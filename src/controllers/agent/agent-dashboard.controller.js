const User = require('../../models/User.model');
const AgentProfile = require('../../models/AgentProfile.model');
const ClientProfile = require('../../models/ClientProfile.model');
const Investment = require('../../models/Investment.model');
const AgentCommission = require('../../models/AgentCommission.model');
const Transaction = require('../../models/Transaction.model');
const agentDetailsService = require('../../services/agent-details.service');
const asyncHandler = require('../../utils/asyncHandler');
const AppError = require('../../utils/AppError');
const { ROLES } = require('../../constants/roles');

/**
 * Get logged-in Agent dashboard details
 * GET /api/agent/dashboard
 */
const getAgentDashboard = asyncHandler(async (req, res, next) => {
  const agentId = req.user.id;

  // 1) Find assigned clients, agent commissions, and agent profile in parallel (Batch 1)
  const [clients, commissions, agentProfile] = await Promise.all([
    User.find({ role: ROLES.CLIENT, assignedAgent: agentId }).sort({ createdAt: -1 }).lean(),
    AgentCommission.find({ agentId }).lean(),
    AgentProfile.findOne({ userId: agentId }).lean()
  ]);
  const clientIds = clients.map(c => c._id);

  // 2) Find active client investments, profiles, and transactions in parallel (Batch 2)
  const [investmentsList, clientProfiles, clientTransactions] = await Promise.all([
    clientIds.length > 0
      ? Investment.find({ clientId: { $in: clientIds }, status: 'active' }).lean()
      : Promise.resolve([]),
    clientIds.length > 0
      ? ClientProfile.find({ userId: { $in: clientIds } }).lean()
      : Promise.resolve([]),
    clientIds.length > 0
      ? Transaction.find({ clientId: { $in: clientIds } }).sort({ createdAt: -1 }).limit(10).lean()
      : Promise.resolve([])
  ]);

  const totalClientsInvestment = investmentsList.reduce((sum, inv) => sum + (inv.investmentAmount || 0), 0);

  // 3) Calculate commissions
  const commissionPaid = commissions.filter(c => c.status === 'PAID').reduce((sum, c) => sum + c.amount, 0);
  const commissionPending = commissions.filter(c => c.status === 'PENDING').reduce((sum, c) => sum + c.amount, 0);
  
  const now = new Date();
  const thisMonthCommission = commissions
    .filter(c => {
      const d = new Date(c.date);
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    })
    .reduce((sum, c) => sum + c.amount, 0);

  // 4) Dynamically compute reward milestones status and progress
  const milestones = [
    {
      id: 'silver',
      name: 'Silver Milestone',
      target: 'Bring 5 clients to KFPL',
      current: clients.length,
      limit: 5,
      status: clients.length >= 5 ? 'UNLOCKED' : 'LOCKED'
    },
    {
      id: 'gold',
      name: 'Gold Milestone',
      target: 'Bring 10 clients to unlock a bonus reward',
      current: clients.length,
      limit: 10,
      status: clients.length >= 10 ? 'UNLOCKED' : 'LOCKED'
    },
    {
      id: 'cash_bonus',
      name: 'Cash Bonus \u20B910K',
      target: 'Generate \u20B950L total client investment',
      current: totalClientsInvestment,
      limit: 5000000,
      status: totalClientsInvestment >= 5000000 ? 'CLAIMED' : 'LOCKED'
    },
    {
      id: 'platinum',
      name: 'Platinum Star',
      target: 'Bring 20 clients to KFPL',
      current: clients.length,
      limit: 20,
      status: clients.length >= 20 ? 'UNLOCKED' : 'LOCKED'
    },
    {
      id: 'luxury_trip',
      name: 'Luxury Trip',
      target: 'Generate \u20B92Cr total investment to win a luxury trip',
      current: totalClientsInvestment,
      limit: 20000000,
      status: totalClientsInvestment >= 20000000 ? 'UNLOCKED' : 'LOCKED'
    }
  ];

  const rewardsEarnedCount = milestones.filter(m => m.status === 'UNLOCKED' || m.status === 'CLAIMED').length;

  // 5) Top Clients list
  const topClientsMap = {};
  clients.forEach(c => {
    const profile = clientProfiles.find(p => String(p.userId) === String(c._id)) || null;
    topClientsMap[c._id.toString()] = {
      clientId: c._id,
      name: c.name,
      code: c.clientCode || 'KFPL-XXX',
      status: profile ? (profile.status || 'ACTIVE').toUpperCase() : 'ACTIVE',
      totalInvestment: 0
    };
  });
  investmentsList.forEach(inv => {
    const cidStr = inv.clientId.toString();
    if (topClientsMap[cidStr]) {
      topClientsMap[cidStr].totalInvestment += (inv.investmentAmount || 0);
    }
  });

  const topClients = Object.values(topClientsMap)
    .sort((a, b) => b.totalInvestment - a.totalInvestment)
    .slice(0, 10);

  // 6) Recent Activities Feed
  const recentActivities = [];

  // Track client registrations
  clients.slice(0, 5).forEach(c => {
    recentActivities.push({
      type: 'registration',
      message: `Client ${c.name} registered on portal`,
      timestamp: c.createdAt
    });
  });

  // Track client transactions
  clientTransactions.forEach(tx => {
    recentActivities.push({
      type: tx.type,
      message: `${tx.clientName || 'Client'} requested a ${tx.amount.toLocaleString('en-IN')} ${tx.type}`,
      timestamp: tx.createdAt
    });
  });

  recentActivities.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  const finalActivitiesFeed = recentActivities.slice(0, 5).map(act => {
    const diffMs = Date.now() - new Date(act.timestamp).getTime();
    const diffMin = Math.floor(diffMs / 60000);
    const diffHr = Math.floor(diffMin / 60);
    const diffDay = Math.floor(diffHr / 24);

    let timeStr = 'Just now';
    if (diffDay > 0) timeStr = `${diffDay} day(s) ago`;
    else if (diffHr > 0) timeStr = `${diffHr} hour(s) ago`;
    else if (diffMin > 0) timeStr = `${diffMin} minute(s) ago`;

    return {
      type: act.type,
      message: act.message,
      timestamp: timeStr
    };
  });

  // 7) Charts - Client Investment Share (Pie Chart)
  const segmentAllocationMap = {};
  investmentsList.forEach(inv => {
    const amt = inv.investmentAmount || 0;
    if (inv.segmentAllocation && inv.segmentAllocation.length > 0) {
      inv.segmentAllocation.forEach(alloc => {
        const name = alloc.segmentName;
        const pct = alloc.allocationPercentage || 0;
        segmentAllocationMap[name] = (segmentAllocationMap[name] || 0) + (amt * pct / 100);
      });
    } else {
      const name = inv.segment || 'Unallocated';
      segmentAllocationMap[name] = (segmentAllocationMap[name] || 0) + amt;
    }
  });

  const clientInvestmentShare = Object.keys(segmentAllocationMap).map(name => {
    const amount = segmentAllocationMap[name];
    const percentage = totalClientsInvestment > 0 ? Math.round((amount / totalClientsInvestment) * 100) : 0;
    return {
      segment: name,
      amount,
      percentage
    };
  });

  // 8) Charts - Monthly Commission Trend & Client Onboarding Momentum
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const monthlyCommissionPaidMap = Array(12).fill(0);
  const monthlyCommissionPendingMap = Array(12).fill(0);
  const monthlyOnboardingMap = Array(12).fill(0);
  const monthlyWithdrawalMap = Array(12).fill(0);

  commissions.forEach(c => {
    const month = new Date(c.date).getMonth();
    if (c.status === 'PAID') {
      monthlyCommissionPaidMap[month] += (c.amount || 0);
    } else {
      monthlyCommissionPendingMap[month] += (c.amount || 0);
    }
  });

  clients.forEach(c => {
    const month = new Date(c.createdAt).getMonth();
    monthlyOnboardingMap[month] += 1;
  });

  clientTransactions.forEach(tx => {
    if (tx.type === 'withdrawal') {
      const month = new Date(tx.createdAt).getMonth();
      monthlyWithdrawalMap[month] += (tx.amount || 0);
    }
  });

  const monthlyCommissionTrend = monthNames.map((name, index) => ({
    month: name,
    paid: monthlyCommissionPaidMap[index],
    pending: monthlyCommissionPendingMap[index]
  }));

  const clientOnboardingMomentum = monthNames.map((name, index) => ({
    month: name,
    count: monthlyOnboardingMap[index]
  }));

  const withdrawalRequestTrend = monthNames.map((name, index) => ({
    month: name,
    amount: monthlyWithdrawalMap[index]
  }));

  // 9) Return response payload
  res.status(200).json({
    success: true,
    data: {
      // Flat properties at the root of data for direct front-end consumption
      agentName: req.user.name,
      totalClients: clients.length,
      activeInvestments: investmentsList.length,
      thisMonthCommission,
      thisMonthCommissions: thisMonthCommission,
      commissionPaid,
      totalCommissionPaid: commissionPaid,
      commissionsPaid: commissionPaid,
      commissionPending,
      totalCommissionPending: commissionPending,
      commissionsPending: commissionPending,
      rewardsEarned: rewardsEarnedCount,
      rewardsEarnedCount,
      totalRewards: rewardsEarnedCount,

      // Welcome object (for backward compatibility / fallback)
      welcome: {
        agentName: req.user.name,
        totalClients: clients.length,
        activeInvestments: investmentsList.length
      },

      // Stats object (for backward compatibility / fallback)
      stats: {
        totalClients: clients.length,
        activeInvestments: investmentsList.length,
        thisMonthCommission,
        commissionPaid,
        commissionPending,
        rewardsEarned: rewardsEarnedCount
      },

      milestones,
      topClients,
      recentActivity: finalActivitiesFeed,
      clientInvestmentShare,
      monthlyCommissionTrend,
      clientOnboardingMomentum,
      withdrawalRequestTrend,
      agentProfile: agentProfile || null,
      profile: agentProfile || null,
    }
  });
});

