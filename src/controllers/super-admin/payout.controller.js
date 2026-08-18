const mongoose = require('mongoose');
const User = require('../../models/User.model');
const ClientProfile = require('../../models/ClientProfile.model');
const AgentProfile = require('../../models/AgentProfile.model');
const Payout = require('../../models/Payout.model');
const Transaction = require('../../models/Transaction.model');
const DividendAllotment = require('../../models/DividendAllotment.model');
const AgentCommission = require('../../models/AgentCommission.model');
const RoiPayout = require('../../models/RoiPayout.model');
const Investment = require('../../models/Investment.model');
const AppError = require('../../utils/AppError');
const asyncHandler = require('../../utils/asyncHandler');

/**
 * Seed initial active clients, agents, investments, and payouts if database is empty.
 * Matches requirements from Admin portal test recording.
 */
const seedMockPayouts = async (creatorId) => {
  return;
  const clientCount = await User.countDocuments({ role: 'client' });
  if (clientCount === 0) {
    console.log('[Payout Seeder] Seeding initial active clients, agents, investments, and payouts...');
    
    // Create Agent
    let agent = await User.create({
      name: 'Vikram Patel',
      email: 'vikram.agent@example.com',
      role: 'agent',
      clientCode: 'AGT-001',
      password: 'password123',
      isActive: true
    });
    
    const AgentProfile = require('../../models/AgentProfile.model');
    await AgentProfile.create({
      userId: agent._id,
      fullName: 'Vikram Patel',
      phone: '+91 98765 00001',
      email: 'vikram.agent@example.com',
      bankName: 'HDFC Bank',
      accountNumber: '50100012345678',
      ifscCode: 'HDFC0000240',
      residencyStatus: 'National (Domestic)',
      panNumber: 'ABCDE1234F',
      aadhaarNumber: '123456789012',
      nomineeName: 'Anita Patel',
      nomineeRelation: 'Spouse',
      nomineePhone: '+91 98765 00002',
      status: 'active'
    });

    // Create Clients
    let c1 = await User.create({
      name: 'Rajesh Kumar',
      email: 'rajesh.kumar@example.com',
      role: 'client',
      clientCode: 'KFPL-1001',
      password: 'password123',
      isActive: true,
      assignedAgent: agent._id
    });
    
    await ClientProfile.create({
      userId: c1._id,
      fullName: 'Rajesh Kumar',
      phone: '+91 99999 88888',
      email: 'rajesh.kumar@example.com',
      dob: new Date('1990-01-01'),
      address: '123 Film City, Mumbai',
      riskProfile: 'Moderate',
      residencyStatus: 'National (Domestic)',
      monthlyRoi: 1.2,
      panNumber: 'ABCDE1234F',
      aadhaarNumber: '123456789012',
      bankName: 'ICICI Bank',
      accountNumber: '000401500123',
      ifscCode: 'ICIC0000004',
      nomineeName: 'Suman Kumar',
      nomineeRelation: 'Spouse',
      nomineePhone: '+91 99999 77777',
      nomineeEmail: 'suman@example.com',
      status: 'active',
      kycStatus: 'VERIFIED',
      tier: 'SILVER'
    });

    let c2 = await User.create({
      name: 'Priya Sharma',
      email: 'priya.sharma@example.com',
      role: 'client',
      clientCode: 'KFPL-1002',
      password: 'password123',
      isActive: true,
      assignedAgent: agent._id
    });

    await ClientProfile.create({
      userId: c2._id,
      fullName: 'Priya Sharma',
      phone: '+91 99999 11111',
      email: 'priya.sharma@example.com',
      dob: new Date('1992-05-15'),
      address: '456 Bandra, Mumbai',
      riskProfile: 'Conservative',
      residencyStatus: 'National (Domestic)',
      monthlyRoi: 1.0,
      panNumber: 'FGHIJ5678K',
      aadhaarNumber: '987654321098',
      bankName: 'SBI Bank',
      accountNumber: '30001234567',
      ifscCode: 'SBIN0000300',
      nomineeName: 'Ramesh Sharma',
      nomineeRelation: 'Father',
      nomineePhone: '+91 99999 22222',
      nomineeEmail: 'ramesh@example.com',
      status: 'active',
      kycStatus: 'VERIFIED',
      tier: 'SILVER'
    });

    // Create Investments
    const Investment = require('../../models/Investment.model');
    await Investment.create([
      {
        clientId: c1._id,
        clientName: 'Rajesh Kumar',
        clientCode: 'KFPL-1001',
        segment: 'Film Making',
        investmentAmount: 5000000,
        roiPercentage: 12,
        riskPercentage: 30,
        riskLevel: 'Medium',
        durationMonths: 18,
        investmentDate: new Date('2026-01-01'),
        status: 'active',
        createdBy: creatorId
      },
      {
        clientId: c2._id,
        clientName: 'Priya Sharma',
        clientCode: 'KFPL-1002',
        segment: 'Distribution',
        investmentAmount: 3000000,
        roiPercentage: 10,
        riskPercentage: 15,
        riskLevel: 'Low',
        durationMonths: 18,
        investmentDate: new Date('2026-02-01'),
        status: 'active',
        createdBy: creatorId
      }
    ]);

    // Create Payouts
    await Payout.create([
      {
        recipientType: 'Client Return (ROI)',
        recipientId: 'KFPL-1001',
        amount: 50000,
        payoutDate: '2026-07-13',
        status: 'pending'
      },
      {
        recipientType: 'Agent Commission',
        recipientId: 'AGT-001',
        commissionType: 'Monthly',
        clientId: 'KFPL-1001',
        amount: 15000,
        payoutDate: '2026-07-13',
        status: 'paid',
        paymentMode: 'Bank Transfer',
        transactionRefId: 'TXN-COMM-777',
        paidAt: new Date()
      }
    ]);
  }
};

