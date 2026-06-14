const express = require('express');
const fs = require('fs');
const path = require('path');
const {
  authenticateToken,
  requirePermission,
  asyncHandler,
  createAuditLog,
} = require('../middleware/auth');
const { generateReport, listReports, exportReportToExcel, exportReportToPDF } = require('../services/reportService');
const ComplianceReport = require('../models/ComplianceReport');
const { BadRequestError, NotFoundError } = require('../middleware/errorHandler');
const { getQueue } = require('../config/queue');
const { alertReportGenerated } = require('../services/notificationService');

const router = express.Router();
router.use(authenticateToken);

function formatReportForFrontend(report) {
  const r = report.toObject ? report.toObject() : report;
  return {
    _id: r._id,
    reportId: r.reportId,
    reportType: r.reportType,
    period: {
      start: r.period?.startDate,
      end: r.period?.endDate,
      label: r.reportType === 'DAILY' ? '日报'
        : r.reportType === 'WEEKLY' ? '周报'
          : r.reportType === 'MONTHLY' ? '月报' : '自定义报告',
      startDate: r.period?.startDate,
      endDate: r.period?.endDate,
    },
    summary: {
      totalTransactions: r.summary?.totalTransactions || 0,
      screened: r.summary?.screenedTransactions || 0,
      flagged: r.summary?.uniqueSanctionHits || r.summary?.totalSanctionHits || 0,
      hitRate: r.summary?.hitRate || 0,
      approved: r.summary?.approvedTransactions || 0,
      rejected: r.summary?.rejectedTransactions || 0,
      pending: r.summary?.pendingReviews || 0,
      avgReviewHours: r.summary?.averageReviewHours || 0,
      slaBreachCount: r.summary?.slaBreachCount || 0,
      ...r.summary,
    },
    riskDistribution: r.riskDistribution || [],
    sanctionHits: (r.sanctionListBreakdown || []).map(s => ({
      listName: s.listName,
      count: s.hitCount || s.count || 0,
      uniqueTransactions: s.uniqueTransactions || 0,
    })),
    sanctionListBreakdown: r.sanctionListBreakdown || [],
    countryRiskBreakdown: r.countryRiskBreakdown || [],
    files: {
      excel: r.filePaths?.excel,
      pdf: r.filePaths?.pdf,
    },
    filePaths: r.filePaths || {},
    generatedBy: { name: r.generatedBy || '系统', username: r.generatedBy },
    createdAt: r.generatedAt,
    generatedAt: r.generatedAt,
    status: r.status,
    reviewerPerformance: r.reviewerPerformance || [],
    trendData: r.trendData || {},
    hourlyStats: r.hourlyTransactionStats || [],
  };
}

router.get('/', requirePermission('report:view'), asyncHandler(async (req, res) => {
  const result = await listReports(req.query);
  const reports = (result.items || []).map(formatReportForFrontend);
  res.json({
    reports,
    total: result.total,
    page: result.page,
    pageSize: result.pageSize,
  });
}));

router.post('/generate', requirePermission('report:generate'), asyncHandler(async (req, res) => {
  const { reportType = 'CUSTOM', startDate, endDate } = req.body;

  if (!startDate || !endDate) {
    throw new BadRequestError('必须提供startDate和endDate');
  }

  const validTypes = ['DAILY', 'WEEKLY', 'MONTHLY', 'CUSTOM', 'ADHOC'];
  if (!validTypes.includes(reportType)) {
    throw new BadRequestError(`无效的报告类型: ${reportType}`);
  }

  const report = await generateReport({
    reportType,
    startDate,
    endDate,
    generatedBy: req.user.username,
  });

  try {
    await alertReportGenerated(report, req.user);
  } catch { /* ignore */ }

  createAuditLog({
    action: 'REPORT_GENERATED',
    category: 'REPORT',
    severity: 'INFO',
    userId: req.user.userId,
    userName: req.user.username,
    userRole: req.user.role,
    entityType: 'ComplianceReport',
    entityId: report.reportId,
    description: `生成${report.reportType}类型合规报告`,
    details: { reportId: report.reportId, reportType: report.reportType, startDate, endDate },
    ipAddress: req.ip,
    userAgent: req.headers['user-agent'],
  }).catch(() => {});

  res.status(201).json({ success: true, report });
}));

router.get('/daily/generate', requirePermission('report:generate'), asyncHandler(async (req, res) => {
  const { date } = req.query;
  const reportDate = date ? new Date(date) : new Date();
  reportDate.setHours(0, 0, 0, 0);
  const endDate = new Date(reportDate);
  endDate.setHours(23, 59, 59, 999);

  const report = await generateReport({
    reportType: 'DAILY',
    startDate: reportDate.toISOString(),
    endDate: endDate.toISOString(),
    generatedBy: req.user.username,
  });

  try {
    await alertReportGenerated(report, req.user);
  } catch { /* ignore */ }

  createAuditLog({
    action: 'REPORT_GENERATED',
    category: 'REPORT',
    severity: 'INFO',
    userId: req.user.userId,
    userName: req.user.username,
    userRole: req.user.role,
    entityType: 'ComplianceReport',
    entityId: report.reportId,
    description: `生成日报合规报告`,
    details: { reportId: report.reportId, reportType: 'DAILY', date: reportDate.toISOString() },
    ipAddress: req.ip,
    userAgent: req.headers['user-agent'],
  }).catch(() => {});

  res.json({ success: true, report });
}));

