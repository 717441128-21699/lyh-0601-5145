const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');
const PDFDocument = require('pdfkit');
const moment = require('moment');
const ComplianceReport = require('../models/ComplianceReport');
const Transaction = require('../models/Transaction');
const ReviewTicket = require('../models/ReviewTicket');
const SanctionEntry = require('../models/SanctionEntry');
const logger = require('../config/logger');
const { createAuditLog } = require('../middleware/auth');

const REPORT_DIR = process.env.REPORT_DIR || './reports';
if (!fs.existsSync(REPORT_DIR)) {
  fs.mkdirSync(REPORT_DIR, { recursive: true });
}

async function generateReportStatistics(period) {
  const { startDate, endDate } = period;

  const [
    totalTxns,
    screenedTxns,
    frozenTxns,
    approvedTxns,
    rejectedTxns,
    hitTxns,
    byRiskLevel,
    byCountry,
    bySanctionList,
    byHsCode,
    reviews,
    completedReviews,
    pendingReviews,
    overdueReviews,
    escalatedReviews,
    slaBreachReviews,
    hourlyStats,
    dailyTrends,
  ] = await Promise.all([
    Transaction.countDocuments({ orderDate: { $gte: startDate, $lte: endDate } }),
    Transaction.countDocuments({ orderDate: { $gte: startDate, $lte: endDate }, status: { $ne: 'PENDING_SCREENING' } }),
    Transaction.countDocuments({ orderDate: { $gte: startDate, $lte: endDate }, frozen: true }),
    Transaction.countDocuments({ orderDate: { $gte: startDate, $lte: endDate }, status: 'APPROVED' }),
    Transaction.countDocuments({ orderDate: { $gte: startDate, $lte: endDate }, status: 'REJECTED' }),
    Transaction.find({
      orderDate: { $gte: startDate, $lte: endDate },
      'sanctionMatches.0': { $exists: true },
    }).countDocuments(),

    Transaction.aggregate([
      { $match: { orderDate: { $gte: startDate, $lte: endDate } } },
      { $group: { _id: '$riskLevel', count: { $sum: 1 } } },
    ]),

    Transaction.aggregate([
      { $match: { orderDate: { $gte: startDate, $lte: endDate } } },
      {
        $group: {
          _id: '$originCountry',
          count: { $sum: 1 },
          highRiskCount: { $sum: { $cond: [{ $in: ['$riskLevel', ['HIGH', 'CRITICAL']] }, 1, 0] } },
          hitCount: { $sum: { $cond: [{ $gt: [{ $size: '$sanctionMatches' }, 0] }, 1, 0] } },
        }
      },
      { $sort: { count: -1 } },
      { $limit: 15 },
    ]),

    Transaction.aggregate([
      { $match: { orderDate: { $gte: startDate, $lte: endDate }, 'sanctionMatches.0': { $exists: true } } },
      { $unwind: '$sanctionMatches' },
      {
        $group: {
          _id: '$sanctionMatches.listName',
          hitCount: { $sum: 1 },
          txnIds: { $addToSet: '$transactionId' },
        }
      },
      {
        $project: {
          hitCount: 1,
          uniqueTransactions: { $size: '$txnIds' },
          listName: '$_id',
        }
      },
      { $sort: { hitCount: -1 } },
    ]),

    Transaction.aggregate([
      { $match: { orderDate: { $gte: startDate, $lte: endDate } } },
      {
        $group: {
          _id: '$hsCode',
          count: { $sum: 1 },
          hitCount: { $sum: { $cond: [{ $gt: [{ $size: '$sanctionMatches' }, 0] }, 1, 0] } },
          description: { $first: '$hsDescription' },
        }
      },
      { $sort: { count: -1 } },
      { $limit: 10 },
    ]),

    ReviewTicket.countDocuments({ createdAt: { $gte: startDate, $lte: endDate } }),
    ReviewTicket.countDocuments({ createdAt: { $gte: startDate, $lte: endDate }, status: { $in: ['APPROVED', 'REJECTED', 'CLOSED'] } }),
    ReviewTicket.countDocuments({ createdAt: { $gte: startDate, $lte: endDate }, status: { $in: ['PENDING', 'ASSIGNED', 'IN_PROGRESS'] } }),
    ReviewTicket.countDocuments({ createdAt: { $gte: startDate, $lte: endDate }, isOverdue: true }),
    ReviewTicket.countDocuments({ createdAt: { $gte: startDate, $lte: endDate }, escalated: true }),
    ReviewTicket.countDocuments({ createdAt: { $gte: startDate, $lte: endDate }, slaBreached: true }),

    Transaction.aggregate([
      { $match: { orderDate: { $gte: startDate, $lte: endDate } } },
      {
        $group: {
          _id: { $hour: '$orderDate' },
          totalCount: { $sum: 1 },
          hitCount: { $sum: { $cond: [{ $gt: [{ $size: '$sanctionMatches' }, 0] }, 1, 0] } },
          avgRiskScore: { $avg: '$riskScore' },
        }
      },
      { $sort: { _id: 1 } },
    ]),

    generateDailyTrendData(startDate, endDate),
  ]);

  const totalHitsCount = bySanctionList.reduce((s, i) => s + (i.hitCount || 0), 0);
  const uniqueHitTxns = await Transaction.find({
    orderDate: { $gte: startDate, $lte: endDate },
    $expr: { $gt: [{ $size: '$sanctionMatches' }, 0] },
  }).countDocuments();

  const uniqueHits = Math.max(uniqueHitTxns, bySanctionList.reduce((s, i) => s + (i.uniqueTransactions || 0), 0));

  const underReview = await Transaction.countDocuments({
    orderDate: { $gte: startDate, $lte: endDate },
    status: { $in: ['FROZEN', 'UNDER_REVIEW'] },
  });

  const riskLevelMap = { LOW: 0, MEDIUM: 0, HIGH: 0, CRITICAL: 0 };
  byRiskLevel.forEach(item => {
    if (item._id) riskLevelMap[item._id] = item.count || 0;
  });

  const riskDistribution = Object.entries(riskLevelMap).map(([level, count]) => ({
    level,
    count,
    percentage: totalTxns > 0 ? parseFloat(((count / totalTxns) * 100).toFixed(2)) : 0,
  }));

  const reviewDurations = await ReviewTicket.find({
    createdAt: { $gte: startDate, $lte: endDate },
    status: { $in: ['APPROVED', 'REJECTED'] },
    reviewDurationHours: { $exists: true, $gt: 0 },
  }).select('reviewDurationHours -_id').lean();

  const durations = reviewDurations.map(r => r.reviewDurationHours).sort((a, b) => a - b);
  const avgDuration = durations.length > 0 ? (durations.reduce((s, d) => s + d, 0) / durations.length) : 0;
  const medianDuration = durations.length > 0 ? (durations.length % 2 === 0
    ? (durations[durations.length / 2 - 1] + durations[durations.length / 2]) / 2
    : durations[Math.floor(durations.length / 2)]) : 0;
  const p95Index = Math.floor(durations.length * 0.95);
  const p95Duration = durations.length > 0 ? durations[p95Index] || durations[durations.length - 1] : 0;

  const uniqueSuppliers = new Set();
  const highRiskSuppliersAffected = new Set();
  const txnSamples = await Transaction.find({
    orderDate: { $gte: startDate, $lte: endDate },
  }).select('supplierId riskLevel -_id').lean();
  txnSamples.forEach(t => {
    uniqueSuppliers.add(t.supplierId);
    if (t.riskLevel === 'HIGH' || t.riskLevel === 'CRITICAL') {
      highRiskSuppliersAffected.add(t.supplierId);
    }
  });

  const reviewerPerf = await ReviewTicket.aggregate([
    { $match: { createdAt: { $gte: startDate, $lte: endDate }, reviewedBy: { $exists: true } } },
    {
      $group: {
        _id: '$reviewedBy',
        reviewCount: { $sum: 1 },
        approvedCount: { $sum: { $cond: [{ $eq: ['$status', 'APPROVED'] }, 1, 0] } },
        rejectedCount: { $sum: { $cond: [{ $eq: ['$status', 'REJECTED'] }, 1, 0] } },
        avgHours: { $avg: '$reviewDurationHours' },
        overdueCount: { $sum: { $cond: ['$isOverdue', 1, 0] } },
      }
    },
    { $sort: { reviewCount: -1 } },
    { $limit: 10 },
  ]);

  return {
    summary: {
      totalTransactions: totalTxns,
      screenedTransactions: screenedTxns,
      frozenTransactions: frozenTxns,
      approvedTransactions: approvedTxns,
      rejectedTransactions: rejectedTxns,
      underReviewCount: underReview,

      totalSanctionHits: totalHitsCount,
      uniqueSanctionHits: uniqueHits,
      hitRate: totalTxns > 0 ? parseFloat(((uniqueHits / totalTxns) * 100).toFixed(4)) : 0,

      highRiskCount: riskLevelMap.HIGH,
      mediumRiskCount: riskLevelMap.MEDIUM,
      lowRiskCount: riskLevelMap.LOW,
      criticalRiskCount: riskLevelMap.CRITICAL,

      totalReviews: reviews,
      completedReviews,
      pendingReviews,
      overdueReviews,
      escalatedReviews,
      slaBreachCount: slaBreachReviews,

      averageReviewHours: parseFloat(avgDuration.toFixed(2)),
      medianReviewHours: parseFloat(medianDuration.toFixed(2)),
      p95ReviewHours: parseFloat(p95Duration.toFixed(2)),

      autoApprovalRate: screenedTxns > 0 ? parseFloat((((approvedTxns - completedReviews) / screenedTxns) * 100).toFixed(2)) : 0,
      manualReviewRate: screenedTxns > 0 ? parseFloat(((completedReviews / screenedTxns) * 100).toFixed(2)) : 0,
      rejectionRate: screenedTxns > 0 ? parseFloat(((rejectedTxns / screenedTxns) * 100).toFixed(2)) : 0,

      totalSuppliersAffected: uniqueSuppliers.size,
      highRiskSuppliers: highRiskSuppliersAffected.size,
    },
    riskDistribution,
    sanctionListBreakdown: bySanctionList.map(i => ({
      listName: i.listName,
      hitCount: i.hitCount,
      uniqueTransactions: i.uniqueTransactions,
    })),
    countryRiskBreakdown: byCountry.map(i => ({
      country: i._id,
      transactionCount: i.count,
      hitCount: i.hitCount,
      highRiskCount: i.highRiskCount,
    })),
    hsCodeRisk: byHsCode.map(i => ({
      hsCode: i._id,
      description: i.description,
      count: i.count,
      hitCount: i.hitCount,
    })),
    reviewerPerformance: reviewerPerf.map(r => ({
      reviewer: r._id,
      reviewCount: r.reviewCount,
      approvedCount: r.approvedCount,
      rejectedCount: r.rejectedCount,
      avgHours: parseFloat((r.avgHours || 0).toFixed(2)),
      overdueCount: r.overdueCount,
    })),
    hourlyTransactionStats: hourlyStats.map(h => ({
      hour: h._id,
      totalCount: h.totalCount,
      hitCount: h.hitCount,
      avgRiskScore: parseFloat((h.avgRiskScore || 0).toFixed(2)),
    })),
    trendData: dailyTrends,
  };
}

