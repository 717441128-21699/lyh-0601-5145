const express = require('express');
const {
  authenticateToken,
  requirePermission,
  asyncHandler,
} = require('../middleware/auth');
const { searchAuditLogs, exportAuditLogs } = require('../services/searchExportService');
const AuditLog = require('../models/AuditLog');

const router = express.Router();
router.use(authenticateToken);

router.get('/', requirePermission('audit:view'), asyncHandler(async (req, res) => {
  const result = await searchAuditLogs(req.query);
  res.json(result);
}));

router.post('/export', requirePermission('audit:export'), asyncHandler(async (req, res) => {
  const result = await exportAuditLogs(req.body, req.user);
  res.json({
    success: true,
    count: result.count,
    fileName: result.fileName,
    downloadUrl: `/uploads/exports/${result.fileName}`,
  });
}));

router.get('/summary', requirePermission('audit:view'), asyncHandler(async (req, res) => {
  const { startDate, endDate } = req.query;
  const filter = {};
  if (startDate) filter.timestamp = { $gte: new Date(startDate) };
  if (endDate) {
    const d = new Date(endDate);
    d.setHours(23, 59, 59, 999);
    filter.timestamp = { ...filter.timestamp, $lte: d };
  }

  const [byCategory, bySeverity, byAction, topUsers, total] = await Promise.all([
    AuditLog.aggregate([{ $match: filter }, { $group: { _id: '$category', count: { $sum: 1 } } }, { $sort: { count: -1 } }]),
    AuditLog.aggregate([{ $match: filter }, { $group: { _id: '$severity', count: { $sum: 1 } } }]),
    AuditLog.aggregate([{ $match: filter, severity: { $in: ['WARNING', 'ERROR', 'CRITICAL'] } }, { $group: { _id: '$action', count: { $sum: 1 } } }, { $sort: { count: -1 } }, { $limit: 10 }]),
    AuditLog.aggregate([{ $match: filter }, { $group: { _id: { userId: '$userId', username: '$userName' }, count: { $sum: 1 } } }, { $sort: { count: -1 } }, { $limit: 15 }]),
    AuditLog.countDocuments(filter),
  ]);

  res.json({ total, byCategory, bySeverity, byAction, topUsers });
}));

router.get('/categories', requirePermission('audit:view'), (req, res) => {
  res.json([
    { value: 'TRANSACTION', label: '交易操作' },
    { value: 'REVIEW', label: '审查工单' },
    { value: 'SANCTION_LIST', label: '制裁名单' },
    { value: 'SUPPLIER', label: '供应商' },
    { value: 'REPORT', label: '报告' },
    { value: 'EXPORT', label: '导出操作' },
    { value: 'AUTH', label: '认证登录' },
    { value: 'USER', label: '用户管理' },
    { value: 'CONFIG', label: '系统配置' },
    { value: 'SYSTEM', label: '系统事件' },
    { value: 'NOTIFICATION', label: '通知推送' },
  ]);
});

router.get('/:logId', requirePermission('audit:view'), asyncHandler(async (req, res) => {
  const log = await AuditLog.findOne({ logId: req.params.logId });
  if (!log) return res.status(404).json({ error: '日志不存在' });
  res.json(log);
}));

module.exports = router;
