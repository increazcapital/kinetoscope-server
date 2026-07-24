
const financialsService = require('../../services/client-financials.service');
const clientDetailsService = require('../../services/client-details.service');
const perksService = require('../../services/perks.service');
const ClientProfile = require('../../models/ClientProfile.model');
const User = require('../../models/User.model');
const Investment = require('../../models/Investment.model');
const Transaction = require('../../models/Transaction.model');
const ClientPerk = require('../../models/ClientPerk.model');
const Perk = require('../../models/Perk.model');
const { sendRoiPayoutNotification } = require('../../services/email.service');
const asyncHandler = require('../../utils/asyncHandler');
const AppError = require('../../utils/AppError');
const { ROLES } = require('../../constants/roles');

const verifyAgentClientAccess = async (clientId, agentId) => {
  const clientUser = await User.findById(clientId);
  if (!clientUser || clientUser.role !== ROLES.CLIENT) {
    throw new AppError('Client not found.', 404);
  }
  if (!clientUser.assignedAgent || clientUser.assignedAgent.toString() !== agentId.toString()) {
    throw new AppError('Access Denied. This client is not assigned to you.', 403);
  }
};

/**
 * Get client investments tab data
 * GET /api/super-admin/clients/:id/investments
 */
const getClientInvestmentsTab = asyncHandler(async (req, res, next) => {
  if (req.user.role === ROLES.AGENT) {
    await verifyAgentClientAccess(req.params.id, req.user.id);
  }
  const data = await financialsService.getInvestmentsTab(req.params.id);

  res.status(200).json({
    success: true,
    message: 'Client investments retrieved successfully',
    data,
  });
});

/**
 * Get client ROI tab data
 * GET /api/super-admin/clients/:id/roi
 */
const getClientRoiTab = asyncHandler(async (req, res, next) => {
  if (req.user.role === ROLES.AGENT) {
    await verifyAgentClientAccess(req.params.id, req.user.id);
  }
  const data = await financialsService.getRoiTab(req.params.id);

  res.status(200).json({
    success: true,
    message: 'Client ROI payouts retrieved successfully',
    data,
  });
});

/**
 * Mark a client's pending ROI payout as paid
 * PATCH /api/super-admin/clients/:id/roi/:payoutId/pay
 */
const markRoiPaid = asyncHandler(async (req, res, next) => {
  const { id: clientId, payoutId } = req.params;

  const updatedPayout = await financialsService.payRoiPayout(clientId, payoutId);

  // Send automated email notification
  try {
    const clientUser = await User.findById(clientId);
    if (clientUser && clientUser.email) {
      let agentEmail = null;
      if (clientUser.assignedAgent) {
        const agent = await User.findById(clientUser.assignedAgent);
        if (agent) agentEmail = agent.email;
      }

      sendRoiPayoutNotification(
        clientUser.email,
        clientUser.name,
        agentEmail,
        updatedPayout
      ).catch((err) =>
        console.error('[ROI Notification Error]:', err.message)
      );
    }
  } catch (error) {
    console.error('[ROI Notification Processing Error]:', error.message);
  }

  res.status(200).json({
    success: true,
    message: 'ROI payout marked as PAID successfully',
    data: {
      payout: updatedPayout,
    },
  });
});

/**
 * Get client documents tab data
 * GET /api/super-admin/clients/:id/documents
 */
const getClientDocumentsTab = asyncHandler(async (req, res, next) => {
  if (req.user.role === ROLES.AGENT) {
    await verifyAgentClientAccess(req.params.id, req.user.id);
  }
  const documentsData = await clientDetailsService.getClientDocumentsData(req.params.id);

  res.status(200).json({
    success: true,
    message: 'Client documents retrieved successfully',
    data: documentsData,
  });
});

/**
 * Get client perks tab data
 * GET /api/super-admin/clients/:id/perks
 */