async function generateDailyTrendData(startDate, endDate) {
  const dates = [];
  const current = new Date(startDate);
  while (current <= endDate) {
    dates.push(new Date(current));
    current.setDate(current.getDate() + 1);
  }

  const dailyHitRates = [];
  const dailyReviewTimes = [];
  const dailyVolume = [];

  for (const date of dates) {
    const dayStart = new Date(date);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(date);
    dayEnd.setHours(23, 59, 59, 999);

    const [total, hits, reviews] = await Promise.all([
      Transaction.countDocuments({ orderDate: { $gte: dayStart, $lte: dayEnd } }),
      Transaction.countDocuments({
        orderDate: { $gte: dayStart, $lte: dayEnd },
        'sanctionMatches.0': { $exists: true },
      }),
      ReviewTicket.aggregate([
        { $match: { reviewedAt: { $gte: dayStart, $lte: dayEnd }, reviewDurationHours: { $exists: true } } },
        { $group: { _id: null, avgHours: { $avg: '$reviewDurationHours' } } },
      ]),
    ]);

    dailyVolume.push({ date, count: total });
    dailyHitRates.push({
      date,
      rate: total > 0 ? parseFloat(((hits / total) * 100).toFixed(3)) : 0,
      count: hits,
    });
    dailyReviewTimes.push({
      date,
      avgHours: reviews[0] ? parseFloat((reviews[0].avgHours || 0).toFixed(2)) : 0,
    });
  }

  return { dailyHitRates, dailyReviewTimes, dailyVolume };
}

