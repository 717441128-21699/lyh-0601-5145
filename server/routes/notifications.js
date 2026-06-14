const express = require('express');
const {
  authenticateToken,
  asyncHandler,
  createAuditLog,
} = require('../middleware/auth');
const { getNotificationsForUser, markAsRead, sendWebhookAlert } = require('../services/notificationService');
const Notification = require('../models/Notification');

const router = express.Router();
router.use(authenticateToken);

router.get('/', asyncHandler(async (req, res) => {
  const { limit = 50, skip = 0, unreadOnly = false } = req.query;
  const result = await getNotificationsForUser(req.user.userId, {
    limit: parseInt(limit),
    skip: parseInt(skip),
    unreadOnly: unreadOnly === 'true' || unreadOnly === true,
  });

  const unreadCount = await Notification.countDocuments({
    $or: [{ 'recipients.users': req.user.userId }, { priority: { $in: ['HIGH', 'URGENT', 'CRITICAL'] } }],
    isRead: false,
    isArchived: false,
  });

  res.json({
    ...result,
    unreadCount,
  });
}));

router.post('/mark-read', asyncHandler(async (req, res) => {
  const { notificationIds, all = false } = req.body;

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
          'deliveryStatus.inApp': { shown: true, shownAt: new Date() },
        },
        $addToSet: { readBy: { userId: req.user.userId, readAt: new Date() } },
      }
    );
    res.json({ success: true, modifiedCount: result.modifiedCount, all: true });
  } else if (notificationIds && Array.isArray(notificationIds)) {
    const result = await markAsRead(req.user.userId, notificationIds);
    res.json({ success: true, modifiedCount: result.modifiedCount });
  } else {
    res.status(400).json({ error: '缺少参数: notificationIds 或 all=true' });
  }
}));

router.get('/unread-count', asyncHandler(async (req, res) => {
  const count = await Notification.countDocuments({
    $or: [{ 'recipients.users': req.user.userId }, { priority: { $in: ['HIGH', 'URGENT', 'CRITICAL'] } }],
    isRead: false,
    isArchived: false,
    $or: [{ expiresAt: { $exists: false } }, { expiresAt: { $gt: new Date() } }],
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

router.get('/:notificationId', asyncHandler(async (req, res) => {
  const notification = await Notification.findOne({ notificationId: req.params.notificationId });
  if (!notification) return res.status(404).json({ error: '通知不存在' });

  if (!notification.isRead) {
    notification.isRead = true;
    notification.readBy = notification.readBy || [];
    notification.readBy.push({ userId: req.user.userId, readAt: new Date() });
    notification.deliveryStatus = notification.deliveryStatus || {};
    notification.deliveryStatus.inApp = { shown: true, shownAt: new Date() };
    await notification.save();
  }

  res.json(notification);
}));

router.post('/:notificationId/archive', asyncHandler(async (req, res) => {
  const result = await Notification.updateOne(
    {
      notificationId: req.params.notificationId,
      $or: [{ 'recipients.users': req.user.userId }, { priority: { $in: ['HIGH', 'URGENT', 'CRITICAL'] } }],
    },
    { $set: { isArchived: true } }
  );

  if (result.matchedCount === 0) {
    return res.status(404).json({ error: '通知不存在或无权限' });
  }

  res.json({ success: true });
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

module.exports = router;