async function resolveRecipientCode(id) {
  if (!id) return id;
  const strId = String(id).trim();

  // If it's a mongo ID, let's resolve it
  if (mongoose.Types.ObjectId.isValid(strId)) {
    // 1. Try finding User directly
    let user = await User.findById(strId);
    if (user && user.clientCode) {
      return user.clientCode;
    }

    // 2. Try finding in ClientProfile
    const clientProfile = await ClientProfile.findById(strId);
    if (clientProfile && clientProfile.userId) {
      user = await User.findById(clientProfile.userId);
      if (user && user.clientCode) {
        return user.clientCode;
      }
    }

    // 3. Try finding in AgentProfile
    const agentProfile = await AgentProfile.findById(strId);
    if (agentProfile && agentProfile.userId) {
      user = await User.findById(agentProfile.userId);
      if (user && user.clientCode) {
        return user.clientCode;
      }
    }
  }

  // Otherwise return as is
  return strId.toUpperCase();
}

/**
 * Record Payout Details (ROI or Commission)
 * POST /api/super-admin/roi/payouts
 */
const recordPayout = asyncHandler(async (req, res, next) => {
  const { recipientType, recipientId, amount, payoutDate, paymentMode, transactionRefId, commissionType, clientId, status } = req.body;

  if (!recipientType || !recipientId || !amount || !payoutDate) {
    return next(new AppError('Please provide recipientType, recipientId, amount, and payoutDate.', 400));
  }

  const numericAmount = Number(amount);
  if (isNaN(numericAmount) || numericAmount <= 0) {
    return next(new AppError('Amount must be a positive number.', 400));
  }

  // Normalize recipientType to database format
  let normalizedRecipientType = recipientType;
  const lowerType = recipientType.toLowerCase();
  if (lowerType === 'client' || lowerType.includes('roi')) {
    normalizedRecipientType = 'Client Return (ROI)';
  } else if (lowerType === 'agent' || lowerType.includes('commission')) {
    normalizedRecipientType = 'Agent Commission';
  }

  // Resolve recipientId and clientId to human-readable codes if passed as ObjectIds
  const resolvedRecipientId = await resolveRecipientCode(recipientId);
  const resolvedClientId = clientId ? await resolveRecipientCode(clientId) : '';

  // Check unique constraints for transactionRefId if provided
  if (transactionRefId) {
    const existing = await Payout.findOne({ transactionRefId });
    if (existing) {
      return next(new AppError(`Payout with transaction reference ID ${transactionRefId} already exists.`, 400));
    }
  }

  let payoutStatus = status || 'pending';
  if (paymentMode && transactionRefId) {
    payoutStatus = 'paid';
  }

  const passedRoi = req.body.roiPercentage || req.body.monthlyRoi;
  let parsedRoiRate = passedRoi ? Number(passedRoi) : null;
  if (!parsedRoiRate) {
    try {
      let uObj = await User.findOne({
        $or: [
          { clientCode: resolvedRecipientId },
          { _id: mongoose.Types.ObjectId.isValid(recipientId) ? recipientId : null }
        ]
      });
      if (uObj) {
        const cProf = await ClientProfile.findOne({ userId: uObj._id });
        parsedRoiRate = cProf ? (cProf.monthlyRoi || 1.2) : 1.2;
      }
    } catch (e) {}
  }

  let finalCommissionType = commissionType || '';
  if (normalizedRecipientType === 'Client Return (ROI)' && (!finalCommissionType || finalCommissionType === 'ROI' || finalCommissionType.includes('12%'))) {
    if (parsedRoiRate) {
      finalCommissionType = `ROI (${parsedRoiRate}%)`;
    }
  }

  const payout = await Payout.create({
    recipientType: normalizedRecipientType,
    recipientId: resolvedRecipientId,
    commissionType: finalCommissionType || commissionType || '',
    clientId: resolvedClientId,
    amount: numericAmount,
    payoutDate,
    paymentMode: paymentMode || '',
    transactionRefId: transactionRefId || '',
    status: payoutStatus,
    roiPercentage: parsedRoiRate,
    roiRate: parsedRoiRate ? `${parsedRoiRate}%` : '',
    paidAt: payoutStatus === 'paid' ? new Date() : undefined
  });

  // If this is an Agent Commission payout and marked as paid, sync matching AgentCommission record to PAID
  if (normalizedRecipientType === 'Agent Commission' && payoutStatus === 'paid') {
    try {
      let agentUser = await User.findOne({
        $or: [
          ...(mongoose.Types.ObjectId.isValid(recipientId) ? [{ _id: recipientId }] : []),
          { clientCode: resolvedRecipientId },
          { name: { $regex: new RegExp(`^${resolvedRecipientId}$`, 'i') } },
          { name: { $regex: new RegExp(`^${recipientId}$`, 'i') } }
        ],
        role: 'agent'
      });

      if (!agentUser && recipientId) {
        const agProf = await AgentProfile.findOne({
          $or: [
            { agentCode: recipientId },
            { clientCode: recipientId },
            { agentCode: resolvedRecipientId }
          ]
        });
        if (agProf) agentUser = await User.findById(agProf.userId);
      }

      if (!agentUser) {
        const allAgents = await User.find({ role: 'agent' });
        if (allAgents.length === 1) agentUser = allAgents[0];
      }

      if (agentUser) {
        let targetClientUser = null;
        if (clientId || resolvedClientId) {
          targetClientUser = await User.findOne({
            $or: [
              ...(clientId && mongoose.Types.ObjectId.isValid(clientId) ? [{ _id: clientId }] : []),
              { clientCode: resolvedClientId },
              { clientCode: clientId },
              { name: { $regex: new RegExp(`^${clientId}$`, 'i') } }
            ]
          });
          if (!targetClientUser && clientId && mongoose.Types.ObjectId.isValid(clientId)) {
            const cProf = await ClientProfile.findById(clientId);
            if (cProf && cProf.userId) {
              targetClientUser = await User.findById(cProf.userId);
            }
          }
        }

        const typeFilter = String(commissionType || '').toUpperCase().includes('ONE') ? 'ONE TIME' : (String(commissionType || '').toUpperCase().includes('SPECIAL') ? 'SPECIAL' : 'MONTHLY');
        const queryFilter = { agentId: agentUser._id, status: 'PENDING' };
        if (targetClientUser) {
          queryFilter.clientId = targetClientUser._id;
        }

        const pendingComms = await AgentCommission.find(queryFilter).sort({ createdAt: 1 });

        if (pendingComms.length > 0) {
          for (const comm of pendingComms) {
            comm.status = 'PAID';
            comm.paymentMode = paymentMode || 'Bank Transfer';
            comm.transactionRefId = transactionRefId || `TXN-${Date.now()}`;
            comm.paidAt = new Date();
            await comm.save();
            console.log(`[Payout Sync Success] Agent ${agentUser.name} Commission ${comm._id} (₹${comm.amount}) marked as PAID`);
          }
        } else {
          await AgentCommission.create({
            agentId: agentUser._id,
            clientId: targetClientUser ? targetClientUser._id : undefined,
            period: new Date().toLocaleDateString('en-IN', { month: 'short', year: 'numeric' }),
            date: new Date(),
            type: typeFilter,
            amount: numericAmount,
            status: 'PAID',
            paymentMode: paymentMode || 'Bank Transfer',
            transactionRefId: transactionRefId || `TXN-${Date.now()}`,
            paidAt: new Date(),
            remarks: `Paid via Super Admin Payout`
          });
        }
      }
    } catch (err) {
      console.error('Error syncing agent commission to PAID on payout creation:', err);
    }
  }

  res.status(201).json({
    success: true,
    message: 'Payout recorded successfully.',
    data: payout,
  });
});

