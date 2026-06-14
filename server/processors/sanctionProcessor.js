const logger = require('../config/logger');
const { processAlertDelivery, createNotification, alertHighRiskTransaction } = require('../services/notificationService');
const Notification = require('../models/Notification');

async function processSanctionMatch(job) {
  const { transactionId, sanctionMatches } = job.data;
  logger.info(`[制裁匹配处理器] 分析交易 ${transactionId} 的 ${sanctionMatches.length} 处匹配`);

  try {
    return { success: true, analyzed: sanctionMatches.length };
  } catch (err) {
    logger.error('[制裁匹配处理器] 失败:', err);
    throw err;
  }
}

async function sendAlertNotification(job) {
  const { type, priority, title, message, data, recipients, expiresInHours, relatedEntity } = job.data;

  logger.info(`[通知处理器] 发送${priority}级通知: ${title}`);

  try {
    const notification = await createNotification({
      type,
      priority,
      severity: priority === 'CRITICAL' ? 'CRITICAL' :
        (priority === 'URGENT' || priority === 'HIGH' ? 'ERROR' :
          (priority === 'MEDIUM' ? 'WARNING' : 'INFO')),
      title,
      message,
      summary: message.substring(0, 200),
      data: data || {},
      recipients: recipients || { users: [], groups: [], channels: [] },
      expiresInHours,
      relatedEntity,
      source: 'queue',
    });

    const deliveryResults = await processAlertDelivery(notification);

    logger.info(`[通知处理器] 完成: 通知ID=${notification.notificationId}, Webhook=${deliveryResults.webhook?.success ? '成功' : '跳过/失败'}`);

    return {
      success: true,
      notificationId: notification.notificationId,
      delivery: deliveryResults,
    };

  } catch (err) {
    logger.error('[通知处理器] 失败:', err);
    throw err;
  }
}

module.exports = {
  processSanctionMatch,
  sendAlertNotification,
};
