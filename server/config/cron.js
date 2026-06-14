const cron = require('node-cron');
const logger = require('./logger');
const { getQueue } = require('./queue');
const { fetchDailyTransactions } = require('../services/dataFetchService');

function initCronJobs() {
  cron.schedule('0 0 * * *', async () => {
    logger.info('触发每日交易数据抓取任务');
    try {
      await fetchDailyTransactions();
    } catch (error) {
      logger.error('每日交易抓取失败:', error);
    }
  }, {
    scheduled: true,
    timezone: 'Asia/Shanghai',
  });

  cron.schedule('0 2 * * *', async () => {
    logger.info('触发每日合规报告生成任务');
    try {
      const reportQueue = getQueue('report');
      await reportQueue.add('generate-daily-report', {
        date: new Date().toISOString().split('T')[0],
      });
    } catch (error) {
      logger.error('报告生成任务调度失败:', error);
    }
  }, {
    scheduled: true,
    timezone: 'Asia/Shanghai',
  });

  cron.schedule('*/15 * * * *', async () => {
    try {
      const reviewQueue = getQueue('review');
      await reviewQueue.add('check-timeout', {
        checkTime: new Date().toISOString(),
      });
    } catch (error) {
      logger.error('工单超时检查任务失败:', error);
    }
  });

  cron.schedule('0 */4 * * *', async () => {
    logger.info('触发增量交易数据同步');
    try {
      await fetchDailyTransactions(true);
    } catch (error) {
      logger.error('增量同步失败:', error);
    }
  }, {
    scheduled: true,
    timezone: 'Asia/Shanghai',
  });

  logger.info('所有定时任务已配置完成');
}

module.exports = { initCronJobs };
