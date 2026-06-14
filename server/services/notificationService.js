const { v4: uuidv4 } = require('uuid');
const axios = require('axios');
const Notification = require('../models/Notification');
const logger = require('../config/logger');
const { createAuditLog } = require('../middleware/auth');

async function createNotification(opts) {
  const notification = new Notification({
    notificationId: uuidv4(),
    type: opts.type || 'SYSTEM_ALERT',
    priority: opts.priority || 'MEDIUM',
    severity: opts.severity || 'INFO',
    title: opts.title || '系统通知',
    message: opts.message || '',
    summary: opts.summary,
    recipients: opts.recipients || { users: [], groups: [], channels: [] },
    relatedEntity: opts.relatedEntity,
    data: opts.data || {},
    source: opts.source || 'system',
    timestamp: new Date(),
  });

  if (opts.expiresInHours) {
    notification.expiresAt = new Date(Date.now() + opts.expiresInHours * 3600 * 1000);
  }

  await notification.save();
  return notification;
}

async function sendWebhookAlert(notification) {
  const webhookUrl = process.env.WEBHOOK_COMPLIANCE_GROUP;

  if (!webhookUrl || webhookUrl.includes('example.com') || webhookUrl.includes('hooks.example.com')) {
    logger.info(`[模拟Webhook推送] [${notification.priority}] ${notification.title}: ${notification.message}`);
    return { success: true, simulated: true };
  }

  const channels = notification.recipients?.channels || [];

  if (!channels.includes('COMPLIANCE_GROUP') && notification.priority !== 'URGENT' && notification.priority !== 'CRITICAL') {
    return { success: false, skipped: true };
  }

  try {
    const payload = {
      msgtype: 'interactive',
      card: {
        header: {
          title: { tag: 'text', content: notification.title },
          template: notification.priority === 'CRITICAL' ? 'red'
            : notification.priority === 'URGENT' || notification.priority === 'HIGH' ? 'orange'
              : notification.priority === 'MEDIUM' ? 'blue' : 'green',
        },
        elements: [
          { tag: 'div', text: { tag: 'lark_md', content: `**${notification.message}**` } },
          {
            tag: 'div', fields: [
              { isShort: true, text: { tag: 'lark_md', content: `**类型:**\n${notification.type}` } },
              { isShort: true, text: { tag: 'lark_md', content: `**优先级:**\n${notification.priority}` } },
            ]
          },
        ],
      },
    };

    if (notification.data && Object.keys(notification.data).length > 0) {
      const dataFields = Object.entries(notification.data)
        .filter(([k]) => typeof notification.data[k] !== 'object')
        .map(([k, v]) => ({ isShort: true, text: { tag: 'lark_md', content: `**${k}:**\n${v}` } }));

      if (dataFields.length > 0) {
        payload.card.elements.push({ tag: 'div', fields: dataFields.slice(0, 8) });
      }
    }

    payload.card.elements.push({
      tag: 'note',
      elements: [{ tag: 'plain_text', content: `合规监控系统 · ${new Date().toLocaleString('zh-CN')}` }],
    });

    await axios.post(webhookUrl, payload, { timeout: 5000 });
    return { success: true };

  } catch (err) {
    logger.warn(`合规群Webhook推送失败: ${err.message}`);
    return { success: false, error: err.message };
  }
}

async function sendEmailAlert(notification) {
  const recipients = notification.recipients?.groups || [];
  if (!recipients.includes('COMPLIANCE') && !recipients.includes('LEGAL')) {
    return { skipped: true };
  }

  logger.info(`[邮件通知模拟] To:合规部 - [${notification.priority}] ${notification.title}`);
  return { success: true, simulated: true };
}

async function sendPushAlert(notification) {
  const userIds = notification.recipients?.users || [];
  if (userIds.length === 0) return { skipped: true };

  logger.info(`[推送通知模拟] To:${userIds.length}用户 - ${notification.title}`);
  return { success: true, simulated: true };
}

