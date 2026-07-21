const Transaction = require('../../models/Transaction.model');
const User = require('../../models/User.model');
const ClientProfile = require('../../models/ClientProfile.model');
const Investment = require('../../models/Investment.model');
const AgentProfile = require('../../models/AgentProfile.model');
const { sendTransactionStatusNotification } = require('../../services/email.service');
const { TRANSACTION_STATUS, TRANSACTION_TYPES } = require('../../constants/statuses');
const AppError = require('../../utils/AppError');
const asyncHandler = require('../../utils/asyncHandler');

/**
 * List pending transaction approvals for Super Admin (with metrics)
 * GET /api/super-admin/transactions/approvals
 */
const getPendingApprovals = asyncHandler(async (req, res, next) => {
  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 10;
  const skip = (page - 1) * limit;

  // 1. Calculate Approvals Stats
  const allPending = await Transaction.find({ status: TRANSACTION_STATUS.PENDING }).lean();
  const pendingRequests = allPending.length;
  
  let pendingDepositsAmount = 0;
  let pendingDepositsCount = 0;
  let pendingWithdrawalsAmount = 0;
  let pendingWithdrawalsCount = 0;

  allPending.forEach(tx => {
    if (tx.type === TRANSACTION_TYPES.DEPOSIT) {
      pendingDepositsAmount += tx.amount;
      pendingDepositsCount++;
    } else if (tx.type === TRANSACTION_TYPES.WITHDRAWAL) {
      pendingWithdrawalsAmount += tx.amount;
      pendingWithdrawalsCount++;
    }
  });

  // 2. Build Query
  const query = { status: TRANSACTION_STATUS.PENDING };

  if (req.query.type) {
    query.type = req.query.type;
  }
  if (req.query.clientCode) {
    query.clientCode = { $regex: req.query.clientCode, $options: 'i' };
  }

  const total = await Transaction.countDocuments(query);
  const transactions = await Transaction.find(query)
    .populate('clientId', 'name email clientCode')
    .populate('agentId', 'name email clientCode')
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .lean();

  // Format list entries to normalize client/agent names and codes
  const formattedTransactions = transactions.map(tx => {
    const isAgent = tx.isAgentWithdrawal;
    const user = isAgent ? (tx.agentId || {}) : (tx.clientId || {});
    return {
      ...tx,
      investorName: user.name || tx.clientName || 'Unknown User',
      investorCode: isAgent ? (user.clientCode ? `AGT-${user.clientCode.replace('AGT-', '')}` : '—') : (user.clientCode || tx.clientCode || '—'),
    };
  });

  res.status(200).json({
    success: true,
    count: formattedTransactions.length,
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    },
    data: {
      stats: {
        pendingRequests,
        pendingDeposits: {
          count: pendingDepositsCount,
          totalAmount: pendingDepositsAmount
        },
        pendingWithdrawals: {
          count: pendingWithdrawalsCount,
          totalAmount: pendingWithdrawalsAmount
        }
      },
      transactions: formattedTransactions,
    },
  });
});

/**
 * Approve or Reject a transaction (Super Admin only)
 * PATCH /api/super-admin/transactions/:id/approve
 */
