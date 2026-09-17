const Transaction = require('../../models/Transaction.model');
const User = require('../../models/User.model');
const AgentCommission = require('../../models/AgentCommission.model');
const AgentProfile = require('../../models/AgentProfile.model');
const { sendTransactionRequestAlertToAdmin } = require('../../services/email.service');
const { TRANSACTION_STATUS, TRANSACTION_TYPES } = require('../../constants/statuses');
const { ROLES } = require('../../constants/roles');
const AppError = require('../../utils/AppError');
const asyncHandler = require('../../utils/asyncHandler');

/**
 * Request a transaction on behalf of an assigned client (Agent portal)
 * POST /api/agent/transactions
 */
const requestAgentTransaction = asyncHandler(async (req, res, next) => {
  const { clientId, type, amount, paymentMethod, referenceNumber, remarks } = req.body;

  if (!clientId || !type || !amount) {
    return next(new AppError('Client ID, transaction type, and amount are required.', 400));
  }

  if (![TRANSACTION_TYPES.DEPOSIT, TRANSACTION_TYPES.WITHDRAWAL].includes(type)) {
    return next(new AppError('Transaction type must be either deposit or withdrawal.', 400));
  }

  if (amount <= 0) {
    return next(new AppError('Amount must be greater than zero.', 400));
  }

  // Verify that the client exists and is assigned to the requesting agent
  const clientUser = await User.findById(clientId);
  if (!clientUser || clientUser.role !== ROLES.CLIENT) {
    return next(new AppError('Client not found.', 404));
  }

  if (!clientUser.assignedAgent || clientUser.assignedAgent.toString() !== req.user._id.toString()) {
    return next(new AppError('You do not have authorization to request transactions for this client.', 403));
  }

  // Create transaction document
  const transaction = await Transaction.create({
    clientId: clientUser._id,
    clientName: clientUser.name,
    clientCode: clientUser.clientCode,
    agentId: req.user._id,
    type,
    amount,
    paymentMethod,
    referenceNumber,
    remarks,
    status: TRANSACTION_STATUS.PENDING,
  });

  // Notify all active Super Admins via email
  try {
    const superAdmins = await User.find({ role: ROLES.SUPER_ADMIN, isActive: true });
    const superAdminEmails = superAdmins.map((admin) => admin.email);

    if (superAdminEmails.length > 0) {
      await sendTransactionRequestAlertToAdmin(
        superAdminEmails,
        clientUser.name,
        clientUser.clientCode,
        {
          type,
          amount,
          paymentMethod,
          referenceNumber,
        }
      );
    }
  } catch (emailError) {
    console.error('[Transaction Notification Error] Failed to email super admins:', emailError.message);
  }

  res.status(201).json({
    success: true,
    message: `${type.charAt(0).toUpperCase() + type.slice(1)} request submitted successfully.`,
    data: {
      transaction,
    },
  });
});

/**
 * Get transactions of clients assigned to the agent (Agent portal)
 * GET /api/agent/transactions
 */
const getAgentTransactions = asyncHandler(async (req, res, next) => {
  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 10;
  const skip = (page - 1) * limit;

  // Find all client IDs assigned to this agent
  const clients = await User.find({ role: ROLES.CLIENT, assignedAgent: req.user._id }, { _id: 1 });
  const clientIds = clients.map((c) => c._id);

  if (clientIds.length === 0) {
    return res.status(200).json({
      success: true,
      count: 0,
      pagination: {
        total: 0,
        page,
        limit,
        totalPages: 0,
      },
      data: {
        transactions: [],
      },
    });
  }

  const query = { clientId: { $in: clientIds } };

  if (req.query.type) {
    query.type = req.query.type;
  }
  if (req.query.status) {
    query.status = req.query.status;
  }

  const total = await Transaction.countDocuments(query);
  const transactions = await Transaction.find(query)
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit);

  res.status(200).json({
    success: true,
    count: transactions.length,
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    },
    data: {
      transactions,
    },
  });
});

/**
 * Request withdrawal of agent's own commission (Agent portal)
 * POST /api/agent/withdrawal
 */
