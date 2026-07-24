const mongoose = require('mongoose');

/**
 * AgentCommission Schema representing commission payout history records for agents.
 */
const agentCommissionSchema = new mongoose.Schema(
  {
    agentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Agent ID is required'],
    },
    clientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    period: {
      type: String, // e.g. "Jan 2025", "Onboarding", "Special Campaign"
      required: [true, 'Period is required'],
    },
    date: {
      type: Date, // Date object (serialized as ISO string in API responses)
      required: [true, 'Date is required'],
    },
    type: {
      type: String,
      enum: {
        values: ['MONTHLY', 'ONE TIME', 'SPECIAL'],
        message: 'Type must be MONTHLY, ONE TIME, or SPECIAL',
      },
      default: 'MONTHLY',
    },
    amount: {
      type: Number,
      required: [true, 'Amount is required'],
      min: [0, 'Amount must be a non-negative number'],
    },
    status: {
      type: String,
      enum: {
        values: ['PAID', 'PENDING'],
        message: 'Status must be PAID or PENDING',
      },
      default: 'PENDING',
    },
    remarks: {
      type: String,
      trim: true,
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
    sourceTransactionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Transaction',
    },
    investmentAmount: {
      type: Number,
      default: 0,
    },
    slabPercentage: {
      type: Number,
      default: 0,
    },
    slabType: {
      type: String,
      enum: ['one-time', 'monthly', ''],
      default: '',
    },
  },
  {
    timestamps: true,
  }
);

// Indexes for fast lookup
agentCommissionSchema.index({ agentId: 1 });
agentCommissionSchema.index({ status: 1 });

const AgentCommission = mongoose.model('AgentCommission', agentCommissionSchema);

module.exports = AgentCommission;