async function findReportById(id) {
  let report = await ComplianceReport.findOne({ reportId: id });
  if (!report) {
    try {
      report = await ComplianceReport.findById(id);
    } catch { /* invalid ObjectId */ }
  }
  return report;
}

router.get('/:reportId', requirePermission('report:view'), asyncHandler(async (req, res) => {
  const { reportId } = req.params;
  const report = await findReportById(reportId);
  if (!report) throw new NotFoundError('报告不存在');
  res.json(formatReportForFrontend(report));
}));

router.get('/:reportId/download/excel', requirePermission('report:export'), asyncHandler(async (req, res) => {
  const { reportId } = req.params;
  const report = await findReportById(reportId);
  if (!report) throw new NotFoundError('报告不存在');

  let filePath = report.filePaths?.excel;
  if (!filePath || !fs.existsSync(filePath)) {
    filePath = await exportReportToExcel(report);
    report.filePaths = report.filePaths || {};
    report.filePaths.excel = filePath;
    await report.save();
  }

  createAuditLog({
    action: 'REPORT_EXPORTED',
    category: 'REPORT',
    severity: 'INFO',
    userId: req.user.userId,
    userName: req.user.username,
    userRole: req.user.role,
    entityType: 'ComplianceReport',
    entityId: report.reportId,
    description: `导出报告 Excel: ${report.reportId}`,
    details: { reportId: report.reportId, format: 'excel', reportType: report.reportType },
    ipAddress: req.ip,
    userAgent: req.headers['user-agent'],
  }).catch(() => {});

  const fileName = `compliance_report_${report.reportType}_${report.reportId}.xlsx`;
  res.download(path.resolve(filePath), fileName);
}));

router.get('/:reportId/download/pdf', requirePermission('report:export'), asyncHandler(async (req, res) => {
  const { reportId } = req.params;
  const report = await findReportById(reportId);
  if (!report) throw new NotFoundError('报告不存在');

  let filePath = report.filePaths?.pdf;
  if (!filePath || !fs.existsSync(filePath)) {
    filePath = await exportReportToPDF(report);
    report.filePaths = report.filePaths || {};
    report.filePaths.pdf = filePath;
    await report.save();
  }

  createAuditLog({
    action: 'REPORT_EXPORTED',
    category: 'REPORT',
    severity: 'INFO',
    userId: req.user.userId,
    userName: req.user.username,
    userRole: req.user.role,
    entityType: 'ComplianceReport',
    entityId: report.reportId,
    description: `导出报告 PDF: ${report.reportId}`,
    details: { reportId: report.reportId, format: 'pdf', reportType: report.reportType },
    ipAddress: req.ip,
    userAgent: req.headers['user-agent'],
  }).catch(() => {});

  const fileName = `compliance_report_${report.reportType}_${report.reportId}.pdf`;
  res.download(path.resolve(filePath), fileName);
}));

router.get('/summary/today', requirePermission('report:view'), asyncHandler(async (req, res) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const endDate = new Date(today);
  endDate.setHours(23, 59, 59, 999);

  const report = await generateReport({
    reportType: 'ADHOC',
    startDate: today.toISOString(),
    endDate: endDate.toISOString(),
    generatedBy: 'api_dashboard',
  });

  res.json({
    reportId: report.reportId,
    generatedAt: report.generatedAt,
    totalTransactions: report.summary?.totalTransactions || 0,
    flagged: report.summary?.uniqueSanctionHits || report.summary?.totalSanctionHits || 0,
    hitRate: report.summary?.hitRate || 0,
    approved: report.summary?.approvedTransactions || 0,
    rejected: report.summary?.rejectedTransactions || 0,
    avgReviewHours: report.summary?.averageReviewHours || 0,
    summary: report.summary || {},
    riskDistribution: report.riskDistribution || [],
    sanctionHits: (report.sanctionListBreakdown || []).map(s => ({
      listName: s.listName,
      count: s.hitCount || s.count || 0,
    })),
    sanctionListBreakdown: report.sanctionListBreakdown || [],
  });
}));

router.post('/:reportId/regenerate-files', requirePermission('report:generate'), asyncHandler(async (req, res) => {
  const { reportId } = req.params;
  const report = await ComplianceReport.findOne({ reportId });
  if (!report) throw new NotFoundError('报告不存在');

  const [excelPath, pdfPath] = await Promise.all([
    exportReportToExcel(report),
    exportReportToPDF(report),
  ]);

  report.filePaths = { excel: excelPath, pdf: pdfPath };
  await report.save();

  res.json({ success: true, files: report.filePaths });
}));

module.exports = router;
