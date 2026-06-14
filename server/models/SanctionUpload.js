const mongoose = require('mongoose');
const { Schema } = mongoose;

const SanctionUploadSchema = new Schema({
  uploadId: { type: String, required: true, unique: true, index: true },
  fileName: { type: String, required: true },
  originalFileName: { type: String },
  fileType: { type: String, enum: ['CSV', 'XLSX', 'XLS', 'JSON'], required: true },
  fileSize: { type: Number },
  fileHash: { type: String },

  listName: {
    type: String,
    required: true,
    enum: ['OFAC-SDN', 'OFAC-NSMBS', 'EU-CON', 'UN-SEC', 'UK-CONS', 'HMT', 'CUSTOM'],
    index: true,
  },

  uploadedBy: { type: String, required: true },
  uploadedAt: { type: Date, default: Date.now, index: true },

  validationStatus: {
    type: String,
    enum: ['PENDING', 'VALIDATING', 'VALID', 'INVALID'],
    default: 'PENDING',
  },
  validationErrors: [{
    row: { type: Number },
    column: { type: String },
    code: { type: String },
    message: { type: String },
  }],
  validationWarnings: [{
    row: { type: Number },
    column: { type: String },
    code: { type: String },
    message: { type: String },
  }],

  processingStatus: {
    type: String,
    enum: ['PENDING', 'PROCESSING', 'COMPLETED', 'PARTIAL', 'FAILED'],
    default: 'PENDING',
    index: true,
  },
  processedAt: { type: Date },

  statistics: {
    totalRows: { type: Number, default: 0 },
    validRows: { type: Number, default: 0 },
    invalidRows: { type: Number, default: 0 },
    skippedRows: { type: Number, default: 0 },
    inserted: { type: Number, default: 0 },
    updated: { type: Number, default: 0 },
    deactivated: { type: Number, default: 0 },
    duplicates: { type: Number, default: 0 },
  },

  filePath: { type: String },
  errorMessage: { type: String },
  notes: { type: String },

  replaceExisting: { type: Boolean, default: false },
  effectiveDate: { type: Date },

}, {
  timestamps: true,
});

SanctionUploadSchema.index({ listName: 1, uploadedAt: -1 });
SanctionUploadSchema.index({ processingStatus: 1, uploadedAt: -1 });

module.exports = mongoose.model('SanctionUpload', SanctionUploadSchema);
