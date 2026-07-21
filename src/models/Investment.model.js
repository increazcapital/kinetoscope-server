const mongoose = require('mongoose');

/**
 * Investment Schema
 * Financial records are immutable — no update or delete operations are permitted.
 */
const investmentSchema = new mongoose.Schema(
  {
    clientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Client ID is required'],
    },
    clientName: {
      type: String,
      required: [true, 'Client name is required'],
      trim: true,
    },
    clientCode: {
      type: String,
      required: [true, 'Client code is required'],
      trim: true,
      uppercase: true,
    },
    segment: {
      type: String,
      trim: true,
    },
    projectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Project',
    },
    segmentAllocation: [
      {
        segmentName: { type: String, required: true },
        allocationPercentage: { type: Number, required: true, min: 0, max: 100 },
      }
    ],
    investmentAmount: {
      type: Number,
      required: [true, 'Investment amount is required'],
      min: [0.01, 'Investment amount must be a positive number'],
    },
    roiPercentage: {
      type: Number,
      required: [true, 'ROI percentage is required'],
      min: [0, 'ROI percentage must be a non-negative number'],
    },
    riskPercentage: {
      type: Number,
      required: [true, 'Risk percentage is required'],
      min: [0, 'Risk percentage must be a non-negative number'],
    },
    riskLevel: {
      type: String,
      enum: ['Low', 'Medium', 'High', 'Medium High'],
      default: 'Medium',
    },
    durationMonths: {
      type: Number,
      default: 24,
    },
    contractEndDate: {
      type: Date,
    },
    investmentDate: {
      type: Date,
      required: [true, 'Investment date is required'],
      default: Date.now,
    },
    status: {
      type: String,
      enum: {
        values: ['active', 'completed', 'cancelled'],
        message: 'Status must be either: active, completed, or cancelled',
      },
      default: 'active',
    },
    remarks: {
      type: String,
      trim: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Investment must be assigned by a user'],
    },
    // Tracks the approved deposit Transaction that auto-created this Investment
    sourceTransactionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Transaction',
      default: null,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Virtual for amount
investmentSchema.virtual('amount')
  .get(function () {
    return this.investmentAmount;
  })
  .set(function (val) {
    this.investmentAmount = val;
  });

// Virtual for roi
investmentSchema.virtual('roi')
  .get(function () {
    return this.roiPercentage;
  })
  .set(function (val) {
    this.roiPercentage = val;
  });

// Pre-save hook to calculate contractEndDate based on investmentDate and durationMonths if not provided
investmentSchema.pre('save', async function () {
  if (this.isNew || this.isModified('investmentDate') || this.isModified('durationMonths')) {
    if (!this.contractEndDate && this.investmentDate) {
      const start = new Date(this.investmentDate);
      start.setMonth(start.getMonth() + (this.durationMonths || 24));
      this.contractEndDate = start;
    }
  }

  // Auto-populate segment name if empty but allocation exists
  if (!this.segment && this.segmentAllocation && this.segmentAllocation.length > 0) {
    this.segment = this.segmentAllocation.map(s => s.segmentName).join(', ');
  }
});

// Indexes for efficient search and filter queries
investmentSchema.index({ clientName: 1 });
investmentSchema.index({ clientCode: 1 });
investmentSchema.index({ segment: 1 });
investmentSchema.index({ status: 1 });
investmentSchema.index({ clientId: 1 });

const Investment = mongoose.model('Investment', investmentSchema);

module.exports = Investment;