async function exportReportToExcel(report) {
  const wb = XLSX.utils.book_new();

  const summaryData = [
    ['合规监控统计报告'],
    [`报告类型: ${report.reportType}`],
    [`统计周期: ${report.period.startDate.toLocaleDateString()} 至 ${report.period.endDate.toLocaleDateString()}`],
    [`生成时间: ${report.generatedAt.toLocaleString()}`],
    [],
    ['指标', '数值'],
    ['交易总数', report.summary.totalTransactions],
    ['已筛查交易', report.summary.screenedTransactions],
    ['冻结交易', report.summary.frozenTransactions],
    ['放行交易', report.summary.approvedTransactions],
    ['拒绝交易', report.summary.rejectedTransactions],
    ['审查中交易', report.summary.underReviewCount],
    [],
    ['制裁命中总数', report.summary.totalSanctionHits],
    ['唯一命中交易数', report.summary.uniqueSanctionHits],
    ['命中率(%)', report.summary.hitRate],
    [],
    ['极低风险', report.summary.lowRiskCount],
    ['中风险', report.summary.mediumRiskCount],
    ['高风险', report.summary.highRiskCount],
    ['极高风险', report.summary.criticalRiskCount],
    [],
    ['工单总数', report.summary.totalReviews],
    ['已完成工单', report.summary.completedReviews],
    ['待处理工单', report.summary.pendingReviews],
    ['超时工单', report.summary.overdueReviews],
    ['升级工单', report.summary.escalatedReviews],
    ['SLA违约数', report.summary.slaBreachCount],
    [],
    ['平均审查时长(小时)', report.summary.averageReviewHours],
    ['审查时长中位数(小时)', report.summary.medianReviewHours],
    ['P95审查时长(小时)', report.summary.p95ReviewHours],
    [],
    ['自动放行率(%)', report.summary.autoApprovalRate],
    ['人工审查率(%)', report.summary.manualReviewRate],
    ['拒绝率(%)', report.summary.rejectionRate],
    [],
    ['涉及供应商数', report.summary.totalSuppliersAffected],
    ['高风险供应商数', report.summary.highRiskSuppliers],
  ];
  const ws1 = XLSX.utils.aoa_to_sheet(summaryData);
  ws1['!cols'] = [{ wch: 30 }, { wch: 20 }];
  XLSX.utils.book_append_sheet(wb, ws1, '汇总统计');

  const riskDist = [['风险等级', '数量', '占比(%)']];
  report.riskDistribution.forEach(r => {
    riskDist.push([r.level, r.count, r.percentage]);
  });
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(riskDist), '风险分布');

  const sancBreakdown = [['制裁名单', '命中次数', '唯一交易数']];
  report.sanctionListBreakdown.forEach(s => {
    sancBreakdown.push([s.listName, s.hitCount, s.uniqueTransactions]);
  });
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(sancBreakdown), '制裁名单分析');

  const countryBrk = [['国家', '交易数', '命中数', '高风险数']];
  report.countryRiskBreakdown.forEach(c => {
    countryBrk.push([c.country, c.transactionCount, c.hitCount, c.highRiskCount]);
  });
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(countryBrk), '国家风险');

  const hsBrk = [['HS编码', '描述', '交易数', '命中数']];
  report.hsCodeRisk.forEach(h => {
    hsBrk.push([h.hsCode, h.description, h.count, h.hitCount]);
  });
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(hsBrk), 'HS编码分析');

  const reviewPerf = [['审查员', '审查数', '通过数', '拒绝数', '平均时长(小时)', '超时数']];
  report.reviewerPerformance.forEach(r => {
    reviewPerf.push([r.reviewer, r.reviewCount, r.approvedCount, r.rejectedCount, r.avgHours, r.overdueCount]);
  });
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(reviewPerf), '审查员绩效');

  const hourlyBrk = [['小时', '交易数', '命中数', '平均风险分']];
  report.hourlyTransactionStats.forEach(h => {
    hourlyBrk.push([`${h.hour}:00`, h.totalCount, h.hitCount, h.avgRiskScore]);
  });
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(hourlyBrk), '小时统计');

  const safeStart = report.period.startDate.toISOString().slice(0, 10).replace(/-/g, '');
  const safeEnd = report.period.endDate.toISOString().slice(0, 10).replace(/-/g, '');
  const fileName = `compliance_report_${report.reportType}_${safeStart}_${safeEnd}.xlsx`;
  const filePath = path.join(REPORT_DIR, fileName);

  XLSX.writeFile(wb, filePath);
  return filePath;
}

