const ClientProfile = require('../../models/ClientProfile.model');
const Investment = require('../../models/Investment.model');
const RoiPayout = require('../../models/RoiPayout.model');
const User = require('../../models/User.model');
const Payout = require('../../models/Payout.model');
const Project = require('../../models/Project.model');
const AgentProfile = require('../../models/AgentProfile.model');
const AppError = require('../../utils/AppError');
const asyncHandler = require('../../utils/asyncHandler');

/**
 * Reusable utility to compute dashboard statistics for a client
 * @param {string} userId - Client User ID
 * @returns {Promise<object>} Dashboard metrics payload
 */
const calculateDashboardData = async (userId) => {
  // 1) Batch 1: parallel fetch primary resources
  const [profile, investments, clientUser, clientRoiPayouts] = await Promise.all([
    ClientProfile.findOne({ userId }),
    Investment.find({ clientId: userId }).sort({ investmentDate: -1 }).lean(),
    User.findById(userId).populate('assignedAgent').lean(),
    RoiPayout.find({ clientId: userId, status: 'PAID' }).sort({ processedDate: -1 }).lean()
  ]);

  if (!profile) {
    throw new AppError('Client profile could not be found for the specified user.', 404);
  }

  // Filter out cancelled investments for the totals
  const validInvestments = investments.filter(inv => inv.status !== 'cancelled');
  const totalInvestment = validInvestments.reduce((sum, inv) => sum + (inv.investmentAmount || 0), 0);

  // Active investments calculations
  const activeInvestmentsList = investments.filter(inv => inv.status === 'active');
  const activeInvestmentsCount = activeInvestmentsList.length;

  // Average ROI rate of active investments
  let roiRate = parseFloat(profile.monthlyRoi) || 0;
  if (activeInvestmentsCount > 0) {
    const roiSum = activeInvestmentsList.reduce((sum, inv) => sum + (inv.roiPercentage || 0), 0);
    roiRate = Number((roiSum / activeInvestmentsCount).toFixed(2));
  }

  // Monthly expected return amount calculation
  let expectedMonthlyRoi = 0;
  activeInvestmentsList.forEach(inv => {
    const rate = inv.roiPercentage || parseFloat(profile.monthlyRoi) || 0;
    expectedMonthlyRoi += (inv.investmentAmount || 0) * (rate / 100);
  });
  expectedMonthlyRoi = Math.round(expectedMonthlyRoi);

  // Next ROI Date calculation
  let nextRoiDate = null;
  if (activeInvestmentsCount > 0) {
    const earliestInvestment = [...activeInvestmentsList].sort((a, b) => new Date(a.investmentDate) - new Date(b.investmentDate))[0];
    const startDate = earliestInvestment.investmentDate ? new Date(earliestInvestment.investmentDate) : new Date();
    
    // One month anniversary
    const oneMonthLater = new Date(startDate);
    oneMonthLater.setMonth(oneMonthLater.getMonth() + 1);

    const now = new Date();
    if (now < oneMonthLater) {
      nextRoiDate = oneMonthLater;
    } else {
      let candidate = new Date(oneMonthLater);
      while (candidate <= now) {
        candidate.setMonth(candidate.setMonth(candidate.getMonth() + 1));
      }
      nextRoiDate = candidate;
    }
  }

  const formatDateToDDMMMYYYY = (date) => {
    if (!date) return '—';
    const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
    const day = String(date.getDate()).padStart(2, '0');
    const monthStr = months[date.getMonth()];
    const year = date.getFullYear();
    return `${day} ${monthStr} ${year}`;
  };

  const nextRoiDateFormatted = nextRoiDate ? formatDateToDDMMMYYYY(nextRoiDate) : '—';

  // 2) Batch 2: parallel fetch secondary resources dependent on clientCode and projects
  const clientCode = clientUser ? clientUser.clientCode : '';
  const projectIds = activeInvestmentsList.map(inv => inv.projectId).filter(Boolean);
  const agentUser = clientUser && clientUser.assignedAgent ? clientUser.assignedAgent : null;

  const [payoutsCount, clientPayouts, agentProfile, projectsList] = await Promise.all([
    clientCode ? Payout.countDocuments({ recipientId: clientCode, status: 'paid' }) : Promise.resolve(0),
    clientCode ? Payout.find({ recipientId: clientCode, recipientType: 'Client Return (ROI)' }).sort({ payoutDate: -1 }).lean() : Promise.resolve([]),
    agentUser ? AgentProfile.findOne({ userId: agentUser._id }).lean() : Promise.resolve(null),
    projectIds.length > 0 ? Project.find({ _id: { $in: projectIds } }).lean() : Promise.resolve([])
  ]);

  // Wealth Advisor details
  let wealthAdvisor = null;
  if (agentUser) {
    wealthAdvisor = {
      name: agentUser.name,
      code: agentUser.clientCode || 'AGT-007',
      phone: agentProfile ? agentProfile.phone : '',
      email: agentUser.email || '',
      role: 'Wealth Advisor',
      whatsAppLink: agentProfile && agentProfile.phone ? `https://wa.me/91${agentProfile.phone.replace(/[^0-9]/g, '')}` : ''
    };
  }

  // Live Portfolio
  const livePortfolio = activeInvestmentsList.map(inv => {
    const project = projectsList.find(p => String(p._id) === String(inv.projectId)) || null;
    return {
      investmentId: inv._id,
      investmentAmount: inv.investmentAmount,
      projectName: project ? project.name : (inv.projectId ? 'Project Deal' : 'Unallocated Portfolio'),
      segment: project ? project.segment : (inv.segment || 'Unallocated'),
      status: project ? project.status : 'Active',
      milestoneProgress: project ? project.milestoneProgress : 99,
      health: project ? project.health : 'On Track',
      bannerImage: project ? project.bannerImage : '',
      summary: project ? project.summary : '',
      currentUpdate: project ? project.currentUpdate : 'Portfolio performance is normal and on track.'
    };
  });

  // Stepper Journey
  const steps = [
    { step: 1, label: 'Account Created', completed: true, isCompleted: true, status: 'completed' },
    { step: 2, label: 'Onboarding Details', completed: !!(profile.phone && profile.address), isCompleted: !!(profile.phone && profile.address), status: (profile.phone && profile.address) ? 'completed' : 'pending' },
    { step: 3, label: 'KYC Submitted', completed: !!(profile.panNumber && profile.aadhaarNumber), isCompleted: !!(profile.panNumber && profile.aadhaarNumber), status: (profile.panNumber && profile.aadhaarNumber) ? 'completed' : 'pending' },
    { step: 4, label: 'Agreement Signed', completed: !!profile.agreementDocument, isCompleted: !!profile.agreementDocument, status: profile.agreementDocument ? 'completed' : 'pending' },
    { step: 5, label: 'First Investment', completed: investments.length > 0, isCompleted: investments.length > 0, status: investments.length > 0 ? 'completed' : 'pending' },
    { step: 6, label: 'ROI Configured', completed: activeInvestmentsCount > 0 || !!profile.monthlyRoi, isCompleted: activeInvestmentsCount > 0 || !!profile.monthlyRoi, status: (activeInvestmentsCount > 0 || !!profile.monthlyRoi) ? 'completed' : 'pending' },
    { step: 7, label: 'First ROI Received', completed: payoutsCount > 0, isCompleted: payoutsCount > 0, status: payoutsCount > 0 ? 'completed' : 'pending' }
  ];

  const completedCount = steps.filter(s => s.completed).length;
  const journeyPercentage = Math.round((completedCount / 7) * 100);

  // Profile complete check
  const isProfileComplete = !!(profile.nomineeName && profile.riskProfile);

  // Asset Allocation
  const segmentAllocationMap = {};
  activeInvestmentsList.forEach(inv => {
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

  const assetAllocation = Object.keys(segmentAllocationMap).map(name => {
    const amount = segmentAllocationMap[name];
    const percentage = totalInvestment > 0 ? Math.round((amount / totalInvestment) * 100) : 0;
    return {
      segment: name,
      amount,
      percentage
    };
  });

  // Historical ROI
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const monthlyRoiMap = Array(12).fill(0);

  clientPayouts.forEach(p => {
    if (p.status === 'paid' && p.payoutDate) {
      const parts = p.payoutDate.split('-');
      if (parts.length === 3) {
        const idx = parseInt(parts[1], 10) - 1;
        if (idx >= 0 && idx < 12) monthlyRoiMap[idx] += (p.amount || 0);
      }
    }
  });

  clientRoiPayouts.forEach(p => {
    const date = p.processedDate ? new Date(p.processedDate) : new Date(p.createdAt);
    monthlyRoiMap[date.getMonth()] += (p.amount || 0);
  });

  const monthlyRoiEarnings = monthNames.map((name, index) => ({
    month: name,
    amount: monthlyRoiMap[index]
  }));

  const recentPayouts = clientPayouts.slice(0, 5).map(p => ({
    id: p._id,
    amount: p.amount,
    date: p.payoutDate,
    paymentMode: p.paymentMode || 'Bank Transfer',
    status: p.status.toUpperCase(),
    refId: p.transactionRefId || '—'
  }));

  return {
    // Flat root-level properties
    totalInvestment,
    totalInvestmentAmount: totalInvestment,
    totalInvestments: totalInvestment,
    activeInvestmentsCount,
    activeProjects: activeInvestmentsCount,
    roiRate,
    roiPercentage: roiRate,
    roi: roiRate,
    roiRateAnnual: roiRate * 12,
    annualRoiRate: roiRate * 12,
    expectedMonthlyRoi,
    monthlyRoi: expectedMonthlyRoi,
    perkTier: (profile.tier || 'GOLD').toUpperCase(),
    nextRoiDate: nextRoiDate ? nextRoiDate.toISOString().split('T')[0] : null,
    nextRoiDateFormatted,
    isProfileComplete,
    profileComplete: isProfileComplete,
    profileCompleted: isProfileComplete,
    onboardingComplete: isProfileComplete,
    journeyPercentage,
    journeyProgress: journeyPercentage,
    progress: journeyPercentage,

    profile: {
      ...profile.toObject(),
      clientCode: clientUser ? clientUser.clientCode : '',
    },
    investments,
    activeInvestments: activeInvestmentsList,
    journey: {
      percentage: journeyPercentage,
      progress: journeyPercentage,
      steps
    },
    livePortfolio,
    assetAllocation,
    monthlyRoiEarnings,
    recentPayouts,
    wealthAdvisor,

    // Nested stats object to cover all frontend fetch patterns
    stats: {
      totalInvestment,
      totalInvestmentAmount: totalInvestment,
      totalInvestments: totalInvestment,
      activeInvestmentsCount,
      activeProjects: activeInvestmentsCount,
      roiRate,
      roiPercentage: roiRate,
      roi: roiRate,
      roiRateAnnual: roiRate * 12,
      annualRoiRate: roiRate * 12,
      expectedMonthlyRoi,
      monthlyRoi: expectedMonthlyRoi,
      perkTier: (profile.tier || 'GOLD').toUpperCase()
    }
  };
};

/**
 * Get logged-in client dashboard details
 * GET /api/client/dashboard
 */
const getClientDashboard = asyncHandler(async (req, res, next) => {
  const dashboardData = await calculateDashboardData(req.user.id);

  res.status(200).json({
    success: true,
    data: dashboardData,
  });
});

/**
 * Get investments list belonging to logged-in client
 * GET /api/client/investments
 */
const getClientInvestments = asyncHandler(async (req, res, next) => {
  const [investments, profile, user] = await Promise.all([
    Investment.find({ clientId: req.user.id }).sort({ investmentDate: -1 }).lean(),
    ClientProfile.findOne({ userId: req.user.id }).lean(),
    User.findById(req.user.id).select('name email clientCode').lean(),
  ]);

  const clientInfo = profile ? {
    ...profile,
    name: user?.name || '',
    email: user?.email || '',
    clientCode: user?.clientCode || '',
    roiPercent: parseFloat(profile.monthlyRoi) || 0,
    roiPercentage: parseFloat(profile.monthlyRoi) || 0,
    monthlyRoi: parseFloat(profile.monthlyRoi) || 0,
  } : null;

  res.status(200).json({
    success: true,
    count: investments.length,
    data: {
      investments,
      client: clientInfo,
    },
    client: clientInfo,
  });
});

/**
 * Get specific investment details (with ownership security check)
 * GET /api/client/investments/:id
 */
const getClientInvestmentById = asyncHandler(async (req, res, next) => {
  const investment = await Investment.findById(req.params.id);

  if (!investment) {
    return next(new AppError('Investment record not found.', 404));
  }

  // Cross-client access restriction check
  if (investment.clientId.toString() !== req.user.id) {
    return next(new AppError('You do not have permission to view this investment record.', 403));
  }

  res.status(200).json({
    success: true,
    data: {
      investment,
    },
  });
});

/**
 * Get logged-in client profile details
 * GET /api/client/profile
 */
const getClientProfile = asyncHandler(async (req, res, next) => {
  const profile = await ClientProfile.findOne({ userId: req.user.id });
  if (!profile) {
    return next(new AppError('Client profile not found.', 404));
  }

  const clientUser = await User.findById(req.user.id).populate('assignedAgent', 'name clientCode');
  let agentInfo = 'Direct Client (No Agent)';
  if (clientUser && clientUser.assignedAgent) {
    agentInfo = `${clientUser.assignedAgent.name} (${clientUser.assignedAgent.clientCode || '—'})`;
  }

  const formatLongDate = (dateVal) => {
    if (!dateVal) return '—';
    const date = new Date(dateVal);
    if (isNaN(date.getTime())) return '—';
    const day = date.getDate();
    const months = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ];
    const month = months[date.getMonth()];
    const year = date.getFullYear();
    return `${day} ${month} ${year}`;
  };

  const profileObj = {
    ...profile.toObject(),
    clientCode: req.user.clientCode || '—',
    clientId: req.user.clientCode || '—',
  };

  res.status(200).json({
    success: true,
    data: {
      profile: profileObj,
      personalInformation: {
        fullName: profile.fullName || req.user.name || '—',
        email: profile.email || req.user.email || '—',
        phone: profile.phone || '—',
        dob: profile.dob ? profile.dob.toISOString().split('T')[0] : '—',
        dobFormatted: formatLongDate(profile.dob),
        address: profile.address || '—',
        emergencyContact: profile.emergencyContact || 'Not provided',
      },
      accountDetails: {
        clientId: req.user.clientCode || '—',
        category: profile.tier ? (profile.tier.charAt(0).toUpperCase() + profile.tier.slice(1).toLowerCase()) : 'Silver',
        status: (profile.status || 'active').toUpperCase(),
        memberSince: req.user.createdAt || profile.createdAt || '—',
        memberSinceFormatted: formatLongDate(req.user.createdAt || profile.createdAt),
        agent: agentInfo,
      },
      nomineeDetails: {
        nomineeName: profile.nomineeName || '—',
        relation: profile.nomineeRelation || '—',
        contact: profile.nomineePhone || '—',
        email: profile.nomineeEmail || 'Not provided',
      },
      riskProfile: {
        riskProfile: profile.riskProfile ? (profile.riskProfile.charAt(0).toUpperCase() + profile.riskProfile.slice(1).toLowerCase()) : 'Moderate',
      }
    },
  });
});

/**
 * Update client's profile details (enforces non-editable field locks)
 * PATCH /api/client/profile
 */
const updateClientProfile = asyncHandler(async (req, res, next) => {
  // Only phone, address, and nominee details can be updated by the client
  const allowedUpdates = [
    'phone',
    'address',
    'emergencyContact',
    'nomineeName',
    'nomineeRelation',
    'nomineePhone',
    'nomineeEmail',
    'nomineeResidency',
  ];

  const updates = {};
  for (const key of Object.keys(req.body)) {
    if (allowedUpdates.includes(key)) {
      updates[key] = req.body[key];
    }
  }

  const profile = await ClientProfile.findOneAndUpdate(
    { userId: req.user.id },
    { $set: updates },
    { new: true, runValidators: true }
  );

  if (!profile) {
    return next(new AppError('Client profile could not be found.', 404));
  }

  const profileObj = {
    ...profile.toObject(),
    clientCode: req.user.clientCode || '—',
    clientId: req.user.clientCode || '—',
  };

  res.status(200).json({
    success: true,
    message: 'Profile updated successfully',
    data: {
      profile: profileObj,
    },
  });
});

/**
 * Get client uploaded documents
 * GET /api/client/documents
 */
const getClientDocuments = asyncHandler(async (req, res, next) => {
  const profile = await ClientProfile.findOne({ userId: req.user.id });
  if (!profile) {
    return next(new AppError('Client profile not found.', 404));
  }

  res.status(200).json({
    success: true,
    data: {
      panDocument: profile.panDocument,
      aadhaarDocument: profile.aadhaarDocument,
      bankProofDocument: profile.bankProofDocument,
      agreementDocument: profile.agreementDocument,
      nomineeProofDocument: profile.nomineeProofDocument,
    },
  });
});

const getClientPayouts = asyncHandler(async (req, res, next) => {
  const clientCode = req.user.clientCode;

  if (!clientCode) {
    return next(new AppError('Client code not found on user record.', 400));
  }

  const payouts = await Payout.find({
    recipientId: clientCode,
    recipientType: 'Client Return (ROI)'
  }).sort({ payoutDate: -1, createdAt: -1 });

  // Calculate metrics
  const totalRecords = payouts.length;
  const paidPayouts = payouts.filter(p => p.status === 'paid').length;
  const pending = payouts.filter(p => p.status === 'pending').length;
  
  const totalReceived = payouts
    .filter(p => p.status === 'paid')
    .reduce((sum, p) => sum + p.amount, 0);

  // Formatted records
  const formattedPayouts = payouts.map(p => {
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
      console.error('[getClientPayouts] Error formatting period:', e.message);
    }

    return {
      _id: p._id,
      recipientType: p.recipientType,
      recipientId: p.recipientId,
      amount: p.amount,
      payoutDate: p.payoutDate,
      paymentMode: p.paymentMode || '—',
      transactionRefId: p.transactionRefId || '—',
      status: p.status === 'paid' ? 'PAID' : 'PENDING',
      paidAt: p.paidAt ? p.paidAt.toISOString().split('T')[0] : '—',
      period: periodFormatted
    };
  });

  res.status(200).json({
    success: true,
    metrics: {
      totalRecords,
      paidPayouts,
      pending,
      totalReceived,
    },
    payouts: formattedPayouts,
  });
});

const getClientWealthAdvisor = asyncHandler(async (req, res, next) => {
  const userId = req.user.id;

  const clientUser = await User.findById(userId).populate('assignedAgent').lean();
  if (!clientUser) {
    return next(new AppError('Client user not found', 404));
  }

  let wealthAdvisor = null;
  if (clientUser.assignedAgent) {
    const agentUser = clientUser.assignedAgent;
    const agentProfile = await AgentProfile.findOne({ userId: agentUser._id }).lean();
    wealthAdvisor = {
      name: agentUser.name,
      code: agentUser.clientCode || 'AGT-007',
      phone: agentProfile ? agentProfile.phone : '',
      email: agentUser.email || '',
      role: 'Wealth Advisor',
      whatsAppLink: agentProfile && agentProfile.phone ? `https://wa.me/91${agentProfile.phone.replace(/[^0-9]/g, '')}` : ''
    };
  }

  res.status(200).json({
    success: true,
    data: wealthAdvisor
  });
});

module.exports = {
  calculateDashboardData,
  getClientDashboard,
  getClientInvestments,
  getClientInvestmentById,
  getClientProfile,
  updateClientProfile,
  getClientDocuments,
  getClientPayouts,
  getClientWealthAdvisor,
};
