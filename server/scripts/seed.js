require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const logger = require('../config/logger');

const User = require('../models/User');
const SanctionEntry = require('../models/SanctionEntry');
const Supplier = require('../models/Supplier');
const Transaction = require('../models/Transaction');
const ReviewTicket = require('../models/ReviewTicket');
const ComplianceReport = require('../models/ComplianceReport');

const HIGH_RISK_ENTITIES = [
  {
    name: 'North Korea Foreign Trade Bank',
    aliases: ['NKFTB', 'DPRK Trade Bank'],
    entityType: 'COMPANY',
    listName: 'OFAC-SDN',
    countries: ['KP'],
    programs: ['DPRK'],
  },
  {
    name: 'Islamic Revolutionary Guard Corps',
    aliases: ['IRGC', 'Pasdaran'],
    entityType: 'ORGANIZATION',
    listName: 'OFAC-SDN',
    countries: ['IR'],
    programs: ['IRAN'],
  },
  {
    name: 'Mahan Air',
    aliases: ['Mahan Airlines'],
    entityType: 'COMPANY',
    listName: 'OFAC-SDN',
    countries: ['IR'],
    programs: ['IRAN-TR'],
  },
  {
    name: 'Syrian Arab Airlines',
    aliases: ['Syrianair', 'Syrian Airlines'],
    entityType: 'COMPANY',
    listName: 'OFAC-SDN',
    countries: ['SY'],
    programs: ['SYRIA'],
  },
  {
    name: 'Rosoboronexport',
    aliases: ['Rostec Defense Export'],
    entityType: 'COMPANY',
    listName: 'EU-CON',
    countries: ['RU'],
  },
  {
    name: 'Promsvyazbank',
    aliases: ['PSB Bank'],
    entityType: 'COMPANY',
    listName: 'EU-CON',
    countries: ['RU'],
  },
  {
    name: 'ALIP',
    aliases: ['Arab League Investment Program'],
    entityType: 'ORGANIZATION',
    listName: 'UN-SEC',
    countries: ['SO'],
  },
  {
    name: 'VTB Bank',
    aliases: ['VTB Group', 'Vneshtorgbank'],
    entityType: 'COMPANY',
    listName: 'UK-CONS',
    countries: ['RU'],
  },
  {
    name: 'Kim Jong Un',
    firstName: 'Jong Un',
    lastName: 'Kim',
    entityType: 'INDIVIDUAL',
    listName: 'OFAC-SDN',
    countries: ['KP'],
    nationalities: ['KP'],
    programs: ['DPRK'],
  },
  {
    name: 'Ayatollah Ali Khamenei',
    aliases: ['Sayyid Ali Hosseini Khamenei'],
    entityType: 'INDIVIDUAL',
    listName: 'EU-CON',
    countries: ['IR'],
    nationalities: ['IR'],
  },
  {
    name: 'Bashar al-Assad',
    firstName: 'Bashar',
    lastName: 'Assad',
    entityType: 'INDIVIDUAL',
    listName: 'UN-SEC',
    countries: ['SY'],
    nationalities: ['SY'],
  },
  {
    name: 'Iran',
    entityType: 'COUNTRY',
    listName: 'OFAC-SDN',
    countries: ['IR'],
    hsCodes: ['2709', '2710', '2711'],
  },
  {
    name: 'North Korea',
    entityType: 'COUNTRY',
    listName: 'OFAC-SDN',
    countries: ['KP'],
    hsCodes: ['8471', '8542', '8517'],
  },
  {
    name: 'Syria',
    entityType: 'COUNTRY',
    listName: 'OFAC-SDN',
    countries: ['SY'],
  },
  {
    name: 'Specified Chemicals Co',
    entityType: 'COMPANY',
    listName: 'OFAC-NSMBS',
    countries: ['RU'],
    hsCodes: ['2833', '2834', '2835'],
    goodsDescription: 'Dual-use chemical precursors',
  },
  {
    name: 'Precision Machine Tools Ltd',
    entityType: 'COMPANY',
    listName: 'OFAC-NSMBS',
    countries: ['CN'],
    hsCodes: ['8458', '8459', '8460', '8461'],
    goodsDescription: 'High-precision CNC machine tools',
  },
  {
    name: 'Aerospace Composite Industries',
    entityType: 'COMPANY',
    listName: 'EU-CON',
    countries: ['IR'],
    hsCodes: ['8803', '8804', '8805'],
    goodsDescription: 'Aerospace-grade composite materials',
  },
  {
    name: 'Maritime Trading LLC',
    entityType: 'COMPANY',
    listName: 'HMT',
    countries: ['VE'],
    vesselImoNumber: 'IMO9876543',
    vesselFlag: 'VE',
  },
  {
    name: 'Electro Optics Systems',
    entityType: 'COMPANY',
    listName: 'OFAC-NSMBS',
    countries: ['MM'],
    hsCodes: ['9013', '9014'],
    goodsDescription: 'Military-grade optical systems',
  },
  {
    name: 'Global Arms Trading Company',
    entityType: 'COMPANY',
    listName: 'OFAC-SDN',
    countries: ['MM', 'LY', 'SD'],
    hsCodes: ['9301', '9302', '9303', '9304', '9305', '9306', '9307'],
    programs: ['ARMS'],
    goodsDescription: 'Military weapons and ammunition',
  },
  {
    name: '军事装备研究所',
    alternateNames: ['Military Equipment Research Institute', 'MERI'],
    entityType: 'ORGANIZATION',
    listName: 'CUSTOM',
    countries: ['CN'],
    endUseSensitive: true,
  },
  {
    name: 'North Eastern Shipping Corp',
    entityType: 'COMPANY',
    listName: 'UN-SEC',
    countries: ['KP'],
    vesselFlag: 'KP',
  },
  {
    name: 'Myanmar Economic Corporation',
    aliases: ['MEC'],
    entityType: 'COMPANY',
    listName: 'OFAC-SDN',
    countries: ['MM'],
  },
  {
    name: 'Belarusian Potash Company',
    aliases: ['Belaruskalij'],
    entityType: 'COMPANY',
    listName: 'EU-CON',
    countries: ['BY'],
    hsCodes: ['3104'],
  },
  {
    name: 'Cubametales',
    entityType: 'COMPANY',
    listName: 'OFAC-SDN',
    countries: ['CU'],
    hsCodes: ['2603', '2607'],
  },
];

