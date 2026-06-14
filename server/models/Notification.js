const mongoose = require('mongoose');
const { Schema } = mongoose;

const NotificationSchema = new Schema({
  notificationId: { type: String, required: true, unique: true, index: true },
  type: {
    type: String,
    enum: [
      'HIGH_RISK_ALERT',
      'REVIEW_ASSIGNED',
      'REVIEW_ESCALATED',
      'REVIEW_OVERDUE',
      'REVIEW_APPROVED',
      'REVIEW_REJECTED',
      'SANCTION_LIST_UPDATED',
      'REPORT_GENERATED',
      'SUPPLIER_FLAGGED',
      'SYSTEM_ALERT',
      'APPROVAL_REQUEST',
      'DENIED_TRADE',
    ],
    required: true,
    index: true,
  },
  priority: {
    type: String,
    enum: ['LOW', 'MEDIUM', 'HIGH', 'URGENT', 'CRITICAL'],
    default: 'MEDIUM',
    index: true,
  },
  severity: {
    type: String,
    enum: ['INFO', 'WARNING', 'ERROR', 'CRITICAL'],
    default: 'INFO',
  },

  title: { type: String, required: true },
  message: { type: String, required: true },
  summary: { type: String },

  recipients: {
    users: [{ type: String }],
    groups: [{ type: String }],
    channels: [{ type: String }],
  },

  relatedEntity: {
    type: { type: String },
    id: { type: String },
    ref: { type: String },
  },

  data: { type: Schema.Types.Mixed },

  deliveryStatus: {
    webhook: { sent: { type: Boolean, default: false }, sentAt: { type: Date }, error: { type: String } },
    email: { sent: { type: Boolean, default: false }, sentAt: { type: Date }, error: { type: String } },
    push: { sent: { type: Boolean, default: false }, sentAt: { type: Date }, error: { type: String } },
    inApp: { shown: { type: Boolean, default: false }, shownAt: { type: Date } },
  },

  readBy: [{
    userId: { type: String },
    readAt: { type: Date },
  }],

  isRead: { type: Boolean, default: false },
  isArchived: { type: Boolean, default: false },
  isExpired: { type: Boolean, default: false },
  expiresAt: { type: Date },

  source: { type: String, default: 'system' },
  timestamp: { type: Date, default: Date.now, index: true },
}, {
  timestamps: false,
});

NotificationSchema.index({ timestamp: -1 });
NotificationSchema.index({ 'recipients.users': 1, isRead: 1, timestamp: -1 });
NotificationSchema.index({ priority: 1, timestamp: -1 });
NotificationSchema.index({ type: 1, timestamp: -1 });

module.exports = mongoose.model('Notification', NotificationSchema);
