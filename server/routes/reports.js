const express = require('express');
const fs = require('fs');
const path = require('path');
const {
  authenticateToken,
  requirePermission,
  asyncHandler,
} = require('../middleware/auth');
const { generateReport, listReports, exportReportToExcel, exportReportToPDF } = require('../services/reportService');
const ComplianceReport = require('../models/ComplianceReport');
const { BadRequestError, NotFoundError } = require('../middleware/errorHandler');
const { getQueue } = require('../config/queue');
const { alertReportGenerated } = require('../services/notificationService');

const router = express.Router();
router.use(authenticateToken);

router.get('/', requirePermission('report:view'), asyncHandler(async (req, res) => {
  const result = await listReports(req.query);
  res.json(result);
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

  res.json({ success: true, report });
}));

router.get('/:reportId', requirePermission('report:view'), asyncHandler(async (req, res) => {
  const { reportId } = req.params;
  const report = await ComplianceReport.findOne({ reportId });
  if (!report) throw new NotFoundError('报告不存在');
  res.json(report);
}));

router.get('/:reportId/download/excel', requirePermission('report:export'), asyncHandler(async (req, res) => {
  const { reportId } = req.params;
  const report = await ComplianceReport.findOne({ reportId });
  if (!report) throw new NotFoundError('报告不存在');

  let filePath = report.filePaths?.excel;
  if (!filePath || !fs.existsSync(filePath)) {
    filePath = await exportReportToExcel(report);
    report.filePaths = report.filePaths || {};
    report.filePaths.excel = filePath;
    await report.save();
  }

  const fileName = `compliance_report_${report.reportType}_${report.reportId}.xlsx`;
  res.download(path.resolve(filePath), fileName);
}));

router.get('/:reportId/download/pdf', requirePermission('report:export'), asyncHandler(async (req, res) => {
  const { reportId } = req.params;
  const report = await ComplianceReport.findOne({ reportId });
  if (!report) throw new NotFoundError('报告不存在');

  let filePath = report.filePaths?.pdf;
  if (!filePath || !fs.existsSync(filePath)) {
    filePath = await exportReportToPDF(report);
    report.filePaths = report.filePaths || {};
    report.filePaths.pdf = filePath;
    await report.save();
  }

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
    summary: report.summary,
    riskDistribution: report.riskDistribution,
    sanctionListBreakdown: report.sanctionListBreakdown,
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