const requestAgentWithdrawal = asyncHandler(async (req, res, next) => {
  const { amount, remarks } = req.body;
  const agentId = req.user.id || req.user._id;

  if (!amount) {
    return next(new AppError('Withdrawal amount is required.', 400));
  }

  const numericAmount = Number(amount);
  if (isNaN(numericAmount) || numericAmount <= 0) {
    return next(new AppError('Amount must be a positive number.', 400));
  }

  // 1. Calculate Agent Available Balance (Sum of commissions + Super Admin recorded payouts minus previous agent withdrawals)
  const Payout = require('../../models/Payout.model');
  const agentUser = await User.findById(agentId).lean();
  const agentCode = agentUser ? (agentUser.clientCode || '') : '';
  const agentName = agentUser ? (agentUser.name || '') : '';

  const [commissions, recordedPayouts, withdrawals] = await Promise.all([
    AgentCommission.find({ agentId, status: 'PAID' }).lean(),
    Payout.find({
      status: { $regex: /^paid$/i },
      $or: [
        { recipientId: String(agentId) },
        ...(agentCode ? [{ recipientId: agentCode }] : []),
        ...(agentName ? [{ recipientId: agentName }] : [])
      ]
    }).lean(),
    Transaction.find({ agentId, isAgentWithdrawal: true, status: { $regex: /^(pending|approved|paid|credited|completed)$/i } }).lean()
  ]);

  const commEarned = commissions.reduce((sum, c) => sum + (c.amount || 0), 0);
  const payoutEarned = recordedPayouts.reduce((sum, p) => sum + (p.amount || 0), 0);
  const totalEarned = Math.max(commEarned, payoutEarned);

  const totalWithdrawn = withdrawals.reduce((sum, w) => sum + (w.amount || 0), 0);
  const availableBalance = Math.max(0, totalEarned - totalWithdrawn);

  if (numericAmount > availableBalance) {
    return next(new AppError(`Withdrawal request exceeds your available balance of ₹${availableBalance.toLocaleString('en-IN')}`, 400));
  }

  // 2. Fetch Agent bank details & selected payout mode
  const { note, paymentMethod, upiId } = req.body;
  const agentProfile = await AgentProfile.findOne({ userId: agentId });
  const selectedMode = (paymentMethod || (upiId ? 'UPI' : 'Bank Transfer')).trim();
  const requestedUpi = (upiId || agentProfile?.upiId || '').trim();

  const bankDetailsObj = {
    accountHolderName: agentUser?.name || agentProfile?.fullName || 'Agent',
    bankName: agentProfile?.bankName || '',
    accountNumber: agentProfile?.accountNumber || '',
    ifscCode: agentProfile?.ifscCode || '',
    upiId: requestedUpi,
    paymentMethod: selectedMode
  };

  if (requestedUpi && agentProfile && agentProfile.upiId !== requestedUpi) {
    agentProfile.upiId = requestedUpi;
    await agentProfile.save().catch(e => console.error('[Agent upiId save error]:', e.message));
  }

  // 3. Create the withdrawal transaction
  const transaction = await Transaction.create({
    agentId,
    isAgentWithdrawal: true,
    type: TRANSACTION_TYPES.WITHDRAWAL,
    amount: numericAmount,
    status: TRANSACTION_STATUS.PENDING,
    paymentMethod: selectedMode === 'UPI' ? (requestedUpi ? `UPI (${requestedUpi})` : 'UPI') : (agentProfile?.bankName ? `${agentProfile.bankName} — ${agentProfile.accountNumber}` : 'Bank Transfer'),
    bankDetails: bankDetailsObj,
    remarks: remarks || note || '',
  });

  // 4. Send email notification to Super Admins
  try {
    const superAdmins = await User.find({ role: ROLES.SUPER_ADMIN, isActive: true });
    const superAdminEmails = superAdmins.map((admin) => admin.email);

    if (superAdminEmails.length > 0) {
      await sendTransactionRequestAlertToAdmin(
        superAdminEmails,
        agentUser?.name || 'Agent',
        agentUser?.clientCode || 'AGT-001',
        {
          type: 'withdrawal',
          amount: numericAmount,
          paymentMethod: bankDetails,
          referenceNumber: `WD-${transaction._id.toString().slice(-6)}`,
        }
      );
    }
  } catch (emailError) {
    console.error('[Agent Withdrawal Notification Error] Failed to email super admins:', emailError.message);
  }

  res.status(201).json({
    success: true,
    message: 'Withdrawal request submitted successfully.',
    data: {
      transaction,
    },
  });
});

