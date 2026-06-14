const Queue = require('bull');
const Redis = require('ioredis');
const logger = require('./logger');
const { processTransaction, processBatchTransactions } = require('../processors/transactionProcessor');
const { processSanctionMatch, sendAlertNotification } = require('../processors/sanctionProcessor');
const { generateDailyReport } = require('../processors/reportProcessor');
const { checkReviewTimeout } = require('../processors/reviewProcessor');

let redisClient;
let transactionQueue;
let sanctionQueue;
let reportQueue;
let notificationQueue;
let reviewQueue;

function getRedisConfig() {
  const config = {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  };
  if (process.env.REDIS_PASSWORD) {
    config.password = process.env.REDIS_PASSWORD;
  }
  return config;
}

function initializeQueues() {
  try {
    const redisConfig = getRedisConfig();
    redisClient = new Redis(redisConfig);

    transactionQueue = new Queue('transactions', {
      redis: redisConfig,
      defaultJobOptions: {
        removeOnComplete: 1000,
        removeOnFail: 5000,
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 },
      },
    });

    sanctionQueue = new Queue('sanction-matching', {
      redis: redisConfig,
      defaultJobOptions: {
        removeOnComplete: 1000,
        removeOnFail: 5000,
        attempts: 2,
      },
    });

    reportQueue = new Queue('reports', {
      redis: redisConfig,
      defaultJobOptions: {
        removeOnComplete: 500,
        removeOnFail: 200,
      },
    });

    notificationQueue = new Queue('notifications', {
      redis: redisConfig,
      defaultJobOptions: {
        removeOnComplete: true,
        removeOnFail: 200,
        attempts: 5,
        backoff: { type: 'fixed', delay: 10000 },
      },
    });

    reviewQueue = new Queue('review-timeout', {
      redis: redisConfig,
      defaultJobOptions: {
        removeOnComplete: 100,
        removeOnFail: 100,
      },
    });

    logger.info('所有队列创建成功');
  } catch (error) {
    logger.error('队列初始化失败:', error);
    throw error;
  }
}

function startAllProcessors() {
  transactionQueue.process('process-single', processTransaction);
  transactionQueue.process('process-batch', 5, processBatchTransactions);

  sanctionQueue.process('match-sanctions', processSanctionMatch);

  reportQueue.process('generate-daily-report', generateDailyReport);

  notificationQueue.process('send-alert', sendAlertNotification);

  reviewQueue.process('check-timeout', checkReviewTimeout);

  logger.info('所有处理器已启动');
}

function getQueue(name) {
  const queues = {
    transaction: transactionQueue,
    sanction: sanctionQueue,
    report: reportQueue,
    notification: notificationQueue,
    review: reviewQueue,
  };
  return queues[name];
}

module.exports = {
  initializeQueues,
  startAllProcessors,
  getQueue,
  getRedisConfig,
};
