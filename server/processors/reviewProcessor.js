const logger = require('../config/logger');
const { checkAndEscalateOverdue } = require('../services/reviewService');

async function checkReviewTimeout(job) {
  const { checkTime } = job.data;
  logger.info(`[工单超时检查] 运行于: ${checkTime}`);

  try {
    const result = await checkAndEscalateOverdue();

    logger.info(`[工单超时检查] 完成: 升级工单 ${result.overdueCount} 个`);

    return {
      success: true,
      checkTime,
      overdueCount: result.overdueCount,
    };

  } catch (err) {
    logger.error('[工单超时检查] 失败:', err);
    throw err;
  }
}

module.exports = {
  checkReviewTimeout,
};
