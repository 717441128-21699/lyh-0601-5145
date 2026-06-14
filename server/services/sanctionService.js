const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');
const csv = require('csv-parser');
const SanctionEntry = require('../models/SanctionEntry');
const SanctionUpload = require('../models/SanctionUpload');
const logger = require('../config/logger');
const { createAuditLog } = require('../middleware/auth');
const { normalizeString } = require('./riskEngineService');

const REQUIRED_FIELDS = ['entryId', 'name', 'entityType'];

const VALID_LISTS = ['OFAC-SDN', 'OFAC-NSMBS', 'EU-CON', 'UN-SEC', 'UK-CONS', 'HMT', 'CUSTOM'];
const VALID_ENTITY_TYPES = ['INDIVIDUAL', 'COMPANY', 'ORGANIZATION', 'VESSEL', 'AIRCRAFT', 'GOODS', 'COUNTRY'];

const FIELD_ALIASES = {
  '编号': 'entryId', 'id': 'entryId', 'EntryID': 'entryId', 'IDENTIFIER': 'entryId',
  '姓名': 'name', '名称': 'name', 'Name': 'name', 'Entity Name': 'name',
  '实体类型': 'entityType', '类型': 'entityType', 'Type': 'entityType',
  '名单': 'listName', 'List': 'listName', '来源': 'listSource',
  '别名': 'alternateNames', '曾用名': 'alternateNames',
  '国家': 'countries', 'Country': 'countries',
  'HS编码': 'hsCodes', 'HS Code': 'hsCodes',
  '备注': 'remarks', 'Remark': 'remarks',
};

function resolveFieldName(header) {
  const cleanHeader = header.trim();
  if (FIELD_ALIASES[cleanHeader]) return FIELD_ALIASES[cleanHeader];
  const lower = cleanHeader.toLowerCase().replace(/[\s_-]/g, '');
  for (const [alias, field] of Object.entries(FIELD_ALIASES)) {
    if (alias.toLowerCase().replace(/[\s_-]/g, '') === lower) return field;
  }
  return cleanHeader;
}

async function validateSanctionData(rows, listName) {
  const errors = [];
  const warnings = [];
  const validRows = [];

  if (!VALID_LISTS.includes(listName)) {
    errors.push({ row: 0, code: 'INVALID_LIST', message: `无效的制裁名单类型: ${listName}` });
    return { errors, warnings, validRows, isValid: false };
  }

  rows.forEach((row, idx) => {
    const rowNum = idx + 2;
    const resolved = {};
    Object.keys(row).forEach(key => {
      const field = resolveFieldName(key);
      resolved[field] = row[key];
    });

    for (const req of REQUIRED_FIELDS) {
      if (!resolved[req] || String(resolved[req]).trim() === '') {
        errors.push({
          row: rowNum,
          column: req,
          code: 'MISSING_REQUIRED',
          message: `缺少必填字段: ${req}`,
        });
      }
    }

    if (resolved.entityType && !VALID_ENTITY_TYPES.includes(String(resolved.entityType).toUpperCase())) {
      warnings.push({
        row: rowNum,
        column: 'entityType',
        code: 'UNKNOWN_ENTITY_TYPE',
        message: `未知实体类型: ${resolved.entityType}，将使用默认值`,
      });
      resolved.entityType = 'COMPANY';
    } else if (resolved.entityType) {
      resolved.entityType = String(resolved.entityType).toUpperCase();
    }

    if (resolved.alternateNames && typeof resolved.alternateNames === 'string') {
      resolved.alternateNames = resolved.alternateNames.split(/[,;，；]/).map(s => s.trim()).filter(Boolean);
    }
    if (resolved.countries && typeof resolved.countries === 'string') {
      resolved.countries = resolved.countries.split(/[,;，；]/).map(s => s.trim().toUpperCase()).filter(Boolean);
    }
    if (resolved.hsCodes && typeof resolved.hsCodes === 'string') {
      resolved.hsCodes = resolved.hsCodes.split(/[,;，；\s]/).map(s => s.trim()).filter(Boolean);
    }
    if (resolved.aliases && typeof resolved.aliases === 'string') {
      resolved.aliases = resolved.aliases.split(/[,;，；]/).map(s => s.trim()).filter(Boolean);
    }

    if (resolved.designationDate && typeof resolved.designationDate === 'string') {
      const parsed = new Date(resolved.designationDate);
      if (!isNaN(parsed.getTime())) resolved.designationDate = parsed;
    }
    if (resolved.expirationDate && typeof resolved.expirationDate === 'string') {
      const parsed = new Date(resolved.expirationDate);
      if (!isNaN(parsed.getTime())) resolved.expirationDate = parsed;
    }

    validRows.push({
      ...resolved,
      listName,
      isActive: true,
    });
  });

  return {
    errors,
    warnings,
    validRows,
    isValid: errors.length === 0,
  };
}

