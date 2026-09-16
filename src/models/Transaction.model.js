const mongoose = require('mongoose');
const { TRANSACTION_STATUS, TRANSACTION_TYPES } = require('../constants/statuses');

/**
 * Transaction Schema
 * Stores deposits and withdrawals initiated by clients or agents on behalf of clients.
 */
const transactionSchema = new mongoose.Schema(
  {
    clientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    clientName: {
      type: String,
      trim: true,
    },
    clientCode: {
      type: String,
      trim: true,
      uppercase: true,
    },
    agentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    isAgentWithdrawal: {
      type: Boolean,
      default: false,
    },
    proofAttachment: {
      type: String,
      default: '',
    },
    type: {
      type: String,
      enum: {
        values: [TRANSACTION_TYPES.DEPOSIT, TRANSACTION_TYPES.WITHDRAWAL],
        message: 'Type must be either deposit or withdrawal',
      },
      required: [true, 'Transaction type is required'],
    },
    amount: {
      type: Number,
      required: [true, 'Transaction amount is required'],
      min: [0.01, 'Amount must be greater than zero'],
    },
    status: {
      type: String,
      enum: {
        values: [TRANSACTION_STATUS.PENDING, TRANSACTION_STATUS.APPROVED, TRANSACTION_STATUS.REJECTED],
        message: 'Status must be pending, approved, or rejected',
      },
      default: TRANSACTION_STATUS.PENDING,
    },
    paymentMethod: {
      type: String,
      trim: true,
    },
    referenceNumber: {
      type: String,
      trim: true,
    },
    remarks: {
      type: String,
      trim: true,
    },
    actionBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User', // The Super Admin who approved/rejected this transaction
    },
    actionAt: {
      type: Date,
    },
    rejectionReason: {
      type: String,
      trim: true,
    },
    linkedInvestmentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Investment',
      default: null,
    },
    projectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Project',
      default: null,
    },
    projectName: {
      type: String,
      trim: true,
      default: '',
    },
    bankDetails: {
      accountHolderName: { type: String, trim: true, default: '' },
      bankName: { type: String, trim: true, default: '' },
      accountNumber: { type: String, trim: true, default: '' },
      ifscCode: { type: String, trim: true, default: '' },
      upiId: { type: String, trim: true, default: '' },
    },
  },
  {
    timestamps: true,
  }
);

const Transaction = mongoose.model('Transaction', transactionSchema);

module.exports = Transaction;

