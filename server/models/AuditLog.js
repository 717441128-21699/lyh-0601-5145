const mongoose = require('mongoose');
const { Schema } = mongoose;

const AuditLogSchema = new Schema({
  logId: { type: String, required: true, unique: true, index: true },
  timestamp: { type: Date, default: Date.now, index: true },

  action: { type: String, required: true, index: true },
  category: {
    type: String,
    enum: [
      'TRANSACTION', 'REVIEW', 'SANCTION_LIST', 'SUPPLIER',
      'REPORT', 'USER', 'AUTH', 'CONFIG', 'EXPORT', 'SYSTEM', 'NOTIFICATION'
    ],
    required: true,
    index: true,
  },
  severity: {
    type: String,
    enum: ['DEBUG', 'INFO', 'WARNING', 'ERROR', 'CRITICAL'],
    default: 'INFO',
    index: true,
  },

  userId: { type: String, index: true },
  userName: { type: String },
  userRole: { type: String },

  entityType: { type: String },
  entityId: { type: String },
  entityRef: { type: String },

  description: { type: String, required: true },
  details: { type: Schema.Types.Mixed },

  changes: {
    before: { type: Schema.Types.Mixed },
    after: { type: Schema.Types.Mixed },
    fields: [{ type: String }],
  },

  ipAddress: { type: String },
  userAgent: { type: String },
  sessionId: { type: String },

  status: {
    type: String,
    enum: ['SUCCESS', 'FAILURE', 'PENDING'],
    default: 'SUCCESS',
  },
  errorMessage: { type: String },
  stackTrace: { type: String },

  relatedTransactionId: { type: String, index: true },
  relatedReviewId: { type: String, index: true },

  read: { type: Boolean, default: false },
}, {
  timestamps: false,
  collection: 'audit_logs',
});

AuditLogSchema.index({ timestamp: -1 });
AuditLogSchema.index({ category: 1, timestamp: -1 });
AuditLogSchema.index({ userId: 1, timestamp: -1 });
AuditLogSchema.index({ action: 1, timestamp: -1 });
AuditLogSchema.index({ entityType: 1, entityId: 1, timestamp: -1 });

module.exports = mongoose.model('AuditLog', AuditLogSchema);