async function processUploadedFile(filePath, fileType, listName) {
  let rows = [];

  if (fileType === 'CSV') {
    rows = await new Promise((resolve, reject) => {
      const results = [];
      fs.createReadStream(filePath)
        .pipe(csv())
        .on('data', (data) => results.push(data))
        .on('end', () => resolve(results))
        .on('error', reject);
    });
  } else if (fileType === 'XLSX' || fileType === 'XLS') {
    const workbook = XLSX.readFile(filePath);
    const firstSheet = workbook.SheetNames[0];
    rows = XLSX.utils.sheet_to_json(workbook.Sheets[firstSheet], { defval: '' });
  } else if (fileType === 'JSON') {
    const content = fs.readFileSync(filePath, 'utf-8');
    const parsed = JSON.parse(content);
    rows = Array.isArray(parsed) ? parsed : (parsed.entries || parsed.data || []);
  }

  logger.info(`文件解析完成: ${rows.length} 行数据`);
  return rows;
}

async function processSanctionUpload(uploadId, user) {
  const upload = await SanctionUpload.findOne({ uploadId });
  if (!upload) throw new Error('上传记录不存在');

  upload.processingStatus = 'PROCESSING';
  upload.validationStatus = 'VALIDATING';
  await upload.save();

  try {
    const fullPath = path.join(__dirname, '..', '..', upload.filePath);
    const rows = await processUploadedFile(fullPath, upload.fileType, upload.listName);

    upload.statistics.totalRows = rows.length;

    const validation = await validateSanctionData(rows, upload.listName);
    upload.validationErrors = validation.errors;
    upload.validationWarnings = validation.warnings;
    upload.statistics.validRows = validation.validRows.length;
    upload.statistics.invalidRows = validation.errors.length;

    if (!validation.isValid && validation.validRows.length === 0) {
      upload.validationStatus = 'INVALID';
      upload.processingStatus = 'FAILED';
      upload.errorMessage = `数据校验失败: ${validation.errors.length}个错误`;
      await upload.save();
      return { success: false, upload };
    }

    upload.validationStatus = validation.isValid ? 'VALID' : 'INVALID';
    await upload.save();

    let inserted = 0, updated = 0, duplicates = 0, deactivated = 0;
    const BATCH_SIZE = 100;

    if (upload.replaceExisting) {
      const deactResult = await SanctionEntry.updateMany(
        { listName: upload.listName },
        { $set: { isActive: false } }
      );
      deactivated = deactResult.modifiedCount || 0;
    }

    for (let i = 0; i < validation.validRows.length; i += BATCH_SIZE) {
      const batch = validation.validRows.slice(i, i + BATCH_SIZE);
      const ops = [];

      for (const entry of batch) {
        entry.uploadedBy = user.userId;
        entry.batchId = uploadId;
        entry.sourceFile = upload.originalFileName;

        if (!entry.entryId) {
          entry.entryId = `${upload.listName}-${uuidv4().substring(0, 8).toUpperCase()}`;
        }

        ops.push({
          updateOne: {
            filter: { entryId: entry.entryId },
            update: [
              {
                $set: {
                  ...entry,
                  version: { $add: [{ $ifNull: ['$version', 0] }, 1] },
                  updatedAt: new Date(),
                  isActive: true,
                }
              }
            ],
            upsert: true,
          }
        });
      }

      try {
        const result = await SanctionEntry.bulkWrite(ops, { ordered: false });
        inserted += result.upsertedCount || 0;
        updated += result.modifiedCount || 0;
        duplicates += (BATCH_SIZE - (result.upsertedCount || 0) - (result.modifiedCount || 0));
      } catch (err) {
        logger.error(`制裁名单批量写入失败:`, err.message);
      }
    }

    upload.statistics.inserted = inserted;
    upload.statistics.updated = updated;
    upload.statistics.deactivated = deactivated;
    upload.statistics.duplicates = Math.max(0, duplicates - (inserted + updated));
    upload.statistics.skippedRows = validation.errors.length;
    upload.processingStatus = 'COMPLETED';
    upload.processedAt = new Date();

    if (validation.errors.length > 0 && validation.validRows.length > 0) {
      upload.processingStatus = 'PARTIAL';
    }

    await upload.save();

    await createAuditLog({
      action: 'SANCTION_LIST_UPDATED',
      category: 'SANCTION_LIST',
      severity: 'WARNING',
      userId: user.userId,
      userName: user.username,
      userRole: user.role,
      entityType: 'SanctionUpload',
      entityId: uploadId,
      description: `制裁名单 ${upload.listName} 更新完成`,
      details: {
        fileName: upload.fileName,
        totalRows: rows.length,
        inserted,
        updated,
        deactivated,
        errors: validation.errors.length,
      },
    });

    logger.info(`制裁名单处理完成: ${upload.listName} - 新增${inserted}, 更新${updated}, 失效${deactivated}`);
    return { success: true, upload };

  } catch (err) {
    logger.error('制裁名单处理失败:', err);
    upload.processingStatus = 'FAILED';
    upload.errorMessage = err.message;
    await upload.save();
    throw err;
  }
}

