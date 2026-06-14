const express = require('express');
const Transaction = require('../models/Transaction');
const {
  authenticateToken,
  requirePermission,
  asyncHandler,
  createAuditLog,
} = require('../middleware/auth');
const { BadRequestError, NotFoundError, ForbiddenError } = require('../middleware/errorHandler');
const { searchTransactions, exportTransactions } = require('../services/searchExportService');
const { fetchDailyTransactions } = require('../services/dataFetchService');
const { getQueue } = require('../config/queue');
const { createReviewTicket } = require('../services/reviewService');
const { calculateRiskScore } = require('../services/riskEngineService');

const router = express.Router();
router.use(authenticateToken);

router.get('/', requirePermission('transaction:view'), asyncHandler(async (req, res) => {
  const result = await searchTransactions(req.query);
  res.json(result);
}));

router.get('/:transactionId', requirePermission('transaction:view'), asyncHandler(async (req, res) => {
  const { transactionId } = req.params;
  const transaction = await Transaction.findOne({ transactionId });
  if (!transaction) {
    throw new NotFoundError('交易不存在');
  }
  res.json(transaction);
}));

router.post('/search', requirePermission('transaction:view'), asyncHandler(async (req, res) => {
  const result = await searchTransactions(req.body);
  res.json(result);
}));

router.post('/export', requirePermission('transaction:view'), asyncHandler(async (req, res) => {
  const { format = 'xlsx' } = req.query;
  const result = await exportTransactions(req.body, format, req.user);
  res.json({
    success: true,
    count: result.count,
    fileName: result.fileName,
    downloadUrl: `/uploads/exports/${result.fileName}`,
  });
}));

router.get('/:transactionId/history', requirePermission('transaction:view'), asyncHandler(async (req, res) => {
  const { transactionId } = req.params;
  const txn = await Transaction.findOne({ transactionId });
  if (!txn) throw new NotFoundError('交易不存在');

  const AuditLog = require('../models/AuditLog');
  const ReviewTicket = require('../models/ReviewTicket');

  const [auditLogs, reviews] = await Promise.all([
    AuditLog.find({
      $or: [{ relatedTransactionId: transactionId }, { entityId: transactionId, entityType: 'Transaction' }],
    }).sort({ timestamp: -1 }).limit(100),
    ReviewTicket.find({ transactionRefId: transactionId }).sort({ createdAt: -1 }),
  ]);

  res.json({
    transaction: txn,
    auditLogs,
    reviews,
  });
}));

router.post('/:transactionId/freeze', requirePermission('transaction:freeze'), asyncHandler(async (req, res) => {
  const { transactionId } = req.params;
  const { reason } = req.body;
  const transaction = await Transaction.findOne({ transactionId });
  if (!transaction) throw new NotFoundError('交易不存在');

  if (['APPROVED', 'REJECTED'].includes(transaction.status)) {
    throw new BadRequestError('交易已处理，无法冻结');
  }

  transaction.frozen = true;
  transaction.frozenAt = new Date();
  transaction.status = 'FROZEN';
  await transaction.save();

  await createAuditLog({
    action: 'TRANSACTION_FROZEN',
    category: 'TRANSACTION',
    severity: 'WARNING',
    userId: req.user.userId,
    userName: req.user.username,
    userRole: req.user.role,
    entityType: 'Transaction',
    entityId: transactionId,
    description: `手工冻结交易 ${transactionId}`,
    details: { reason },
    relatedTransactionId: transactionId,
  });

  res.json({ success: true, transaction });
}));

router.post('/:transactionId/release', requirePermission('transaction:release'), asyncHandler(async (req, res) => {
  const { transactionId } = req.params;
  const { reason } = req.body;
  const transaction = await Transaction.findOne({ transactionId });
  if (!transaction) throw new NotFoundError('交易不存在');

  if (!transaction.frozen) {
    throw new BadRequestError('交易未冻结');
  }
  if (transaction.reviewId && !['APPROVED', 'CLOSED'].includes(transaction.status)) {
    throw new BadRequestError('该交易正在审查中，请通过工单系统处理');
  }

  transaction.frozen = false;
  transaction.releasedAt = new Date();
  transaction.status = 'APPROVED';
  transaction.reviewedBy = req.user.username;
  transaction.reviewedAt = new Date();
  transaction.reviewNotes = reason || '手工放行';
  await transaction.save();

  await createAuditLog({
    action: 'TRANSACTION_RELEASED',
    category: 'TRANSACTION',
    severity: 'WARNING',
    userId: req.user.userId,
    userName: req.user.username,
    userRole: req.user.role,
    entityType: 'Transaction',
    entityId: transactionId,
    description: `手工放行交易 ${transactionId}`,
    details: { reason },
    relatedTransactionId: transactionId,
  });

  res.json({ success: true, transaction });
}));

router.post('/:transactionId/re-screen', requirePermission('transaction:view'), asyncHandler(async (req, res) => {
  const { transactionId } = req.params;
  const transaction = await Transaction.findOne({ transactionId });
  if (!transaction) throw new NotFoundError('交易不存在');

  const riskResult = await calculateRiskScore(transaction);
  transaction.riskScore = riskResult.riskScore;
  transaction.riskLevel = riskResult.riskLevel;
  transaction.riskFactors = riskResult.riskFactors;
  transaction.sanctionMatches = riskResult.sanctionMatches;
  transaction.status = 'SCREENED';

  if (riskResult.riskScore >= 50) {
    transaction.frozen = true;
    transaction.frozenAt = new Date();
    transaction.status = 'UNDER_REVIEW';
    const ticket = await createReviewTicket(transaction, riskResult);
    transaction.reviewId = ticket._id;
  }

  await transaction.save();

  const transactionQueue = getQueue('transaction');
  await transactionQueue.add('process-single', { transactionId });

  await createAuditLog({
    action: 'TRANSACTION_RESCREENED',
    category: 'TRANSACTION',
    severity: 'INFO',
    userId: req.user.userId,
    userName: req.user.username,
    userRole: req.user.role,
    entityType: 'Transaction',
    entityId: transactionId,
    description: `交易重新筛查`,
    details: { riskScore: riskResult.riskScore, riskLevel: riskResult.riskLevel },
    relatedTransactionId: transactionId,
  });

  res.json({ success: true, transaction, riskResult });
}));

router.post('/sync', requirePermission('transaction:view'), asyncHandler(async (req, res) => {
  const { incremental = false } = req.body || {};
  const result = await fetchDailyTransactions(Boolean(incremental));
  res.json({ success: true, ...result });
}));

router.post('/create-review', requirePermission('transaction:view'), asyncHandler(async (req, res) => {
  const { transactionId } = req.body;
  const transaction = await Transaction.findOne({ transactionId });
  if (!transaction) throw new NotFoundError('交易不存在');

  const riskResult = {
    riskScore: transaction.riskScore || 60,
    riskLevel: transaction.riskLevel || 'MEDIUM',
    sanctionMatches: transaction.sanctionMatches || [],
    riskFactors: transaction.riskFactors || [],
  };

  const ticket = await createReviewTicket(transaction, riskResult, { source: 'manual' });
  transaction.frozen = true;
  transaction.frozenAt = new Date();
  transaction.status = 'UNDER_REVIEW';
  transaction.reviewId = ticket._id;
  await transaction.save();

  res.json({ success: true, ticket, transaction });
}));

module.exports = router;