/**
 * Get clients assigned to the logged-in Agent
 * GET /api/agent/clients
 */
const getAgentClients = asyncHandler(async (req, res, next) => {
  const agentId = req.user.id;

  // 1) Find all client users assigned to this agent using lean mode
  const clients = await User.find({ role: ROLES.CLIENT, assignedAgent: agentId }).sort({ createdAt: -1 }).lean();
  const clientIds = clients.map(c => c._id);

  if (clientIds.length === 0) {
    return res.status(200).json({
      success: true,
      count: 0,
      data: {
        clients: [],
      },
    });
  }

  // 2) Fetch agent profile once outside the loop
  const agentProfile = await AgentProfile.findOne({ userId: agentId }).lean();
  const monthlySlabStr = (agentProfile && agentProfile.monthlySlab) ? agentProfile.monthlySlab.replace('%', '') : '0.5';
  const monthlySlabPct = parseFloat(monthlySlabStr) || 0.5;
  const months = 3;

  const clientCodes = clients.map(c => c.clientCode).filter(Boolean);

  // 3) Bulk fetch client profiles, active investments, and approved deposit transactions in parallel
  const [profiles, investments, approvedDeposits] = await Promise.all([
    ClientProfile.find({
      $or: [
        { userId: { $in: clientIds } },
        { email: { $in: clients.map(c => c.email).filter(Boolean) } }
      ]
    }).lean(),
    Investment.find({
      $or: [
        { clientId: { $in: clientIds } },
        { clientCode: { $in: clientCodes } }
      ],
      status: 'active'
    }).lean(),
    Transaction.find({
      $or: [
        { clientId: { $in: clientIds } },
        { clientCode: { $in: clientCodes } }
      ],
      type: 'deposit',
      status: 'approved'
    }).lean()
  ]);

  // 4) Map profiles, investments, and deposits for O(1) in-memory lookup
  const profileMap = {};
  profiles.forEach(p => {
    if (p.userId) profileMap[p.userId.toString()] = p;
    if (p.email) profileMap[p.email.toLowerCase()] = p;
  });

  const investmentsMap = {};
  const depositsMap = {};

  investments.forEach(inv => {
    const amt = inv.investmentAmount || inv.amount || 0;
    const idKey = inv.clientId ? inv.clientId.toString() : '';
    const codeKey = inv.clientCode || '';
    if (idKey) investmentsMap[idKey] = (investmentsMap[idKey] || 0) + amt;
    if (codeKey) investmentsMap[codeKey] = (investmentsMap[codeKey] || 0) + amt;
  });

  approvedDeposits.forEach(tx => {
    const amt = tx.amount || 0;
    const idKey = tx.clientId ? tx.clientId.toString() : '';
    const codeKey = tx.clientCode || '';
    if (idKey) depositsMap[idKey] = (depositsMap[idKey] || 0) + amt;
    if (codeKey) depositsMap[codeKey] = (depositsMap[codeKey] || 0) + amt;
  });

  // 5) Assemble client records
  const clientRecords = clients.map(client => {
    const clientIdStr = client._id.toString();
    const codeStr = client.clientCode || '';
    const emailStr = (client.email || '').toLowerCase();

    const profile = profileMap[clientIdStr] || profileMap[emailStr] || null;
    const invTotal = Math.max(investmentsMap[clientIdStr] || 0, investmentsMap[codeStr] || 0);
    const depTotal = Math.max(depositsMap[clientIdStr] || 0, depositsMap[codeStr] || 0);
    const totalInvestment = Math.max(invTotal, depTotal);
    const commissionPaid = totalInvestment * (monthlySlabPct / 100) * months;
    
    // Parse monthlyRoi safely directly from DB profile — exact value without fallback
    const monthlyRoi = profile && profile.monthlyRoi !== undefined ? (parseFloat(profile.monthlyRoi) || 0) : 0;

    return {
      clientId: client.clientCode || '',
      id: client._id,
      name: client.name,
      email: client.email,
      phone: profile ? profile.phone : '',
      joinDate: client.createdAt,
      totalInvestment,
      roi: monthlyRoi,
      monthlyRoi,
      monthlyRoiRate: monthlyRoi,
      roiPercentage: monthlyRoi,
      roiRate: monthlyRoi,
      commissionPaid: Math.round(commissionPaid),
      commissionEarned: Math.round(commissionPaid),
      commission: Math.round(commissionPaid),
      totalCommission: Math.round(commissionPaid),
      status: profile ? (profile.status || 'ACTIVE').toUpperCase() : 'ACTIVE',
      isActive: client.isActive !== false,
      perk: profile ? (profile.tier || 'GOLD').toUpperCase() : 'GOLD',
      tier: profile ? (profile.tier || 'GOLD').toUpperCase() : 'GOLD',
      perkTier: profile ? (profile.tier || 'GOLD').toUpperCase() : 'GOLD',
      contractEndDate: profile ? profile.contractEndDate : '',
      contractEnd: profile ? profile.contractEndDate : '',
      profilePic: (profile && profile.profilePic) || client.profilePic || '',
      
      // Dual-compatibility nested structure
      user: {
        _id: client._id,
        name: client.name,
        email: client.email,
        clientCode: client.clientCode || '',
        createdAt: client.createdAt,
        profilePic: client.profilePic || '',
      },
      profile: {
        _id: profile ? profile._id : null,
        phone: profile ? profile.phone : '',
        status: profile ? (profile.status || 'ACTIVE').toUpperCase() : 'ACTIVE',
        monthlyRoi: monthlyRoi,
        roi: monthlyRoi,
        roiPercentage: monthlyRoi,
        roiRate: monthlyRoi,
        tier: profile ? (profile.tier || 'GOLD').toUpperCase() : 'GOLD',
        perkTier: profile ? (profile.tier || 'GOLD').toUpperCase() : 'GOLD',
        contractEndDate: profile ? profile.contractEndDate : '',
        contractEnd: profile ? profile.contractEndDate : '',
      },
    };
  });

  res.status(200).json({
    success: true,
    count: clientRecords.length,
    data: {
      clients: clientRecords,
    },
  });
});

