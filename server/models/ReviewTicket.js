const mongoose = require('mongoose');
const { Schema } = mongoose;

const ReviewTicketSchema = new Schema({
  ticketId: { type: String, required: true, unique: true, index: true },
  transactionId: {
    type: Schema.Types.ObjectId,
    ref: 'Transaction',
    required: true,
    index: true,
  },
  transactionRefId: { type: String, required: true },

  riskScore: { type: Number, required: true },
  riskLevel: {
    type: String,
    enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'],
    required: true,
    index: true,
  },
  sanctionMatches: [{
    sanctionId: { type: Schema.Types.ObjectId, ref: 'SanctionEntry' },
    listName: { type: String },
    matchedField: { type: String },
    matchScore: { type: Number },
    matchValue: { type: String },
    matchedEntryName: { type: String },
  }],
  riskSummary: { type: String },

  status: {
    type: String,
    enum: ['PENDING', 'ASSIGNED', 'IN_PROGRESS', 'APPROVED', 'REJECTED', 'ESCALATED', 'CLOSED'],
    default: 'PENDING',
    index: true,
  },
  priority: {
    type: String,
    enum: ['LOW', 'MEDIUM', 'HIGH', 'URGENT'],
    default: 'MEDIUM',
    index: true,
  },

  assignedTo: { type: String, index: true },
  assignedGroup: { type: String, default: 'LEGAL_DEPT', index: true },
  assignedAt: { type: Date },

  escalated: { type: Boolean, default: false, index: true },
  escalatedAt: { type: Date },
  escalatedTo: { type: String },
  escalateReason: { type: String },

  reviewDeadline: { type: Date, index: true },
  isOverdue: { type: Boolean, default: false, index: true },

  reviewerAssigned: { type: String },
  reviewedBy: { type: String },
  reviewedAt: { type: Date },
  reviewDurationHours: { type: Number },

  decision: {
    type: String,
    enum: ['RELEASE', 'REJECT', 'REQUEST_MORE_INFO', null],
    default: null,
  },
  decisionNotes: { type: String },
  decisionEvidence: [{ type: String }],

  rejectionReason: { type: String },
  rejectionCategory: { type: String },

  commentCount: { type: Number, default: 0 },
  lastActivityAt: { type: Date },

  slaBreached: { type: Boolean, default: false },
  slaBreachReason: { type: String },

  source: { type: String, default: 'auto' },
}, {
  timestamps: true,
});

ReviewTicketSchema.index({ createdAt: -1 });
ReviewTicketSchema.index({ status: 1, priority: 1, createdAt: -1 });
ReviewTicketSchema.index({ assignedTo: 1, status: 1 });
ReviewTicketSchema.index({ reviewDeadline: 1, status: 1, escalated: 1 });

ReviewTicketSchema.pre('save', function(next) {
  this.lastActivityAt = new Date();
  if (this.reviewDeadline && !this.reviewDeadlineHasBeenSet) {
    this.reviewDeadlineHasBeenSet = true;
  }
  next();
});

module.exports = mongoose.model('ReviewTicket', ReviewTicketSchema);
