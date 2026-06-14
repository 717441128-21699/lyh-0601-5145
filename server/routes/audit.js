const express = require('express');
const {
  authenticateToken,
  requirePermission,
  asyncHandler,
} = require('../middleware/auth');
const { searchAuditLogs, exportAuditLogs } = require('../services/searchExportService');
const AuditLog = require('../models/AuditLog');

function formatAuditForFrontend(log) {
  const l = log && typeof log.toObject === 'function' ? log.toObject() : log;
  return {
    _id: l._id,
    id: l.logId,
    logId: l.logId,
    category: l.category,
    action: l.action,
    severity: l.severity,
    user: {
      name: l.userName || '-',
      username: l.userId || '',
      role: l.userRole || '',
    },
    userId: l.userId,
    userName: l.userName,
    userRole: l.userRole,
    ip: l.ipAddress,
    ipAddress: l.ipAddress,
    userAgent: l.userAgent,
    resourceType: l.entityType,
    entityType: l.entityType,
    resourceId: l.entityId,
    entityId: l.entityId,
    description: l.description,
    details: l.details || {},
    beforeSnapshot: l.changes?.before,
    afterSnapshot: l.changes?.after,
    changes: l.changes || {},
    status: l.status,
    errorMessage: l.errorMessage,
    createdAt: l.timestamp,
    timestamp: l.timestamp,
    relatedTransactionId: l.relatedTransactionId,
    relatedReviewId: l.relatedReviewId,
  };
}

const router = express.Router();
router.use(authenticateToken);

router.get('/', requirePermission('audit:view'), asyncHandler(async (req, res) => {
  const result = await searchAuditLogs(req.query);
  const logs = (result.items || []).map(formatAuditForFrontend);
  res.json({
    logs,
    total: result.total,
    page: result.page,
    pageSize: result.pageSize,
  });
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

  const [byCategory, bySeverity, byAction, topUsers, total, uniqueUsers] = await Promise.all([
    AuditLog.aggregate([{ $match: filter }, { $group: { _id: '$category', count: { $sum: 1 } } }, { $sort: { count: -1 } }]),
    AuditLog.aggregate([{ $match: filter }, { $group: { _id: '$severity', count: { $sum: 1 } } }]),
    AuditLog.aggregate([{ $match: filter, severity: { $in: ['WARNING', 'ERROR', 'CRITICAL'] } }, { $group: { _id: '$action', count: { $sum: 1 } } }, { $sort: { count: -1 } }, { $limit: 10 }]),
    AuditLog.aggregate([{ $match: filter }, { $group: { _id: { userId: '$userId', username: '$userName' }, count: { $sum: 1 } } }, { $sort: { count: -1 } }, { $limit: 15 }]),
    AuditLog.countDocuments(filter),
    AuditLog.distinct('userId', filter).then(ids => ids.length),
  ]);

  const severityMap = {};
  bySeverity.forEach(s => { severityMap[s._id] = s.count; });

  res.json({
    total,
    uniqueUsers,
    byCategory,
    bySeverity: severityMap,
    bySeverityArray: bySeverity,
    byAction,
    topUsers,
  });
}));

router.get('/categories', requirePermission('audit:view'), asyncHandler(async (req, res) => {
  const categories = await AuditLog.aggregate([
    { $group: { _id: '$category', count: { $sum: 1 } } },
    { $sort: { count: -1 } },
  ]);
  res.json(categories.map(c => ({
    _id: c._id,
    count: c.count,
    name: c._id,
  })));
}));

router.get('/:logId', requirePermission('audit:view'), asyncHandler(async (req, res) => {
  const { logId } = req.params;
  const isObjectId = /^[0-9a-fA-F]{24}$/.test(logId);
  
  let log;
  if (isObjectId) {
    log = await AuditLog.findById(logId);
  } else {
    log = await AuditLog.findOne({ logId });
  }
  
  if (!log) return res.status(404).json({ error: '日志不存在' });
  res.json(formatAuditForFrontend(log));
}));

module.exports = router;
