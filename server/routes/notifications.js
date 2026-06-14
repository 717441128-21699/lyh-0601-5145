const express = require('express');
const {
  authenticateToken,
  asyncHandler,
  createAuditLog,
} = require('../middleware/auth');
const { getNotificationsForUser, markAsRead, sendWebhookAlert } = require('../services/notificationService');
const Notification = require('../models/Notification');

function formatNotificationForFrontend(notif, userId) {
  const n = notif.toObject ? notif.toObject() : notif;
  const isRead = n.isRead || (n.readBy || []).some(r => r.userId === userId);
  const channels = [
    {
      channel: 'IN_APP',
      status: isRead ? 'READ' : (n.deliveryStatus?.inApp?.shown ? 'SENT' : 'PENDING'),
      sentAt: n.deliveryStatus?.inApp?.shownAt,
    },
    {
      channel: 'EMAIL',
      status: n.deliveryStatus?.email?.sent ? 'SENT' : (n.deliveryStatus?.email?.error ? 'FAILED' : 'PENDING'),
      sentAt: n.deliveryStatus?.email?.sentAt,
      error: n.deliveryStatus?.email?.error,
    },
    {
      channel: 'WEBHOOK',
      status: n.deliveryStatus?.webhook?.sent ? 'SENT' : (n.deliveryStatus?.webhook?.error ? 'FAILED' : 'PENDING'),
      sentAt: n.deliveryStatus?.webhook?.sentAt,
      error: n.deliveryStatus?.webhook?.error,
    },
    {
      channel: 'SMS',
      status: n.deliveryStatus?.push?.sent ? 'SENT' : 'PENDING',
      sentAt: n.deliveryStatus?.push?.sentAt,
    },
  ];

  return {
    _id: n._id,
    id: n.notificationId,
    notificationId: n.notificationId,
    type: n.type,
    priority: n.priority,
    title: n.title,
    content: n.message,
    message: n.message,
    summary: n.summary || n.message?.slice(0, 100),
    user: n.recipients?.users?.length
      ? { name: n.recipients.users[0], username: n.recipients.users[0] }
      : undefined,
    resourceType: n.relatedEntity?.type,
    resourceId: n.relatedEntity?.id,
    channels,
    read: isRead,
    isRead,
    archived: n.isArchived,
    isArchived: n.isArchived,
    metadata: n.data || {},
    data: n.data || {},
    createdAt: n.timestamp,
    timestamp: n.timestamp,
    readAt: (n.readBy || []).find(r => r.userId === userId)?.readAt,
  };
}

const router = express.Router();
router.use(authenticateToken);

// ========== 固定路径路由（必须放在动态参数路由之前！） ==========

router.get('/', asyncHandler(async (req, res) => {
  const { limit = 50, skip = 0, page = 1, pageSize = 20, unreadOnly = false, read, minPriority, type, priority } = req.query;

  const opts = {
    limit: parseInt(pageSize) || parseInt(limit) || 20,
    skip: ((parseInt(page) || 1) - 1) * (parseInt(pageSize) || parseInt(limit) || 20),
    unreadOnly: unreadOnly === 'true' || unreadOnly === true || read === false,
    type,
    priority,
    minPriority,
  };

  const result = await getNotificationsForUser(req.user.userId, opts);

  const notifications = (result.items || []).map(n => formatNotificationForFrontend(n, req.user.userId));

  const unreadCount = await Notification.countDocuments({
    $or: [{ 'recipients.users': req.user.userId }, { priority: { $in: ['HIGH', 'URGENT', 'CRITICAL'] } }],
    isRead: false,
    isArchived: false,
  });

  const urgentCount = await Notification.countDocuments({
    priority: { $in: ['URGENT', 'CRITICAL'] },
    isRead: false,
    isArchived: false,
  });

  res.json({
    notifications,
    total: result.total,
    unread: unreadCount,
    unreadTotal: unreadCount,
    urgentCount,
    page: parseInt(page) || 1,
    pageSize: parseInt(pageSize) || parseInt(limit) || 20,
  });
}));

router.post('/mark-read', asyncHandler(async (req, res) => {
  const { notificationIds, ids, all = false } = req.body;
  const targetIds = notificationIds || ids || [];

  if (all === true || all === 'true') {
    const result = await Notification.updateMany(
      {
        $or: [
          { 'recipients.users': req.user.userId },
          { priority: { $in: ['HIGH', 'URGENT', 'CRITICAL'] } },
        ],
        isRead: false,
      },
      {
        $set: {
          isRead: true,
          'deliveryStatus.inApp.shown': true,
          'deliveryStatus.inApp.shownAt': new Date(),
        },
        $addToSet: { readBy: { userId: req.user.userId, readAt: new Date() } },
      }
    );
    res.json({ success: true, modifiedCount: result.modifiedCount, all: true });
  } else if (targetIds && Array.isArray(targetIds) && targetIds.length > 0) {
    const result = await markAsRead(req.user.userId, targetIds);
    res.json({ success: true, modifiedCount: result.modifiedCount || 0, count: result.modifiedCount || 0 });
  } else {
    res.status(400).json({ error: '缺少参数: ids 或 notificationIds 或 all=true' });
  }
}));

