const logger = require('../config/logger');
const { generateReport, alertReportGenerated } = require('../services/reportService');

async function generateDailyReport(job) {
  const { date } = job.data;
  logger.info(`[报告处理器] 开始生成 ${date} 日报告`);

  try {
    const startDate = new Date(date);
    startDate.setHours(0, 0, 0, 0);
    const endDate = new Date(date);
    endDate.setHours(23, 59, 59, 999);

    const report = await generateReport({
      reportType: 'DAILY',
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
      generatedBy: 'system_cron',
    });

    try {
      await alertReportGenerated(report, { userId: 'system', username: '系统定时任务' });
    } catch (notifErr) {
      logger.warn('报告通知发送失败:', notifErr.message);
    }

    logger.info(`[报告处理器] 完成: 报告ID=${report.reportId}, 交易数=${report.summary.totalTransactions}, 命中率=${report.summary.hitRate}%`);

    return {
      success: true,
      reportId: report.reportId,
      files: report.filePaths,
      summary: report.summary,
    };

  } catch (err) {
    logger.error('[报告处理器] 失败:', err);
    throw err;
  }
}

module.exports = {
  generateDailyReport,
};