async function processAlertDelivery(notification) {
  const results = {};

  try {
    const webhookResult = await sendWebhookAlert(notification);
    results.webhook = webhookResult;
    if (webhookResult.success) {
      notification.deliveryStatus.webhook = {
        sent: true,
        sentAt: new Date(),
      };
    } else if (webhookResult.error) {
      notification.deliveryStatus.webhook.error = webhookResult.error;
    }
  } catch (err) {
    results.webhook = { success: false, error: err.message };
    notification.deliveryStatus.webhook.error = err.message;
  }

  try {
    const emailResult = await sendEmailAlert(notification);
    results.email = emailResult;
    if (emailResult.success) {
      notification.deliveryStatus.email = { sent: true, sentAt: new Date() };
    }
  } catch (err) {
    results.email = { success: false, error: err.message };
  }

  try {
    const pushResult = await sendPushAlert(notification);
    results.push = pushResult;
    if (pushResult.success) {
      notification.deliveryStatus.push = { sent: true, sentAt: new Date() };
    }
  } catch (err) {
    results.push = { success: false, error: err.message };
  }

  notification.deliveryStatus.inApp = { shown: false };
  await notification.save();

  return results;
}

async function alertHighRiskTransaction(transaction, riskResult, ticket) {
  const isCritical = riskResult.riskLevel === 'CRITICAL';
  const deadlineHours = isCritical ? 4 : 24;
  const notification = await createNotification({
    type: 'HIGH_RISK_ALERT',
    priority: isCritical ? 'CRITICAL' : 'URGENT',
    severity: isCritical ? 'CRITICAL' : 'ERROR',
    title: `🚨 高风险交易命中: ${transaction.transactionId}`,
    message: `交易 ${transaction.transactionId} 风险评分 ${riskResult.riskScore}/100 (${riskResult.riskLevel})，${ticket ? `已冻结并生成工单 ${ticket.ticketId}，截止时间 ${deadlineHours} 小时` : '请立即处理'}`,
    summary: `${transaction.supplierName} · ${transaction.hsCode} · ${transaction.originCountry} → ${transaction.destinationCountry}`,
    data: {
      transactionId: transaction.transactionId,
      poNumber: transaction.poNumber,
      supplierName: transaction.supplierName,
      supplierCountry: transaction.supplierCountry,
      hsCode: transaction.hsCode,
      originCountry: transaction.originCountry,
      endUser: transaction.endUser,
      totalAmount: `${transaction.currency} ${transaction.totalAmount.toLocaleString()}`,
      riskScore: riskResult.riskScore,
      riskLevel: riskResult.riskLevel,
      ticketId: ticket?.ticketId || null,
      reviewDeadline: ticket?.reviewDeadline || null,
      deadlineHours,
      sanctionListsHit: [...new Set(riskResult.sanctionMatches.map(m => m.listName))].join(', ') || '无',
    },
    recipients: {
      groups: ['COMPLIANCE', 'LEGAL'],
      channels: ['COMPLIANCE_GROUP'],
    },
    expiresInHours: 48,
    relatedEntity: ticket ? {
      type: 'ReviewTicket',
      id: ticket.ticketId,
      ref: transaction.transactionId,
    } : {
      type: 'Transaction',
      id: transaction._id.toString(),
      ref: transaction.transactionId,
    },
  });

  await processAlertDelivery(notification);

  await createAuditLog({
    action: 'HIGH_RISK_ALERT_SENT',
    category: 'NOTIFICATION',
    severity: 'WARNING',
    entityType: 'Transaction',
    entityId: transaction.transactionId,
    description: `高风险交易警报已发送 (${riskResult.riskLevel})`,
    details: {
      riskScore: riskResult.riskScore,
      notificationId: notification.notificationId,
    },
    relatedTransactionId: transaction.transactionId,
    relatedReviewId: ticket?.ticketId,
  });

  return notification;
}

async function alertSanctionListUploaded(upload, user) {
  const notification = await createNotification({
    type: 'SANCTION_LIST_UPDATED',
    priority: upload.statistics?.inserted > 100 ? 'HIGH' : 'MEDIUM',
    severity: 'INFO',
    title: `制裁名单已更新: ${upload.listName}`,
    message: `用户 ${user.username} 更新了 ${upload.listName} 制裁名单，新增 ${upload.statistics?.inserted || 0} 条，更新 ${upload.statistics?.updated || 0} 条，失效 ${upload.statistics?.deactivated || 0} 条`,
    data: {
      uploadId: upload.uploadId,
      listName: upload.listName,
      fileName: upload.fileName,
      statistics: upload.statistics,
    },
    recipients: {
      groups: ['COMPLIANCE', 'AUDIT'],
      channels: ['COMPLIANCE_GROUP'],
    },
  });

  await processAlertDelivery(notification);
  return notification;
}

