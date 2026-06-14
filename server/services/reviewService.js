const { v4: uuidv4 } = require('uuid');
const moment = require('moment');
const ReviewTicket = require('../models/ReviewTicket');
const Transaction = require('../models/Transaction');
const User = require('../models/User');
const Supplier = require('../models/Supplier');
const logger = require('../config/logger');
const { getQueue } = require('../config/queue');
const { createAuditLog } = require('../middleware/auth');

const REVIEW_TIME_LIMIT_HOURS = parseInt(process.env.REVIEW_TIME_LIMIT_HOURS || '24');
const ESCALATION_GROUP = 'COMPLIANCE_DIRECTOR';
const DEFAULT_GROUP = 'LEGAL_DEPT';

async function createReviewTicket(transaction, riskResult, opts = {}) {
  const reviewDeadline = moment().add(REVIEW_TIME_LIMIT_HOURS, 'hours').toDate();
  const isUrgent = riskResult.riskLevel === 'CRITICAL' || riskResult.riskScore >= 90;

  if (isUrgent) {
    reviewDeadline = moment().add(4, 'hours').toDate();
  }

  const ticket = new ReviewTicket({
    ticketId: 'REV-' + Date.now().toString(36).toUpperCase() + '-' + Math.random().toString(36).substring(2, 6).toUpperCase(),
    transactionId: transaction._id,
    transactionRefId: transaction.transactionId,
    riskScore: riskResult.riskScore,
    riskLevel: riskResult.riskLevel,
    sanctionMatches: riskResult.sanctionMatches.map(m => ({
      ...m,
      matchedEntryName: '待加载',
    })),
    riskSummary: generateRiskSummary(riskResult),
    status: 'PENDING',
    priority: isUrgent ? 'URGENT' : (riskResult.riskLevel === 'HIGH' ? 'HIGH' : 'MEDIUM'),
    assignedGroup: DEFAULT_GROUP,
    reviewDeadline,
    source: opts.source || 'auto',
  });

  await ticket.save();
  logger.info(`创建合规工单: ${ticket.ticketId} (交易: ${transaction.transactionId}, 风险: ${riskResult.riskLevel})`);

  await createAuditLog({
    action: 'REVIEW_TICKET_CREATED',
    category: 'REVIEW',
    severity: isUrgent ? 'CRITICAL' : 'WARNING',
    entityType: 'ReviewTicket',
    entityId: ticket.ticketId,
    entityRef: transaction.transactionId,
    description: `自动创建合规工单: ${ticket.ticketId}`,
    details: {
      riskScore: riskResult.riskScore,
      riskLevel: riskResult.riskLevel,
      factorsCount: riskResult.riskFactors.length,
      reviewDeadline,
    },
    relatedTransactionId: transaction.transactionId,
    relatedReviewId: ticket.ticketId,
  });

  await assignTicketToGroup(ticket, DEFAULT_GROUP);
  return ticket;
}

function generateRiskSummary(riskResult) {
  const parts = [];
  const sanctionCount = riskResult.sanctionMatches.length;
  if (sanctionCount > 0) {
    const lists = [...new Set(riskResult.sanctionMatches.map(m => m.listName))].join(', ');
    parts.push(`制裁名单命中 ${sanctionCount} 处 (${lists})`);
  }

  const countryFactors = riskResult.riskFactors.filter(f => f.type.startsWith('COUNTRY_'));
  if (countryFactors.length > 0) {
    parts.push(`${countryFactors.length}项国家风险触发`);
  }

  const sensitiveFactor = riskResult.riskFactors.find(f => f.type === 'SENSITIVE_END_USER');
  if (sensitiveFactor) {
    parts.push('涉及敏感用途/最终用户');
  }

  if (parts.length === 0) {
    parts.push(`综合风险评分 ${riskResult.riskScore}/100`);
  }

  return parts.join('；');
}

async function assignTicketToGroup(ticket, groupName) {
  const users = await User.find({
    department: groupName === DEFAULT_GROUP ? 'LEGAL' : 'COMPLIANCE',
    role: { $in: ['LEGAL_REVIEWER', 'COMPLIANCE_OFFICER', 'COMPLIANCE_DIRECTOR'] },
    isActive: true,
  }).select('userId username fullName assignedTicketCount role');

  if (users.length === 0) {
    logger.warn(`组 ${groupName} 没有可用的审查员，保持PENDING状态`);
    ticket.assignedGroup = groupName;
    await ticket.save();
    return ticket;
  }

  users.sort((a, b) => (a.assignedTicketCount || 0) - (b.assignedTicketCount || 0));
  const assignee = users[0];

  ticket.assignedTo = assignee.userId;
  ticket.reviewerAssigned = assignee.username;
  ticket.assignedGroup = groupName;
  ticket.assignedAt = new Date();
  ticket.status = 'ASSIGNED';

  await ticket.save();

  await User.updateOne(
    { userId: assignee.userId },
    { $inc: { assignedTicketCount: 1 } }
  );

  logger.info(`工单 ${ticket.ticketId} 已分配给 ${assignee.username}`);
  return ticket;
}