const USERS = [
  {
    username: 'admin',
    password: 'Admin@2024',
    fullName: '系统管理员',
    email: 'admin@compliance.com',
    role: 'ADMIN',
    department: 'IT',
  },
  {
    username: 'director.wang',
    password: 'Compliance@2024',
    fullName: '王总监',
    email: 'wang.director@compliance.com',
    role: 'COMPLIANCE_DIRECTOR',
    department: 'COMPLIANCE',
  },
  {
    username: 'officer.li',
    password: 'Officer@2024',
    fullName: '李合规',
    email: 'li.officer@compliance.com',
    role: 'COMPLIANCE_OFFICER',
    department: 'COMPLIANCE',
  },
  {
    username: 'lawyer.zhang',
    password: 'Legal@2024',
    fullName: '张律师',
    email: 'zhang.lawyer@compliance.com',
    role: 'LEGAL_REVIEWER',
    department: 'LEGAL',
  },
  {
    username: 'lawyer.chen',
    password: 'Legal@2024',
    fullName: '陈法务',
    email: 'chen.lawyer@compliance.com',
    role: 'LEGAL_REVIEWER',
    department: 'LEGAL',
  },
  {
    username: 'auditor.sun',
    password: 'Audit@2024',
    fullName: '孙审计',
    email: 'sun.auditor@compliance.com',
    role: 'AUDITOR',
    department: 'AUDIT',
  },
  {
    username: 'viewer.zhao',
    password: 'Viewer@2024',
    fullName: '赵观察者',
    email: 'zhao.viewer@compliance.com',
    role: 'VIEWER',
    department: 'COMPLIANCE',
  },
];