const getClientPerksTab = asyncHandler(async (req, res, next) => {
  const clientId = req.params.id;
  if (req.user.role === ROLES.AGENT) {
    await verifyAgentClientAccess(clientId, req.user.id);
  }

  const [user, investments, approvedDeposits, assignments, profile, allDbPerks] = await Promise.all([
    User.findById(clientId),
    Investment.find({ clientId }).lean(),
    Transaction.find({ clientId, type: 'deposit', status: 'approved' }).lean(),
    ClientPerk.find({ clientId })
      .populate({
        path: 'perkId',
        select: 'title description tier minInvestment status',
      })
      .sort({ createdAt: -1 }),
    ClientProfile.findOne({ userId: clientId }),
    Perk.find({ status: 'active' }).lean(),
  ]);

  if (!user) {
    return next(new AppError('Client profile not found.', 404));
  }

  const validInvestments = (investments || []).filter(inv => inv.status !== 'cancelled');
  const invTotal = validInvestments.reduce((sum, inv) => sum + (inv.investmentAmount || 0), 0);
  const depTotal = (approvedDeposits || []).reduce((sum, tx) => sum + (tx.amount || 0), 0);
  const totalInvestment = Math.max(invTotal, depTotal);

  let investmentTier = 'SILVER';
  if (totalInvestment >= 5000000) investmentTier = 'DIAMOND';
  else if (totalInvestment >= 1500000) investmentTier = 'PLATINUM';
  else if (totalInvestment >= 500000) investmentTier = 'GOLD';

  const tierWeights = { SILVER: 1, GOLD: 2, PLATINUM: 3, DIAMOND: 4 };
  const profileTier = profile ? (profile.tier || 'SILVER').toUpperCase() : 'SILVER';
  let currentTier = 'SILVER';
  let maxWeight = tierWeights[investmentTier];

  if (profileTier && tierWeights[profileTier] > maxWeight) {
    maxWeight = tierWeights[profileTier];
    currentTier = profileTier;
  }

  const activeAssignedPerks = assignments
    .map(assign => assign.perkId)
    .filter(perk => perk && (perk.status || 'active').toLowerCase() === 'active');

  activeAssignedPerks.forEach(p => {
    const t = (p.tier || 'SILVER').toUpperCase();
    if (tierWeights[t] > maxWeight) {
      maxWeight = tierWeights[t];
      currentTier = t;
    }
  });

  const tierPerksFromDb = allDbPerks.filter(p => (p.tier || '').toUpperCase() === currentTier);

  const defaultBenefitsMap = {
    SILVER: [
      { title: 'Monthly investment reports', description: 'Standard monthly performance statement' },
      { title: 'Email support (24hr response)', description: 'Standard email help desk access' },
      { title: 'Basic portfolio insights', description: 'Access to view portfolio growth details' }
    ],
    GOLD: [
      { title: 'All Silver benefits', description: 'Includes all lower tier benefits' },
      { title: 'Priority support (12hr response)', description: 'Faster help desk ticket processing' },
      { title: 'Quarterly investment review call', description: 'One-on-one portfolio review call each quarter' },
      { title: 'Early access to new projects', description: 'Priority access to upcoming investment projects' }
    ],
    PLATINUM: [
      { title: 'All Gold benefits', description: 'Includes all lower tier benefits' },
      { title: 'Dedicated relationship manager', description: 'Direct contact point for all operations' },
      { title: 'Exclusive event invitations', description: 'VIP invites to company galas and screenings' },
      { title: 'Bonus eligibility (annual)', description: 'Eligible for annual investment bonus' }
    ],
    DIAMOND: [
      { title: 'All Platinum benefits', description: 'Includes all lower tier benefits' },
      { title: 'VIP concierge service', description: 'White-glove treatment for deposits/withdrawals' },
      { title: 'Board-level investment insights', description: 'Quarterly reports directly from executives' }
    ]
  };

  const assignedPerkTitles = activeAssignedPerks.map(perk => ({
    title: perk.title,
    description: perk.description,
    tier: perk.tier || currentTier,
    isCustom: true
  }));

  const dbTierPerkTitles = tierPerksFromDb.map(perk => ({
    title: perk.title,
    description: perk.description,
    tier: perk.tier || currentTier,
    isCustom: false
  }));

  const perkTitleSet = new Set();
  const allPerksCombined = [];

  const rawList = (assignedPerkTitles.length > 0 || dbTierPerkTitles.length > 0)
    ? [...assignedPerkTitles, ...dbTierPerkTitles]
    : (defaultBenefitsMap[currentTier] || []);

  rawList.forEach(p => {
    if (p && p.title && !perkTitleSet.has(p.title.toLowerCase())) {
      perkTitleSet.add(p.title.toLowerCase());
      allPerksCombined.push(p);
    }
  });

  res.status(200).json({
    success: true,
    message: 'Client perks retrieved successfully',
    data: {
      currentTier,
      totalInvestment,
      perks: allPerksCombined,
    },
  });
});

module.exports = {
  getClientInvestmentsTab,
  getClientRoiTab,
  markRoiPaid,
  getClientDocumentsTab,
  getClientPerksTab,
};
