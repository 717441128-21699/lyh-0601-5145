const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
const { faker } = require('@faker-js/faker');
const Transaction = require('../models/Transaction');
const Supplier = require('../models/Supplier');
const logger = require('../config/logger');
const { getQueue } = require('../config/queue');

const HS_CODES = [
  { code: '8471.30', desc: '便携式自动数据处理设备' },
  { code: '8471.41', desc: '处理部件' },
  { code: '8542.31', desc: '集成电路' },
  { code: '8517.12', desc: '电信设备' },
  { code: '8803.30', desc: '航空零部件' },
  { code: '9013.80', desc: '光学仪器' },
  { code: '8411.82', desc: '涡轮发动机零件' },
  { code: '8525.60', desc: '通信设备' },
  { code: '3808.91', desc: '杀虫剂' },
  { code: '8458.11', desc: '车床' },
  { code: '8479.89', desc: '专用机械' },
  { code: '3926.90', desc: '塑料制品' },
  { code: '7326.90', desc: '钢铁制品' },
  { code: '8459.29', desc: '钻床' },
  { code: '8501.64', desc: '电动机' },
];

const HIGH_RISK_COUNTRIES = ['IR', 'KP', 'SY', 'CU', 'VE', 'BY', 'MM', 'RU', 'SO', 'SD', 'LY', 'YE'];
const MEDIUM_RISK_COUNTRIES = ['CN', 'AE', 'SA', 'HK', 'SG', 'AE', 'QA', 'KW', 'BH', 'OM'];
const NORMAL_COUNTRIES = ['US', 'DE', 'JP', 'GB', 'FR', 'CA', 'AU', 'NL', 'KR', 'IN', 'BR', 'IT', 'ES', 'MX', 'TW'];

const END_USE_SENSITIVE = ['军事', '国防', '核设施', '导弹', '航空', '航天', '武器', '弹药', '生化'];

function randomCountry() {
  const rand = Math.random();
  if (rand < 0.1) return HIGH_RISK_COUNTRIES[Math.floor(Math.random() * HIGH_RISK_COUNTRIES.length)];
  if (rand < 0.3) return MEDIUM_RISK_COUNTRIES[Math.floor(Math.random() * MEDIUM_RISK_COUNTRIES.length)];
  return NORMAL_COUNTRIES[Math.floor(Math.random() * NORMAL_COUNTRIES.length)];
}

function generateMockTransactions(count, date = new Date()) {
  const transactions = [];
  const dayStart = new Date(date);
  dayStart.setHours(0, 0, 0, 0);

  for (let i = 0; i < count; i++) {
    const hsCode = HS_CODES[Math.floor(Math.random() * HS_CODES.length)];
    const origin = randomCountry();
    const supplierCountry = Math.random() < 0.8 ? origin : randomCountry();
    const unitPrice = parseFloat((Math.random() * 50000 + 100).toFixed(2));
    const quantity = Math.floor(Math.random() * 5000 + 1);
    const orderTime = new Date(dayStart.getTime() + Math.random() * 24 * 60 * 60 * 1000);

    let endUser = faker.company.name();
    if (Math.random() < 0.08) {
      endUser = END_USE_SENSITIVE[Math.floor(Math.random() * END_USE_SENSITIVE.length)]
        + '部门-' + faker.company.name();
    }

    transactions.push({
      transactionId: 'TXN-' + dayStart.getFullYear() +
        String(dayStart.getMonth() + 1).padStart(2, '0') +
        String(dayStart.getDate()).padStart(2, '0') +
        '-' + String(i + 1).padStart(6, '0'),
      poNumber: 'PO-' + (202400000 + Math.floor(Math.random() * 99999)),
      orderDate: orderTime,
      supplierId: 'SUP-' + String(Math.floor(Math.random() * 500) + 1).padStart(4, '0'),
      supplierName: faker.company.name(),
      supplierCountry,
      hsCode: hsCode.code,
      hsDescription: hsCode.desc,
      originCountry: origin,
      destinationCountry: Math.random() < 0.7 ? 'CN' : randomCountry(),
      endUser,
      endUserCountry: randomCountry(),
      productDescription: hsCode.desc + ' - ' + faker.commerce.productName(),
      quantity,
      unitPrice,
      totalAmount: parseFloat((unitPrice * quantity).toFixed(2)),
      currency: Math.random() < 0.85 ? 'USD' : ['EUR', 'CNY', 'GBP', 'JPY'][Math.floor(Math.random() * 4)],
    });
  }

  return transactions;
}

async function fetchFromPOApi(incremental = false) {
  const mockUrl = process.env.PO_API_URL;
  logger.info(`尝试从采购订单API抓取数据: ${mockUrl || '(模拟模式)'}`);

  if (!mockUrl || mockUrl.includes('example.com') || mockUrl.includes('purchase-system.com')) {
    const baseCount = incremental ? 1000 : Math.floor(Math.random() * 3000) + 2000;
    const count = Math.floor(baseCount * (0.8 + Math.random() * 0.4));
    logger.info(`[模拟] 从采购系统抓取 ${count} 条订单`);
    return generateMockTransactions(count);
  }

  try {
    const response = await axios.get(mockUrl, {
      params: incremental ? { since: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString() } : {},
      timeout: 30000,
    });
    return response.data.transactions || [];
  } catch (err) {
    logger.warn('采购订单API抓取失败，切换到模拟模式:', err.message);
    return generateMockTransactions(Math.floor(Math.random() * 2000) + 1500);
  }
}