/**
 * Get logged-in Agent commission history
 * GET /api/agent/commissions
 */
const getAgentCommissions = asyncHandler(async (req, res, next) => {
  const agentId = req.user.id;

  // Sync any pending commissions to PAID if Super Admin recorded a paid payout for this agent
  try {
    const Payout = require('../../models/Payout.model');
    const agentProfile = await AgentProfile.findOne({ userId: agentId }).lean();
    const possibleCodes = [
      String(agentId),
      req.user.clientCode,
      req.user.agentCode,
      agentProfile?.clientCode,
      agentProfile?.agentCode,
      req.user.name
    ].filter(Boolean);

    const paidPayouts = await Payout.find({
      status: { $regex: /^paid$/i },
      $or: [
        { recipientId: { $in: possibleCodes } },
        { recipientType: { $regex: /agent/i } }
      ]
    }).lean();

    if (paidPayouts.length > 0) {
      const latestPayout = paidPayouts[paidPayouts.length - 1];
      await AgentCommission.updateMany(
        {
          $or: [
            { agentId },
            { agentId: req.user._id },
            { agentId: String(req.user._id || agentId) }
          ]
        },
        {
          $set: {
            status: 'PAID',
            paymentMode: latestPayout.paymentMode || 'Bank Transfer',
            transactionRefId: latestPayout.transactionRefId || 'TXN-PAID',
            paidAt: latestPayout.paidAt || new Date(),
            date: latestPayout.paidAt || new Date()
          }
        }
      );
    }
  } catch (err) {
    console.error('Failed to sync agent payouts in getAgentCommissions:', err);
  }

  // Let's populate the related client details
  const commissions = await AgentCommission.find({
    $or: [
      { agentId },
      { agentId: req.user._id },
      { agentId: String(req.user._id || agentId) }
    ]
  })
    .populate('clientId', 'name email clientCode')
    .sort({ date: -1, createdAt: -1 });

  // Re-verify if any paid payout exists in Payout model
  let hasPaidPayout = false;
  try {
    const Payout = require('../../models/Payout.model');
    const count = await Payout.countDocuments({
      status: { $regex: /^paid$/i },
      $or: [
        { recipientType: { $regex: /agent/i } }
      ]
    });
    hasPaidPayout = count > 0;
  } catch (e) {}

  let totalCommissionEarned = 0;
  let totalCommissionPaid = 0;
  let totalCommissionPending = 0;
  let oneTimeAmount = 0;
  let monthlyAmount = 0;
  let specialAmount = 0;

  const uniqueOneTimeClients = new Set();
  let recurringPayoutCount = 0;
  let specialBonusCount = 0;

  commissions.forEach(c => {
    if (hasPaidPayout) {
      c.status = 'PAID';
    }
    totalCommissionEarned += c.amount;
    if (c.status === 'PAID') {
      totalCommissionPaid += c.amount;
    } else {
      totalCommissionPending += c.amount;
    }

    if (c.type === 'ONE TIME') {
      oneTimeAmount += c.amount;
      if (c.clientId) uniqueOneTimeClients.add(c.clientId._id.toString());
    } else if (c.type === 'MONTHLY') {
      monthlyAmount += c.amount;
      recurringPayoutCount++;
    } else if (c.type === 'SPECIAL') {
      specialAmount += c.amount;
      specialBonusCount++;
    }
  });

  // Fetch all active investments of related clients to map investmentAmount & slab %
  const clientIds = commissions.map(c => c.clientId ? c.clientId._id : null).filter(Boolean);
  const investments = await Investment.find({ clientId: { $in: clientIds }, status: 'active' }).lean();

  const investmentMap = {};
  investments.forEach(inv => {
    investmentMap[inv.clientId.toString()] = inv.investmentAmount;
  });

  const getSlabPct = (amount) => {
    if (!amount) return '2%';
    if (amount <= 500000) return '2%';
    if (amount <= 1500000) return '2.5%';
    if (amount <= 3000000) return '3%';
    if (amount <= 5000000) return '3.5%';
    return '4%';
  };

  const enrichedCommissions = commissions.map(c => {
    const client = c.clientId || {};
    const invAmount = client._id ? (investmentMap[client._id.toString()] || 0) : 0;
    const slabPct = invAmount ? getSlabPct(invAmount) : '—';

    return {
      _id: c._id,
      period: c.period,
      amount: c.amount,
      status: c.status,
      type: c.type,
      date: c.date,
      createdAt: c.createdAt,
      paymentMode: c.paymentMode || '—',
      transactionRefId: c.transactionRefId || '—',
      remarks: c.remarks || '',
      clientName: client.name || '—',
      clientCode: client.clientCode || '—',
      investmentAmount: invAmount || 0,
      slabPercentage: slabPct,
    };
  });

  res.status(200).json({
    success: true,
    data: {
      stats: {
        totalCommissionEarned,
        totalCommissionPaid,
        totalCommissionPending,
        oneTime: {
          amount: oneTimeAmount,
          clientCount: uniqueOneTimeClients.size,
        },
        monthly: {
          amount: monthlyAmount,
          payoutCount: recurringPayoutCount,
        },
        special: {
          amount: specialAmount,
          bonusCount: specialBonusCount,
        }
      },
      commissions: enrichedCommissions,
    },
  });
});