async function manuallyAssignTicket(ticketId, assignToUserId, assignedBy) {
  const ticket = await ReviewTicket.findOne({ ticketId });
  if (!ticket) throw new Error('工单不存在');

  if (['APPROVED', 'REJECTED', 'CLOSED'].includes(ticket.status)) {
    throw new Error('工单已关闭，无法重新分配');
  }

  const targetUser = await User.findOne({ userId: assignToUserId, isActive: true });
  if (!targetUser) throw new Error('目标用户不存在或未激活');

  const previousAssignee = ticket.assignedTo;

  ticket.assignedTo = targetUser.userId;
  ticket.reviewerAssigned = targetUser.username;
  ticket.assignedAt = new Date();
  ticket.status = 'ASSIGNED';
  ticket.escalated = false;
  ticket.escalatedAt = null;
  ticket.escalatedTo = null;

  await ticket.save();

  if (previousAssignee && previousAssignee !== targetUser.userId) {
    await User.updateOne(
      { userId: previousAssignee },
      { $inc: { assignedTicketCount: -1 } }
    );
  }

  await User.updateOne(
    { userId: targetUser.userId },
    { $inc: { assignedTicketCount: 1 } }
  );

  await createAuditLog({
    action: 'TICKET_REASSIGNED',
    category: 'REVIEW',
    severity: 'INFO',
    userId: assignedBy.userId,
    userName: assignedBy.username,
    userRole: assignedBy.role,
    entityType: 'ReviewTicket',
    entityId: ticket.ticketId,
    description: `工单由 ${assignedBy.username} 分配给 ${targetUser.username}`,
    relatedReviewId: ticket.ticketId,
    relatedTransactionId: ticket.transactionRefId,
  });

  return ticket;
}

async function escalateTicket(ticketId, opts = {}) {
  const ticket = await ReviewTicket.findOne({ ticketId });
  if (!ticket) throw new Error('工单不存在');

  if (ticket.escalated) {
    logger.warn(`工单 ${ticketId} 已升级，跳过`);
    return ticket;
  }

  ticket.escalated = true;
  ticket.escalatedAt = new Date();
  ticket.escalatedTo = ESCALATION_GROUP;
  ticket.escalateReason = opts.reason || '24小时审查超时未处理';
  ticket.status = 'ESCALATED';
  ticket.assignedGroup = 'COMPLIANCE';
  ticket.reviewDeadline = moment().add(4, 'hours').toDate();
  ticket.slaBreached = true;
  ticket.slaBreachReason = opts.reason || '超时SLA违反';

  await ticket.save();
  logger.warn(`工单升级: ${ticket.ticketId} -> ${ESCALATION_GROUP}`);

  const directors = await User.find({
    role: 'COMPLIANCE_DIRECTOR',
    isActive: true,
  }).select('userId username fullName');

  if (directors.length > 0) {
    directors.sort((a, b) => (a.assignedTicketCount || 0) - (b.assignedTicketCount || 0));
    const director = directors[0];
    ticket.assignedTo = director.userId;
    ticket.reviewerAssigned = director.username;
    ticket.assignedAt = new Date();
    await ticket.save();

    await User.updateOne(
      { userId: director.userId },
      { $inc: { assignedTicketCount: 1 } }
    );
  }

  const notificationQueue = getQueue('notification');
  await notificationQueue.add('send-alert', {
    type: 'REVIEW_ESCALATED',
    priority: 'URGENT',
    title: `合规工单升级通知: ${ticket.ticketId}`,
    message: `交易 ${ticket.transactionRefId} 审查工单超时未处理，已升级至合规总监`,
    data: {
      ticketId: ticket.ticketId,
      transactionId: ticket.transactionRefId,
      riskScore: ticket.riskScore,
      riskLevel: ticket.riskLevel,
      reason: ticket.escalateReason,
    },
    recipients: {
      groups: [ESCALATION_GROUP],
      channels: ['COMPLIANCE_GROUP'],
    },
  });

  await createAuditLog({
    action: 'TICKET_ESCALATED',
    category: 'REVIEW',
    severity: 'WARNING',
    entityType: 'ReviewTicket',
    entityId: ticket.ticketId,
    description: `工单升级至${ESCALATION_GROUP}`,
    details: { reason: ticket.escalateReason },
    relatedReviewId: ticket.ticketId,
    relatedTransactionId: ticket.transactionRefId,
  });

  return ticket;
}