/**
 * Get unified list of payouts (ROI & Commission)
 * GET /api/super-admin/roi/payouts
 */
const getPayouts = asyncHandler(async (req, res, next) => {
  const { status, recipientType, search } = req.query;

  const query = {};
  if (status && status !== 'All') {
    query.status = status.toLowerCase(); // 'pending' or 'paid'
  }
  if (recipientType && recipientType !== 'All') {
    query.recipientType = recipientType;
  }

  if (search) {
    const searchRegex = { $regex: search, $options: 'i' };
    query.$or = [
      { recipientId: searchRegex },
      { transactionRefId: searchRegex },
      { payoutDate: searchRegex },
    ];
  }

  if (req.user.role === 'agent') {
    const clients = await User.find({ role: 'client', assignedAgent: req.user._id }, { _id: 1, clientCode: 1 });
    const clientIds = clients.map(c => c._id.toString());
    const clientCodes = clients.map(c => c.clientCode).filter(Boolean);
    
    const agentRecipientFilter = {
      $or: [
        { recipientId: { $in: clientIds } },
        { recipientId: { $in: clientCodes } }
      ]
    };
    
    if (query.$and) {
      query.$and.push(agentRecipientFilter);
    } else {
      query.$and = [agentRecipientFilter];
    }
  }

  const [payouts, withdrawalTransactions] = await Promise.all([
    Payout.find(query).sort({ payoutDate: -1, createdAt: -1 }).lean(),
    Transaction.find({ $or: [{ type: 'withdrawal' }, { isAgentWithdrawal: true }] })
      .populate('clientId', 'name clientCode email')
      .populate('agentId', 'name clientCode agentCode email')
      .sort({ createdAt: -1 })
      .lean()
  ]);

  // Populate recipient names
  const recipientIds = payouts.map(p => p.recipientId);
  const objectIds = recipientIds.filter(id => mongoose.Types.ObjectId.isValid(id));

  const [usersByCode, usersById, clientProfiles, agentProfiles, allClientProfiles, allUsers] = await Promise.all([
    User.find({}, { name: 1, clientCode: 1, monthlyRoi: 1, roiPercent: 1, roiPercentage: 1 }).lean(),
    User.find({ clientCode: { $in: recipientIds } }, { name: 1, clientCode: 1, monthlyRoi: 1, roiPercent: 1, roiPercentage: 1 }).lean(),
    User.find({ _id: { $in: objectIds } }, { name: 1, monthlyRoi: 1, roiPercent: 1, roiPercentage: 1 }).lean(),
    ClientProfile.find({ _id: { $in: objectIds } }).populate('userId', 'name clientCode monthlyRoi roiPercent').lean(),
    AgentProfile.find({ _id: { $in: objectIds } }).populate('userId', 'name').lean(),
    ClientProfile.find({}).populate('userId', 'name clientCode monthlyRoi roiPercent').lean(),
    User.find({ role: 'client' }, { _id: 1, clientCode: 1, name: 1, monthlyRoi: 1, roiPercent: 1, roiPercentage: 1 }).lean(),
    DividendAllotment.find({}).populate('clientId', 'name clientCode').populate('projectId', 'name').sort({ allotmentDate: -1, createdAt: -1 }).lean(),
    Transaction.find({ status: { $regex: /^(paid|approved|credited|completed)$/i } }).sort({ createdAt: -1 }).lean()
  ]);

  const userMap = {};
  const roiMap = {};

  allUsers.forEach(u => {
    const val = u.monthlyRoi ?? u.roiPercent ?? u.roiPercentage;
    if (val !== undefined && val !== null && val !== 0) {
      if (u._id) roiMap[u._id.toString()] = val;
      if (u.clientCode) roiMap[u.clientCode] = val;
    }
  });

  usersByCode.forEach(u => {
    if (u.clientCode) {
      userMap[u.clientCode] = u.name;
      const val = u.monthlyRoi ?? u.roiPercent ?? u.roiPercentage;
      if (val !== undefined && val !== null && val !== 0) roiMap[u.clientCode] = val;
    }
  });
  usersById.forEach(u => {
    userMap[u._id.toString()] = u.name;
    const val = u.monthlyRoi ?? u.roiPercent ?? u.roiPercentage;
    if (val !== undefined && val !== null && val !== 0) roiMap[u._id.toString()] = val;
  });
  clientProfiles.forEach(cp => {
    if (cp.userId) {
      const uObj = cp.userId;
      userMap[cp._id.toString()] = typeof uObj === 'object' ? uObj.name : uObj;
      const val = cp.monthlyRoi ?? cp.roiPercent ?? (typeof uObj === 'object' ? (uObj.monthlyRoi ?? uObj.roiPercent) : null);
      if (val !== undefined && val !== null && val !== 0) {
        roiMap[cp._id.toString()] = val;
        if (typeof uObj === 'object' && uObj._id) roiMap[uObj._id.toString()] = val;
        if (typeof uObj === 'object' && uObj.clientCode) roiMap[uObj.clientCode] = val;
      }
    }
  });
  allClientProfiles.forEach(cp => {
    const val = cp.monthlyRoi ?? cp.roiPercent;
    if (val !== undefined && val !== null && val !== 0) {
      if (cp._id) roiMap[cp._id.toString()] = val;
      if (cp.userId) {
        const uId = typeof cp.userId === 'object' ? cp.userId._id : cp.userId;
        if (uId) roiMap[uId.toString()] = val;
        if (typeof cp.userId === 'object' && cp.userId.clientCode) roiMap[cp.userId.clientCode] = val;
      }
    }
  });

  let formatted = payouts.map(p => {
    const name = userMap[p.recipientId] || 'Unknown';
    let periodFormatted = '—';
    try {
      if (p.payoutDate) {
        const parts = p.payoutDate.split('-');
        if (parts.length >= 3) {
          const dObj = new Date(parts[0], parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
          periodFormatted = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }).format(dObj);
        } else if (parts.length >= 2) {
          const dObj = new Date(parts[0], parseInt(parts[1], 10) - 1, 1);
          periodFormatted = new Intl.DateTimeFormat('en-IN', { month: 'short', year: 'numeric' }).format(dObj);
        }
      }
    } catch (e) {
      console.error('[getPayouts] Error formatting period:', e.message);
    }

    const isClient = p.recipientType === 'Client Return (ROI)' || p.recipientType === 'CLIENT' || p.recipientType === 'Client' || (p.commissionType && /ROI/i.test(p.commissionType));
    
    let displayType = p.commissionType || p.type;
    let payoutDetailStr = p.payoutDetail || p.commissionType || p.type;
    let finalRoiVal = p.roiPercentage;

    if (isClient) {
      const regexMatch = p.commissionType ? p.commissionType.match(/ROI\s*\((\d+(\.\d+)?%?)\)/i) : null;
      finalRoiVal = (p.roiPercentage !== undefined && p.roiPercentage !== null)
        ? p.roiPercentage
        : (regexMatch ? parseFloat(regexMatch[1]) : (roiMap[p.recipientId] || roiMap[p.clientId] || 1.2));
      displayType = `ROI (${finalRoiVal}%)`;
      payoutDetailStr = `Monthly ROI Return (${finalRoiVal}%)`;
    } else {
      const isOneTime = String(p.commissionType || p.type || '').toLowerCase().includes('one');
      displayType = isOneTime ? 'ONE TIME' : 'MONTHLY';
      payoutDetailStr = isOneTime ? 'One-Time Commission' : 'Monthly Slab Commission';
    }

    return {
      _id: p._id,
      recipientId: p.recipientId,
      recipientName: name,
      recipientCode: p.recipientId,
      recipientType: isClient ? 'CLIENT' : 'AGENT',
      type: displayType,
      payoutDetail: payoutDetailStr,
      roiPercentage: finalRoiVal,
      period: periodFormatted,
      amount: p.amount,
      payoutDate: p.payoutDate,
      paymentMode: p.paymentMode || '—',
      transactionRefId: p.transactionRefId || '—',
      status: (p.status || 'paid').toUpperCase(),
      paidAt: p.paidAt ? p.paidAt.toISOString().split('T')[0] : (p.payoutDate || '—'),
      rawDate: p.payoutDate || p.createdAt,
    };
  });

  // Merge approved Transaction withdrawals as separate distinct rows in Complete Transaction Details
  const existingIds = new Set(formatted.map(p => String(p._id)));

  withdrawalTransactions.forEach(tx => {
    const txIdStr = String(tx._id);
    const isAgent = tx.isAgentWithdrawal;
    const user = isAgent ? (tx.agentId || {}) : (tx.clientId || {});
    const code = isAgent ? (user.clientCode || user.agentCode || 'AGT-001') : (user.clientCode || tx.clientCode || 'KFPL-CL-1001');
    const name = user.name || tx.clientName || (isAgent ? 'Agent' : 'Client');

    if (!existingIds.has(txIdStr)) {
      let periodFormatted = '—';
      const dVal = tx.actionAt || tx.createdAt;
      if (dVal) {
        const dObj = new Date(dVal);
        if (!isNaN(dObj.getTime())) {
          periodFormatted = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }).format(dObj);
        }
      }

      const itemRecipientType = isAgent ? 'AGENT' : 'CLIENT';
      if (!recipientType || recipientType === 'All' || recipientType.toUpperCase() === itemRecipientType) {
        const cidStr = tx.clientId ? (tx.clientId._id ? tx.clientId._id.toString() : String(tx.clientId)) : null;
        const clientRoiVal = tx.roiPercentage || tx.snapshotRoi || (cidStr && roiMap[cidStr]) || null;

        const descLower = String(tx.description || tx.remarks || tx.referenceNumber || '').toLowerCase();
        const isRoiWD = tx.withdrawalType === 'roi' || descLower.includes('roi');
        const isDivWD = tx.withdrawalType === 'dividend' || (descLower.includes('div') && !isRoiWD);
        const isCapWD = tx.withdrawalCategory === 'capital' || (descLower.includes('capital') && !isRoiWD && !isDivWD);

        const isOneTimeCommWD = isAgent && (tx.withdrawalCategory === 'one-time' || descLower.includes('one-time') || descLower.includes('onetime'));
        const isMonthlyCommWD = isAgent && (tx.withdrawalCategory === 'monthly' || descLower.includes('monthly'));

        let typeLabel = 'Withdrawal';
        let detailLabel = 'Withdrawal';

        if (isAgent) {
          if (isOneTimeCommWD) {
            typeLabel = 'Commission Withdrawal (One-Time)';
            detailLabel = tx.paymentMethod ? `One-Time Commission (${tx.paymentMethod})` : 'Withdrawal One Time Commission';
          } else if (isMonthlyCommWD) {
            typeLabel = 'Commission Withdrawal (Monthly)';
            detailLabel = tx.paymentMethod ? `Monthly Commission (${tx.paymentMethod})` : 'Withdrawal Monthly Commission';
          } else {
            typeLabel = 'Commission Withdrawal';
            detailLabel = tx.paymentMethod ? `Commission Withdrawal (${tx.paymentMethod})` : 'Agent Commission Withdrawal';
          }
        } else {
          if (isDivWD) {
            typeLabel = 'Dividend Withdrawal';
            detailLabel = 'Withdrawal Dividend Bonus';
          } else if (isRoiWD) {
            typeLabel = clientRoiVal ? `Withdrawal ROI (${clientRoiVal}%)` : 'ROI Withdrawal';
            detailLabel = clientRoiVal ? `Withdrawal ROI (${clientRoiVal}%)` : 'Monthly ROI Withdrawal';
          } else if (isCapWD) {
            typeLabel = 'Capital Withdrawal';
            detailLabel = 'Capital Account Withdrawal';
          } else {
            typeLabel = 'Withdrawal';
            detailLabel = tx.remarks || 'Wallet Withdrawal';
          }
        }

        formatted.push({
          _id: tx._id,
          recipientId: code,
          recipientName: name,
          recipientCode: code,
          recipientType: itemRecipientType,
          isWithdrawal: true,
          type: typeLabel,
          payoutDetail: detailLabel,
          category: isDivWD ? 'DIVIDEND WITHDRAWAL' : (isCapWD ? 'CAPITAL WITHDRAWAL' : 'WITHDRAWAL'),
          period: periodFormatted,
          amount: tx.amount,
          payoutDate: tx.createdAt ? new Date(tx.createdAt).toISOString().split('T')[0] : '—',
          paymentMode: tx.paymentMethod || 'Bank Transfer',
          transactionRefId: tx.referenceNumber || `WD-${tx._id.toString().slice(-6)}`,
          transactionRef: tx.referenceNumber || '',
          referenceNumber: tx.referenceNumber || '',
          status: (tx.status || 'PAID').toUpperCase(),
          paidAt: tx.actionAt ? new Date(tx.actionAt).toISOString().split('T')[0] : (tx.createdAt ? new Date(tx.createdAt).toISOString().split('T')[0] : '—'),
          rawDate: tx.createdAt,
        });
      }
    }
  });

  // Merge Project Dividend allotments as distinct DIVIDEND CREDIT rows
  const dividendAllotments = await DividendAllotment.find()
    .populate('clientId', 'name email clientCode')
    .populate('projectId', 'name')
    .lean();

  dividendAllotments.forEach(div => {
    const divIdStr = String(div._id);
    if (!existingIds.has(divIdStr)) {
      const user = div.clientId || {};
      const code = user.clientCode || div.clientCode || 'KFPL-CL-1001';
      const name = user.name || div.clientName || 'Client';

      let periodFormatted = '—';
      const dVal = div.allotmentDate || div.createdAt;
      if (dVal) {
        const dObj = new Date(dVal);
        if (!isNaN(dObj.getTime())) {
          periodFormatted = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }).format(dObj);
        }
      }

      if (!recipientType || recipientType === 'All' || recipientType.toUpperCase() === 'CLIENT') {
        formatted.push({
          _id: div._id,
          recipientId: code,
          recipientName: name,
          recipientCode: code,
          recipientType: 'CLIENT',
          isWithdrawal: false,
          type: 'DIVIDEND CREDIT',
          category: 'DIVIDEND CREDIT',
          period: periodFormatted,
          payoutDetail: div.projectId ? `Project Dividend Bonus (${div.projectId.name || 'Bonus'})` : (div.remarks || 'Project Dividend Bonus'),
          amount: Number(div.allottedAmount || div.amount || 0),
          paymentMode: 'Direct Credit',
          transactionRefId: div._id ? `DIV-${String(div._id).slice(-8).toUpperCase()}` : 'DIV-BONUS',
          status: 'PAID',
          paidAt: dVal ? new Date(dVal).toISOString().split('T')[0] : '—',
          rawDate: dVal || new Date(),
        });
      }
    }
  });

  if (search) {
    const searchLower = search.toLowerCase();
    formatted = formatted.filter(item => 
      item.recipientName.toLowerCase().includes(searchLower) ||
      item.recipientCode.toLowerCase().includes(searchLower) ||
      item.transactionRefId.toLowerCase().includes(searchLower) ||
      item.period.toLowerCase().includes(searchLower)
    );
  }

  res.status(200).json({
    success: true,
    count: formatted.length,
    data: formatted,
  });
});

