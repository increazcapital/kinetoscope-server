const User = require('../models/User.model');
const ClientProfile = require('../models/ClientProfile.model');
const Investment = require('../models/Investment.model');
const { ROLES } = require('../constants/roles');

/**
 * Service to aggregate, filter, and fetch client data for the reporting and management screens.
 *
 * @param {Object} params
 * @param {string} params.search - Search term matching client name, email, or code
 * @param {string} params.status - ClientProfile status filter (active, inactive, suspended)
 * @param {string} params.tier - ClientProfile tier filter (DIAMOND, PLATINUM, GOLD, SILVER)
 * @param {number} params.page - Current page number
 * @param {number} params.limit - Max items per page
 * @param {boolean} params.bypassPagination - True to fetch all records (for CSV exports)
 * @returns {Promise<Object>} Object containing aggregated clients array and the total count matching filters
 */
const getManageClientsData = async ({
  search,
  status,
  tier,
  residencyStatus,
  page = 1,
  limit = 10,
  bypassPagination = false,
}) => {
  const profileFilter = {};
  if (status && status !== 'All Statuses' && status !== 'All Clients') {
    profileFilter.status = status.toLowerCase();
  }
  if (tier && tier !== 'All Tiers') {
    profileFilter.tier = tier.toUpperCase();
  }
  if (residencyStatus && residencyStatus !== 'All Residency') {
    profileFilter.residencyStatus = residencyStatus;
  }

  let clientUserIds = null;
  if (status || tier || residencyStatus) {
    const matchingProfiles = await ClientProfile.find(profileFilter, { userId: 1 });
    clientUserIds = matchingProfiles.map(p => p.userId);
    // If filters are selected and no clients match, short-circuit
    if (clientUserIds.length === 0) {
      return { clients: [], total: 0 };
    }
  }

  // Build user query targeting role=client
  const userQuery = { role: ROLES.CLIENT };
  if (clientUserIds !== null) {
    userQuery._id = { $in: clientUserIds };
  }

  if (search) {
    userQuery.$or = [
      { name: { $regex: search, $options: 'i' } },
      { email: { $regex: search, $options: 'i' } },
      { clientCode: { $regex: search, $options: 'i' } },
    ];
  }

  let query = User.find(userQuery).populate('assignedAgent', 'name email clientCode');

  if (!bypassPagination) {
    const skip = (Number(page) - 1) * Number(limit);
    query = query.skip(skip).limit(Number(limit));
  }

  // Sort by newest first and count total matching documents in parallel
  const [users, total] = await Promise.all([
    query.sort({ createdAt: -1 }).lean(),
    User.countDocuments(userQuery)
  ]);

  const userIds = users.map(u => u._id);

  // Fetch client profiles and all investments for these clients in bulk in parallel
  const [profiles, allInvestments] = await Promise.all([
    ClientProfile.find({ userId: { $in: userIds } }).lean(),
    Investment.find({ clientId: { $in: userIds } }).lean()
  ]);

  const profileMap = {};
  profiles.forEach(p => {
    profileMap[p.userId.toString()] = p;
  });

  const investmentsMap = {};
  userIds.forEach(id => {
    investmentsMap[id.toString()] = [];
  });
  allInvestments.forEach(inv => {
    const cidStr = inv.clientId.toString();
    if (investmentsMap[cidStr]) {
      investmentsMap[cidStr].push(inv);
    }
  });

  const clientsData = users.map(user => {
    const userIdStr = user._id.toString();
    const profile = profileMap[userIdStr] || null;
    const investments = investmentsMap[userIdStr] || [];

    // Compute total investment (excluding cancelled status)
    const validInvestments = investments.filter(inv => inv.status !== 'cancelled');
    const totalInvestment = validInvestments.reduce((sum, inv) => sum + inv.investmentAmount, 0);

    // Compute average ROI of active investments, fall back to all valid investments, or 0
    const activeInvestments = investments.filter(inv => inv.status === 'active');
    let roiPercentage = 0;
    if (activeInvestments.length > 0) {
      const roiSum = activeInvestments.reduce((sum, inv) => sum + inv.roiPercentage, 0);
      roiPercentage = Number((roiSum / activeInvestments.length).toFixed(2));
    } else if (validInvestments.length > 0) {
      const roiSum = validInvestments.reduce((sum, inv) => sum + inv.roiPercentage, 0);
      roiPercentage = Number((roiSum / validInvestments.length).toFixed(2));
    }

    return {
      clientId: user.clientCode || '',
      joinDate: user.createdAt,
      contractStartDate: profile ? profile.contractStartDate : null,
      contractEndDate: profile ? profile.contractEndDate : null,
      clientName: user.name,
      email: user.email,
      totalInvestment,
      roiPercentage,
      monthlyRoi: (profile && profile.monthlyRoi !== undefined && profile.monthlyRoi !== null) ? Number(profile.monthlyRoi) : 0,
      tier: profile ? (profile.tier || 'SILVER') : 'SILVER',
      perks: profile ? (profile.tier || 'SILVER') : 'SILVER',
      assignedAgent: user.assignedAgent ? {
        _id: user.assignedAgent._id,
        name: user.assignedAgent.name,
        email: user.assignedAgent.email,
        clientCode: user.assignedAgent.clientCode || '',
      } : null,
      agentCommission: user.assignedAgent ? (profile && profile.agentCommission ? profile.agentCommission : '0.5% monthly') : '—',
      riskProfile: profile ? (profile.riskProfile || 'moderate').toUpperCase() : 'MODERATE',
      residencyStatus: profile ? (profile.residencyStatus || 'National (Domestic)') : 'National (Domestic)',
      status: profile ? (profile.status || 'active').toUpperCase() : 'ACTIVE',
    };
  });

  return { clients: clientsData, total };
};

module.exports = {
  getManageClientsData,
};
