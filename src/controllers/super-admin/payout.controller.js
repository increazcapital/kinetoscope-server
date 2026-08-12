const mongoose = require('mongoose');
const User = require('../../models/User.model');
const ClientProfile = require('../../models/ClientProfile.model');
const AgentProfile = require('../../models/AgentProfile.model');
const Payout = require('../../models/Payout.model');
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

  let finalCommissionType = commissionType || '';
  if (normalizedRecipientType === 'Client Return (ROI)' && (!finalCommissionType || finalCommissionType === 'ROI' || finalCommissionType.includes('12%'))) {
    const passedRoi = req.body.roiPercentage || req.body.monthlyRoi;
    if (passedRoi) {
      finalCommissionType = `ROI (${passedRoi}%)`;
    } else {
      try {
        let uObj = await User.findOne({
          $or: [
            { clientCode: resolvedRecipientId },
            { _id: mongoose.Types.ObjectId.isValid(recipientId) ? recipientId : null }
          ]
        });
        if (uObj) {
          const cProf = await ClientProfile.findOne({ userId: uObj._id });
          const cRate = cProf ? (cProf.monthlyRoi || 1.2) : 1.2;
          finalCommissionType = `ROI (${cRate}%)`;
        }
      } catch (e) {}
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
    paidAt: payoutStatus === 'paid' ? new Date() : undefined
  });

  // If this is an Agent Commission payout and marked as paid, sync AgentCommission records to PAID
  if (normalizedRecipientType === 'Agent Commission' && payoutStatus === 'paid') {
    try {
      const AgentCommission = require('../../models/AgentCommission.model');
      let agentUser = await User.findOne({
        $or: [
          { clientCode: resolvedRecipientId },
          { _id: mongoose.Types.ObjectId.isValid(recipientId) ? recipientId : null }
        ],
        role: 'agent'
      });

      if (!agentUser && resolvedRecipientId) {
        const agProf = await AgentProfile.findOne({ clientCode: resolvedRecipientId });
        if (agProf) agentUser = await User.findById(agProf.userId);
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

  const payouts = await Payout.find(query).sort({ payoutDate: -1, createdAt: -1 }).lean();

  // Populate recipient names
  const recipientIds = payouts.map(p => p.recipientId);
  const objectIds = recipientIds.filter(id => mongoose.Types.ObjectId.isValid(id));

  const [usersByCode, usersById, clientProfiles, agentProfiles, allClientProfiles] = await Promise.all([
    User.find({ clientCode: { $in: recipientIds } }, { name: 1, clientCode: 1 }).lean(),
    User.find({ _id: { $in: objectIds } }, { name: 1 }).lean(),
    ClientProfile.find({ _id: { $in: objectIds } }).populate('userId', 'name').lean(),
    AgentProfile.find({ _id: { $in: objectIds } }).populate('userId', 'name').lean(),
    ClientProfile.find({}).lean()
  ]);

  const userMap = {};
  const roiMap = {};
  usersByCode.forEach(u => {
    if (u.clientCode) userMap[u.clientCode] = u.name;
  });
  usersById.forEach(u => {
    userMap[u._id.toString()] = u.name;
  });
  clientProfiles.forEach(cp => {
    if (cp.userId) {
      userMap[cp._id.toString()] = cp.userId.name;
      roiMap[cp.userId._id.toString()] = cp.monthlyRoi;
    }
  });
  agentProfiles.forEach(ap => {
    if (ap.userId) userMap[ap._id.toString()] = ap.userId.name;
  });
  allClientProfiles.forEach(cp => {
    if (cp.userId) roiMap[cp.userId.toString()] = cp.monthlyRoi;
  });

  let formatted = payouts.map(p => {
    const name = userMap[p.recipientId] || 'Unknown';
    let periodFormatted = '—';
    try {
      if (p.payoutDate) {
        const parts = p.payoutDate.split('-');
        if (parts.length >= 2) {
          const dObj = new Date(parts[0], parseInt(parts[1], 10) - 1, 1);
          periodFormatted = new Intl.DateTimeFormat('en-US', { month: 'short', year: 'numeric' }).format(dObj);
        }
      }
    } catch (e) {
      console.error('[getPayouts] Error formatting period:', e.message);
    }

    let roiTypeStr = 'ROI';
    if (p.recipientType === 'Client Return (ROI)') {
      let clientRoi = roiMap[p.recipientId] || roiMap[p.clientId] || null;
      if (clientRoi === null || clientRoi === undefined) {
        const matchedU = usersByCode.find(u => u.clientCode === p.recipientId || u._id.toString() === p.recipientId) ||
                         usersById.find(u => u._id.toString() === p.recipientId);
        if (matchedU) {
          const uProf = allClientProfiles.find(cp => cp.userId?.toString() === matchedU._id.toString());
          if (uProf && uProf.monthlyRoi !== undefined) clientRoi = uProf.monthlyRoi;
        }
      }
      const finalRoiVal = (clientRoi !== undefined && clientRoi !== null) ? clientRoi : 0;
      roiTypeStr = `ROI (${finalRoiVal}%)`;
    }

    return {
      _id: p._id,
      recipientId: p.recipientId,
      recipientName: name,
      recipientCode: p.recipientId,
      recipientType: p.recipientType === 'Client Return (ROI)' ? 'CLIENT' : 'AGENT',
      type: p.recipientType === 'Client Return (ROI)' ? roiTypeStr : `Comm (${p.commissionType || 'monthly'})`,
      period: periodFormatted,
      amount: p.amount,
      payoutDate: p.payoutDate,
      paymentMode: p.paymentMode || '—',
      transactionRefId: p.transactionRefId || '—',
      status: p.status.toUpperCase(), // return upper case for frontend table compatibility
      paidAt: p.paidAt ? p.paidAt.toISOString().split('T')[0] : '—',
      rawDate: p.payoutDate || p.createdAt,
    };
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
  const payout = await Payout.findByIdAndDelete(id);

  if (!payout) {
    return next(new AppError('Payout record not found.', 404));
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
