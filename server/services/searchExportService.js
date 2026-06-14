const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');
const archiver = require('archiver');
const { v4: uuidv4 } = require('uuid');
const Transaction = require('../models/Transaction');
const ReviewTicket = require('../models/ReviewTicket');
const AuditLog = require('../models/AuditLog');
const logger = require('../config/logger');
const { createAuditLog } = require('../middleware/auth');

const EXPORT_DIR = process.env.UPLOAD_DIR || './uploads/exports';
if (!fs.existsSync(EXPORT_DIR)) {
  fs.mkdirSync(EXPORT_DIR, { recursive: true });
}

function buildTransactionFilter(query) {
  const filter = {};

  if (query.transactionId) {
    if (Array.isArray(query.transactionId)) {
      filter.transactionId = { $in: query.transactionId };
    } else {
      filter.transactionId = query.transactionId;
    }
  }

  if (query.supplierId) filter.supplierId = query.supplierId;
  if (query.supplierName) filter.supplierName = { $regex: query.supplierName, $options: 'i' };
  if (query.hsCode) {
    filter.$or = [
      { hsCode: { $regex: `^${query.hsCode}` } },
      { hsCode: query.hsCode },
    ];
  }

  if (query.originCountry) filter.originCountry = query.originCountry;
  if (query.supplierCountry) filter.supplierCountry = query.supplierCountry;
  if (query.destinationCountry) filter.destinationCountry = query.destinationCountry;

  if (query.riskLevel) {
    filter.riskLevel = Array.isArray(query.riskLevel) ? { $in: query.riskLevel } : query.riskLevel;
  }
  if (query.minRiskScore) filter.riskScore = { ...filter.riskScore, $gte: parseInt(query.minRiskScore) };
  if (query.maxRiskScore) filter.riskScore = { ...filter.riskScore, $lte: parseInt(query.maxRiskScore) };

  if (query.status) {
    filter.status = Array.isArray(query.status) ? { $in: query.status } : query.status;
  }
  if (query.frozen !== undefined) filter.frozen = query.frozen === 'true' || query.frozen === true;

  if (query.hasSanctionMatch !== undefined) {
    const hasMatch = query.hasSanctionMatch === 'true' || query.hasSanctionMatch === true;
    if (hasMatch) {
      filter.$expr = { $gt: [{ $size: '$sanctionMatches' }, 0] };
    } else {
      filter.$expr = { $eq: [{ $size: '$sanctionMatches' }, 0] };
    }
  }

  if (query.endUser) filter.endUser = { $regex: query.endUser, $options: 'i' };

  if (query.poNumber) filter.poNumber = { $regex: query.poNumber, $options: 'i' };

  const dateField = query.dateField || 'orderDate';
  if (query.startDate) filter[dateField] = { ...filter[dateField], $gte: new Date(query.startDate) };
  if (query.endDate) {
    const endD = new Date(query.endDate);
    endD.setHours(23, 59, 59, 999);
    filter[dateField] = { ...filter[dateField], $lte: endD };
  }

  if (query.minAmount) filter.totalAmount = { ...filter.totalAmount, $gte: parseFloat(query.minAmount) };
  if (query.maxAmount) filter.totalAmount = { ...filter.totalAmount, $lte: parseFloat(query.maxAmount) };

  return filter;
}

async function searchTransactions(query = {}) {
  const filter = buildTransactionFilter(query);

  const page = parseInt(query.page) || 1;
  const pageSize = Math.min(parseInt(query.pageSize) || 50, 500);
  const skip = (page - 1) * pageSize;
  const sortField = query.sortBy || 'orderDate';
  const sortOrder = query.sortOrder === 'asc' ? 1 : -1;

  logger.info(`查询交易: ${JSON.stringify({ filter: Object.keys(filter), page, pageSize })}`);

  const [total, items] = await Promise.all([
    Transaction.countDocuments(filter),
    Transaction.find(filter)
      .sort({ [sortField]: sortOrder })
      .skip(skip)
      .limit(pageSize)
      .lean(),
  ]);

  const stats = await Transaction.aggregate([
    { $match: filter },
    {
      $group: {
        _id: null,
        totalAmountSum: { $sum: '$totalAmount' },
        avgRiskScore: { $avg: '$riskScore' },
        byLevel: {
          $push: '$riskLevel'
        },
        hasHit: {
          $sum: { $cond: [{ $gt: [{ $size: '$sanctionMatches' }, 0] }, 1, 0] }
        },
      }
    },
  ]);

  const riskLevels = {};
  if (stats[0]?.byLevel) {
    stats[0].byLevel.forEach(l => {
      riskLevels[l] = (riskLevels[l] || 0) + 1;
    });
  }

  return {
    total,
    page,
    pageSize,
    items,
    summary: {
      total,
      returned: items.length,
      totalAmount: stats[0]?.totalAmountSum || 0,
      avgRiskScore: parseFloat((stats[0]?.avgRiskScore || 0).toFixed(2)),
      sanctionMatchCount: stats[0]?.hasHit || 0,
      riskLevelBreakdown: riskLevels,
    },
  };
}