async function reviewApprove(ticketId, reviewer, notes = '') {
  const session = await ReviewTicket.startSession();
  session.startTransaction();

  try {
    const ticket = await ReviewTicket.findOne({ ticketId }).session(session);
    if (!ticket) throw new Error('工单不存在');

    if (['APPROVED', 'REJECTED'].includes(ticket.status)) {
      throw new Error('工单已处理');
    }

    const reviewedAt = new Date();
    const reviewDuration = ticket.assignedAt
      ? (reviewedAt - ticket.assignedAt) / (1000 * 60 * 60)
      : 0;

    ticket.status = 'APPROVED';
    ticket.decision = 'RELEASE';
    ticket.reviewedBy = reviewer.userId;
    ticket.reviewedAt = reviewedAt;
    ticket.reviewDurationHours = parseFloat(reviewDuration.toFixed(2));
    ticket.decisionNotes = notes;

    await ticket.save({ session });

    const transaction = await Transaction.findById(ticket.transactionId).session(session);
    if (transaction) {
      transaction.status = 'APPROVED';
      transaction.frozen = false;
      transaction.releasedAt = reviewedAt;
      transaction.reviewId = ticket._id;
      transaction.reviewedBy = reviewer.username;
      transaction.reviewedAt = reviewedAt;
      transaction.reviewNotes = notes;
      await transaction.save({ session });

      await Supplier.findOneAndUpdate(
        { supplierId: transaction.supplierId },
        {
          $inc: { approvedTransactionCount: 1 },
          $set: { lastScreeningDate: reviewedAt },
        },
        { session }
      );
    }

    if (reviewer.userId) {
      await User.updateOne(
        { userId: reviewer.userId },
        {
          $inc: { completedTicketCount: 1 },
          $min: { assignedTicketCount: 0 },
        },
        { session }
      ).session(session);
    }

    await session.commitTransaction();

    await createAuditLog({
      action: 'TICKET_APPROVED',
      category: 'REVIEW',
      severity: 'INFO',
      userId: reviewer.userId,
      userName: reviewer.username,
      userRole: reviewer.role,
      entityType: 'ReviewTicket',
      entityId: ticket.ticketId,
      description: `工单审批通过，交易已放行`,
      details: { notes, durationHours: ticket.reviewDurationHours },
      relatedReviewId: ticket.ticketId,
      relatedTransactionId: ticket.transactionRefId,
    });

    logger.info(`工单审批通过: ${ticketId} by ${reviewer.username}`);
    return { ticket, transaction };

  } catch (err) {
    await session.abortTransaction();
    throw err;
  } finally {
    session.endSession();
  }
}

