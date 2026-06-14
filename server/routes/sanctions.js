const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const SanctionEntry = require('../models/SanctionEntry');
const SanctionUpload = require('../models/SanctionUpload');
const {
  authenticateToken,
  requirePermission,
  asyncHandler,
  createAuditLog,
} = require('../middleware/auth');
const {
  processSanctionUpload,
  createSanctionEntry,
  updateSanctionEntry,
  deactivateSanctionEntry,
  getSanctionEntries,
  VALID_LISTS,
  VALID_ENTITY_TYPES,
} = require('../services/sanctionService');
const { BadRequestError, NotFoundError } = require('../middleware/errorHandler');
const { alertSanctionListUploaded } = require('../services/notificationService');
const { getQueue } = require('../config/queue');

const router = express.Router();
router.use(authenticateToken);

const UPLOAD_DIR = process.env.UPLOAD_DIR || './uploads/sanctions';
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const timestamp = Date.now();
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `sanction_${timestamp}_${uuidv4().substring(0, 8)}${ext}`);
  },
});

const fileFilter = (req, file, cb) => {
  const allowed = ['.csv', '.xlsx', '.xls', '.json'];
  const ext = path.extname(file.originalname).toLowerCase();
  if (allowed.includes(ext)) cb(null, true);
  else cb(new BadRequestError('文件格式不支持，仅支持 CSV, XLSX, XLS, JSON'));
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: (parseInt(process.env.MAX_FILE_SIZE_MB) || 50) * 1024 * 1024 },
});

router.get('/', requirePermission('sanction:view'), asyncHandler(async (req, res) => {
  const result = await getSanctionEntries(req.query);
  res.json(result);
}));

router.get('/config', requirePermission('sanction:view'), (req, res) => {
  res.json({
    validLists: VALID_LISTS,
    validEntityTypes: VALID_ENTITY_TYPES,
  });
});

router.get('/:entryId', requirePermission('sanction:view'), asyncHandler(async (req, res) => {
  const { entryId } = req.params;
  const entry = await SanctionEntry.findOne({ entryId });
  if (!entry) throw new NotFoundError('制裁条目不存在');
  res.json(entry);
}));

router.post('/', requirePermission('sanction:manage'), asyncHandler(async (req, res) => {
  const entry = await createSanctionEntry(req.body, req.user);
  res.status(201).json(entry);
}));

router.put('/:entryId', requirePermission('sanction:manage'), asyncHandler(async (req, res) => {
  const { entryId } = req.params;
  const entry = await updateSanctionEntry(entryId, req.body, req.user);
  res.json(entry);
}));

router.delete('/:entryId', requirePermission('sanction:manage'), asyncHandler(async (req, res) => {
  const { entryId } = req.params;
  const entry = await deactivateSanctionEntry(entryId, req.user);
  res.json({ success: true, entry });
}));

router.post('/upload',
  requirePermission('sanction:upload'),
  upload.single('file'),
  asyncHandler(async (req, res) => {
    const { listName, replaceExisting = false, effectiveDate } = req.body;

    if (!VALID_LISTS.includes(listName)) {
      fs.unlinkSync(req.file.path);
      throw new BadRequestError(`无效的制裁名单类型: ${listName}`);
    }
    if (!req.file) throw new BadRequestError('请上传文件');

    const ext = path.extname(req.file.originalname).toLowerCase();
    const fileType = ext === '.csv' ? 'CSV' :
      (ext === '.xlsx' ? 'XLSX' :
        (ext === '.xls' ? 'XLS' :
          (ext === '.json' ? 'JSON' : null)));

    if (!fileType) {
      fs.unlinkSync(req.file.path);
      throw new BadRequestError('不支持的文件格式');
    }

    const uploadRecord = new SanctionUpload({
      uploadId: 'UPL-' + Date.now().toString(36).toUpperCase(),
      fileName: req.file.filename,
      originalFileName: req.file.originalname,
      fileType,
      fileSize: req.file.size,
      listName,
      uploadedBy: req.user.userId,
      filePath: path.relative(process.cwd(), req.file.path),
      replaceExisting: replaceExisting === 'true' || replaceExisting === true,
      effectiveDate: effectiveDate ? new Date(effectiveDate) : new Date(),
    });
    await uploadRecord.save();

    const result = await processSanctionUpload(uploadRecord.uploadId, req.user);

    if (result.success) {
      try {
        await alertSanctionListUploaded(result.upload, req.user);
      } catch (notifErr) { /* ignore */ }
    }

    res.json({
      success: result.success,
      upload: result.upload,
      downloadUrl: `/uploads/sanctions/${req.file.filename}`,
    });
  })
);

router.get('/uploads/history', requirePermission('sanction:view'), asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const pageSize = parseInt(req.query.pageSize) || 20;
  const skip = (page - 1) * pageSize;

  const filter = {};
  if (req.query.listName) filter.listName = req.query.listName;
  if (req.query.status) filter.processingStatus = req.query.status;

  const total = await SanctionUpload.countDocuments(filter);
  const items = await SanctionUpload.find(filter)
    .sort({ uploadedAt: -1 })
    .skip(skip)
    .limit(pageSize);

  res.json({ total, page, pageSize, items });
}));

router.get('/uploads/:uploadId', requirePermission('sanction:view'), asyncHandler(async (req, res) => {
  const { uploadId } = req.params;
  const upload = await SanctionUpload.findOne({ uploadId });
  if (!upload) throw new NotFoundError('上传记录不存在');
  res.json(upload);
}));

router.post('/search/transactions', requirePermission('sanction:view'), asyncHandler(async (req, res) => {
  const { entryId } = req.body;
  if (!entryId) throw new BadRequestError('缺少entryId');

  const entry = await SanctionEntry.findOne({ entryId });
  if (!entry) throw new NotFoundError('制裁条目不存在');

  const Transaction = require('../models/Transaction');
  const transactions = await Transaction.find({
    'sanctionMatches.sanctionId': entry._id,
  }).sort({ orderDate: -1 }).limit(500);

  res.json({
    entry,
    transactionCount: transactions.length,
    transactions,
  });
}));

router.get('/stats/summary', requirePermission('sanction:view'), asyncHandler(async (req, res) => {
  const result = await SanctionEntry.aggregate([
    { $match: { isActive: true } },
    {
      $group: {
        _id: { list: '$listName', type: '$entityType' },
        count: { $sum: 1 },
      }
    },
  ]);

  const totalActive = await SanctionEntry.countDocuments({ isActive: true });
  const totalInactive = await SanctionEntry.countDocuments({ isActive: false });

  res.json({
    totalActive,
    totalInactive,
    byListAndType: result,
  });
}));

module.exports = router;