router.get('/unread-count', asyncHandler(async (req, res) => {
  const count = await Notification.countDocuments({
    $and: [
      { $or: [{ 'recipients.users': req.user.userId }, { priority: { $in: ['HIGH', 'URGENT', 'CRITICAL'] } }] },
      { $or: [{ expiresAt: { $exists: false } }, { expiresAt: { $gt: new Date() } }] },
    ],
    isRead: false,
    isArchived: false,
  });

  const urgentCount = await Notification.countDocuments({
    priority: { $in: ['URGENT', 'CRITICAL'] },
    isRead: false,
    isArchived: false,
  });

  res.json({
    total: count,
    urgent: urgentCount,
    normal: count - urgentCount,
  });
}));

router.post('/test-webhook', asyncHandler(async (req, res) => {
  const notif = {
    type: 'SYSTEM_ALERT',
    priority: 'MEDIUM',
    severity: 'INFO',
    title: '测试通知',
    message: `这是来自合规监控系统的测试推送 (${req.user?.username || '系统'})`,
    recipients: { groups: ['COMPLIANCE'], channels: ['COMPLIANCE_GROUP'] },
    data: req.body?.testData || { source: 'manual_test', timestamp: new Date().toISOString() },
  };

  const result = await sendWebhookAlert(notif);
  res.json({ success: result.success || result.simulated, result });
}));

router.get('/types/config', (req, res) => {
  res.json([
    { value: 'HIGH_RISK_ALERT', label: '高风险交易警报', priority: 'URGENT' },
    { value: 'REVIEW_ASSIGNED', label: '工单分配', priority: 'MEDIUM' },
    { value: 'REVIEW_ESCALATED', label: '工单升级', priority: 'HIGH' },
    { value: 'REVIEW_OVERDUE', label: '工单超时', priority: 'URGENT' },
    { value: 'REVIEW_APPROVED', label: '交易放行', priority: 'LOW' },
    { value: 'REVIEW_REJECTED', label: '交易拒绝', priority: 'HIGH' },
    { value: 'SANCTION_LIST_UPDATED', label: '制裁名单更新', priority: 'MEDIUM' },
    { value: 'REPORT_GENERATED', label: '报告生成', priority: 'LOW' },
    { value: 'SUPPLIER_FLAGGED', label: '供应商告警', priority: 'HIGH' },
    { value: 'SYSTEM_ALERT', label: '系统通知', priority: 'MEDIUM' },
  ]);
});

// ========== 动态参数路由（必须放在最后！） ==========

router.get('/:notificationId', asyncHandler(async (req, res) => {
  const { notificationId } = req.params;
  const isObjectId = /^[0-9a-fA-F]{24}$/.test(notificationId);

  let notification;
  if (isObjectId) {
    notification = await Notification.findById(notificationId);
  } else {
    notification = await Notification.findOne({ notificationId });
  }

  if (!notification) return res.status(404).json({ error: '通知不存在' });

  let changed = false;
  if (!notification.isRead) {
    notification.isRead = true;
    notification.readBy = notification.readBy || [];
    notification.readBy.push({ userId: req.user.userId, readAt: new Date() });
    notification.deliveryStatus = notification.deliveryStatus || {};
    notification.deliveryStatus.inApp = { shown: true, shownAt: new Date() };
    changed = true;
  }

  if (changed) await notification.save();

  res.json(formatNotificationForFrontend(notification, req.user.userId));
}));

router.post('/:notificationId/archive', asyncHandler(async (req, res) => {
  const { notificationId } = req.params;
  const isObjectId = /^[0-9a-fA-F]{24}$/.test(notificationId);

  const idFilter = isObjectId
    ? { _id: notificationId }
    : { notificationId };

  const result = await Notification.updateOne(
    {
      ...idFilter,
      $or: [{ 'recipients.users': req.user.userId }, { priority: { $in: ['HIGH', 'URGENT', 'CRITICAL'] } }],
    },
    { $set: { isArchived: true } }
  );

  if (result.matchedCount === 0) {
    return res.status(404).json({ error: '通知不存在或无权限' });
  }

  res.json({ success: true });
}));

module.exports = router;