async function exportTransactions(query = {}, format = 'xlsx', user) {
  const filter = buildTransactionFilter(query);
  logger.info(`准备导出交易: ${Object.keys(filter).join(',')}, 格式: ${format}`);

  const cursor = Transaction.find(filter).sort({ orderDate: -1 }).cursor();
  let count = 0;

  const aoaData = [
    ['交易编号', 'PO编号', '订单日期', '供应商ID', '供应商名称', '供应商国家',
      'HS编码', '商品描述', '原产地', '目的国', '最终用户', '最终用户国',
      '数量', '单价', '总金额', '币种',
      '风险评分', '风险等级', '状态', '是否冻结',
      '制裁命中数', '命中名单',
      '审查工单号', '审查人', '审查时间', '审查备注',
      '拒绝原因', '创建时间']
  ];

  for await (const doc of cursor) {
    count++;
    const txn = doc.toObject();
    aoaData.push([
      txn.transactionId,
      txn.poNumber,
      txn.orderDate ? txn.orderDate.toLocaleString() : '',
      txn.supplierId,
      txn.supplierName,
      txn.supplierCountry,
      txn.hsCode,
      txn.hsDescription || txn.productDescription || '',
      txn.originCountry,
      txn.destinationCountry,
      txn.endUser,
      txn.endUserCountry || '',
      txn.quantity,
      txn.unitPrice,
      txn.totalAmount,
      txn.currency,
      txn.riskScore,
      txn.riskLevel,
      txn.status,
      txn.frozen ? '是' : '否',
      (txn.sanctionMatches || []).length,
      [...new Set((txn.sanctionMatches || []).map(m => m.listName))].join('; '),
      txn.reviewId ? '已关联' : '',
      txn.reviewedBy || '',
      txn.reviewedAt ? txn.reviewedAt.toLocaleString() : '',
      txn.reviewNotes || '',
      txn.rejectionReason || '',
      txn.createdAt ? txn.createdAt.toLocaleString() : '',
    ]);

    if (count % 1000 === 0) {
      logger.info(`导出进度: ${count} 条`);
    }
  }

  logger.info(`共 ${count} 条交易待导出`);
  const fileId = uuidv4().substring(0, 8);
  const timestamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');

  if (format === 'csv') {
    const fileName = `transactions_export_${timestamp}_${fileId}.csv`;
    const filePath = path.join(EXPORT_DIR, fileName);
    const csvContent = aoaData.map(row =>
      row.map(cell => {
        const s = String(cell ?? '');
        if (s.includes(',') || s.includes('"') || s.includes('\n')) {
          return '"' + s.replace(/"/g, '""') + '"';
        }
        return s;
      }).join(',')
    ).join('\n');

    fs.writeFileSync(filePath, '\uFEFF' + csvContent, 'utf-8');

    await createAuditLog({
      action: 'TRANSACTIONS_EXPORTED',
      category: 'EXPORT',
      severity: 'INFO',
      userId: user?.userId,
      userName: user?.username,
      description: `导出 ${count} 条交易记录 (CSV)`,
      details: { filters: Object.keys(filter), count, fileName },
    });

    return { filePath, fileName, count };
  }

  const wb = XLSX.utils.book_new();

  const MAX_SHEET_ROWS = 1048575;
  const header = aoaData[0];
  const dataRows = aoaData.slice(1);

  for (let i = 0; i < dataRows.length; i += MAX_SHEET_ROWS) {
    const chunk = dataRows.slice(i, i + MAX_SHEET_ROWS);
    const sheetData = [header, ...chunk];
    const ws = XLSX.utils.aoa_to_sheet(sheetData);

    const colWidths = [18, 16, 20, 14, 25, 14, 12, 30, 10, 10, 25, 12, 10, 12, 14, 8, 10, 10, 14, 8, 10, 20, 14, 14, 20, 30, 30, 20];
    ws['!cols'] = colWidths.map(w => ({ wch: w }));

    const sheetName = dataRows.length > MAX_SHEET_ROWS ? `Transactions_${Math.floor(i / MAX_SHEET_ROWS) + 1}` : 'Transactions';
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
  }

  if (aoaData.length > 1) {
    const summaryData = [
      ['交易合规记录导出摘要'],
      ['导出时间', new Date().toLocaleString()],
      ['导出数量', count],
      ['筛选条件', Object.keys(filter).join(', ') || '无'],
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(summaryData), 'Export_Info');
  }

  const fileName = `transactions_export_${timestamp}_${fileId}.xlsx`;
  const filePath = path.join(EXPORT_DIR, fileName);
  XLSX.writeFile(wb, filePath);

  await createAuditLog({
    action: 'TRANSACTIONS_EXPORTED',
    category: 'EXPORT',
    severity: 'INFO',
    userId: user?.userId,
    userName: user?.username,
    description: `导出 ${count} 条交易记录 (Excel)`,
    details: { filters: Object.keys(filter), count, fileName },
  });

  return { filePath, fileName, count };
}

async function buildReviewFilter(query) {
  const filter = {};
  if (query.ticketId) filter.ticketId = query.ticketId;
  if (query.transactionId) filter.transactionRefId = query.transactionId;
  if (query.riskLevel) filter.riskLevel = query.riskLevel;
  if (query.status) filter.status = query.status;
  if (query.priority) filter.priority = query.priority;
  if (query.assignedTo) filter.assignedTo = query.assignedTo;
  if (query.assignedGroup) filter.assignedGroup = query.assignedGroup;
  if (query.escalated !== undefined) filter.escalated = query.escalated === 'true';
  if (query.isOverdue !== undefined) filter.isOverdue = query.isOverdue === 'true';
  if (query.decision) filter.decision = query.decision;

  if (query.startDate) filter.createdAt = { $gte: new Date(query.startDate) };
  if (query.endDate) {
    const endD = new Date(query.endDate);
    endD.setHours(23, 59, 59, 999);
    filter.createdAt = { ...filter.createdAt, $lte: endD };
  }

  return filter;
}

async function searchReviews(query = {}) {
  const filter = await buildReviewFilter(query);
  const page = parseInt(query.page) || 1;
  const pageSize = Math.min(parseInt(query.pageSize) || 50, 200);
  const skip = (page - 1) * pageSize;

  const [total, items] = await Promise.all([
    ReviewTicket.countDocuments(filter),
    ReviewTicket.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(pageSize)
      .populate('transactionId', 'transactionId supplierName totalAmount hsCode originCountry')
      .lean(),
  ]);

  return { total, page, pageSize, items };
}

async function buildAuditFilter(query) {
  const filter = {};
  if (query.category) filter.category = query.category;
  if (query.action) filter.action = query.action;
  if (query.severity) filter.severity = query.severity;
  if (query.userId) filter.userId = query.userId;
  if (query.entityType) filter.entityType = query.entityType;
  if (query.entityId) filter.entityId = query.entityId;
  if (query.relatedTransactionId) filter.relatedTransactionId = query.relatedTransactionId;
  if (query.relatedReviewId) filter.relatedReviewId = query.relatedReviewId;

  if (query.keyword) {
    const kw = query.keyword;
    filter.$or = [
      { description: { $regex: kw, $options: 'i' } },
      { action: { $regex: kw, $options: 'i' } },
      { entityId: { $regex: kw, $options: 'i' } },
      { userName: { $regex: kw, $options: 'i' } },
      { userId: { $regex: kw, $options: 'i' } },
      { errorMessage: { $regex: kw, $options: 'i' } },
      { ipAddress: { $regex: kw, $options: 'i' } },
    ];
  }

  if (query.startDate) filter.timestamp = { $gte: new Date(query.startDate) };
  if (query.endDate) {
    const endD = new Date(query.endDate);
    endD.setHours(23, 59, 59, 999);
    filter.timestamp = { ...filter.timestamp, $lte: endD };
  }

  return filter;
}

async function searchAuditLogs(query = {}) {
  const filter = buildAuditFilter(query);
  const page = parseInt(query.page) || 1;
  const pageSize = Math.min(parseInt(query.pageSize) || 100, 500);
  const skip = (page - 1) * pageSize;

  const [total, items] = await Promise.all([
    AuditLog.countDocuments(filter),
    AuditLog.find(filter)
      .sort({ timestamp: -1 })
      .skip(skip)
      .limit(pageSize)
      .lean(),
  ]);

  return { total, page, pageSize, items };
}

async function exportAuditLogs(query = {}, user) {
  const filter = buildAuditFilter(query);
  const cursor = AuditLog.find(filter).sort({ timestamp: -1 }).cursor();
  let count = 0;

  const aoaData = [
    ['时间', '类别', '动作', '严重程度',
      '用户ID', '用户名', '用户角色',
      '实体类型', '实体ID', '交易关联', '工单关联',
      '描述', '状态', '错误信息', 'IP地址']
  ];

  for await (const doc of cursor) {
    count++;
    const log = doc.toObject();
    aoaData.push([
      log.timestamp ? log.timestamp.toLocaleString() : '',
      log.category,
      log.action,
      log.severity,
      log.userId || '',
      log.userName || '',
      log.userRole || '',
      log.entityType || '',
      log.entityId || '',
      log.relatedTransactionId || '',
      log.relatedReviewId || '',
      log.description || '',
      log.status || '',
      log.errorMessage || '',
      log.ipAddress || '',
    ]);
  }

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoaData), 'Audit_Logs');
  const fileId = uuidv4().substring(0, 8);
  const timestamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const fileName = `audit_export_${timestamp}_${fileId}.xlsx`;
  const filePath = path.join(EXPORT_DIR, fileName);
  XLSX.writeFile(wb, filePath);

  await createAuditLog({
    action: 'AUDIT_LOGS_EXPORTED',
    category: 'EXPORT',
    severity: 'WARNING',
    userId: user?.userId,
    userName: user?.username,
    description: `导出审计日志 ${count} 条`,
    details: { count, filters: Object.keys(filter) },
  });

  return { filePath, fileName, count };
}

module.exports = {
  searchTransactions,
  exportTransactions,
  buildTransactionFilter,
  searchReviews,
  searchAuditLogs,
  exportAuditLogs,
};