const approveRejectTransaction = asyncHandler(async (req, res, next) => {
  const { id } = req.params;
  const { status, rejectionReason } = req.body;

  if (!status || ![TRANSACTION_STATUS.APPROVED, TRANSACTION_STATUS.REJECTED].includes(status)) {
    return next(new AppError('Please provide a valid action status: approved or rejected.', 400));
  }

  const transaction = await Transaction.findById(id);
  if (!transaction) {
    return next(new AppError('Transaction record not found.', 404));
  }

  if (transaction.status !== TRANSACTION_STATUS.PENDING) {
    return next(new AppError(`This transaction has already been ${transaction.status}.`, 400));
  }

  // Update status and actions metadata
  transaction.status = status;
  transaction.actionBy = req.user.id || req.user._id;
  transaction.actionAt = new Date();
  transaction.remarks = rejectionReason || transaction.remarks || '';

  if (status === TRANSACTION_STATUS.REJECTED) {
    if (!rejectionReason) {
      return next(new AppError('Rejection reason is required when rejecting a transaction.', 400));
    }
    transaction.rejectionReason = rejectionReason;
  }

  await transaction.save();

  // ═══════════════════════════════════════════════════════════════════════
  // CRITICAL: When a DEPOSIT is APPROVED, auto-create an Investment record
  // so that totalInvestment is properly reflected across ALL dashboards
  // (Super Admin Client Details, Agent Admin Client Details, Client Dashboard)
  // ═══════════════════════════════════════════════════════════════════════
  if (status === TRANSACTION_STATUS.APPROVED && transaction.type === TRANSACTION_TYPES.DEPOSIT && !transaction.isAgentWithdrawal) {
    try {
      // Fetch client profile to get ROI % and client code
      const clientUser = await User.findById(transaction.clientId).lean();
      const clientProfile = clientUser ? await ClientProfile.findOne({ userId: transaction.clientId }).lean() : null;

      const roiPct = clientProfile ? (clientProfile.monthlyRoi || 0) : 0;
      const riskPct = 0; // default risk %

      // Check if an Investment for this exact transaction already exists (idempotent guard)
      const existingInvestment = await Investment.findOne({ sourceTransactionId: transaction._id });
      if (!existingInvestment) {
        const newInvestment = await Investment.create({
          clientId: transaction.clientId,
          clientName: transaction.clientName || (clientUser ? clientUser.name : 'Unknown'),
          clientCode: transaction.clientCode || (clientUser ? clientUser.clientCode : ''),
          investmentAmount: transaction.amount,
          roiPercentage: roiPct,
          riskPercentage: riskPct,
          riskLevel: 'Medium',
          investmentDate: transaction.actionAt || new Date(),
          status: 'active',
          createdBy: req.user.id || req.user._id,
          remarks: `Auto-created from approved deposit transaction #${transaction._id}`,
          segment: 'Trading & Syndication',
          sourceTransactionId: transaction._id
        });

        // Link investment back to transaction
        transaction.linkedInvestmentId = newInvestment._id;
        await transaction.save();

        console.log(`[Investment Created] Deposit TXN ${transaction._id} approved → Investment ${newInvestment._id} created for client ${transaction.clientCode || transaction.clientName}`);
      }
    } catch (investmentError) {
      // Log but don't block the approval response
      console.error('[Investment Creation Error] Failed to auto-create investment on deposit approval:', investmentError.message);
    }
  }

  // Notify client or agent of the outcome via email
  try {
    const recipientUser = await User.findById(transaction.clientId || transaction.agentId);
    if (recipientUser && recipientUser.email) {
      await sendTransactionStatusNotification(
        recipientUser.email,
        recipientUser.name,
        {
          type: transaction.type,
          amount: transaction.amount,
        },
        status,
        rejectionReason || 'Processed by administrator'
      );
    }
  } catch (emailError) {
    console.error('[Transaction Notification Error] Failed to email recipient:', emailError.message);
  }

  res.status(200).json({
    success: true,
    message: `Transaction request was successfully ${status.toLowerCase()}.`,
    data: {
      transaction,
    },
  });
});

/**
 * View Approved and Rejected Transactions History
 * GET /api/super-admin/transactions/history
 */
const getApprovalsHistory = asyncHandler(async (req, res, next) => {
  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 10;
  const skip = (page - 1) * limit;

  const query = { status: { $in: [TRANSACTION_STATUS.APPROVED, TRANSACTION_STATUS.REJECTED] } };

  // Search filter
  const { search } = req.query;
  if (search) {
    const searchRegex = { $regex: search, $options: 'i' };
    query.$or = [
      { clientName: searchRegex },
      { clientCode: searchRegex },
      { paymentMethod: searchRegex },
      { referenceNumber: searchRegex },
    ];
  }

  const total = await Transaction.countDocuments(query);
  const transactions = await Transaction.find(query)
    .populate('clientId', 'name email clientCode')
    .populate('agentId', 'name email clientCode')
    .populate('actionBy', 'name email')
    .sort({ actionAt: -1, updatedAt: -1 })
    .skip(skip)
    .limit(limit)
    .lean();

  const formattedHistory = transactions.map(tx => {
    const isAgent = tx.isAgentWithdrawal;
    const user = isAgent ? (tx.agentId || {}) : (tx.clientId || {});
    return {
      ...tx,
      investorName: user.name || tx.clientName || 'Unknown User',
      investorCode: isAgent ? (user.clientCode ? `AGT-${user.clientCode.replace('AGT-', '')}` : '—') : (user.clientCode || tx.clientCode || '—'),
      actionTimeFormatted: tx.actionAt ? tx.actionAt.toISOString().replace('T', ' ').substring(0, 16) : '—',
    };
  });

  res.status(200).json({
    success: true,
    count: formattedHistory.length,
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    },
    data: {
      history: formattedHistory,
    },
  });
});

