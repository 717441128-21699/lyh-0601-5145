const express = require('express');
const Supplier = require('../models/Supplier');
const Transaction = require('../models/Transaction');
const {
  authenticateToken,
  requirePermission,
  asyncHandler,
  createAuditLog,
} = require('../middleware/auth');
const { NotFoundError, BadRequestError, ForbiddenError } = require('../middleware/errorHandler');
const { calculateRiskScore } = require('../services/riskEngineService');
const { alertSupplierBlacklisted } = require('../services/notificationService');

const router = express.Router();
router.use(authenticateToken);

router.get('/', requirePermission('supplier:view'), asyncHandler(async (req, res) => {
  const filter = {};
  if (req.query.supplierId) filter.supplierId = req.query.supplierId;
  if (req.query.name) filter.name = { $regex: req.query.name, $options: 'i' };
  if (req.query.country) filter.country = req.query.country;
  if (req.query.riskLevel) filter.riskLevel = Array.isArray(req.query.riskLevel) ? { $in: req.query.riskLevel } : req.query.riskLevel;
  if (req.query.complianceStatus) filter.complianceStatus = req.query.complianceStatus;
  if (req.query.isActive !== undefined) filter.isActive = req.query.isActive === 'true';
  if (req.query.blacklisted !== undefined) filter.blacklisted = req.query.blacklisted === 'true';

  if (req.query.search) {
    filter.$or = [
      { name: { $regex: req.query.search, $options: 'i' } },
      { supplierId: { $regex: req.query.search, $options: 'i' } },
      { registrationNumber: { $regex: req.query.search, $options: 'i' } },
    ];
  }

  const page = parseInt(req.query.page) || 1;
  const pageSize = Math.min(parseInt(req.query.pageSize) || 50, 200);
  const skip = (page - 1) * pageSize;

  const [total, items] = await Promise.all([
    Supplier.countDocuments(filter),
    Supplier.find(filter)
      .sort({ riskScore: -1 })
      .skip(skip)
      .limit(pageSize)
      .lean(),
  ]);

  res.json({ total, page, pageSize, items });
}));

router.get('/stats/summary', requirePermission('supplier:view'), asyncHandler(async (req, res) => {
  const [byRisk, byCompliance, byCountry, blacklisted, total] = await Promise.all([
    Supplier.aggregate([
      { $match: { isActive: true } },
      { $group: { _id: '$riskLevel', count: { $sum: 1 } } },
    ]),
    Supplier.aggregate([
      { $match: { isActive: true } },
      { $group: { _id: '$complianceStatus', count: { $sum: 1 } } },
    ]),
    Supplier.aggregate([
      { $match: { isActive: true } },
      {
        $group: {
          _id: '$country',
          count: { $sum: 1 },
          highRisk: {
            $sum: {
              $cond: [
                { $in: ['$riskLevel', ['HIGH', 'CRITICAL', 'BLACKLISTED']] },
                1,
                0
              ]
            }
          }
        }
      },
      { $sort: { count: -1 } },
      { $limit: 20 },
    ]),
    Supplier.countDocuments({ blacklisted: true }),
    Supplier.countDocuments({ isActive: true }),
  ]);

  res.json({ total, blacklisted, byRisk, byCompliance, byCountry });
}));

router.get('/:supplierId', requirePermission('supplier:view'), asyncHandler(async (req, res) => {
  const { supplierId } = req.params;
  const supplier = await Supplier.findOne({ supplierId });
  if (!supplier) throw new NotFoundError('供应商不存在');

  const recentTxns = await Transaction.find({ supplierId })
    .sort({ orderDate: -1 })
    .limit(20);

  const txnStats = await Transaction.aggregate([
    { $match: { supplierId } },
    {
      $group: {
        _id: null,
        total: { $sum: 1 },
        totalAmount: { $sum: '$totalAmount' },
        approved: { $sum: { $cond: [{ $eq: ['$status', 'APPROVED'] }, 1, 0] } },
        rejected: { $sum: { $cond: [{ $eq: ['$status', 'REJECTED'] }, 1, 0] } },
        hitCount: { $sum: { $cond: [{ $gt: [{ $size: '$sanctionMatches' }, 0] }, 1, 0] } },
      }
    },
  ]);

  res.json({
    supplier,
    recentTransactions: recentTxns,
    transactionStats: txnStats[0] || {},
  });
}));

router.put('/:supplierId', requirePermission('supplier:update'), asyncHandler(async (req, res) => {
  const { supplierId } = req.params;
  const supplier = await Supplier.findOne({ supplierId });
  if (!supplier) throw new NotFoundError('供应商不存在');

  const before = supplier.toObject();

  const editableFields = [
    'name', 'legalName', 'alternateNames', 'registrationNumber', 'taxId', 'vatNumber',
    'country', 'countriesOfOperation', 'address', 'contactInfo',
    'beneficialOwners', 'directors', 'shareholders',
    'notes', 'tags',
  ];

  editableFields.forEach(key => {
    if (req.body[key] !== undefined) {
      supplier[key] = req.body[key];
    }
  });

  await supplier.save();

  await createAuditLog({
    action: 'SUPPLIER_UPDATED',
    category: 'SUPPLIER',
    severity: 'INFO',
    userId: req.user.userId,
    userName: req.user.username,
    userRole: req.user.role,
    entityType: 'Supplier',
    entityId: supplierId,
    description: `更新供应商信息: ${supplier.name}`,
    changes: {
      before: { name: before.name, country: before.country },
      after: { name: supplier.name, country: supplier.country },
    },
  });

  res.json(supplier);
}));

