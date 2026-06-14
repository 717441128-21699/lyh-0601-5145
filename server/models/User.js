const mongoose = require('mongoose');
const { Schema } = mongoose;
const bcrypt = require('bcryptjs');

const UserSchema = new Schema({
  userId: { type: String, required: true, unique: true, index: true },
  username: { type: String, required: true, unique: true, index: true },
  email: { type: String, required: true, unique: true, lowercase: true },
  fullName: { type: String, required: true },

  passwordHash: { type: String, required: true },

  role: {
    type: String,
    enum: ['COMPLIANCE_DIRECTOR', 'COMPLIANCE_OFFICER', 'LEGAL_REVIEWER', 'AUDITOR', 'ADMIN', 'VIEWER'],
    required: true,
    index: true,
  },
  department: {
    type: String,
    enum: ['COMPLIANCE', 'LEGAL', 'AUDIT', 'ADMIN', 'IT'],
    default: 'COMPLIANCE',
  },

  permissions: [{ type: String }],

  isActive: { type: Boolean, default: true, index: true },
  isLocked: { type: Boolean, default: false },

  lastLoginAt: { type: Date },
  lastLoginIp: { type: String },
  loginCount: { type: Number, default: 0 },

  notificationPreferences: {
    email: { type: Boolean, default: true },
    push: { type: Boolean, default: true },
    webhook: { type: Boolean, default: true },
    riskThreshold: { type: String, default: 'HIGH' },
  },

  assignedTicketCount: { type: Number, default: 0 },
  completedTicketCount: { type: Number, default: 0 },

}, {
  timestamps: true,
});

UserSchema.methods.comparePassword = async function(password) {
  return bcrypt.compare(password, this.passwordHash);
};

UserSchema.statics.hashPassword = async function(password) {
  return bcrypt.hash(password, 10);
};

UserSchema.index({ role: 1, isActive: 1 });

module.exports = mongoose.model('User', UserSchema);
