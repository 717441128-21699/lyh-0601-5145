const express = require('express');
const {
  authenticateToken,
  requirePermission,
  asyncHandler,
} = require('../middleware/auth');
const { getRecentDashboardStats, generateReport, generateReportStatistics } = require('../services/reportService');
const Transaction = require('../models/Transaction');
const ReviewTicket = require('../models/ReviewTicket');
const SanctionEntry = require('../models/SanctionEntry');
const Supplier = require('../models/Supplier');
const AuditLog = require('../models/AuditLog');

const router = express.Router();
router.use(authenticateToken);

router.get('/overview', requirePermission('dashboard:view'), asyncHandler(async (req, res) => {
  const stats = await getRecentDashboardStats();
  res.json(stats);
}));

router.get('/stats/realtime', requirePermission('dashboard:view'), asyncHandler(async (req, res) => {
  const now = new Date();
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const weekAgo = new Date(now);
  weekAgo.setDate(weekAgo.getDate() - 7);
  const monthAgo = new Date(now);
  monthAgo.setDate(monthAgo.getDate() - 30);

  const [
    todayTxns,
    todayHits,
    todayApproved,
    todayRejected,
    pendingReviews,
    criticalReviews,
    activeSanctions,
    totalSuppliers,
    weeklyTxnTrend,
    weeklyRiskTrend,
    topHighRiskCountries,
    recentAlerts,
    topSuppliersByRisk,
  ] = await Promise.all([
    Transaction.countDocuments({ orderDate: { $gte: today } }),
    Transaction.countDocuments({ orderDate: { $gte: today }, 'sanctionMatches.0': { $exists: true } }),
    Transaction.countDocuments({ orderDate: { $gte: today }, status: 'APPROVED' }),
    Transaction.countDocuments({ orderDate: { $gte: today }, status: 'REJECTED' }),
    ReviewTicket.countDocuments({ status: { $in: ['PENDING', 'ASSIGNED', 'IN_PROGRESS', 'ESCALATED'] } }),
    ReviewTicket.countDocuments({ riskLevel: 'CRITICAL', status: { $nin: ['APPROVED', 'REJECTED', 'CLOSED'] } }),
    SanctionEntry.countDocuments({ isActive: true }),
    Supplier.countDocuments({ isActive: true }),

    Transaction.aggregate([
      { $match: { orderDate: { $gte: weekAgo } } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$orderDate' } },
          count: { $sum: 1 },
          hits: { $sum: { $cond: [{ $gt: [{ $size: '$sanctionMatches' }, 0] }, 1, 0] } },
          avgRisk: { $avg: '$riskScore' },
        }
      },
      { $sort: { _id: 1 } },
    ]),

    Transaction.aggregate([
      { $match: { createdAt: { $gte: weekAgo } } },
      { $group: { _id: '$riskLevel', count: { $sum: 1 } } },
    ]),

    Transaction.aggregate([
      { $match: { orderDate: { $gte: monthAgo }, riskLevel: { $in: ['HIGH', 'CRITICAL'] } } },
      { $group: { _id: '$originCountry', count: { $sum: 1 }, total: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 10 },
    ]),

    ReviewTicket.find({
      createdAt: { $gte: weekAgo },
      priority: { $in: ['URGENT', 'HIGH'] },
    }).sort({ createdAt: -1 }).limit(10).select('ticketId transactionRefId riskLevel priority status createdAt sanctionMatches'),

    Supplier.find({
      isActive: true,
      riskLevel: { $in: ['HIGH', 'CRITICAL', 'BLACKLISTED'] },
    }).sort({ riskScore: -1 }).limit(10).select('supplierId name country riskLevel riskScore rejectionCount'),
  ]);

  const recentAudit = await AuditLog.find({
    timestamp: { $gte: weekAgo },
    severity: { $in: ['WARNING', 'ERROR', 'CRITICAL'] },
  }).sort({ timestamp: -1 }).limit(15);

  res.json({
    today: {
      total: todayTxns,
      hits: todayHits,
      approved: todayApproved,
      rejected: todayRejected,
      hitRate: todayTxns > 0 ? parseFloat(((todayHits / todayTxns) * 100).toFixed(2)) : 0,
    },
    pending: {
      reviews: pendingReviews,
      critical: criticalReviews,
    },
    inventory: {
      sanctionEntries: activeSanctions,
      suppliers: totalSuppliers,
    },
    weeklyTxnTrend,
    weeklyRiskTrend,
    topHighRiskCountries,
    recentAlerts,
    recentAudit,
    topSuppliersByRisk,
  });
}));