async function exportReportToPDF(report) {
  const safeStart = report.period.startDate.toISOString().slice(0, 10).replace(/-/g, '');
  const safeEnd = report.period.endDate.toISOString().slice(0, 10).replace(/-/g, '');
  const fileName = `compliance_report_${report.reportType}_${safeStart}_${safeEnd}.pdf`;
  const filePath = path.join(REPORT_DIR, fileName);

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50, bufferPages: true });
    const stream = fs.createWriteStream(filePath);
    doc.pipe(stream);

    const pageWidth = doc.page.width - 100;

    doc.fontSize(22).fillColor('#1a365d').text('合规监控统计报告', { align: 'center' });
    doc.moveDown(0.5);
    doc.fontSize(12).fillColor('#4a5568').text(`报告类型: ${report.reportType}报告`, { align: 'center' });
    doc.text(`统计周期: ${report.period.startDate.toLocaleDateString()} 至 ${report.period.endDate.toLocaleDateString()}`, { align: 'center' });
    doc.text(`生成时间: ${report.generatedAt.toLocaleString()}`, { align: 'center' });
    doc.moveDown();
    doc.strokeColor('#cbd5e0').lineWidth(1).moveTo(50, doc.y).lineTo(pageWidth + 50, doc.y).stroke();
    doc.moveDown();

    const sections = [
      { title: '交易统计', items: [
        { label: '交易总数', value: report.summary.totalTransactions.toLocaleString() },
        { label: '已筛查', value: report.summary.screenedTransactions.toLocaleString() },
        { label: '已冻结', value: report.summary.frozenTransactions.toLocaleString() },
        { label: '已放行', value: report.summary.approvedTransactions.toLocaleString() },
        { label: '已拒绝', value: report.summary.rejectedTransactions.toLocaleString() },
        { label: '审查中', value: report.summary.underReviewCount.toLocaleString() },
      ]},
      { title: '制裁命中统计', items: [
        { label: '命中总次数', value: report.summary.totalSanctionHits.toLocaleString() },
        { label: '唯一命中交易', value: report.summary.uniqueSanctionHits.toLocaleString() },
        { label: '命中率', value: `${report.summary.hitRate}%` },
      ]},
      { title: '风险分布', items: [
        { label: '极低风险 (LOW)', value: report.summary.lowRiskCount.toLocaleString() },
        { label: '中风险 (MEDIUM)', value: report.summary.mediumRiskCount.toLocaleString() },
        { label: '高风险 (HIGH)', value: report.summary.highRiskCount.toLocaleString() },
        { label: '极高风险 (CRITICAL)', value: report.summary.criticalRiskCount.toLocaleString() },
      ]},
      { title: '审查效率', items: [
        { label: '工单总数', value: report.summary.totalReviews.toLocaleString() },
        { label: '已完成', value: report.summary.completedReviews.toLocaleString() },
        { label: '待处理', value: report.summary.pendingReviews.toLocaleString() },
        { label: '超时未处理', value: report.summary.overdueReviews.toLocaleString() },
        { label: '升级工单', value: report.summary.escalatedReviews.toLocaleString() },
        { label: 'SLA违约', value: report.summary.slaBreachCount.toLocaleString() },
      ]},
      { title: '审查时长', items: [
        { label: '平均时长', value: `${report.summary.averageReviewHours} 小时` },
        { label: '中位数', value: `${report.summary.medianReviewHours} 小时` },
        { label: 'P95分位', value: `${report.summary.p95ReviewHours} 小时` },
      ]},
    ];

    for (const section of sections) {
      doc.fontSize(14).fillColor('#1a365d').text(section.title);
      doc.moveDown(0.3);

      for (const item of section.items) {
        doc.fontSize(10).fillColor('#2d3748').text(`${item.label}:`, { continued: true });
        doc.fillColor('#1a365d').text(`  ${item.value}`);
      }
      doc.moveDown();
    }

    if (report.sanctionListBreakdown.length > 0) {
      doc.fontSize(14).fillColor('#1a365d').text('制裁名单命中明细');
      doc.moveDown(0.3);
      doc.fontSize(10).fillColor('#2d3748');
      for (const item of report.sanctionListBreakdown) {
        doc.text(`• ${item.listName}: 命中${item.hitCount}次 / ${item.uniqueTransactions}笔交易`);
      }
      doc.moveDown();
    }

    if (report.countryRiskBreakdown.length > 0) {
      doc.addPage();
      doc.fontSize(14).fillColor('#1a365d').text('Top 15 国家风险分布');
      doc.moveDown(0.3);
      doc.fontSize(10).fillColor('#2d3748');
      const topCountries = report.countryRiskBreakdown.slice(0, 15);
      for (const c of topCountries) {
        doc.text(`• ${c.country}: ${c.transactionCount}笔 / 命中${c.hitCount}次 / 高风险${c.highRiskCount}笔`);
      }
    }

    const pageCount = doc.bufferedPageRange().count;
    for (let i = 0; i < pageCount; i++) {
      doc.switchToPage(i);
      doc.fontSize(8).fillColor('#a0aec0').text(
        `合规监控系统 · 机密文件 · 第 ${i + 1}/${pageCount} 页`,
        50,
        doc.page.height - 40,
        { align: 'center', width: pageWidth }
      );
    }

    doc.end();
    stream.on('finish', () => resolve(filePath));
    stream.on('error', reject);
  });
}