async function seedUsers() {
  logger.info('开始初始化用户数据...');
  await User.deleteMany({});

  const userDocs = [];
  for (const u of USERS) {
    userDocs.push({
      userId: 'USR-' + (10000 + userDocs.length + 1),
      username: u.username,
      email: u.email,
      fullName: u.fullName,
      passwordHash: await bcrypt.hash(u.password, 10),
      role: u.role,
      department: u.department,
      isActive: true,
      notificationPreferences: {
        email: true,
        push: true,
        webhook: true,
        riskThreshold: 'HIGH',
      },
    });
  }

  await User.insertMany(userDocs);
  logger.info(`用户数据初始化完成: ${userDocs.length} 个用户`);
  USERS.forEach(u => {
    console.log(`  用户: ${u.username} / 密码: ${u.password} / 角色: ${u.role}`);
  });
}

async function seedSanctionEntries() {
  logger.info('开始初始化制裁名单...');
  await SanctionEntry.deleteMany({});

  const docs = HIGH_RISK_ENTITIES.map((entity, idx) => ({
    entryId: `${entity.listName}-${String(idx + 1).padStart(5, '0')}`,
    listName: entity.listName,
    listSource: entity.listName.includes('OFAC') ? 'US Treasury' :
      entity.listName.includes('EU') ? 'EU Official Journal' :
        entity.listName.includes('UN') ? 'UN Security Council' :
          entity.listName.includes('UK') ? 'UK HMT' : 'Custom Imported',
    entityType: entity.entityType,
    name: entity.name,
    alternateNames: entity.alternateNames || [],
    aliases: entity.aliases || [],
    firstName: entity.firstName,
    lastName: entity.lastName,
    countries: entity.countries || [],
    nationalities: entity.nationalities || [],
    hsCodes: entity.hsCodes || [],
    goodsDescription: entity.goodsDescription,
    vesselImoNumber: entity.vesselImoNumber,
    vesselFlag: entity.vesselFlag,
    programs: entity.programs || [],
    designationDate: new Date(Date.now() - Math.random() * 1000 * 24 * 3600 * 1000),
    isActive: true,
    uploadedBy: 'system_seed',
    batchId: 'SEED-' + Date.now(),
    remarks: '系统初始化示例数据',
    version: 1,
  }));

  await SanctionEntry.insertMany(docs);
  logger.info(`制裁名单初始化完成: ${docs.length} 条记录`);
}