async function reviewReject(ticketId, reviewer, opts = {}) {
  const session = await ReviewTicket.startSession();
  session.startTransaction();

  try {
    const { reason = '', category = 'SANCTION_MATCH', notes = '' } = opts;

    const ticket = await ReviewTicket.findOne({ ticketId }).session(session);
    if (!ticket) throw new Error('工单不存在');

    if (['APPROVED', 'REJECTED'].includes(ticket.status)) {
      throw new Error('工单已处理');
    }

    const reviewedAt = new Date();
    const reviewDuration = ticket.assignedAt
      ? (reviewedAt - ticket.assignedAt) / (1000 * 60 * 60)
      : 0;

    ticket.status = 'REJECTED';
    ticket.decision = 'REJECT';
    ticket.reviewedBy = reviewer.userId;
    ticket.reviewedAt = reviewedAt;
    ticket.reviewDurationHours = parseFloat(reviewDuration.toFixed(2));
    ticket.decisionNotes = notes;
    ticket.rejectionReason = reason;
    ticket.rejectionCategory = category;

    await ticket.save({ session });

    const transaction = await Transaction.findById(ticket.transactionId).session(session);
    if (transaction) {
      transaction.status = 'REJECTED';
      transaction.frozen = true;
      transaction.reviewId = ticket._id;
      transaction.reviewedBy = reviewer.username;
      transaction.reviewedAt = reviewedAt;
      transaction.reviewNotes = notes;
      transaction.rejectionReason = reason;
      transaction.rejectionDate = reviewedAt;
      await transaction.save({ session });

      const supplier = await Supplier.findOne({ supplierId: transaction.supplierId }).session(session);
      if (supplier) {
        supplier.rejectionCount = (supplier.rejectionCount || 0) + 1;
        supplier.rejectedTransactionCount = (supplier.rejectedTransactionCount || 0) + 1;
        supplier.sanctionHits = (supplier.sanctionHits || 0) + ticket.sanctionMatches.length;

        if (ticket.riskLevel === 'CRITICAL' || supplier.rejectionCount >= 3) {
          supplier.riskLevel = 'CRITICAL';
          supplier.blacklisted = true;
          supplier.blacklistReason = reason || `多次触发合规审查拒绝 (${supplier.rejectionCount}次)`;
          supplier.blacklistedAt = reviewedAt;
          supplier.complianceStatus = 'REJECTED';
        } else if (supplier.rejectionCount >= 2 || ticket.riskLevel === 'HIGH') {
          supplier.riskLevel = 'HIGH';
          supplier.complianceStatus = 'FLAGGED';
        } else {
          supplier.riskLevel = 'MEDIUM';
        }

        supplier.riskScore = Math.min(100, (supplier.riskScore || 0) + 15 + (ticket.riskScore * 0.3));
        supplier.lastScreeningDate = reviewedAt;
        await supplier.save({ session });
      }
    }

    if (reviewer.userId) {
      await User.updateOne(
        { userId: reviewer.userId },
        {
          $inc: { completedTicketCount: 1 },
          $min: { assignedTicketCount: 0 },
        },
        { session }
      ).session(session);
    }

    await session.commitTransaction();

    const notificationQueue = getQueue('notification');
    await notificationQueue.add('send-alert', {
      type: 'DENIED_TRADE',
      priority: ticket.riskLevel === 'CRITICAL' ? 'CRITICAL' : 'HIGH',
      title: `交易拒绝: ${ticket.transactionRefId}`,
      message: `合规审查拒单 - 原因: ${reason || category}`,
      data: {
        ticketId: ticket.ticketId,
        transactionId: ticket.transactionRefId,
        reason,
        category,
        supplierName: transaction?.supplierName,
      },
      recipients: {
        groups: ['COMPLIANCE', 'LEGAL', 'PROCUREMENT'],
        channels: ['COMPLIANCE_GROUP'],
      },
    });

    await createAuditLog({
      action: 'TICKET_REJECTED',
      category: 'REVIEW',
      severity: 'WARNING',
      userId: reviewer.userId,
      userName: reviewer.username,
      userRole: reviewer.role,
      entityType: 'ReviewTicket',
      entityId: ticket.ticketId,
      description: `工单拒绝 - 交易禁止`,
      details: { reason, category, notes },
      relatedReviewId: ticket.ticketId,
      relatedTransactionId: ticket.transactionRefId,
    });

    logger.warn(`工单拒绝: ${ticketId} by ${reviewer.username} - ${reason}`);
    return { ticket, transaction };

  } catch (err) {
    await session.abortTransaction();
    throw err;
  } finally {
    session.endSession();
  }
}

async function checkAndEscalateOverdue() {
  logger.info('开始检查超时工单...');

  const now = new Date();
  const overdueTickets = await ReviewTicket.find({
    status: { $in: ['PENDING', 'ASSIGNED', 'IN_PROGRESS'] },
    escalated: false,
    reviewDeadline: { $lt: now },
  });

  logger.info(`发现 ${overdueTickets.length} 个超时工单`);

  for (const ticket of overdueTickets) {
    try {
      ticket.isOverdue = true;
      await ticket.save();
      await escalateTicket(ticket.ticketId, { reason: '超过审查时限未处理 (自动升级)' });
    } catch (err) {
      logger.error(`工单升级失败 ${ticket.ticketId}:`, err);
    }
  }

  await ReviewTicket.updateMany(
    {
      status: { $in: ['PENDING', 'ASSIGNED'] },
      reviewDeadline: { $lt: now },
      isOverdue: false,
    },
    { $set: { isOverdue: true } }
  );

  return { overdueCount: overdueTickets.length };
}

async function getTicketStats(filter = {}) {
  const baseFilter = {};
  if (filter.startDate) baseFilter.createdAt = { $gte: new Date(filter.startDate) };
  if (filter.endDate) baseFilter.createdAt = { ...baseFilter.createdAt, $lte: new Date(filter.endDate) };
  if (filter.assignedTo) baseFilter.assignedTo = filter.assignedTo;

  return ReviewTicket.aggregate([
    { $match: baseFilter },
    {
      $group: {
        _id: '$status',
        count: { $sum: 1 },
      },
    },
  ]);
}

module.exports = {
  createReviewTicket,
  assignTicketToGroup,
  manuallyAssignTicket,
  escalateTicket,
  reviewApprove,
  reviewReject,
  checkAndEscalateOverdue,
  getTicketStats,
  generateRiskSummary,
  REVIEW_TIME_LIMIT_HOURS,
};