/**
 * Get agent's commission withdrawal history and current available balance (Agent portal)
 * GET /api/agent/withdrawal
 */
const getAgentWithdrawals = asyncHandler(async (req, res, next) => {
  const agentId = req.user.id || req.user._id;

  // 1. Calculate Agent Available Balance (Sum of commissions + Super Admin recorded payouts minus previous agent withdrawals)
  const Payout = require('../../models/Payout.model');
  const agentUser = await User.findById(agentId).lean();
  const agentCode = agentUser ? (agentUser.clientCode || '') : '';
  const agentName = agentUser ? (agentUser.name || '') : '';

  const [commissions, recordedPayouts, withdrawals] = await Promise.all([
    AgentCommission.find({ agentId, status: 'PAID' }).lean(),
    Payout.find({
      status: { $regex: /^paid$/i },
      $or: [
        { recipientId: String(agentId) },
        ...(agentCode ? [{ recipientId: agentCode }] : []),
        ...(agentName ? [{ recipientId: agentName }] : [])
      ]
    }).lean(),
    Transaction.find({ agentId, isAgentWithdrawal: true, status: { $regex: /^(pending|approved|paid|credited|completed)$/i } }).lean()
  ]);

  const commEarned = commissions.reduce((sum, c) => sum + (c.amount || 0), 0);
  const validRecordedPayouts = recordedPayouts.filter(p => !p.isWithdrawal && String(p.category || '').toUpperCase() !== 'WITHDRAWAL' && !/withdrawal/i.test(p.commissionType || ''));
  const payoutEarned = validRecordedPayouts.reduce((sum, p) => sum + (p.amount || 0), 0);
  const totalEarned = Math.max(commEarned, payoutEarned);

  // Deduplicate manual withdrawal entries by month (only count once per month even if multiple entries exist)
  const manualAgentWithdrawals = recordedPayouts.filter(p => p.isWithdrawal || String(p.category || '').toUpperCase() === 'WITHDRAWAL' || /withdrawal/i.test(p.commissionType || ''));
  const agentMonthMap = new Map();
  manualAgentWithdrawals.forEach(w => {
    const d = w.payoutDate ? new Date(w.payoutDate) : new Date(w.createdAt);
    const monthKey = !isNaN(d.getTime())
      ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      : (w.month || w.period || 'current');

    if (!agentMonthMap.has(monthKey)) {
      agentMonthMap.set(monthKey, Number(w.amount || 0));
    } else {
      agentMonthMap.set(monthKey, Math.max(agentMonthMap.get(monthKey), Number(w.amount || 0)));
    }
  });

  const totalWithdrawn = Array.from(agentMonthMap.values()).reduce((sum, amt) => sum + amt, 0);
  const availableBalance = Math.max(0, totalEarned - totalWithdrawn);

  // 2. Get Bank Account
  const agentProfile = await AgentProfile.findOne({ userId: agentId });
  const bankAccount = agentProfile ? {
    bankName: agentProfile.bankName,
    accountNumber: agentProfile.accountNumber ? `****${agentProfile.accountNumber.slice(-4)}` : '—',
  } : { bankName: '—', accountNumber: '—' };

  // 3. Fetch History list (combine Transaction withdrawal requests + Manual Payouts recorded by Super Admin)
  const txHistory = await Transaction.find({ agentId, isAgentWithdrawal: true }).lean();
  
  const mappedPayouts = recordedPayouts
    .filter(p => !p.isWithdrawal && String(p.category || '').toUpperCase() !== 'WITHDRAWAL' && !/withdrawal/i.test(p.commissionType || ''))
    .map(p => ({
      _id: p._id,
      amount: p.amount,
      status: p.status,
      createdAt: p.createdAt,
      requestId: p.transactionRefId || `MANUAL-${p._id.toString().slice(-4)}`,
      paymentMethod: p.paymentMode || 'Bank Transfer',
      isManualPayout: true
    }));

  const history = [...txHistory, ...mappedPayouts].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  res.status(200).json({
    success: true,
    data: {
      availableBalance,
      bankAccount,
      history,
    },
  });
});

module.exports = {
  requestAgentTransaction,
  getAgentTransactions,
  requestAgentWithdrawal,
  getAgentWithdrawals,
};