async function alertReportGenerated(report, user) {
  const notification = await createNotification({
    type: 'REPORT_GENERATED',
    priority: 'LOW',
    severity: 'INFO',
    title: `合规报告生成完成: ${report.reportType}报告`,
    message: `${report.period.startDate.toLocaleDateString()} 至 ${report.period.endDate.toLocaleDateString()} 的合规报告已生成`,
    data: {
      reportId: report.reportId,
      reportType: report.reportType,
      hitRate: report.summary?.hitRate,
      total: report.summary?.totalTransactions,
      rejected: report.summary?.rejectedTransactions,
    },
    recipients: {
      groups: ['COMPLIANCE', 'AUDIT', 'MANAGEMENT'],
    },
    userId: user?.userId,
  });

  await processAlertDelivery(notification);
  return notification;
}

async function alertSupplierBlacklisted(supplier, reason, user) {
  const notification = await createNotification({
    type: 'SUPPLIER_FLAGGED',
    priority: 'URGENT',
    severity: 'ERROR',
    title: `供应商被列入黑名单: ${supplier.supplierId}`,
    message: `供应商 ${supplier.name} (${supplier.supplierId}) 已被列入黑名单。原因: ${reason}`,
    data: {
      supplierId: supplier.supplierId,
      supplierName: supplier.name,
      country: supplier.country,
      reason,
      riskLevel: supplier.riskLevel,
    },
    recipients: {
      groups: ['COMPLIANCE', 'LEGAL', 'PROCUREMENT'],
      channels: ['COMPLIANCE_GROUP'],
    },
  });

  await processAlertDelivery(notification);
  return notification;
}

async function getNotificationsForUser(userId, opts = {}) {
  const { limit = 50, skip = 0, unreadOnly = false, type, priority, minPriority } = opts;

  const filter = {
    $and: [
      {
        $or: [
          { 'recipients.users': userId },
          { isRead: false, priority: { $in: ['HIGH', 'URGENT', 'CRITICAL'] } },
        ],
      },
      { isArchived: false },
    ],
  };

  if (unreadOnly) {
    filter.$and.push({ isRead: false });
  }

  if (type) {
    filter.$and.push({ type });
  }

  if (priority) {
    filter.$and.push({ priority });
  }

  if (minPriority) {
    const priorityOrder = ['LOW', 'MEDIUM', 'HIGH', 'URGENT', 'CRITICAL'];
    const minIndex = priorityOrder.indexOf(minPriority);
    if (minIndex >= 0) {
      const higherPriorities = priorityOrder.slice(minIndex);
      filter.$and.push({ priority: { $in: higherPriorities } });
    }
  }

  const total = await Notification.countDocuments(filter);
  const items = await Notification.find(filter)
    .sort({ timestamp: -1 })
    .skip(skip)
    .limit(limit);

  return { total, items };
}

async function markAsRead(userId, notificationIds) {
  const objectIds = [];
  const businessIds = [];
  notificationIds.forEach(id => {
    if (/^[0-9a-fA-F]{24}$/.test(id)) {
      objectIds.push(id);
    } else {
      businessIds.push(id);
    }
  });

  const idFilter = {};
  if (objectIds.length > 0 && businessIds.length > 0) {
    idFilter.$or = [
      { _id: { $in: objectIds } },
      { notificationId: { $in: businessIds } },
    ];
  } else if (objectIds.length > 0) {
    idFilter._id = { $in: objectIds };
  } else {
    idFilter.notificationId = { $in: businessIds };
  }

  const filter = {
    $and: [
      idFilter,
      {
        $or: [
          { 'recipients.users': userId },
          { isRead: false },
        ],
      },
    ],
  };

  const result = await Notification.updateMany(
    filter,
    {
      $set: { isRead: true, 'deliveryStatus.inApp.shown': true, 'deliveryStatus.inApp.shownAt': new Date() },
      $addToSet: { readBy: { userId, readAt: new Date() } },
    }
  );

  return result;
}

module.exports = {
  createNotification,
  processAlertDelivery,
  alertHighRiskTransaction,
  alertSanctionListUploaded,
  alertReportGenerated,
  alertSupplierBlacklisted,
  getNotificationsForUser,
  markAsRead,
  sendWebhookAlert,
};