async function enrichSupplierData(transactions) {
  logger.info(`开始补全 ${transactions.length} 条交易的供应商信息`);

  const supplierIds = [...new Set(transactions.map(t => t.supplierId))];
  const existingSuppliers = await Supplier.find(
    { supplierId: { $in: supplierIds } },
    { supplierId: 1, name: 1, country: 1, riskLevel: 1 }
  ).lean();
  const supplierMap = new Map(existingSuppliers.map(s => [s.supplierId, s]));

  const newSuppliers = [];
  for (const txn of transactions) {
    if (!supplierMap.has(txn.supplierId)) {
      newSuppliers.push({
        supplierId: txn.supplierId,
        name: txn.supplierName,
        legalName: txn.supplierName + (Math.random() < 0.3 ? ' Co., Ltd.' : ''),
        country: txn.supplierCountry,
        countriesOfOperation: [txn.supplierCountry],
        isActive: true,
      });
    }
  }

  if (newSuppliers.length > 0) {
    try {
      await Supplier.insertMany(newSuppliers, { ordered: false });
      logger.info(`新增 ${newSuppliers.length} 个供应商记录`);
    } catch (err) {
      logger.warn(`供应商批量插入部分失败: ${err.message}`);
    }
  }

  return transactions;
}

async function saveTransactions(transactions) {
  if (!transactions || transactions.length === 0) return { inserted: 0, skipped: 0 };

  logger.info(`开始保存 ${transactions.length} 条交易记录`);
  const ops = [];
  const BATCH_SIZE = 500;
  let inserted = 0;
  let skipped = 0;

  for (let i = 0; i < transactions.length; i += BATCH_SIZE) {
    const batch = transactions.slice(i, i + BATCH_SIZE);
    const batchOps = batch.map(t => ({
      updateOne: {
        filter: { transactionId: t.transactionId },
        update: { $setOnInsert: { ...t, status: 'PENDING_SCREENING' } },
        upsert: true,
      }
    }));

    try {
      const result = await Transaction.bulkWrite(batchOps, { ordered: false });
      inserted += result.upsertedCount || 0;
      skipped += (result.matchedCount || 0);
    } catch (err) {
      logger.error(`交易批量写入失败(块${i}):`, err.message);
    }

    if (i % (BATCH_SIZE * 10) === 0 && i > 0) {
      logger.info(`进度: 已处理 ${i}/${transactions.length} 条`);
    }
  }

  logger.info(`交易保存完成: 新增${inserted}条, 已存在${skipped}条`);
  return { inserted, skipped };
}

async function queueForScreening(newTransactionIds) {
  if (!newTransactionIds || newTransactionIds.length === 0) return;

  logger.info(`将 ${newTransactionIds.length} 条新交易加入筛查队列`);
  const transactionQueue = getQueue('transaction');

  if (newTransactionIds.length <= 100) {
    for (const id of newTransactionIds) {
      await transactionQueue.add('process-single', { transactionId: id });
    }
  } else {
    const BATCH_SIZE = 200;
    for (let i = 0; i < newTransactionIds.length; i += BATCH_SIZE) {
      const batch = newTransactionIds.slice(i, i + BATCH_SIZE);
      await transactionQueue.add('process-batch', { transactionIds: batch });
    }
  }

  logger.info('筛查任务已入队');
}

async function fetchDailyTransactions(incremental = false) {
  const label = incremental ? '增量同步' : '每日抓取';
  logger.info(`========== 开始${label} ==========`);

  try {
    const transactions = await fetchFromPOApi(incremental);
    logger.info(`获取到 ${transactions.length} 条交易原始数据`);

    if (transactions.length === 0) {
      logger.info(`${label}完成，无新数据`);
      return { fetched: 0 };
    }

    await enrichSupplierData(transactions);

    const txnIds = transactions.map(t => t.transactionId);
    const existing = await Transaction.find(
      { transactionId: { $in: txnIds } },
      { transactionId: 1 }
    ).lean();
    const existingSet = new Set(existing.map(t => t.transactionId));
    const newTransactions = transactions.filter(t => !existingSet.has(t.transactionId));
    const existingCount = transactions.length - newTransactions.length;

    logger.info(`其中新交易: ${newTransactions.length}条, 已存在: ${existingCount}条`);

    await saveTransactions(newTransactions);

    if (newTransactions.length > 0) {
      const savedIds = newTransactions.map(t => t.transactionId);
      await queueForScreening(savedIds);
    }

    logger.info(`========== ${label}完成 ==========`);

    return {
      fetched: transactions.length,
      new: newTransactions.length,
      existing: existingCount,
    };
  } catch (err) {
    logger.error(`${label}失败:`, err);
    throw err;
  }
}

module.exports = {
  fetchDailyTransactions,
  fetchFromPOApi,
  enrichSupplierData,
  saveTransactions,
  queueForScreening,
  generateMockTransactions,
};
