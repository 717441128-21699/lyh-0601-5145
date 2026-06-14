const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const logger = require('./config/logger');
const { initializeQueues, startAllProcessors } = require('./config/queue');
const { initCronJobs } = require('./config/cron');
const authRoutes = require('./routes/auth');
const transactionRoutes = require('./routes/transactions');
const sanctionRoutes = require('./routes/sanctions');
const reviewRoutes = require('./routes/reviews');
const reportRoutes = require('./routes/reports');
const supplierRoutes = require('./routes/suppliers');
const auditRoutes = require('./routes/audit');
const dashboardRoutes = require('./routes/dashboard');
const notificationRoutes = require('./routes/notifications');
const { errorHandler } = require('./middleware/errorHandler');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10000,
  standardHeaders: true,
  legacyHeaders: false,
});

app.use('/api/', apiLimiter);
app.use('/uploads', express.static('uploads'));
app.use('/reports', express.static('reports'));

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
  });
});

app.use('/api/auth', authRoutes);
app.use('/api/transactions', transactionRoutes);
app.use('/api/sanctions', sanctionRoutes);
app.use('/api/reviews', reviewRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/suppliers', supplierRoutes);
app.use('/api/audit', auditRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/notifications', notificationRoutes);

app.use(errorHandler);

async function startServer() {
  try {
    logger.info('正在启动合规监控系统...');

    await mongoose.connect(process.env.MONGODB_URI, {
      maxPoolSize: 50,
      socketTimeoutMS: 45000,
      serverSelectionTimeoutMS: 5000,
    });
    logger.info('MongoDB 数据库连接成功');

    initializeQueues();
    logger.info('任务队列初始化完成');

    startAllProcessors();
    logger.info('任务处理器启动完成');

    initCronJobs();
    logger.info('定时任务已配置');

    app.listen(PORT, () => {
      logger.info(`服务已启动: http://localhost:${PORT}`);
      logger.info(`API 文档: http://localhost:${PORT}/api/health`);
    });
  } catch (error) {
    logger.error('启动失败:', error);
    process.exit(1);
  }
}

process.on('SIGTERM', async () => {
  logger.info('收到SIGTERM信号，正在优雅关闭...');
  await mongoose.disconnect();
  process.exit(0);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('未处理的Promise拒绝:', { reason, promise });
});

startServer();