async function seedSuppliers() {
  logger.info('开始初始化供应商数据...');
  await Supplier.deleteMany({});

  const countries = ['CN', 'US', 'DE', 'JP', 'KR', 'SG', 'HK', 'TW', 'GB', 'FR',
    'IT', 'AU', 'CA', 'NL', 'IN', 'BR', 'MX', 'MY', 'TH', 'VN',
    'RU', 'IR', 'KP', 'SY', 'AE', 'SA', 'QA', 'BY', 'MM', 'CU'];

  const riskLevels = ['LOW', 'LOW', 'LOW', 'MEDIUM', 'MEDIUM', 'HIGH', 'SAFE', 'CRITICAL'];

  const names = [
    'Huawei Technologies', 'ZTE Corp', 'SMIC Semiconductor', 'Foxconn Technology',
    'BYD Company', 'CATL Energy', 'Alibaba Group', 'Tencent Holdings',
    'Samsung Electronics', 'SK Hynix', 'LG Display', 'Hyundai Motors',
    'Sony Corporation', 'Panasonic Corp', 'Toyota Motor', 'Mitsubishi Electric',
    'BASF SE', 'Siemens AG', 'Bosch Group', 'Infineon Technologies',
    'Texas Instruments', 'Intel Corp', 'Qualcomm Inc', 'NVIDIA Corp',
    'TSMC Taiwan', 'MediaTek Inc', 'ASE Group', 'United Microelectronics',
    'Sinopec Group', 'PetroChina', 'CNOOC Ltd', 'State Grid Corp',
    'Military Industries Corp', 'North Korea Tech Trading', 'Iranian Electronics Co',
    'Rostec State Corp', 'Belarusian Machinery', 'Myanmar Metals Ltd',
  ];

  const suppliers = [];
  for (let i = 0; i < 200; i++) {
    const country = countries[Math.floor(Math.random() * countries.length)];
    const riskIdx = Math.floor(Math.random() * riskLevels.length);
    const name = names[Math.floor(Math.random() * names.length)] + ' ' + (i + 1);
    const isHighRiskCountry = ['KP', 'IR', 'SY', 'RU', 'MM', 'CU', 'BY'].includes(country);

    let riskLevel = isHighRiskCountry
      ? (Math.random() < 0.6 ? 'HIGH' : (Math.random() < 0.7 ? 'CRITICAL' : 'MEDIUM'))
      : riskLevels[riskIdx];

    const blacklisted = riskLevel === 'CRITICAL' && Math.random() < 0.3;

    suppliers.push({
      supplierId: 'SUP-' + String(i + 1).padStart(4, '0'),
      name,
      legalName: name + (Math.random() < 0.5 ? ' Co., Ltd.' : ' International Ltd'),
      alternateNames: Math.random() < 0.3 ? [name + ' Group'] : [],
      registrationNumber: 'REG' + String(Math.floor(Math.random() * 99999999)).padStart(8, '0'),
      taxId: 'TAX' + String(Math.floor(Math.random() * 999999)).padStart(10, '0'),
      country,
      countriesOfOperation: [country],
      address: {
        line1: Math.floor(Math.random() * 999) + ' ' + ['Main', 'Oak', 'Park', 'Industrial', 'Tech'][Math.floor(Math.random() * 5)] + ' St',
        city: ['Shanghai', 'Beijing', 'Shenzhen', 'Seoul', 'Tokyo', 'Berlin', 'San Francisco', 'Singapore'][Math.floor(Math.random() * 8)],
        country,
      },
      contactInfo: {
        primaryContact: 'Mr. Contact ' + (i + 1),
        email: `contact${i + 1}@supplier.com`,
        phone: '+86-10' + String(Math.floor(Math.random() * 99999999)).padStart(8, '0'),
      },
      riskLevel: blacklisted ? 'BLACKLISTED' : riskLevel,
      riskScore: riskLevel === 'LOW' || riskLevel === 'SAFE' ? Math.floor(Math.random() * 25)
        : riskLevel === 'MEDIUM' ? (25 + Math.floor(Math.random() * 25))
          : riskLevel === 'HIGH' ? (50 + Math.floor(Math.random() * 30))
            : (80 + Math.floor(Math.random() * 20)),
      complianceStatus: riskLevel === 'CRITICAL' ? 'REJECTED'
        : riskLevel === 'HIGH' ? 'FLAGGED'
          : riskLevel === 'MEDIUM' ? 'PENDING'
            : 'VERIFIED',
      screeningCount: Math.floor(Math.random() * 50),
      sanctionHits: Math.floor(Math.random() * 5),
      rejectionCount: riskLevel === 'CRITICAL' ? (2 + Math.floor(Math.random() * 5)) : (riskLevel === 'HIGH' ? Math.floor(Math.random() * 3) : 0),
      transactionCount: Math.floor(Math.random() * 200),
      approvedTransactionCount: Math.floor(Math.random() * 150),
      rejectedTransactionCount: Math.floor(Math.random() * 20),
      tradeVolume: Math.floor(Math.random() * 1000000000),
      isActive: !blacklisted,
      blacklisted,
      blacklistReason: blacklisted ? '多次触发制裁名单命中' : undefined,
      blacklistedAt: blacklisted ? new Date(Date.now() - Math.random() * 1000 * 3600 * 24 * 90) : undefined,
      lastScreeningDate: new Date(Date.now() - Math.random() * 1000 * 3600 * 24 * 30),
    });
  }

  await Supplier.insertMany(suppliers);
  logger.info(`供应商数据初始化完成: ${suppliers.length} 个供应商`);
}