/**
 * Mark a pending payout as PAID
 * PATCH /api/super-admin/roi/payouts/:id/pay
 */
const markPayoutPaid = asyncHandler(async (req, res, next) => {
  const { id } = req.params;
  const { paymentMode, transactionRefId } = req.body;

  if (!paymentMode || !transactionRefId) {
    return next(new AppError('Payment mode and transaction reference ID are required.', 400));
  }

  const payout = await Payout.findById(id);
  if (!payout) {
    return next(new AppError('Payout record not found.', 404));
  }

  if (payout.status === 'paid') {
    return next(new AppError('This payout is already marked as paid.', 400));
  }

  // Check unique constraints for transactionRefId
  const existing = await Payout.findOne({ transactionRefId, _id: { $ne: id } });
  if (existing) {
    return next(new AppError(`Payout with transaction reference ID ${transactionRefId} already exists.`, 400));
  }

  payout.status = 'paid';
  payout.paymentMode = paymentMode;
  payout.transactionRefId = transactionRefId;
  payout.paidAt = new Date();
  await payout.save();

  // Sync AgentCommission records for this agent to PAID
  if (String(payout.recipientType).toLowerCase().includes('agent')) {
    try {
      const AgentCommission = require('../../models/AgentCommission.model');
      let agentUser = await User.findOne({
        $or: [
          { clientCode: payout.recipientId },
          { _id: mongoose.Types.ObjectId.isValid(payout.recipientId) ? payout.recipientId : null }
        ],
        role: 'agent'
      });

      if (!agentUser && payout.recipientId) {
        const agProf = await AgentProfile.findOne({ clientCode: payout.recipientId });
        if (agProf) agentUser = await User.findById(agProf.userId);
      }

      if (!agentUser) {
        const allAgents = await User.find({ role: 'agent' });
        if (allAgents.length === 1) agentUser = allAgents[0];
      }

      if (agentUser) {
        await AgentCommission.updateMany(
          { agentId: agentUser._id, status: 'PENDING' },
          {
            $set: {
              status: 'PAID',
              paymentMode: paymentMode || 'Bank Transfer',
              transactionRefId: transactionRefId || 'TXN-PAID',
              paidAt: new Date(),
              date: new Date()
            }
          }
        );
      }
    } catch (err) {
      console.error('Error syncing agent commission to PAID on markPayoutPaid:', err);
    }
  }

  res.status(200).json({
    success: true,
    message: 'Payout marked as paid successfully.',
    data: payout,
  });
});