async function createSanctionEntry(data, user) {
  if (!data.listName || !VALID_LISTS.includes(data.listName)) {
    throw new Error(`无效的制裁名单类型: ${data.listName}`);
  }

  if (!data.entryId) {
    data.entryId = `${data.listName}-${Date.now().toString(36).toUpperCase()}`;
  }

  const existing = await SanctionEntry.findOne({ entryId: data.entryId });
  if (existing) throw new Error('entryId已存在');

  if (data.entityType && !VALID_ENTITY_TYPES.includes(data.entityType.toUpperCase())) {
    throw new Error(`无效的实体类型: ${data.entityType}`);
  }

  const entry = new SanctionEntry({
    ...data,
    entityType: data.entityType?.toUpperCase() || 'COMPANY',
    uploadedBy: user.userId,
    batchId: 'MANUAL-' + Date.now(),
    isActive: true,
  });

  await entry.save();

  await createAuditLog({
    action: 'SANCTION_ENTRY_CREATED',
    category: 'SANCTION_LIST',
    severity: 'WARNING',
    userId: user.userId,
    userName: user.username,
    userRole: user.role,
    entityType: 'SanctionEntry',
    entityId: entry.entryId,
    description: `手动添加制裁条目: ${entry.name}`,
    details: { listName: data.listName, entityType: data.entityType },
  });

  return entry;
}

async function updateSanctionEntry(entryId, data, user) {
  const entry = await SanctionEntry.findOne({ entryId });
  if (!entry) throw new Error('制裁条目不存在');

  const before = entry.toObject();

  Object.keys(data).forEach(key => {
    if (key !== '_id' && key !== '__v' && key !== 'entryId') {
      entry[key] = data[key];
    }
  });

  entry.version = (entry.version || 0) + 1;
  await entry.save();

  await createAuditLog({
    action: 'SANCTION_ENTRY_UPDATED',
    category: 'SANCTION_LIST',
    severity: 'WARNING',
    userId: user.userId,
    userName: user.username,
    userRole: user.role,
    entityType: 'SanctionEntry',
    entityId: entryId,
    description: `更新制裁条目: ${entry.name}`,
    changes: {
      before: { name: before.name, isActive: before.isActive },
      after: { name: entry.name, isActive: entry.isActive },
    },
  });

  return entry;
}

async function deactivateSanctionEntry(entryId, user) {
  const entry = await SanctionEntry.findOne({ entryId });
  if (!entry) throw new Error('制裁条目不存在');

  entry.isActive = false;
  entry.version = (entry.version || 0) + 1;
  await entry.save();

  await createAuditLog({
    action: 'SANCTION_ENTRY_DEACTIVATED',
    category: 'SANCTION_LIST',
    severity: 'WARNING',
    userId: user.userId,
    userName: user.username,
    userRole: user.role,
    entityType: 'SanctionEntry',
    entityId: entryId,
    description: `失效制裁条目: ${entry.name}`,
  });

  return entry;
}

async function getSanctionEntries(query = {}) {
  const filter = {};
  if (query.listName) filter.listName = query.listName;
  if (query.entityType) filter.entityType = query.entityType;
  if (query.isActive !== undefined) filter.isActive = query.isActive === 'true' || query.isActive === true;
  else filter.isActive = true;

  if (query.country) filter.countries = query.country;
  if (query.hsCode) filter.hsCodes = { $elemMatch: { $regex: `^${query.hsCode}` } };

  if (query.search) {
    const searchNorm = normalizeString(query.search);
    filter.$or = [
      { $text: { $search: query.search } },
      { name: { $regex: query.search, $options: 'i' } },
      { entryId: { $regex: query.search, $options: 'i' } },
    ];
  }

  const page = parseInt(query.page) || 1;
  const pageSize = parseInt(query.pageSize) || 50;
  const skip = (page - 1) * pageSize;

  const total = await SanctionEntry.countDocuments(filter);
  const items = await SanctionEntry.find(filter)
    .sort({ updatedAt: -1 })
    .skip(skip)
    .limit(pageSize);

  return {
    total,
    page,
    pageSize,
    items,
  };
}

module.exports = {
  validateSanctionData,
  processUploadedFile,
  processSanctionUpload,
  createSanctionEntry,
  updateSanctionEntry,
  deactivateSanctionEntry,
  getSanctionEntries,
  VALID_LISTS,
  VALID_ENTITY_TYPES,
  REQUIRED_FIELDS,
};
