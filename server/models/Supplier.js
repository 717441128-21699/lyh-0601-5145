const mongoose = require('mongoose');
const { Schema } = mongoose;

const SupplierSchema = new Schema({
  supplierId: { type: String, required: true, unique: true, index: true },
  name: { type: String, required: true, index: true },
  legalName: { type: String },
  alternateNames: [{ type: String }],

  registrationNumber: { type: String },
  taxId: { type: String },
  vatNumber: { type: String },

  country: { type: String, required: true, index: true },
  countriesOfOperation: [{ type: String }],

  address: {
    line1: { type: String },
    line2: { type: String },
    city: { type: String },
    state: { type: String },
    postalCode: { type: String },
    country: { type: String },
  },

  contactInfo: {
    primaryContact: { type: String },
    email: { type: String },
    phone: { type: String },
    website: { type: String },
  },

  beneficialOwners: [{
    name: { type: String },
    nationality: { type: String },
    ownershipPercentage: { type: Number },
  }],
  directors: [{ type: String }],
  shareholders: [{ type: String }],

  riskLevel: {
    type: String,
    enum: ['SAFE', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL', 'BLACKLISTED'],
    default: 'LOW',
    index: true,
  },
  riskScore: { type: Number, default: 0 },
  riskReasons: [{ type: String }],

  complianceStatus: {
    type: String,
    enum: ['VERIFIED', 'PENDING', 'FLAGGED', 'REJECTED', 'SUSPENDED'],
    default: 'PENDING',
    index: true,
  },

  lastScreeningDate: { type: Date },
  screeningCount: { type: Number, default: 0 },
  sanctionHits: { type: Number, default: 0 },
  rejectionCount: { type: Number, default: 0 },

  tradeVolume: { type: Number, default: 0 },
  transactionCount: { type: Number, default: 0 },
  approvedTransactionCount: { type: Number, default: 0 },
  rejectedTransactionCount: { type: Number, default: 0 },

  dueDiligence: {
    completedAt: { type: Date },
    level: { type: String, enum: ['STANDARD', 'ENHANCED', null] },
    findings: { type: String },
    documentUrl: { type: String },
  },

  notes: { type: String },
  tags: [{ type: String }],

  isActive: { type: Boolean, default: true, index: true },
  blacklisted: { type: Boolean, default: false, index: true },
  blacklistReason: { type: String },
  blacklistedAt: { type: Date },

}, {
  timestamps: true,
});

SupplierSchema.index({ riskLevel: 1, isActive: 1 });
SupplierSchema.index({ country: 1, riskLevel: 1 });
SupplierSchema.index({ name: 'text', legalName: 'text', alternateNames: 'text' });

module.exports = mongoose.model('Supplier', SupplierSchema);
