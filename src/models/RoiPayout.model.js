const mongoose = require('mongoose');

/**
 * RoiPayout Schema representing individual ROI payout records
 */
const roiPayoutSchema = new mongoose.Schema(
  {
    clientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Client ID is required'],
    },
    payoutMonth: {
      type: String, // e.g. "Jan 2025"
      required: [true, 'Payout month is required'],
    },
    amount: {
      type: Number,
      required: [true, 'Payout amount is required'],
      min: [0, 'Payout amount must be a non-negative number'],
    },
    status: {
      type: String,
      enum: {
        values: ['PAID', 'PENDING'],
        message: 'Status must be either PAID or PENDING',
      },
      default: 'PENDING',
    },
    roiPercentage: {
      type: Number,
      default: null,
    },
    roiRate: {
      type: String,
      default: '',
    },
    processedDate: {
      type: Date,
    },
    paymentMode: {
      type: String,
      enum: ['Bank Transfer', 'UPI', 'Cheque', 'Other', ''],
      default: '',
    },
    transactionRefId: {
      type: String,
      default: '',
    },
  },
  {
    timestamps: true,
  }
);

// Indexes for fast lookup
roiPayoutSchema.index({ clientId: 1 });
roiPayoutSchema.index({ status: 1 });

const RoiPayout = mongoose.model('RoiPayout', roiPayoutSchema);

module.exports = RoiPayout;