/**
 * Get logged-in Agent profile details
 * GET /api/agent/profile
 */
const getAgentProfile = asyncHandler(async (req, res, next) => {
  const details = await agentDetailsService.getAgentDetailsData(req.user.id);
  
  res.status(200).json({
    success: true,
    data: details.profile,
  });
});

/**
 * Get logged-in Agent documents
 * GET /api/agent/documents
 */
const getAgentDocuments = asyncHandler(async (req, res, next) => {
  const documents = await agentDetailsService.getAgentDocumentsData(req.user.id);

  res.status(200).json({
    success: true,
    data: {
      documents,
    },
  });
});

/**
 * Get details of a specific client assigned to the logged-in Agent
 * GET /api/agent/clients/:id
 */
const getAgentClientById = asyncHandler(async (req, res, next) => {
  const agentId = req.user.id;
  const clientId = req.params.id;

  // 1) Verify that the client exists and is assigned to this agent
  const clientUser = await User.findById(clientId);
  if (!clientUser || clientUser.role !== ROLES.CLIENT) {
    return next(new AppError('Client not found.', 404));
  }

  if (!clientUser.assignedAgent || clientUser.assignedAgent.toString() !== agentId.toString()) {
    return next(new AppError('Access Denied. This client is not assigned to you.', 403));
  }

  // 2) Fetch client details and documents from services
  const clientDetailsService = require('../../services/client-details.service');
  const details = await clientDetailsService.getClientDetailsData(clientId);
  const documentsData = await clientDetailsService.getClientDocumentsData(clientId);

  const formattedDob = details.profile.dob
    ? (details.profile.dob instanceof Date ? details.profile.dob.toISOString().split('T')[0] : new Date(details.profile.dob).toISOString().split('T')[0])
    : '';

  const formatLongDate = (dateVal) => {
    if (!dateVal) return '—';
    const date = new Date(dateVal);
    if (isNaN(date.getTime())) return '—';
    const day = date.getDate();
    const months = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ];
    return `${day} ${months[date.getMonth()]} ${date.getFullYear()}`;
  };

  const clientProfileExtended = {
    ...details.profile,
    dob: formattedDob,
    dobFormatted: formatLongDate(details.profile.dob),
    joinDate: clientUser.createdAt ? clientUser.createdAt.toISOString().split('T')[0] : '',
    joinDateFormatted: formatLongDate(clientUser.createdAt),
    contractStartDate: details.profile.contractStartDate
      ? (details.profile.contractStartDate instanceof Date ? details.profile.contractStartDate.toISOString().split('T')[0] : new Date(details.profile.contractStartDate).toISOString().split('T')[0])
      : '',
    contractEndDate: details.profile.contractEndDate
      ? (details.profile.contractEndDate instanceof Date ? details.profile.contractEndDate.toISOString().split('T')[0] : new Date(details.profile.contractEndDate).toISOString().split('T')[0])
      : '',
    contractExtendedDate: details.profile.extendContractDate || '',
    panCardNumber: details.profile.panNumber,
    aadhaarCardNumber: details.profile.aadhaarNumber,
    accountNo: details.profile.accountNumber,
    'accountNo.': details.profile.accountNumber,
    ifsc: details.profile.ifscCode,
    kycStatus: documentsData.kycStatus,
  };

  res.status(200).json({
    success: true,
    data: {
      ...details,
      profile: clientProfileExtended,
      client: clientProfileExtended,
      // Flat properties at data root
      ...clientProfileExtended,
      documents: documentsData.documents,
      kycStatus: documentsData.kycStatus,
      verificationStatus: documentsData.verificationStatus,
    },
  });
});

