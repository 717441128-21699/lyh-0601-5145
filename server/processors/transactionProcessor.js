const Transaction = require('../models/Transaction');
const logger = require('../config/logger');
const { calculateRiskScore } = require('../services/riskEngineService');
const { createReviewTicket } = require('../services/reviewService');
const { alertHighRiskTransaction } = require('../services/notificationService');
const { getQueue } = require('../config/queue');

const HIGH_RISK_THRESHOLD = parseInt(process.env.RISK_THRESHOLD_HIGH || '80');
const MEDIUM_RISK_THRESHOLD = parseInt(process.env.RISK_THRESHOLD_MEDIUM || '50');

async function processTransaction(job) {
  const { transactionId } = job.data;
  logger.info(`[交易处理器] 开始处理: ${transactionId}`);

  try {
    const transaction = await Transaction.findOne({ transactionId });
    if (!transaction) {
      logger.warn(`交易不存在: ${transactionId}`);
      return { skipped: true, reason: 'not_found' };
    }

    if (transaction.status !== 'PENDING_SCREENING') {
      logger.info(`交易已处理，跳过: ${transactionId} (${transaction.status})`);
      return { skipped: true, reason: 'already_processed' };
    }

    const riskResult = await calculateRiskScore(transaction);

    transaction.riskScore = riskResult.riskScore;
    transaction.riskLevel = riskResult.riskLevel;
    transaction.riskFactors = riskResult.riskFactors;
    transaction.sanctionMatches = riskResult.sanctionMatches;
    transaction.status = 'SCREENED';

    let ticket = null;

    if (riskResult.riskScore >= HIGH_RISK_THRESHOLD - 15 || riskResult.sanctionMatches.length > 0) {
      transaction.frozen = true;
      transaction.frozenAt = new Date();
      transaction.status = 'UNDER_REVIEW';

      ticket = await createReviewTicket(transaction, riskResult);
      transaction.reviewId = ticket._id;

      await alertHighRiskTransaction(transaction, riskResult, ticket);
    }

    await transaction.save();

    logger.info(`[交易处理器] 完成: ${transactionId} - 风险:${riskResult.riskLevel}/${riskResult.riskScore} - ${riskResult.sanctionMatches.length}处命中`);

    return {
      success: true,
      transactionId,
      riskScore: riskResult.riskScore,
      riskLevel: riskResult.riskLevel,
      matchedSanctions: riskResult.sanctionMatches.length,
      ticketCreated: !!ticket,
      ticketId: ticket?.ticketId || null,
    };

  } catch (err) {
    logger.error(`[交易处理器] 失败: ${transactionId}`, {
      error: err.message,
      stack: err.stack,
    });
    throw err;
  }
}

async function processBatchTransactions(job) {
  const { transactionIds } = job.data;
  logger.info(`[批量处理器] 开始处理 ${transactionIds.length} 条交易`);

  const BATCH_SIZE = 50;
  const results = { success: 0, failed: 0, skipped: 0, highRisk: 0, ticketsCreated: [] };

  for (let i = 0; i < transactionIds.length; i += BATCH_SIZE) {
    const batch = transactionIds.slice(i, i + BATCH_SIZE);
    const promises = batch.map(id =>
      processTransaction({ data: { transactionId: id } })
        .then(r => ({ id, result: r }))
        .catch(err => ({ id, error: err.message }))
    );

    const batchResults = await Promise.allSettled(promises);

    for (const settled of batchResults) {
      if (settled.status === 'fulfilled') {
        const { result } = settled.value;
        if (result?.skipped) results.skipped++;
        else if (result?.success) {
          results.success++;
          if (result.riskScore >= HIGH_RISK_THRESHOLD - 15) results.highRisk++;
          if (result.ticketCreated) results.ticketsCreated.push(result.ticketId);
        } else results.failed++;
      } else {
        results.failed++;
      }
    }

    const progress = Math.min(i + BATCH_SIZE, transactionIds.length);
    job.progress(Math.round((progress / transactionIds.length) * 100));

    if (i % (BATCH_SIZE * 5) === 0 && i > 0) {
      logger.info(`[批量处理器] 进度 ${progress}/${transactionIds.length}: 成功${results.success}, 失败${results.failed}, 跳过${results.skipped}`);
    }
  }

  logger.info(`[批量处理器] 完成: 成功${results.success}, 失败${results.failed}, 跳过${results.skipped}, 高风险${results.highRisk}, 生成工单${results.ticketsCreated.length}`);
  return results;
}

module.exports = {
  processTransaction,
  processBatchTransactions,
};
