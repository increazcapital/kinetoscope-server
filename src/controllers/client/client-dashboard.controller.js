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
  // Fetch client user to get clientCode
  const clientUser = await User.findById(userId).populate('assignedAgent').lean();
  const clientCode = clientUser ? clientUser.clientCode : '';

  // 1) Batch 1: parallel fetch primary resources (querying by userId OR clientCode)
  const Transaction = require('../../models/Transaction.model');
  const [profile, rawInvestments, clientRoiPayouts, approvedDeposits, approvedWithdrawals] = await Promise.all([
    ClientProfile.findOne({ userId }),
    Investment.find({
      $or: [{ clientId: userId }, ...(clientCode ? [{ clientCode }] : [])]
    }).sort({ investmentDate: -1 }).lean(),
    RoiPayout.find({ clientId: userId, status: 'PAID' }).sort({ processedDate: -1 }).lean(),
    Transaction.find({
      $or: [{ clientId: userId }, ...(clientCode ? [{ clientCode }] : [])],
      type: 'deposit',
      status: 'approved'
    }).lean(),
    Transaction.find({
      $or: [{ clientId: userId }, ...(clientCode ? [{ clientCode }] : [])],
      type: 'withdrawal',
      status: 'approved'
    }).lean()
  ]);

  if (!profile) {
    throw new AppError('Client profile could not be found for the specified user.', 404);
  }

  // Filter out cancelled investments for the totals
  const validInvestments = rawInvestments.filter(inv => inv.status !== 'cancelled');
  const investmentsSum = validInvestments.reduce((sum, inv) => sum + (inv.investmentAmount || 0), 0);
  const approvedDepositsSum = approvedDeposits.reduce((sum, tx) => sum + (tx.amount || 0), 0);
  const capitalWithdrawalsSum = approvedWithdrawals.filter(w => w.withdrawalType === 'capital').reduce((sum, tx) => sum + (tx.amount || 0), 0);
  const roiWithdrawalsSum = approvedWithdrawals.filter(w => w.withdrawalType === 'roi' || String(w.description || w.remarks || '').toLowerCase().includes('roi')).reduce((sum, tx) => sum + (tx.amount || 0), 0);

  const netCapital = Math.max(0, approvedDepositsSum - capitalWithdrawalsSum);

  // If full capital has been withdrawn (or approved capital withdrawals >= deposits), net total investment is 0
  const isFullCapitalWithdrawn = capitalWithdrawalsSum >= approvedDepositsSum && approvedDepositsSum > 0;
  const totalInvestment = isFullCapitalWithdrawn ? 0 : Math.max(investmentsSum, netCapital);

  // Define effective investments array (with fallback for clients with capital but no segment allocations yet)
  const roiRateVal = parseFloat(profile.monthlyRoi) || 1.5;
  const investments = rawInvestments.length > 0 ? rawInvestments : (totalInvestment > 0 ? [{
    _id: `synth_inv_${userId}`,
    clientId: userId,
    clientName: clientUser?.name || profile?.fullName || 'Client',
    clientCode: clientUser?.clientCode || '',
    segment: 'Capital Deposit',
    projectName: 'Unallocated',
    investmentAmount: totalInvestment,
    roiPercentage: roiRateVal,
    riskPercentage: 0,
    riskLevel: 'Medium',
    investmentDate: profile?.createdAt || new Date(),
    status: 'active',
    remarks: 'Primary capital allocation'
  }] : []);

  // Active investments calculations
  const activeInvestmentsList = rawInvestments.filter(inv => inv.status === 'active');
  const activeInvestmentsCount = activeInvestmentsList.length > 0 ? activeInvestmentsList.length : (totalInvestment > 0 ? 1 : 0);

  // Average ROI rate of active investments
  let roiRate = parseFloat(profile.monthlyRoi) || 0;
  if (activeInvestmentsList.length > 0) {
    const roiSum = activeInvestmentsList.reduce((sum, inv) => sum + (inv.roiPercentage || 0), 0);
    roiRate = Number((roiSum / activeInvestmentsList.length).toFixed(2));
  }

  // Monthly expected return amount calculation
  let expectedMonthlyRoi = 0;
  if (activeInvestmentsList.length > 0) {
    activeInvestmentsList.forEach(inv => {
      const rate = inv.roiPercentage || parseFloat(profile.monthlyRoi) || 0;
      expectedMonthlyRoi += (inv.investmentAmount || 0) * (rate / 100);
    });
  } else if (totalInvestment > 0 && roiRate > 0) {
    expectedMonthlyRoi = (totalInvestment * roiRate) / 100;
  }
  expectedMonthlyRoi = Math.round(expectedMonthlyRoi);

  // Next ROI Date calculation
  let nextRoiDate = null;
  if (activeInvestmentsCount > 0 && activeInvestmentsList.length > 0) {
    const validInvList = activeInvestmentsList.filter(Boolean);
    if (validInvList.length > 0) {
      const earliestInvestment = [...validInvList].sort((a, b) => new Date(a.investmentDate || a.createdAt || 0) - new Date(b.investmentDate || b.createdAt || 0))[0];
      const startDate = (earliestInvestment && earliestInvestment.investmentDate) ? new Date(earliestInvestment.investmentDate) : new Date();
      
      const oneMonthLater = new Date(startDate);
      oneMonthLater.setMonth(oneMonthLater.getMonth() + 1);

      const now = new Date();
      if (now < oneMonthLater) {
        nextRoiDate = oneMonthLater;
      } else {
        let candidate = new Date(oneMonthLater);
        while (candidate <= now) {
          candidate.setMonth(candidate.getMonth() + 1);
        }
        nextRoiDate = candidate;
      }
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

  const recentPayouts = clientPayouts.slice(0, 5).map(p => {
    const pDate = p.payoutDate ? new Date(p.payoutDate) : new Date(p.createdAt || Date.now());
    const monthStr = !isNaN(pDate.getTime())
      ? pDate.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })
      : 'Jul 2026';
    return {
      id: p._id,
      _id: p._id,
      month: p.month || p.payoutMonth || p.period || monthStr,
      payoutMonth: p.payoutMonth || p.month || monthStr,
      period: p.period || p.month || monthStr,
      amount: p.amount,
      received: p.amount,
      expected: p.amount,
      date: p.payoutDate || p.createdAt,
      paidAt: p.payoutDate || p.createdAt,
      processedDate: p.payoutDate || p.createdAt,
      paymentMode: p.paymentMode || 'Bank Transfer',
      status: p.status ? p.status.toUpperCase() : 'PAID',
      refId: p.transactionRefId || '—'
    };
  });

  const totalRoiPaidVal = clientRoiPayouts.reduce((sum, p) => sum + Number(p.amount || 0), 0);
  const netRoiReceivedVal = Math.max(0, totalRoiPaidVal - roiWithdrawalsSum);

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
    roiReceived: netRoiReceivedVal,
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
    roiHistory: recentPayouts,
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
      roiReceived: netRoiReceivedVal,
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
  const Transaction = require('../../models/Transaction.model');
  const [profile, user] = await Promise.all([
    ClientProfile.findOne({ userId: req.user.id }).lean(),
    User.findById(req.user.id).select('name email clientCode').lean(),
  ]);

  const clientCode = user ? user.clientCode : '';
  const [rawInvestments, approvedDeposits] = await Promise.all([
    Investment.find({
      $or: [{ clientId: req.user.id }, ...(clientCode ? [{ clientCode }] : [])]
    }).sort({ investmentDate: -1 }).lean(),
    Transaction.find({
      $or: [{ clientId: req.user.id }, ...(clientCode ? [{ clientCode }] : [])],
      type: 'deposit',
      status: 'approved'
    }).sort({ updatedAt: -1 }).lean()
  ]);

  let effectiveInvestments = [...rawInvestments];
  const totalFromInvs = rawInvestments.filter(inv => inv.status !== 'cancelled').reduce((sum, inv) => sum + (inv.investmentAmount || 0), 0);
  const profileTotal = profile ? (profile.totalInvestment || 0) : 0;
  const depositsTotal = approvedDeposits.reduce((sum, tx) => sum + (tx.amount || 0), 0);
  const targetTotal = Math.max(totalFromInvs, profileTotal, depositsTotal);

  if (effectiveInvestments.length === 0 && targetTotal > 0) {
    const roiRate = parseFloat(profile?.monthlyRoi) || 1.5;
    effectiveInvestments = [{
      _id: `synth_inv_${req.user.id}`,
      clientId: req.user.id,
      clientName: user?.name || profile?.fullName || 'Client',
      clientCode: user?.clientCode || '',
      segment: 'Capital Deposit',
      projectName: 'Unallocated',
      investmentAmount: targetTotal,
      roiPercentage: roiRate,
      riskPercentage: 0,
      riskLevel: 'Medium',
      investmentDate: profile?.createdAt || new Date(),
      status: 'active',
      remarks: 'Primary capital allocation'
    }];
  }

  const clientInfo = profile ? {
    ...profile,
    totalInvestment: targetTotal,
    name: user?.name || '',
    email: user?.email || '',
    clientCode: user?.clientCode || '',
    roiPercent: parseFloat(profile.monthlyRoi) || 0,
    roiPercentage: parseFloat(profile.monthlyRoi) || 0,
    monthlyRoi: parseFloat(profile.monthlyRoi) || 0,
  } : null;

  res.status(200).json({
    success: true,
    count: effectiveInvestments.length,
    data: {
      investments: effectiveInvestments,
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
        profilePic: profile.profilePic || req.user.profilePic || '',
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
    'profilePic',
  ];

  const updates = {};
  for (const key of Object.keys(req.body)) {
    if (allowedUpdates.includes(key)) {
      updates[key] = req.body[key];
    }
  }

  if (updates.profilePic && updates.profilePic.startsWith('data:image/')) {
    const { uploadBase64ToCloudinary } = require('../../services/cloudinary.service');
    try {
      const cloudinaryUrl = await uploadBase64ToCloudinary(updates.profilePic, 'kinetoscope/clients/avatars');
      if (cloudinaryUrl && (cloudinaryUrl.startsWith('http://') || cloudinaryUrl.startsWith('https://'))) {
        updates.profilePic = cloudinaryUrl;
      } else {
        delete updates.profilePic;
      }
    } catch (err) {
      console.error('[Client Profile Upload] Failed to upload avatar to Cloudinary:', err);
      delete updates.profilePic;
    }
  }

  const profile = await ClientProfile.findOneAndUpdate(
    { userId: req.user.id },
    { $set: updates },
    { new: true, runValidators: true }
  );

  if (updates.profilePic) {
    const User = require('../../models/User.model');
    await User.findByIdAndUpdate(req.user.id, { profilePic: updates.profilePic });
  }

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

const removeClientAvatar = asyncHandler(async (req, res, next) => {
  const profile = await ClientProfile.findOne({ userId: req.user.id });
  if (profile && profile.profilePic) {
    if (profile.profilePic.startsWith('http')) {
      const { deleteFromCloudinary } = require('../../services/cloudinary.service');
      await deleteFromCloudinary(profile.profilePic);
    }
    profile.profilePic = '';
    await profile.save();
  }

  const User = require('../../models/User.model');
  await User.findByIdAndUpdate(req.user.id, { profilePic: '' });

  const profileObj = profile ? {
    ...profile.toObject(),
    clientCode: req.user.clientCode || '—',
    clientId: req.user.clientCode || '—',
  } : {};

  res.status(200).json({
    success: true,
    message: 'Profile picture removed successfully.',
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

/**
 * Upload or update signed agreement document for Client
 * POST /api/client/documents/agreement
 */
const uploadAgreementDocument = asyncHandler(async (req, res, next) => {
  const profile = await ClientProfile.findOne({ userId: req.user.id });
  if (!profile) {
    return next(new AppError('Client profile not found.', 404));
  }

  let file = req.file;
  if (!file && req.files) {
    if (Array.isArray(req.files) && req.files.length > 0) file = req.files[0];
    else if (typeof req.files === 'object') {
      const keys = Object.keys(req.files);
      if (keys.length > 0 && req.files[keys[0]]?.length > 0) file = req.files[keys[0]][0];
    }
  }

  let fileUrl = req.body.fileUrl || '';
  if (file) {
    const { uploadBufferToCloudinary } = require('../../services/cloudinary.service');
    try {
      fileUrl = await uploadBufferToCloudinary(file.buffer, 'kinetoscope/clients/agreements');
    } catch (err) {
      console.error('[Cloudinary Upload Error]', err);
      return next(new AppError(`File upload to Cloudinary failed: ${err.message}`, 500));
    }
  }

  if (!fileUrl) {
    return next(new AppError('Please select or upload a valid agreement document file.', 400));
  }

  const uploadDate = new Date();
  profile.agreementDocument = fileUrl;
  profile.signedAgreementUrl = fileUrl;
  profile.agreementDocumentVerified = false;
  profile.agreementVerified = false;
  profile.contractStartDate = uploadDate;
  
  const calcEndDate = new Date(uploadDate);
  calcEndDate.setMonth(calcEndDate.getMonth() + 18);
  profile.contractEndDate = calcEndDate;
  profile.kycStatus = 'PENDING';
  await profile.save();

  const { sendDocumentUploadedAdminNotification } = require('../../services/email.service');
  sendDocumentUploadedAdminNotification({
    userEmail: req.user.email,
    userName: req.user.name,
    userRole: 'Client',
    userCode: req.user.clientCode,
    uploadedDocLabels: ['Signed Client Participation Agreement'],
  }).catch(err => console.error('[Email Notification] Admin upload notification failed:', err.message));

  res.status(200).json({
    success: true,
    message: 'Signed agreement document uploaded successfully',
    data: {
      agreementDocument: fileUrl,
      url: fileUrl,
    },
  });
});

const uploadKycDocument = asyncHandler(async (req, res, next) => {
  const profile = await ClientProfile.findOne({ userId: req.user.id });
  if (!profile) {
    return next(new AppError('Client profile not found.', 404));
  }

  let file = req.file;
  if (!file && req.files) {
    if (Array.isArray(req.files) && req.files.length > 0) {
      file = req.files[0];
    } else if (typeof req.files === 'object') {
      const keys = Object.keys(req.files);
      if (keys.length > 0 && req.files[keys[0]] && req.files[keys[0]].length > 0) {
        file = req.files[keys[0]][0];
      }
    }
  }

  const docType = req.body.docType || (file ? file.fieldname : null);

  if (!file || !docType) {
    return next(new AppError('No document file received for upload.', 400));
  }

  let url = '';
  try {
    const { uploadBufferToCloudinary } = require('../../services/cloudinary.service');
    url = await uploadBufferToCloudinary(file.buffer, `kinetoscope/clients/${docType}`);
  } catch (err) {
    console.error(`[Client KYC Upload Error] Cloudinary upload failed for ${docType}:`, err);
    return next(new AppError(`Cloudinary file upload failed: ${err.message}`, 500));
  }

  profile[docType] = url;
  if (docType === 'aadhaarDocument') profile.idProofDocument = url;
  profile.kycStatus = 'PENDING';
  profile.agreementVerified = false;
  profile.agreementDocumentVerified = false;
  if (docType === 'agreementDocument') {
    profile.signedAgreementUrl = url;
  }
  await profile.save();

  const docLabels = {
    panDocument: 'PAN Card Document',
    aadhaarDocument: 'ID Proof (Aadhaar / Passport)',
    bankProofDocument: 'Bank Details Document',
    agreementDocument: 'Signed Client Participation Agreement',
    nomineeProofDocument: 'Nominee ID Proof Document',
  };
  const { sendDocumentUploadedAdminNotification } = require('../../services/email.service');
  sendDocumentUploadedAdminNotification({
    userEmail: req.user.email,
    userName: req.user.name,
    userRole: 'Client',
    userCode: req.user.clientCode,
    uploadedDocLabels: [docLabels[docType] || docType],
  }).catch(err => console.error('[Email Notification] Admin upload notification failed:', err.message));

  return res.status(200).json({
    success: true,
    message: 'Document uploaded successfully to Cloudinary',
    data: { url, [docType]: url }
  });
});

module.exports = {
  calculateDashboardData,
  getClientDashboard,
  getClientInvestments,
  getClientInvestmentById,
  getClientProfile,
  updateClientProfile,
  removeClientAvatar,
  getClientDocuments,
  uploadAgreementDocument,
  uploadKycDocument,
  getClientPayouts,
  getClientWealthAdvisor,
};
