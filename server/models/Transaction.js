const mongoose = require('mongoose');
const { Schema } = mongoose;

const TransactionSchema = new Schema({
  transactionId: {
    type: String,
    required: true,
    unique: true,
    index: true,
  },
  poNumber: { type: String, required: true, index: true },
  orderDate: { type: Date, required: true, index: true },
  supplierId: { type: String, required: true, index: true },
  supplierName: { type: String, required: true },
  supplierCountry: { type: String, required: true, index: true },
  hsCode: { type: String, required: true, index: true },
  hsDescription: { type: String },
  originCountry: { type: String, required: true, index: true },
  destinationCountry: { type: String, required: true },
  endUser: { type: String, required: true },
  endUserCountry: { type: String },
  productDescription: { type: String },
  quantity: { type: Number, required: true },
  unitPrice: { type: Number, required: true },
  totalAmount: { type: Number, required: true },
  currency: { type: String, default: 'USD' },

  riskScore: { type: Number, default: 0, index: true },
  riskLevel: {
    type: String,
    enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'],
    default: 'LOW',
    index: true,
  },
  riskFactors: [{
    type: { type: String },
    description: { type: String },
    score: { type: Number },
    matchedSanction: { type: String },
  }],
  sanctionMatches: [{
    sanctionId: { type: Schema.Types.ObjectId, ref: 'SanctionEntry' },
    listName: { type: String },
    matchedField: { type: String },
    matchScore: { type: Number },
    matchValue: { type: String },
  }],

  status: {
    type: String,
    enum: ['PENDING_SCREENING', 'SCREENED', 'FROZEN', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'RELEASED'],
    default: 'PENDING_SCREENING',
    index: true,
  },
  frozen: { type: Boolean, default: false },
  frozenAt: { type: Date },
  releasedAt: { type: Date },

  reviewId: { type: Schema.Types.ObjectId, ref: 'ReviewTicket' },
  reviewedBy: { type: String },
  reviewedAt: { type: Date },
  reviewNotes: { type: String },

  rejectionReason: { type: String },
  rejectionDate: { type: Date },

  source: { type: String, default: 'auto_sync' },
  syncTimestamp: { type: Date, default: Date.now },

}, {
  timestamps: true,
});

TransactionSchema.index({ createdAt: -1 });
TransactionSchema.index({ status: 1, riskLevel: 1 });
TransactionSchema.index({ orderDate: -1, status: 1 });
TransactionSchema.index({ supplierId: 1, orderDate: -1 });

module.exports = mongoose.model('Transaction', TransactionSchema);
