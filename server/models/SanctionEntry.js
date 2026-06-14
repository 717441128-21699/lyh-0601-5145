const mongoose = require('mongoose');
const { Schema } = mongoose;

const SanctionEntrySchema = new Schema({
  entryId: { type: String, required: true, unique: true, index: true },
  listName: {
    type: String,
    required: true,
    enum: ['OFAC-SDN', 'OFAC-NSMBS', 'EU-CON', 'UN-SEC', 'UK-CONS', 'HMT', 'CUSTOM'],
    index: true,
  },
  listSource: { type: String },
  entityType: {
    type: String,
    enum: ['INDIVIDUAL', 'COMPANY', 'ORGANIZATION', 'VESSEL', 'AIRCRAFT', 'GOODS', 'COUNTRY'],
    required: true,
    index: true,
  },

  name: { type: String, required: true, index: true },
  alternateNames: [{ type: String }],
  aliases: [{ type: String }],

  firstName: { type: String },
  lastName: { type: String },
  middleName: { type: String },

  registrationNumbers: [{
    type: { type: String },
    number: { type: String },
    country: { type: String },
  }],

  addresses: [{
    line1: { type: String },
    line2: { type: String },
    city: { type: String },
    state: { type: String },
    postalCode: { type: String },
    country: { type: String },
  }],

  countries: [{ type: String, index: true }],
  nationalities: [{ type: String }],
  birthDates: [{ type: String }],
  birthPlaces: [{ type: String }],
  identityDocuments: [{
    type: { type: String },
    number: { type: String },
    country: { type: String },
  }],

  hsCodes: [{ type: String, index: true }],
  goodsDescription: { type: String },

  vesselImoNumber: { type: String },
  vesselName: { type: String },
  vesselFlag: { type: String },

  designationDate: { type: Date },
  expirationDate: { type: Date },
  programs: [{ type: String }],
  sanctionsType: { type: String },

  remarks: { type: String },
  additionalInfo: { type: Schema.Types.Mixed },

  isActive: { type: Boolean, default: true, index: true },

  uploadedBy: { type: String },
  batchId: { type: String },
  sourceFile: { type: String },

  version: { type: Number, default: 1 },
}, {
  timestamps: true,
});

SanctionEntrySchema.index({ listName: 1, isActive: 1 });
SanctionEntrySchema.index({ 'countries': 1, isActive: 1 });
SanctionEntrySchema.index({ 'hsCodes': 1, isActive: 1 });
SanctionEntrySchema.index({ name: 'text', alternateNames: 'text', aliases: 'text' }, {
  weights: { name: 10, alternateNames: 5, aliases: 5 },
  name: 'sanction_text_search',
});

SanctionEntrySchema.pre('save', function(next) {
  this.updatedAt = new Date();
  this.version = (this.version || 1) + 1;
  next();
});

module.exports = mongoose.model('SanctionEntry', SanctionEntrySchema);