async function seedTransactions() {
  logger.info('开始初始化交易数据...');
  await Transaction.deleteMany({});
  await ReviewTicket.deleteMany({});

  const days = parseInt(process.env.SEED_DAYS || '14');
  const txnsPerDay = parseInt(process.env.SEED_TXNS_PER_DAY || '1500');
  let totalTxns = 0;
  let totalTickets = 0;

  const statuses = ['APPROVED', 'APPROVED', 'APPROVED', 'SCREENED', 'UNDER_REVIEW', 'REJECTED', 'FROZEN'];
  const riskLevels = ['LOW', 'LOW', 'LOW', 'LOW', 'MEDIUM', 'MEDIUM', 'HIGH', 'CRITICAL'];
  const currencies = ['USD', 'USD', 'USD', 'EUR', 'CNY', 'JPY', 'GBP'];

  const HS_CODES = [
    { code: '8471.30', desc: '便携式数据处理设备' },
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
    { code: '2709.00', desc: '原油' },
    { code: '2710.19', desc: '成品油' },
  ];

  const countries = ['CN', 'US', 'DE', 'JP', 'KR', 'SG', 'HK', 'TW', 'GB', 'FR',
    'IT', 'AU', 'CA', 'NL', 'IN', 'BR', 'MX', 'MY', 'TH', 'VN',
    'RU', 'IR', 'KP', 'SY', 'AE', 'SA', 'QA', 'BY', 'MM', 'CU', 'VE', 'LY', 'SD'];

  for (let d = days; d >= 0; d--) {
    const date = new Date();
    date.setDate(date.getDate() - d);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const datePrefix = `${year}${month}${day}`;

    const dailyCount = Math.floor(txnsPerDay * (0.8 + Math.random() * 0.4));
    const dailyTxns = [];

    for (let i = 1; i <= dailyCount; i++) {
      const hour = Math.floor(Math.random() * 24);
      const minute = Math.floor(Math.random() * 60);
      const second = Math.floor(Math.random() * 60);
      const orderTime = new Date(date);
      orderTime.setHours(hour, minute, second, 0);

      const hs = HS_CODES[Math.floor(Math.random() * HS_CODES.length)];
      const origin = countries[Math.floor(Math.random() * countries.length)];
      const dest = Math.random() < 0.7 ? 'CN' : countries[Math.floor(Math.random() * countries.length)];
      const supCountry = Math.random() < 0.8 ? origin : countries[Math.floor(Math.random() * countries.length)];
      const unitPrice = parseFloat((Math.random() * 50000 + 100).toFixed(2));
      const qty = Math.floor(Math.random() * 5000 + 1);
      const total = parseFloat((unitPrice * qty).toFixed(2));

      const isHighRiskCountry = ['KP', 'IR', 'SY', 'CU', 'VE', 'BY', 'MM', 'RU', 'SO', 'SD', 'LY', 'YE'].includes(origin)
        || ['KP', 'IR', 'SY', 'CU', 'VE', 'BY', 'MM', 'RU', 'SO', 'SD', 'LY', 'YE'].includes(supCountry);

      const riskIdx = isHighRiskCountry
        ? (Math.random() < 0.5 ? 7 : (Math.random() < 0.7 ? 6 : 5))
        : Math.floor(Math.random() * riskLevels.length);

      const riskLevel = riskLevels[riskIdx];
      const riskScore = riskLevel === 'LOW' ? Math.floor(Math.random() * 30)
        : riskLevel === 'MEDIUM' ? (30 + Math.floor(Math.random() * 25))
          : riskLevel === 'HIGH' ? (55 + Math.floor(Math.random() * 25))
            : (80 + Math.floor(Math.random() * 20));

      let status;
      if (d === 0 && riskLevel !== 'LOW') {
        status = Math.random() < 0.5 ? 'UNDER_REVIEW' : (riskLevel === 'CRITICAL' ? 'FROZEN' : statuses[Math.floor(Math.random() * statuses.length)]);
      } else if (riskLevel === 'LOW' || riskLevel === 'MEDIUM') {
        status = Math.random() < 0.85 ? 'APPROVED' : 'SCREENED';
      } else if (riskLevel === 'HIGH') {
        status = Math.random() < 0.6 ? 'APPROVED' : (Math.random() < 0.5 ? 'REJECTED' : 'UNDER_REVIEW');
      } else {
        status = Math.random() < 0.4 ? 'REJECTED' : (Math.random() < 0.5 ? 'UNDER_REVIEW' : 'APPROVED');
      }

      const txnId = `TXN-${datePrefix}-${String(i).padStart(6, '0')}`;
      const hasMatch = (riskLevel !== 'LOW' || Math.random() < 0.05);
      const sanctionsMatched = [];

      if (hasMatch && HIGH_RISK_ENTITIES.length > 0) {
        const matchedEntity = HIGH_RISK_ENTITIES[Math.floor(Math.random() * HIGH_RISK_ENTITIES.length)];
        sanctionsMatched.push({
          listName: matchedEntity.listName,
          matchedField: isHighRiskCountry ? 'country' : (matchedEntity.hsCodes?.length ? 'hsCode' : 'supplier_name'),
          matchScore: 80 + Math.floor(Math.random() * 20),
          matchValue: matchedEntity.name,
        });

        if (Math.random() < 0.3) {
          const another = HIGH_RISK_ENTITIES[Math.floor(Math.random() * HIGH_RISK_ENTITIES.length)];
          sanctionsMatched.push({
            listName: another.listName,
            matchedField: 'endUser_name',
            matchScore: 75 + Math.floor(Math.random() * 25),
            matchValue: another.name,
          });
        }
      }

      let endUser = 'Manufacturing Co. ' + (100 + i);
      if (Math.random() < 0.1 || riskLevel === 'CRITICAL') {
        endUser = ['军事装备-' + Math.floor(Math.random() * 100), '国防科技-所' + Math.floor(Math.random() * 20), '核设施-项目' + Math.floor(Math.random() * 10)][Math.floor(Math.random() * 3)];
      }

      dailyTxns.push({
        transactionId: txnId,
        poNumber: 'PO-' + (202400000 + d * 1000 + i),
        orderDate: orderTime,
        supplierId: 'SUP-' + String(Math.floor(Math.random() * 200) + 1).padStart(4, '0'),
        supplierName: 'Supplier ' + String(Math.floor(Math.random() * 500) + 1),
        supplierCountry: supCountry,
        hsCode: hs.code,
        hsDescription: hs.desc,
        originCountry: origin,
        destinationCountry: dest,
        endUser,
        endUserCountry: Math.random() < 0.9 ? dest : countries[Math.floor(Math.random() * countries.length)],
        productDescription: hs.desc + ' - 型号 ' + String.fromCharCode(65 + Math.floor(Math.random() * 26)) + (100 + Math.floor(Math.random() * 999)),
        quantity: qty,
        unitPrice,
        totalAmount: total,
        currency: currencies[Math.floor(Math.random() * currencies.length)],
        riskScore,
        riskLevel,
        riskFactors: hasMatch ? [
          {
            type: isHighRiskCountry ? 'COUNTRY_HIGH_RISK' : 'SANCTION_MATCH',
            description: isHighRiskCountry ? `高风险国家: ${origin}` : `制裁命中: ${sanctionsMatched[0].matchValue}`,
            score: Math.floor(riskScore * 0.6),
          },
        ] : [],
        sanctionMatches: sanctionsMatched,
        status,
        frozen: status === 'FROZEN' || status === 'UNDER_REVIEW' || status === 'REJECTED',
        frozenAt: (status === 'FROZEN' || status === 'UNDER_REVIEW' || status === 'REJECTED')
          ? new Date(orderTime.getTime() + Math.random() * 3600000) : undefined,
        createdAt: orderTime,
        updatedAt: orderTime,
      });
    }

    await Transaction.insertMany(dailyTxns, { ordered: false });
    totalTxns += dailyTxns.length;

    if (d % 3 === 0) {
      logger.info(`进度: 已处理 ${days - d}/${days} 天, 累计交易: ${totalTxns}`);
    }
  }

  logger.info(`交易数据初始化完成: ${totalTxns} 条交易`);

  logger.info('为历史高风险交易生成工单...');
  const needTicketTxns = await Transaction.find({
    $or: [
      { riskLevel: { $in: ['HIGH', 'CRITICAL'] } },
      { status: { $in: ['UNDER_REVIEW', 'FROZEN', 'REJECTED'] } },
    ],
  }).limit(500);

  const tickets = [];
  for (const txn of needTicketTxns) {
    if (tickets.length >= 300) break;

    const isUrgent = txn.riskLevel === 'CRITICAL';
    const deadline = new Date(txn.createdAt);
    deadline.setHours(deadline.getHours() + (isUrgent ? 4 : 24));

    const ticketStatus = txn.status === 'APPROVED' ? 'APPROVED'
      : txn.status === 'REJECTED' ? 'REJECTED'
        : (d === 0 && Math.random() < 0.3 ? 'ESCALATED'
          : (d === 0 ? ['ASSIGNED', 'PENDING', 'IN_PROGRESS'][Math.floor(Math.random() * 3)]
            : Math.random() < 0.7 ? 'APPROVED' : ['REJECTED', 'CLOSED'][Math.floor(Math.random() * 2)]));

    const isOverdue = deadline < new Date() && !['APPROVED', 'REJECTED', 'CLOSED'].includes(ticketStatus);

    tickets.push({
      ticketId: 'REV-' + txn.transactionId.slice(-12),
      transactionId: txn._id,
      transactionRefId: txn.transactionId,
      riskScore: txn.riskScore,
      riskLevel: txn.riskLevel,
      sanctionMatches: txn.sanctionMatches,
      riskSummary: `${txn.riskLevel}风险 - ${txn.sanctionMatches.length}处命中`,
      status: ticketStatus,
      priority: isUrgent ? 'URGENT' : (txn.riskLevel === 'HIGH' ? 'HIGH' : 'MEDIUM'),
      assignedGroup: Math.random() < 0.5 ? 'LEGAL_DEPT' : 'COMPLIANCE',
      assignedTo: ['officer.li', 'lawyer.zhang', 'lawyer.chen'][Math.floor(Math.random() * 3)],
      reviewerAssigned: ['李合规', '张律师', '陈法务'][Math.floor(Math.random() * 3)],
      assignedAt: new Date(txn.createdAt.getTime() + Math.random() * 3600000),
      escalated: ticketStatus === 'ESCALATED' || isOverdue,
      escalatedAt: ticketStatus === 'ESCALATED' ? new Date(deadline.getTime() + Math.random() * 3600000) : undefined,
      escalatedTo: ticketStatus === 'ESCALATED' ? 'COMPLIANCE_DIRECTOR' : undefined,
      escalateReason: isOverdue ? '超时自动升级' : undefined,
      reviewDeadline: deadline,
      isOverdue,
      slaBreached: isOverdue,
      reviewedBy: ['director.wang', 'officer.li', 'lawyer.zhang', 'lawyer.chen'][Math.floor(Math.random() * 4)],
      reviewedAt: ['APPROVED', 'REJECTED', 'CLOSED'].includes(ticketStatus)
        ? new Date(Math.min(new Date(), deadline.getTime() + Math.random() * 8 * 3600000))
        : undefined,
      reviewDurationHours: ['APPROVED', 'REJECTED', 'CLOSED'].includes(ticketStatus)
        ? parseFloat((Math.random() * (isUrgent ? 3 : 20) + 0.5).toFixed(2))
        : undefined,
      decision: ticketStatus === 'APPROVED' ? 'RELEASE' : (ticketStatus === 'REJECTED' ? 'REJECT' : null),
      rejectionReason: ticketStatus === 'REJECTED'
        ? ['制裁名单命中', '高风险国家', '敏感最终用途', '综合风险评估'][Math.floor(Math.random() * 4)]
        : undefined,
      rejectionCategory: ticketStatus === 'REJECTED' ? 'SANCTION_MATCH' : undefined,
      createdAt: txn.createdAt,
      updatedAt: txn.createdAt,
    });
  }

  await ReviewTicket.insertMany(tickets, { ordered: false });
  logger.info(`工单数据初始化完成: ${tickets.length} 张工单`);
}

async function seedReports() {
  logger.info('初始化示例报告...');
  await ComplianceReport.deleteMany({});
  logger.info('报告初始化完成（报告将在实际运行时生成）');
}

async function seedAll() {
  logger.info('='.repeat(60));
  logger.info('合规监控系统 - 数据库初始化');
  logger.info('='.repeat(60));

  try {
    await mongoose.connect(process.env.MONGODB_URI);
    logger.info('数据库连接成功');

    await seedUsers();
    await seedSanctionEntries();
    await seedSuppliers();
    await seedTransactions();
    await seedReports();

    logger.info('='.repeat(60));
    logger.info('✅ 数据库初始化全部完成！');
    logger.info('='.repeat(60));

    process.exit(0);
  } catch (err) {
    logger.error('初始化失败:', err);
    process.exit(1);
  }
}

seedAll();