/**
 * Bulk CSV Payout Upload
 * POST /api/super-admin/roi/payouts/bulk
 */
const bulkUploadPayouts = asyncHandler(async (req, res, next) => {
  if (!req.file) {
    return next(new AppError('Please upload a CSV file.', 400));
  }

  const csvData = req.file.buffer.toString('utf-8');
  const lines = csvData.split(/\r?\n/).map(line => line.trim()).filter(line => line.length > 0);

  if (lines.length <= 1) {
    return next(new AppError('CSV file is empty or contains no records.', 400));
  }

  const headers = lines[0].split(',').map(h => h.trim().replace(/^["']|["']$/g, ''));
  const getIndex = (names) => headers.findIndex(h => names.some(name => h.toLowerCase() === name.toLowerCase()));

  const recipientTypeIdx = getIndex(['recipientType', 'type', 'payoutType']);
  const recipientCodeIdx = getIndex(['recipientCode', 'code', 'codeId']);
  const amountIdx = getIndex(['amount', 'amountPaid', 'value']);
  const payoutDateIdx = getIndex(['payoutDate', 'date', 'paidAt']);
  const paymentModeIdx = getIndex(['paymentMode', 'mode']);
  const transactionRefIdIdx = getIndex(['transactionRefId', 'refId', 'referenceId', 'ref']);
  const commissionTypeIdx = getIndex(['commissionType', 'commType']);
  const relatedClientCodeIdx = getIndex(['relatedClientCode', 'clientCode']);

  if (recipientTypeIdx === -1 || recipientCodeIdx === -1 || amountIdx === -1) {
    return next(new AppError('CSV must contain recipientType, recipientCode (or code), and amount columns.', 400));
  }

  const results = [];
  const errors = [];

  for (let i = 1; i < lines.length; i++) {
    const row = lines[i].split(',').map(val => val.trim().replace(/^["']|["']$/g, ''));
    if (row.length < 3) continue;

    const recipientType = row[recipientTypeIdx];
    const recipientCode = row[recipientCodeIdx];
    const amountVal = Number(row[amountIdx]);
    
    if (!recipientType || !recipientCode || isNaN(amountVal) || amountVal <= 0) {
      errors.push(`Row ${i + 1}: Invalid recipient type, code or amount.`);
      continue;
    }

    const rawPayoutDate = payoutDateIdx !== -1 && row[payoutDateIdx] ? new Date(row[payoutDateIdx]) : new Date();
    const payoutDateFormatted = rawPayoutDate.toISOString().split('T')[0];
    const paymentMode = paymentModeIdx !== -1 ? row[paymentModeIdx] : 'Bank Transfer';
    const transactionRefId = transactionRefIdIdx !== -1 ? row[transactionRefIdIdx] : 'TXN-' + Math.random().toString(36).substring(2, 10).toUpperCase();
    const commissionType = commissionTypeIdx !== -1 ? row[commissionTypeIdx] : '';
    const relatedClientCode = relatedClientCodeIdx !== -1 ? row[relatedClientCodeIdx] : '';

    // Verify recipient user exists
    const user = await User.findOne({ clientCode: recipientCode.toUpperCase() });
    if (!user) {
      errors.push(`Row ${i + 1}: Recipient code ${recipientCode} not found in database.`);
      continue;
    }

    const isClient = recipientType.toLowerCase().includes('client') || recipientType.toLowerCase().includes('roi');
    const dbRecipientType = isClient ? 'Client Return (ROI)' : 'Agent Commission';

    let dbCommType = '';
    if (!isClient) {
      dbCommType = 'Monthly';
      if (commissionType) {
        const typeLower = commissionType.toLowerCase();
        if (typeLower.includes('one') || typeLower.includes('onboard')) {
          dbCommType = 'One-Time';
        } else if (typeLower.includes('special') || typeLower.includes('override')) {
          dbCommType = 'Special';
        }
      }
    }

    try {
      const pRecord = await Payout.create({
        recipientType: dbRecipientType,
        recipientId: recipientCode.toUpperCase(),
        commissionType: dbCommType,
        clientId: isClient ? '' : (relatedClientCode ? relatedClientCode.toUpperCase() : ''),
        amount: amountVal,
        payoutDate: payoutDateFormatted,
        paymentMode,
        transactionRefId,
        status: 'paid',
        paidAt: rawPayoutDate
      });
      results.push(pRecord);
    } catch (err) {
      errors.push(`Row ${i + 1}: Failed to save - ${err.message}`);
    }
  }

  res.status(200).json({
    success: true,
    message: `Bulk processing complete. Successfully recorded ${results.length} payouts.`,
    processedCount: results.length,
    skippedCount: errors.length,
    errors,
  });
});

/**
 * Clear all Payout records (Super Admin only)
 * DELETE /api/super-admin/roi/payouts
 */
const clearAllPayouts = asyncHandler(async (req, res, next) => {
  const result = await Payout.deleteMany({});

  res.status(200).json({
    success: true,
    message: `All payout records (${result.deletedCount}) have been cleared successfully.`,
    count: result.deletedCount
  });
});

/**
 * Delete a single Payout record (Super Admin only)
 * DELETE /api/super-admin/roi/payouts/:id
 */
const deletePayout = asyncHandler(async (req, res, next) => {
  const { id } = req.params;
  let payout = await Payout.findByIdAndDelete(id);

  if (!payout) {
    payout = await Transaction.findByIdAndDelete(id);
  }

  if (!payout) {
    payout = await DividendAllotment.findByIdAndDelete(id);
  }

  if (!payout) {
    return next(new AppError('Payout or transaction record not found.', 404));
  }

  // Revert corresponding AgentCommission record status back to PENDING if deleted
  if (payout.recipientType === 'Agent Commission' || (payout.recipientType || '').toLowerCase().includes('agent')) {
    try {
      let agentUser = await User.findOne({
        $or: [
          { clientCode: payout.recipientId },
          { name: { $regex: new RegExp(`^${payout.recipientId}$`, 'i') } }
        ],
        role: 'agent'
      });

      if (!agentUser && payout.recipientId) {
        const agProf = await AgentProfile.findOne({
          $or: [
            { agentCode: payout.recipientId },
            { clientCode: payout.recipientId }
          ]
        });
        if (agProf) agentUser = await User.findById(agProf.userId);
      }

      if (agentUser) {
        const revertFilter = {
          agentId: agentUser._id,
          status: 'PAID'
        };
        if (payout.transactionRefId) {
          revertFilter.$or = [
            { transactionRefId: payout.transactionRefId },
            { amount: payout.amount }
          ];
        }
        const updateRes = await AgentCommission.updateMany(
          revertFilter,
          {
            $set: {
              status: 'PENDING',
              paymentMode: '',
              transactionRefId: '',
              paidAt: null
            }
          }
        );
        console.log(`[Payout Delete Revert] Reverted ${updateRes.modifiedCount} Agent ${agentUser.name} Commissions back to PENDING.`);
      }
    } catch (revertErr) {
      console.error('Error reverting agent commission on payout delete:', revertErr);
    }
  }

  res.status(200).json({
    success: true,
    message: 'Payout record deleted successfully.',
    data: payout
  });
});

module.exports = {
  recordPayout,
  getPayouts,
  markPayoutPaid,
  bulkUploadPayouts,
  clearAllPayouts,
  deletePayout,
};