router.get('/stats/trend', requirePermission('dashboard:view'), asyncHandler(async (req, res) => {
  const { range = '7d' } = req.query;
  let days = 7;
  if (range === '30d') days = 30;
  else if (range === '90d') days = 90;
  else if (range === '24h') days = 1;

  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  const isHourly = days === 1;

  const groupExpr = isHourly
    ? {
        datePart: { $dateToString: { format: '%Y-%m-%d %H:00', date: '$orderDate' } },
      }
    : {
        datePart: { $dateToString: { format: '%Y-%m-%d', date: '$orderDate' } },
      };

  const data = await Transaction.aggregate([
    { $match: { orderDate: { $gte: startDate } } },
    {
      $group: {
        _id: groupExpr,
        total: { $sum: 1 },
        hits: { $sum: { $cond: [{ $gt: [{ $size: '$sanctionMatches' }, 0] }, 1, 0] } },
        approved: { $sum: { $cond: [{ $eq: ['$status', 'APPROVED'] }, 1, 0] } },
        rejected: { $sum: { $cond: [{ $eq: ['$status', 'REJECTED'] }, 1, 0] } },
        avgRisk: { $avg: '$riskScore' },
        highRisk: { $sum: { $cond: [{ $in: ['$riskLevel', ['HIGH', 'CRITICAL']] }, 1, 0] } },
      }
    },
    { $sort: { _id: 1 } },
  ]);

  res.json({ range, isHourly, data });
}));

router.get('/stats/hourly-today', requirePermission('dashboard:view'), asyncHandler(async (req, res) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const end = new Date(today);
  end.setHours(23, 59, 59, 999);

  const data = await Transaction.aggregate([
    { $match: { orderDate: { $gte: today, $lte: end } } },
    {
      $group: {
        _id: { $hour: '$orderDate' },
        count: { $sum: 1 },
        hits: { $sum: { $cond: [{ $gt: [{ $size: '$sanctionMatches' }, 0] }, 1, 0] } },
        avgRisk: { $avg: '$riskScore' },
      }
    },
    { $sort: { _id: 1 } },
  ]);

  const hourly = new Array(24).fill(0).map((_, i) => {
    const found = data.find(d => d._id === i);
    return {
      hour: i,
      label: `${i.toString().padStart(2, '0')}:00`,
      count: found?.count || 0,
      hits: found?.hits || 0,
      avgRisk: parseFloat(((found?.avgRisk) || 0).toFixed(1)),
    };
  });

  res.json(hourly);
}));

router.get('/report-preview', requirePermission('dashboard:view'), asyncHandler(async (req, res) => {
  const { range = '7d' } = req.query;
  let days = 7;
  if (range === 'today') days = 0;
  else if (range === '30d') days = 30;

  const start = new Date();
  start.setDate(start.getDate() - days);
  start.setHours(0, 0, 0, 0);
  const end = new Date();
  end.setHours(23, 59, 59, 999);

  const stats = await generateReportStatistics({ startDate: start, endDate: end });
  res.json({
    range,
    startDate: start,
    endDate: end,
    summary: stats.summary,
    riskDistribution: stats.riskDistribution,
    sanctionListBreakdown: stats.sanctionListBreakdown,
    countryRiskBreakdown: stats.countryRiskBreakdown.slice(0, 10),
    hsCodeRisk: stats.hsCodeRisk.slice(0, 5),
  });
}));

module.exports = router;