router.post('/:supplierId/blacklist', requirePermission('supplier:block'), asyncHandler(async (req, res) => {
  const { supplierId } = req.params;
  const { reason, autoRejectTxns = false } = req.body;
  const supplier = await Supplier.findOne({ supplierId });
  if (!supplier) throw new NotFoundError('供应商不存在');

  supplier.blacklisted = true;
  supplier.blacklistReason = reason || '管理员手工加入黑名单';
  supplier.blacklistedAt = new Date();
  supplier.riskLevel = 'BLACKLISTED';
  supplier.riskScore = 100;
  supplier.complianceStatus = 'REJECTED';
  supplier.isActive = false;
  await supplier.save();

  if (autoRejectTxns) {
    await Transaction.updateMany(
      { supplierId, status: { $in: ['PENDING_SCREENING', 'SCREENED', 'UNDER_REVIEW', 'FROZEN'] } },
      {
        $set: {
          status: 'REJECTED',
          frozen: true,
          rejectionReason: '供应商被列入黑名单',
          rejectionDate: new Date(),
        },
      }
    );
  }

  try {
    await alertSupplierBlacklisted(supplier, supplier.blacklistReason, req.user);
  } catch { /* ignore */ }

  await createAuditLog({
    action: 'SUPPLIER_BLACKLISTED',
    category: 'SUPPLIER',
    severity: 'CRITICAL',
    userId: req.user.userId,
    userName: req.user.username,
    userRole: req.user.role,
    entityType: 'Supplier',
    entityId: supplierId,
    description: `供应商被加入黑名单: ${supplier.name}`,
    details: { reason, autoRejectTxns },
  });

  res.json({ success: true, supplier });
}));

router.post('/:supplierId/unblock', requirePermission('supplier:block'), asyncHandler(async (req, res) => {
  const { supplierId } = req.params;
  const { reason } = req.body;
  const supplier = await Supplier.findOne({ supplierId });
  if (!supplier) throw new NotFoundError('供应商不存在');

  if (req.user.role !== 'COMPLIANCE_DIRECTOR' && req.user.role !== 'ADMIN') {
    throw new ForbiddenError('仅合规总监或管理员可解除黑名单');
  }

  supplier.blacklisted = false;
  supplier.blacklistReason = undefined;
  supplier.blacklistedAt = undefined;
  supplier.riskLevel = 'MEDIUM';
  supplier.riskScore = 50;
  supplier.complianceStatus = 'PENDING';
  supplier.isActive = true;
  await supplier.save();

  await createAuditLog({
    action: 'SUPPLIER_UNBLOCKED',
    category: 'SUPPLIER',
    severity: 'WARNING',
    userId: req.user.userId,
    userName: req.user.username,
    userRole: req.user.role,
    entityType: 'Supplier',
    entityId: supplierId,
    description: `解除供应商黑名单: ${supplier.name}`,
    details: { reason },
  });

  res.json({ success: true, supplier });
}));

router.post('/:supplierId/rescreen', requirePermission('supplier:view'), asyncHandler(async (req, res) => {
  const { supplierId } = req.params;
  const supplier = await Supplier.findOne({ supplierId });
  if (!supplier) throw new NotFoundError('供应商不存在');

  const sampleTxn = {
    supplierName: supplier.name,
    supplierCountry: supplier.country,
    originCountry: supplier.country,
    endUser: '',
    hsCode: '',
    totalAmount: 0,
  };

  const riskResult = await calculateRiskScore(sampleTxn);
  supplier.lastScreeningDate = new Date();
  supplier.screeningCount = (supplier.screeningCount || 0) + 1;

  if (riskResult.riskScore >= 80) supplier.riskLevel = 'HIGH';
  else if (riskResult.riskScore >= 50) supplier.riskLevel = 'MEDIUM';
  else supplier.riskLevel = 'LOW';

  supplier.riskScore = Math.round((supplier.riskScore + riskResult.riskScore) / 2);
  await supplier.save();

  res.json({ success: true, supplier, riskResult });
}));

router.get('/:supplierId/history', requirePermission('supplier:view'), asyncHandler(async (req, res) => {
  const { supplierId } = req.params;
  const supplier = await Supplier.findOne({ supplierId });
  if (!supplier) throw new NotFoundError('供应商不存在');

  const AuditLog = require('../models/AuditLog');
  const logs = await AuditLog.find({
    $or: [{ entityId: supplierId, entityType: 'Supplier' }],
  }).sort({ timestamp: -1 }).limit(100);

  res.json({ supplier, auditLogs: logs });
}));

module.exports = router;
