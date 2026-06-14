const express = require('express');
const ReviewTicket = require('../models/ReviewTicket');
const Transaction = require('../models/Transaction');
const User = require('../models/User');
const {
  authenticateToken,
  requirePermission,
  asyncHandler,
  createAuditLog,
} = require('../middleware/auth');
const { BadRequestError, NotFoundError, ForbiddenError } = require('../middleware/errorHandler');
const {
  manuallyAssignTicket,
  reviewApprove,
  reviewReject,
  escalateTicket,
  checkAndEscalateOverdue,
} = require('../services/reviewService');
const { searchReviews } = require('../services/searchExportService');

const router = express.Router();
router.use(authenticateToken);

router.get('/', requirePermission('review:view'), asyncHandler(async (req, res) => {
  const result = await searchReviews(req.query);
  res.json(result);
}));

router.get('/dashboard', requirePermission('review:view'), asyncHandler(async (req, res) => {
  const user = req.user;
  const commonFilter = {};

  if (req.query.dateRange === 'today') {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    commonFilter.createdAt = { $gte: today };
  }

  const [
    myAssigned,
    myPending,
    groupPending,
    overdue,
    escalated,
    byStatus,
    byPriority,
    completedToday,
  ] = await Promise.all([
    ReviewTicket.countDocuments({ ...commonFilter, assignedTo: user.userId, status: { $nin: ['APPROVED', 'REJECTED', 'CLOSED'] } }),
    ReviewTicket.countDocuments({ ...commonFilter, assignedTo: user.userId, status: { $in: ['ASSIGNED', 'IN_PROGRESS'] } }),
    ReviewTicket.countDocuments({ ...commonFilter, assignedGroup: user.department === 'LEGAL' ? 'LEGAL_DEPT' : 'COMPLIANCE', status: 'PENDING' }),
    ReviewTicket.countDocuments({ ...commonFilter, isOverdue: true, status: { $nin: ['APPROVED', 'REJECTED', 'CLOSED'] } }),
    ReviewTicket.countDocuments({ ...commonFilter, escalated: true, status: { $nin: ['APPROVED', 'REJECTED', 'CLOSED'] } }),

    ReviewTicket.aggregate([
      { $match: commonFilter },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]),
    ReviewTicket.aggregate([
      { $match: commonFilter },
      { $group: { _id: '$priority', count: { $sum: 1 } } },
    ]),
    (async () => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      return ReviewTicket.countDocuments({ reviewedAt: { $gte: today }, assignedTo: user.userId });
    })(),
  ]);

  res.json({
    myAssigned,
    myPending,
    groupPending,
    overdue,
    escalated,
    completedToday,
    byStatus,
    byPriority,
  });
}));

router.get('/:ticketId', requirePermission('review:view'), asyncHandler(async (req, res) => {
  const { ticketId } = req.params;
  const ticket = await ReviewTicket.findOne({ ticketId })
    .populate('transactionId')
    .populate('sanctionMatches.sanctionId');
  if (!ticket) throw new NotFoundError('工单不存在');

  const AuditLog = require('../models/AuditLog');
  const auditLogs = await AuditLog.find({ relatedReviewId: ticketId })
    .sort({ timestamp: -1 })
    .limit(50);

  res.json({ ticket, auditLogs });
}));

router.put('/:ticketId/assign', requirePermission('review:assign'), asyncHandler(async (req, res) => {
  const { ticketId } = req.params;
  const { assignTo } = req.body;

  if (!assignTo) throw new BadRequestError('缺少assignTo参数');

  const targetUser = await User.findOne({ userId: assignTo });
  if (!targetUser) throw new NotFoundError('目标用户不存在');

  const ticket = await manuallyAssignTicket(ticketId, assignTo, req.user);
  res.json({ success: true, ticket });
}));

