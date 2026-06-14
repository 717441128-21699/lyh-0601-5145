const mongoose = require('mongoose');
const { Schema } = mongoose;

const ComplianceReportSchema = new Schema({
  reportId: { type: String, required: true, unique: true, index: true },
  reportType: {
    type: String,
    enum: ['DAILY', 'WEEKLY', 'MONTHLY', 'CUSTOM', 'ADHOC'],
    required: true,
    index: true,
  },
  period: {
    startDate: { type: Date, required: true, index: true },
    endDate: { type: Date, required: true, index: true },
  },
  generatedAt: { type: Date, default: Date.now, index: true },
  generatedBy: { type: String },

  summary: {
    totalTransactions: { type: Number, default: 0 },
    screenedTransactions: { type: Number, default: 0 },
    frozenTransactions: { type: Number, default: 0 },
    approvedTransactions: { type: Number, default: 0 },
    rejectedTransactions: { type: Number, default: 0 },
    underReviewCount: { type: Number, default: 0 },

    totalSanctionHits: { type: Number, default: 0 },
    uniqueSanctionHits: { type: Number, default: 0 },
    hitRate: { type: Number, default: 0 },

    highRiskCount: { type: Number, default: 0 },
    mediumRiskCount: { type: Number, default: 0 },
    lowRiskCount: { type: Number, default: 0 },
    criticalRiskCount: { type: Number, default: 0 },

    totalReviews: { type: Number, default: 0 },
    completedReviews: { type: Number, default: 0 },
    pendingReviews: { type: Number, default: 0 },
    overdueReviews: { type: Number, default: 0 },
    escalatedReviews: { type: Number, default: 0 },
    slaBreachCount: { type: Number, default: 0 },

    averageReviewHours: { type: Number, default: 0 },
    medianReviewHours: { type: Number, default: 0 },
    p95ReviewHours: { type: Number, default: 0 },

    autoApprovalRate: { type: Number, default: 0 },
    manualReviewRate: { type: Number, default: 0 },
    rejectionRate: { type: Number, default: 0 },

    totalSuppliersAffected: { type: Number, default: 0 },
    highRiskSuppliers: { type: Number, default: 0 },
  },

  riskDistribution: [{
    level: { type: String },
    count: { type: Number },
    percentage: { type: Number },
  }],

  sanctionListBreakdown: [{
    listName: { type: String },
    hitCount: { type: Number },
    uniqueTransactions: { type: Number },
  }],

  countryRiskBreakdown: [{
    country: { type: String },
    transactionCount: { type: Number },
    hitCount: { type: Number },
    highRiskCount: { type: Number },
  }],

  hsCodeRisk: [{
    hsCode: { type: String },
    description: { type: String },
    count: { type: Number },
    hitCount: { type: Number },
  }],

  topMatchedEntities: [{
    sanctionId: { type: Schema.Types.ObjectId, ref: 'SanctionEntry' },
    entityName: { type: String },
    listName: { type: String },
    matchCount: { type: Number },
  }],

  reviewerPerformance: [{
    reviewer: { type: String },
    reviewCount: { type: Number },
    approvedCount: { type: Number },
    rejectedCount: { type: Number },
    avgHours: { type: Number },
    overdueCount: { type: Number },
  }],

  hourlyTransactionStats: [{
    hour: { type: Number },
    totalCount: { type: Number },
    hitCount: { type: Number },
    avgRiskScore: { type: Number },
  }],

  trendData: {
    dailyHitRates: [{ date: { type: Date }, rate: { type: Number }, count: { type: Number } }],
    dailyReviewTimes: [{ date: { type: Date }, avgHours: { type: Number } }],
    dailyVolume: [{ date: { type: Date }, count: { type: Number } }],
  },

  filePaths: {
    pdf: { type: String },
    excel: { type: String },
  },

  status: {
    type: String,
    enum: ['GENERATING', 'COMPLETED', 'FAILED'],
    default: 'COMPLETED',
    index: true,
  },
  errorMessage: { type: String },

}, {
  timestamps: true,
  collection: 'compliance_reports',
});

ComplianceReportSchema.index({ reportType: 1, generatedAt: -1 });
ComplianceReportSchema.index({ 'period.startDate': 1, 'period.endDate': 1 });

module.exports = mongoose.model('ComplianceReport', ComplianceReportSchema);
