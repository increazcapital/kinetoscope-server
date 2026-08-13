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
  const limit = parseInt(req.query.limit, 10) || 10000;
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
    .populate('projectId', 'name segment minInvestment targetFunding')
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .lean();

  // Format list entries to normalize client/agent names and codes
  const formattedTransactions = transactions.map(tx => {
    const isAgent = tx.isAgentWithdrawal;
    const user = isAgent ? (tx.agentId || {}) : (tx.clientId || {});
    let code = '—';
    if (isAgent) {
      code = user.clientCode || user.agentCode || (user._id ? `KFPL-AG-${user._id.toString().slice(-4)}` : 'KFPL-AG-1001');
    } else {
      code = user.clientCode || tx.clientCode || '—';
    }
    return {
      ...tx,
      investorName: user.name || tx.clientName || (isAgent ? 'Agent' : 'Client'),
      investorCode: code,
      clientCode: code,
      agentCode: code,
      projectName: tx.projectName || (tx.projectId ? tx.projectId.name : ''),
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

      // Check if a specific Project was targeted for this deposit
      let projectObj = null;
      if (transaction.projectId) {
        const Project = require('../../models/Project.model');
        projectObj = await Project.findById(transaction.projectId).lean();
      }

      const roiPct = projectObj?.monthlyRoi ? parseFloat(projectObj.monthlyRoi) : (clientProfile ? (clientProfile.monthlyRoi || 1.5) : 1.5);
      const riskPct = 0; // default risk %

      // Check if an Investment for this exact transaction already exists
      const existingInvestment = await Investment.findOne({
        $or: [
          { sourceTransactionId: transaction._id },
          ...(transaction.linkedInvestmentId ? [{ _id: transaction.linkedInvestmentId }] : [])
        ]
      });

      let activeInvObj = null;
      if (existingInvestment) {
        existingInvestment.status = 'active';
        existingInvestment.investmentAmount = transaction.amount;
        existingInvestment.approvedAt = new Date();
        await existingInvestment.save();
        activeInvObj = existingInvestment;
        console.log(`[Investment Activated] Pending Investment ${existingInvestment._id} activated on deposit approval.`);
      } else {
        const newInvestment = await Investment.create({
          clientId: transaction.clientId,
          clientName: transaction.clientName || (clientUser ? clientUser.name : 'Unknown'),
          clientCode: transaction.clientCode || (clientUser ? clientUser.clientCode : ''),
          projectId: transaction.projectId || undefined,
          projectName: transaction.projectName || projectObj?.name || '',
          segment: projectObj?.segment || transaction.segment || transaction.category || 'General',
          investmentAmount: transaction.amount,
          roiPercentage: roiPct,
          riskPercentage: riskPct,
          riskLevel: projectObj?.riskLevel || 'Medium',
          investmentDate: transaction.actionAt || new Date(),
          status: 'active',
          createdBy: req.user.id || req.user._id,
          remarks: `Auto-created from approved deposit transaction #${transaction._id}${transaction.projectName ? ` for project "${transaction.projectName}"` : ''}`,
          sourceTransactionId: transaction._id
        });

        transaction.linkedInvestmentId = newInvestment._id;
        await transaction.save();
        activeInvObj = newInvestment;
        console.log(`[Investment Created] Deposit TXN ${transaction._id} approved → Investment ${newInvestment._id} created for client ${transaction.clientCode || transaction.clientName}`);
      }

      // Update Project funded amount if linked to a project
      if (transaction.projectId) {
        const Project = require('../../models/Project.model');
        const projToUpdate = await Project.findById(transaction.projectId);
        if (projToUpdate) {
          const activeProjInvs = await Investment.find({ projectId: projToUpdate._id, status: 'active' });
          const totalProjFunded = activeProjInvs.reduce((sum, inv) => sum + (inv.investmentAmount || 0), 0);
          projToUpdate.fundedAmount = totalProjFunded;
          await projToUpdate.save();
        }
      }

      // Recalculate ClientProfile and User total investment balance from approved deposits and active investments
      const ClientProfile = require('../../models/ClientProfile.model');
      const allApprovedDeposits = await Transaction.find({ clientId: transaction.clientId, type: 'deposit', status: 'APPROVED' }).lean();
      const approvedDepositsSum = allApprovedDeposits.reduce((sum, t) => sum + Number(t.amount || 0), 0);

      const allActiveClientInvs = await Investment.find({ clientId: transaction.clientId, status: 'active' }).lean();
      const activeInvsSum = allActiveClientInvs.reduce((sum, inv) => sum + (inv.investmentAmount || 0), 0);

      const finalClientTotalInv = Math.max(approvedDepositsSum, activeInvsSum);

      await Promise.all([
        ClientProfile.findOneAndUpdate(
          { userId: transaction.clientId },
          { $set: { totalInvestment: finalClientTotalInv } }
        ),
        User.findByIdAndUpdate(
          transaction.clientId,
          { $set: { totalInvestment: finalClientTotalInv } }
        )
      ]);

      // Auto-resolve any open Service Request for project investment
      try {
        const ServiceRequest = require('../../models/ServiceRequest.model');
        await ServiceRequest.updateMany(
          { createdBy: transaction.clientId, category: 'Project Investment Request', status: { $in: ['OPEN', 'IN PROGRESS'] } },
          { $set: { status: 'RESOLVED', adminRemarks: `Deposit payment of ₹${transaction.amount.toLocaleString('en-IN')} approved by Super Admin.` } }
        );
      } catch (srErr) {
        console.error('[Deposit Approval] Failed to update service requests:', srErr.message);
      }

      // Dispatch Email Notification to Client
      if (clientUser && clientUser.email) {
        try {
          const { sendEmail, buildLightEmailTemplate } = require('../../services/email.service');
          const contentHtml = `
            <p style="font-size: 15px; color: #1E293B;">Hello <strong>${clientUser.name}</strong>,</p>
            <p style="font-size: 14px; color: #475569;">Great news! Your capital deposit of <strong>₹${transaction.amount.toLocaleString('en-IN')}</strong> ${transaction.projectName ? `for project <strong>${transaction.projectName}</strong>` : ''} has been approved by Super Admin.</p>
            <div style="margin: 20px 0; padding: 18px; background-color: #F0FDF4; border-left: 4px solid #10B981; border-radius: 8px; border: 1px solid #DCFCE7;">
              <p style="margin: 0; color: #166534; font-weight: 700; font-size: 15px;">Status: APPROVED & ACTIVE</p>
              <p style="margin: 8px 0 0 0; color: #15803D; font-size: 14px;"><strong>Approved Investment Amount:</strong> ₹${transaction.amount.toLocaleString('en-IN')}</p>
              <p style="margin: 4px 0 0 0; color: #15803D; font-size: 13.5px;"><strong>Transaction / Reference UTR:</strong> ${transaction.referenceNumber || 'N/A'}</p>
            </div>
            <p style="font-size: 14px; color: #475569;">Your funds have been added to your active investment portfolio. You can view your portfolio details anytime in your Client Portal Dashboard.</p>
          `;
          const html = buildLightEmailTemplate({
            title: '🎉 Payment Deposit Approved',
            subtitle: `Transaction Ref: ${transaction.referenceNumber || transaction._id}`,
            contentHtml,
            bannerAccent: '#10B981'
          });

          await sendEmail({
            to: clientUser.email,
            subject: `🎉 Payment Deposit & Investment Approved - ${transaction.projectName || 'Kinetoscope'}`,
            text: `Hello ${clientUser.name},\n\nYour deposit payment of ₹${transaction.amount.toLocaleString('en-IN')} has been approved by Super Admin.\n\n— Kinetoscope Support Team`,
            html,
          });
          console.log(`[Deposit Approval] Email sent successfully to ${clientUser.email}`);
        } catch (emailErr) {
          console.error(`[Deposit Approval] Failed to send email to ${clientUser.email}:`, emailErr.message);
        }
      }
    } catch (investmentError) {
      console.error('[Investment Creation Error] Failed to auto-create investment on deposit approval:', investmentError.message);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // AUTO-CREATE AGENT COMMISSION: Calculate from slab config when client
    // has an assigned agent. Commission is created as PENDING — Super Admin
    // must explicitly pay it.
    // ═══════════════════════════════════════════════════════════════════════
    try {
      const commClient = await User.findById(transaction.clientId).lean();
      if (commClient && commClient.assignedAgent) {
        const CommissionSlab = require('../../models/CommissionSlab.model');
        const AgentCommission = require('../../models/AgentCommission.model');
        const AgentOverride = require('../../models/AgentOverride.model');

        const depositAmount = transaction.amount;
        const agentUserId = commClient.assignedAgent;
        const periodStr = new Date().toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });

        // Fetch slabs and agent override in parallel
        const [allSlabs, agentOverride] = await Promise.all([
          CommissionSlab.find({}).sort({ minAmount: 1 }).lean(),
          AgentOverride.findOne({ agentId: agentUserId }).lean()
        ]);

        const findMatchingSlab = (type) => {
          const typeSlabs = allSlabs.filter(s => s.type === type);
          for (const slab of typeSlabs) {
            const max = slab.maxAmount === null || slab.maxAmount === undefined ? Infinity : slab.maxAmount;
            if (depositAmount >= slab.minAmount && depositAmount <= max) {
              return slab;
            }
          }
          return null;
        };

        // 1st Month (Deposit Approval): Generate ONE TIME commission as PENDING.
        // Monthly commission starts from 2nd Month onwards.
        const slabTypes = ['one-time'];
        const commissionsToCreate = [];

        for (const slabType of slabTypes) {
          // Idempotency: check if commission for this deposit + type already exists
          const existing = await AgentCommission.findOne({
            sourceTransactionId: transaction._id,
            slabType: slabType
          }).lean();
          if (existing) continue;

          const matchedSlab = findMatchingSlab(slabType);
          if (!matchedSlab) continue;

          // Use agent override if exists, otherwise use slab percentage
          let pct = matchedSlab.commissionPercentage;
          if (agentOverride && agentOverride.commissionOverride !== undefined) {
            pct = agentOverride.commissionOverride;
          }

          const commAmount = Math.round(depositAmount * (pct / 100));
          if (commAmount <= 0) continue;

          commissionsToCreate.push({
            agentId: agentUserId,
            clientId: transaction.clientId,
            period: periodStr,
            date: new Date(),
            type: slabType === 'one-time' ? 'ONE TIME' : 'MONTHLY',
            amount: commAmount,
            status: 'PENDING',
            remarks: `Auto-calculated from deposit ₹${depositAmount.toLocaleString('en-IN')} at ${pct}% (${slabType} slab)`,
            sourceTransactionId: transaction._id,
            investmentAmount: depositAmount,
            slabPercentage: pct,
            slabType: slabType
          });
        }

        if (commissionsToCreate.length > 0) {
          await AgentCommission.insertMany(commissionsToCreate);
          console.log(`[Commission Auto-Created] ${commissionsToCreate.length} PENDING commission(s) for agent ${agentUserId} from deposit TXN ${transaction._id}`);
        }
      }
    } catch (commError) {
      // Log but don't block the approval response
      console.error('[Commission Auto-Create Error] Failed to auto-create agent commission:', commError.message);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // CRITICAL: When a WITHDRAWAL is APPROVED, recalculate client net capital.
  // If net capital reaches 0, close active investments & delete pending commissions.
  // ═══════════════════════════════════════════════════════════════════════
  if ((status === TRANSACTION_STATUS.APPROVED || String(status).toLowerCase() === 'approved') && transaction.type === TRANSACTION_TYPES.WITHDRAWAL && !transaction.isAgentWithdrawal) {
    try {
      const isCapitalWithdrawal = transaction.withdrawalCategory === 'capital' ||
        (transaction.remarks && /capital/i.test(transaction.remarks));

      if (isCapitalWithdrawal) {
        const allApprovedDeposits = await Transaction.find({
          clientId: transaction.clientId,
          type: 'deposit',
          status: { $in: ['APPROVED', 'approved', 'paid'] }
        }).lean();

        const allApprovedCapitalWithdrawals = await Transaction.find({
          clientId: transaction.clientId,
          type: 'withdrawal',
          status: { $in: ['APPROVED', 'approved', 'paid'] },
          $or: [
            { withdrawalCategory: 'capital' },
            { remarks: { $regex: /capital/i } }
          ]
        }).lean();

        const depSum = allApprovedDeposits.reduce((sum, t) => sum + Number(t.amount || 0), 0);
        const capitalWithSum = allApprovedCapitalWithdrawals.reduce((sum, t) => sum + Number(t.amount || 0), 0);
        const netCapital = Math.max(0, depSum - capitalWithSum);

        const ClientProfile = require('../../models/ClientProfile.model');
        await Promise.all([
          ClientProfile.findOneAndUpdate(
            { userId: transaction.clientId },
            { $set: { totalInvestment: netCapital } }
          ),
          User.findByIdAndUpdate(
            transaction.clientId,
            { $set: { totalInvestment: netCapital } }
          )
        ]);

        if (netCapital <= 0) {
          await Investment.updateMany(
            { clientId: transaction.clientId, status: 'active' },
            { $set: { status: 'withdrawn' } }
          );

          const AgentCommission = require('../../models/AgentCommission.model');
          await AgentCommission.deleteMany({ clientId: transaction.clientId, status: 'PENDING' });
          console.log(`[Capital Withdrawal Approved] Client ${transaction.clientId} net capital is ₹0. Pending commissions deleted.`);
        }
      }

      // Note: Withdrawal transactions update capital/available balance, but do NOT create fake ROI Payout statement records.
    } catch (wErr) {
      console.error('[Withdrawal Approval Error]:', wErr.message);
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
  const limit = parseInt(req.query.limit, 10) || 10000;
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
    .populate('projectId', 'name segment minInvestment targetFunding riskLevel')
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
          segment: tx.segment || tx.category || (tx.projectId ? 'Project Investment' : 'Capital Deposit'),
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