async function generateReport(opts) {
  const { reportType = 'DAILY', startDate, endDate, generatedBy = 'system' } = opts;

  const period = {
    startDate: new Date(startDate),
    endDate: new Date(endDate),
  };

  logger.info(`开始生成${reportType}报告: ${period.startDate.toLocaleDateString()} ~ ${period.endDate.toLocaleDateString()}`);

  const statistics = await generateReportStatistics(period);

  const report = new ComplianceReport({
    reportId: 'RPT-' + Date.now().toString(36).toUpperCase(),
    reportType,
    period,
    generatedAt: new Date(),
    generatedBy,
    ...statistics,
    status: 'GENERATING',
  });

  await report.save();

  try {
    const [excelPath, pdfPath] = await Promise.all([
      exportReportToExcel(report),
      exportReportToPDF(report),
    ]);

    report.filePaths = {
      excel: excelPath,
      pdf: pdfPath,
    };
    report.status = 'COMPLETED';
    await report.save();

    await createAuditLog({
      action: 'REPORT_GENERATED',
      category: 'REPORT',
      severity: 'INFO',
      entityType: 'ComplianceReport',
      entityId: report.reportId,
      description: `合规报告生成完成: ${reportType}`,
      details: {
        startDate,
        endDate,
        totalTxns: report.summary.totalTransactions,
        hitRate: report.summary.hitRate,
      },
    });

    logger.info(`报告生成完成: ${report.reportId}`);
    return report;

  } catch (err) {
    report.status = 'FAILED';
    report.errorMessage = err.message;
    await report.save();
    throw err;
  }
}