router.put('/:ticketId/status', requirePermission('review:view'), asyncHandler(async (req, res) => {
  const { ticketId } = req.params;
  const { status } = req.body;
  const validStatuses = ['ASSIGNED', 'IN_PROGRESS', 'CLOSED'];

  if (!validStatuses.includes(status)) {
    throw new BadRequestError(`无效状态: ${status}`);
  }

  const ticket = await ReviewTicket.findOne({ ticketId });
  if (!ticket) throw new NotFoundError('工单不存在');
  if (['APPROVED', 'REJECTED'].includes(ticket.status)) {
    throw new BadRequestError('工单已处理，无法修改状态');
  }

  ticket.status = status;
  await ticket.save();

  await createAuditLog({
    action: 'TICKET_STATUS_UPDATED',
    category: 'REVIEW',
    severity: 'INFO',
    userId: req.user.userId,
    userName: req.user.username,
    userRole: req.user.role,
    entityType: 'ReviewTicket',
    entityId: ticketId,
    description: `工单状态更新为: ${status}`,
    relatedReviewId: ticketId,
    relatedTransactionId: ticket.transactionRefId,
  });

  res.json({ success: true, ticket });
}));

router.post('/:ticketId/approve', requirePermission('review:approve'), asyncHandler(async (req, res) => {
  const { ticketId } = req.params;
  const { notes } = req.body;

  const result = await reviewApprove(ticketId, req.user, notes);
  res.json({ success: true, ...result });
}));

router.post('/:ticketId/reject', requirePermission('review:reject'), asyncHandler(async (req, res) => {
  const { ticketId } = req.params;
  const { reason, category, notes } = req.body;

  if (!reason) throw new BadRequestError('必须提供拒绝原因');

  const result = await reviewReject(ticketId, req.user, { reason, category, notes });
  res.json({ success: true, ...result });
}));

router.post('/:ticketId/escalate', requirePermission('review:escalate'), asyncHandler(async (req, res) => {
  const { ticketId } = req.params;
  const { reason } = req.body;

  const ticket = await escalateTicket(ticketId, { reason });
  res.json({ success: true, ticket });
}));

router.post('/check-overdue', requirePermission('review:view'), asyncHandler(async (req, res) => {
  if (req.user.role !== 'COMPLIANCE_DIRECTOR' && req.user.role !== 'ADMIN') {
    throw new ForbiddenError('仅合规总监或管理员可执行此操作');
  }
  const result = await checkAndEscalateOverdue();
  res.json({ success: true, ...result });
}));

router.get('/stats/performance', requirePermission('review:view'), asyncHandler(async (req, res) => {
  const { startDate, endDate, userId } = req.query;
  const filter = {};
  if (startDate) filter.reviewedAt = { $gte: new Date(startDate) };
  if (endDate) {
    const d = new Date(endDate);
    d.setHours(23, 59, 59, 999);
    filter.reviewedAt = { ...filter.reviewedAt, $lte: d };
  }
  if (userId) filter.reviewedBy = userId;
  filter.status = { $in: ['APPROVED', 'REJECTED'] };

  const result = await ReviewTicket.aggregate([
    { $match: filter },
    {
      $group: {
        _id: '$reviewedBy',
        total: { $sum: 1 },
        approved: { $sum: { $cond: [{ $eq: ['$status', 'APPROVED'] }, 1, 0] } },
        rejected: { $sum: { $cond: [{ $eq: ['$status', 'REJECTED'] }, 1, 0] } },
        avgHours: { $avg: '$reviewDurationHours' },
        maxHours: { $max: '$reviewDurationHours' },
        slaBreach: { $sum: { $cond: ['$slaBreached', 1, 0] } },
        overdue: { $sum: { $cond: ['$isOverdue', 1, 0] } },
      }
    },
    { $sort: { total: -1 } },
  ]);

  res.json(result);
}));

router.get('/stats/workload', requirePermission('review:view'), asyncHandler(async (req, res) => {
  const reviewers = await User.find(
    { isActive: true, role: { $in: ['LEGAL_REVIEWER', 'COMPLIANCE_OFFICER', 'COMPLIANCE_DIRECTOR'] } },
    { userId: 1, fullName: 1, username: 1, role: 1, assignedTicketCount: 1, completedTicketCount: 1 }
  ).lean();

  const workload = [];
  for (const reviewer of reviewers) {
    const pending = await ReviewTicket.countDocuments({
      assignedTo: reviewer.userId,
      status: { $in: ['ASSIGNED', 'IN_PROGRESS', 'ESCALATED'] },
    });
    const overdue = await ReviewTicket.countDocuments({
      assignedTo: reviewer.userId,
      status: { $in: ['ASSIGNED', 'IN_PROGRESS', 'ESCALATED'] },
      isOverdue: true,
    });

    workload.push({
      ...reviewer,
      pendingCount: pending,
      overdueCount: overdue,
    });
  }

  res.json(workload);
}));

module.exports = router;