/**
 * Get details of a single transaction including investor/agent profile details
 * GET /api/super-admin/transactions/:id
 */
const getTransactionById = asyncHandler(async (req, res, next) => {
  const { id } = req.params;

  const transaction = await Transaction.findById(id)
    .populate('clientId', 'name email clientCode')
    .populate('agentId', 'name email clientCode')
    .lean();

  if (!transaction) {
    return next(new AppError('Transaction record not found.', 404));
  }

  let profileData = null;
  if (transaction.isAgentWithdrawal) {
    const agentProfile = await AgentProfile.findOne({ userId: transaction.agentId }).lean();
    if (agentProfile) {
      profileData = {
        phone: agentProfile.phone || '—',
        panNumber: agentProfile.panNumber || '—',
        bankName: agentProfile.bankName || '—',
        accountNumber: agentProfile.accountNumber || '—',
        ifscCode: agentProfile.ifscCode || '—',
        residencyStatus: agentProfile.residencyStatus || '—',
      };
    }
  } else if (transaction.clientId) {
    const clientProfile = await ClientProfile.findOne({ userId: transaction.clientId._id || transaction.clientId }).lean();
    if (clientProfile) {
      profileData = {
        phone: clientProfile.phone || '—',
        panNumber: clientProfile.panNumber || '—',
        riskProfile: clientProfile.riskProfile || 'Moderate',
        tier: clientProfile.tier || 'Silver',
        residencyStatus: clientProfile.residencyStatus || '—',
      };
    }
  }

  res.status(200).json({
    success: true,
    data: {
      transaction: {
        ...transaction,
        investorName: transaction.isAgentWithdrawal ? (transaction.agentId ? transaction.agentId.name : 'Unknown Agent') : (transaction.clientId ? transaction.clientId.name : 'Unknown Client'),
        investorCode: transaction.isAgentWithdrawal ? (transaction.agentId ? transaction.agentId.clientCode : '—') : (transaction.clientId ? transaction.clientId.clientCode : '—'),
        investorEmail: transaction.isAgentWithdrawal ? (transaction.agentId ? transaction.agentId.email : '—') : (transaction.clientId ? transaction.clientId.email : '—'),
      },
      profile: profileData,
    },
  });
});

/**
 * Clear All Approved and Rejected Transaction Logs
 * DELETE /api/super-admin/transactions/history/clear
 * Clears history logs from Approval History table while preserving client investment capital in Investment model.
 */
const clearAllHistory = asyncHandler(async (req, res, next) => {
  // 1) Ensure all approved client deposits are permanently secured in Investment model before clearing logs
  await runInvestmentBackfill();

  // 2) Clear all non-pending transaction history logs (approved & rejected)
  const result = await Transaction.deleteMany({
    status: { $in: [TRANSACTION_STATUS.APPROVED, TRANSACTION_STATUS.REJECTED] }
  });

  res.status(200).json({
    success: true,
    message: `${result.deletedCount} transaction log(s) cleared successfully from Approval History. All client investment amounts are securely preserved in Investment portfolio.`,
    deletedCount: result.deletedCount,
  });
});

/**
 * Standalone helper to convert approved deposit transactions into Investment records
 * Includes deduplication guard to clean up race-condition duplicate investments.
 */