async function listReports(query = {}) {
  const filter = {};
  if (query.reportType) filter.reportType = query.reportType;
  if (query.startDate) filter['period.startDate'] = { $gte: new Date(query.startDate) };
  if (query.endDate) filter['period.endDate'] = { $lte: new Date(query.endDate) };
  if (query.status) filter.status = query.status;

  const page = parseInt(query.page) || 1;
  const pageSize = parseInt(query.pageSize) || 20;
  const skip = (page - 1) * pageSize;

  const total = await ComplianceReport.countDocuments(filter);
  const items = await ComplianceReport.find(filter)
    .sort({ generatedAt: -1 })
    .skip(skip)
    .limit(pageSize);

  return { total, page, pageSize, items };
}

async function getRecentDashboardStats() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const weekStart = new Date(today);
  weekStart.setDate(weekStart.getDate() - 7);
  const monthStart = new Date(today);
  monthStart.setDate(1);

  const [
    todayTxns,
    todayHits,
    weekTxns,
    pendingReviews,
    overdueReviews,
    highRiskCount,
    totalActiveSanctions,
    suppliers,
  ] = await Promise.all([
    Transaction.countDocuments({ orderDate: { $gte: today } }),
    Transaction.countDocuments({
      orderDate: { $gte: today },
      $expr: { $gt: [{ $size: '$sanctionMatches' }, 0] },
    }),
    Transaction.countDocuments({ orderDate: { $gte: weekStart } }),
    ReviewTicket.countDocuments({ status: { $in: ['PENDING', 'ASSIGNED', 'IN_PROGRESS'] } }),
    ReviewTicket.countDocuments({ isOverdue: true, status: { $ne: 'CLOSED' } }),
    Transaction.countDocuments({
      orderDate: { $gte: yesterday },
      riskLevel: { $in: ['HIGH', 'CRITICAL'] },
    }),
    SanctionEntry.countDocuments({ isActive: true }),
    {
      total: await require('../models/Supplier').countDocuments({ isActive: true }),
      highRisk: await require('../models/Supplier').countDocuments({ isActive: true, riskLevel: { $in: ['HIGH', 'CRITICAL', 'BLACKLISTED'] } }),
    },
  ]);

  return {
    today: {
      transactions: todayTxns,
      sanctionHits: todayHits,
      hitRate: todayTxns > 0 ? parseFloat(((todayHits / todayTxns) * 100).toFixed(2)) : 0,
      highRiskAlerts: highRiskCount,
    },
    week: {
      transactions: weekTxns,
    },
    month: {
      start: monthStart,
    },
    pendingWork: {
      pendingReviews,
      overdueReviews,
      slaWarning: overdueReviews > 0,
    },
    sanctions: {
      activeEntries: totalActiveSanctions,
    },
    suppliers: {
      total: suppliers.total,
      highRisk: suppliers.highRisk,
    },
  };
}

module.exports = {
  generateReport,
  listReports,
  generateReportStatistics,
  exportReportToExcel,
  exportReportToPDF,
  getRecentDashboardStats,
};