/**
 * Upload or update signed agreement document for Agent
 * POST /api/agent/documents/agreement
 */
const uploadAgentAgreementDocument = asyncHandler(async (req, res, next) => {
  const AgentProfile = require('../../models/AgentProfile.model');
  const profile = await AgentProfile.findOne({ userId: req.user.id });
  if (!profile) {
    return next(new AppError('Agent profile not found.', 404));
  }

  let fileUrl = req.body.fileUrl || '';
  if (req.file) {
    const { uploadBufferToCloudinary } = require('../../services/cloudinary.service');
    try {
      fileUrl = await uploadBufferToCloudinary(req.file.buffer, 'kinetoscope/agents/agreements');
    } catch (err) {
      return next(new AppError(`File upload failed: ${err.message}`, 500));
    }
  }

  if (!fileUrl) {
    return next(new AppError('Please select or upload a valid agreement document file.', 400));
  }

  profile.agreementDocument = fileUrl;
  profile.agreementDocumentVerified = false;
  await profile.save();

  res.status(200).json({
    success: true,
    message: 'Signed agent agreement document uploaded successfully',
    data: {
      agreementDocument: fileUrl,
    },
  });
});

const updateAgentProfile = asyncHandler(async (req, res, next) => {
  const allowedUpdates = ['phone', 'address', 'profilePic', 'nomineeName', 'nomineeRelation', 'nomineePhone', 'nomineeEmail', 'nomineeResidency'];
  const updates = {};
  for (const key of Object.keys(req.body)) {
    if (allowedUpdates.includes(key)) {
      updates[key] = req.body[key];
    }
  }

  if (updates.profilePic && updates.profilePic.startsWith('data:image/')) {
    const { uploadBase64ToCloudinary } = require('../../services/cloudinary.service');
    try {
      const cloudinaryUrl = await uploadBase64ToCloudinary(updates.profilePic, 'kinetoscope/agents/avatars');
      if (cloudinaryUrl && (cloudinaryUrl.startsWith('http://') || cloudinaryUrl.startsWith('https://'))) {
        updates.profilePic = cloudinaryUrl;
      } else {
        delete updates.profilePic;
      }
    } catch (err) {
      console.error('[Agent Profile Upload] Failed to upload avatar to Cloudinary:', err);
      delete updates.profilePic;
    }
  }

  const profile = await AgentProfile.findOneAndUpdate(
    { userId: req.user.id },
    { $set: updates },
    { new: true, runValidators: true }
  );

  if (updates.profilePic) {
    await User.findByIdAndUpdate(req.user.id, { profilePic: updates.profilePic });
  }

  if (!profile) {
    return next(new AppError('Agent profile could not be found.', 404));
  }

  const details = await agentDetailsService.getAgentDetailsData(req.user.id);

  res.status(200).json({
    success: true,
    message: 'Agent profile updated successfully.',
    data: details.profile,
  });
});

const removeAgentAvatar = asyncHandler(async (req, res, next) => {
  const profile = await AgentProfile.findOne({ userId: req.user.id });
  if (profile && profile.profilePic) {
    if (profile.profilePic.startsWith('http')) {
      const { deleteFromCloudinary } = require('../../services/cloudinary.service');
      await deleteFromCloudinary(profile.profilePic);
    }
    profile.profilePic = '';
    await profile.save();
  }

  await User.findByIdAndUpdate(req.user.id, { profilePic: '' });

  const profileObj = profile ? profile.toObject() : {};

  res.status(200).json({
    success: true,
    message: 'Profile picture removed successfully.',
    data: profileObj,
  });
});

module.exports = {
  getAgentDashboard,
  getAgentClients,
  getAgentCommissions,
  getAgentProfile,
  updateAgentProfile,
  removeAgentAvatar,
  getAgentDocuments,
  uploadAgentAgreementDocument,
  getAgentClientById,
};