const runInvestmentBackfill = async () => {
  try {
    // 1) DEDUPLICATION GUARD: Clean up duplicate auto-synced investments created by race conditions
    const autoInvestments = await Investment.find({
      remarks: { $regex: /Auto-(synced|created) from approved deposit transaction/i }
    }).lean();

    const seenTxMap = {};
    const duplicateIdsToDelete = [];

    autoInvestments.forEach(inv => {
      const key = inv.sourceTransactionId
        ? inv.sourceTransactionId.toString()
        : `${inv.clientId}_${inv.investmentAmount}`;

      if (seenTxMap[key]) {
        duplicateIdsToDelete.push(inv._id);
      } else {
        seenTxMap[key] = inv._id;
      }
    });

    if (duplicateIdsToDelete.length > 0) {
      await Investment.deleteMany({ _id: { $in: duplicateIdsToDelete } });
      console.log(`[Deduplication] Cleaned up ${duplicateIdsToDelete.length} duplicate investment record(s).`);
    }

    // 2) BACKFILL: Process approved deposits without linked investment
    const approvedDeposits = await Transaction.find({
      status: TRANSACTION_STATUS.APPROVED,
      type: TRANSACTION_TYPES.DEPOSIT,
      isAgentWithdrawal: { $ne: true }
    }).lean();

    let created = 0;
    let skipped = 0;
    const errors = [];

    for (const tx of approvedDeposits) {
      try {
        // Check if an investment already exists for this transaction (by sourceTransactionId or matching client+amount)
        const existingInv = await Investment.findOne({
          $or: [
            { sourceTransactionId: tx._id },
            { _id: tx.linkedInvestmentId },
            { clientId: tx.clientId, investmentAmount: tx.amount }
          ]
        });

        if (existingInv) {
          if (!tx.linkedInvestmentId || tx.linkedInvestmentId.toString() !== existingInv._id.toString()) {
            await Transaction.findByIdAndUpdate(tx._id, { linkedInvestmentId: existingInv._id });
          }
          skipped++;
          continue;
        }

        const clientUser = await User.findById(tx.clientId).lean();
        const clientProfile = clientUser ? await ClientProfile.findOne({ userId: tx.clientId }).lean() : null;
        const roiPct = clientProfile ? (clientProfile.monthlyRoi || 0) : 0;

        const newInvestment = await Investment.create({
          clientId: tx.clientId,
          clientName: tx.clientName || (clientUser ? clientUser.name : 'Unknown'),
          clientCode: tx.clientCode || (clientUser ? clientUser.clientCode : ''),
          investmentAmount: tx.amount,
          roiPercentage: roiPct,
          riskPercentage: 0,
          riskLevel: 'Medium',
          investmentDate: tx.actionAt || tx.updatedAt || tx.createdAt,
          status: 'active',
          createdBy: tx.actionBy || tx.clientId,
          remarks: `Auto-synced from approved deposit transaction #${tx._id}`,
          segment: 'Trading & Syndication',
          sourceTransactionId: tx._id,
        });

        await Transaction.findByIdAndUpdate(tx._id, { linkedInvestmentId: newInvestment._id });
        created++;
      } catch (err) {
        errors.push({ txId: tx._id, error: err.message });
      }
    }

    if (created > 0) {
      console.log(`[Auto-Sync] Created ${created} investment(s) from approved deposit transactions.`);
    }

    return { created, skipped, errors, duplicatesRemoved: duplicateIdsToDelete.length };
  } catch (err) {
    console.error('[Auto-Sync Error] Failed to run investment backfill:', err.message);
    return { created: 0, skipped: 0, errors: [err.message] };
  }
};

/**
 * Backfill: Create Investment records for all existing approved deposits that don't have one
 * POST /api/super-admin/transactions/backfill-investments
 */
const backfillApprovedDeposits = asyncHandler(async (req, res, next) => {
  const result = await runInvestmentBackfill();
  res.status(200).json({
    success: true,
    message: `Backfill complete. Created ${result.created} investment(s).`,
    ...result,
  });
});

module.exports = {
  getPendingApprovals,
  approveRejectTransaction,
  getApprovalsHistory,
  getTransactionById,
  clearAllHistory,
  backfillApprovedDeposits,
  runInvestmentBackfill,
};
