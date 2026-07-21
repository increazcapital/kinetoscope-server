const User = require('../../models/User.model');
const ClientProfile = require('../../models/ClientProfile.model');
const AgentProfile = require('../../models/AgentProfile.model');
const Investment = require('../../models/Investment.model');
const Transaction = require('../../models/Transaction.model');
const Payout = require('../../models/Payout.model');
const RoiPayout = require('../../models/RoiPayout.model');
const asyncHandler = require('../../utils/asyncHandler');
const { ROLES } = require('../../constants/roles');

/**
 * Get Super Admin Dashboard analytics data
 * GET /api/super-admin/dashboard/analytics
 */
const getAdminDashboard = asyncHandler(async (req, res, next) => {
  // 1) Gather basic counts in parallel
  const [
    totalClientsCount,
    totalAgentsCount,
    pendingApprovalsCount,
    activeInvestmentsCount,
    allClients,
    allAgents,
    activeInvestmentsList,
    allTransactions,
    paidRoiPayouts,
    paidPayouts,
    approvedDepositsList
  ] = await Promise.all([
    User.countDocuments({ role: ROLES.CLIENT }),
    User.countDocuments({ role: ROLES.AGENT }),
    Transaction.countDocuments({ status: 'pending' }),
    Investment.countDocuments({ status: 'active' }),
    User.find({ role: ROLES.CLIENT }).lean(),
    User.find({ role: ROLES.AGENT }).lean(),
    Investment.find({ status: 'active' }).lean(),
    Transaction.find().sort({ createdAt: -1 }).limit(100).lean(),
    RoiPayout.find({ status: 'PAID' }).lean(),
    Payout.find({ recipientType: 'Client Return (ROI)', status: 'paid' }).lean(),
    Transaction.find({ type: 'deposit', status: 'approved' }).lean()
  ]);

  // 2) Calculate total investment amount
  const invSum = activeInvestmentsList.reduce((sum, inv) => sum + (inv.investmentAmount || 0), 0);
  const depSum = (approvedDepositsList || []).reduce((sum, tx) => sum + (tx.amount || 0), 0);
  const totalInvestmentAmount = Math.max(invSum, depSum);

  // 3) Calculate total ROI paid
  let totalRoiPaid = 0;
  paidRoiPayouts.forEach(p => totalRoiPaid += (p.amount || 0));
  paidPayouts.forEach(p => totalRoiPaid += (p.amount || 0));

  // 4) Investment by Segment (Pie Chart / Donut Chart)
  // Aggregate active allocations across the 6 main segments:
  // - Film Making, Distribution, Music, Trading & Syndication, Content IP Bank, Film Exhibition
  const defaultSegments = {
    'Film Making': 0,
    'Distribution': 0,
    'Music': 0,
    'Trading & Syndication': 0,
    'Content IP Bank': 0,
    'Film Exhibition': 0
  };

  let aggregatedSegmentSum = 0;
  activeInvestmentsList.forEach(inv => {
    const amt = inv.investmentAmount || 0;
    if (inv.segmentAllocation && inv.segmentAllocation.length > 0) {
      inv.segmentAllocation.forEach(alloc => {
        const name = alloc.segmentName;
        const pct = alloc.allocationPercentage || 0;
        const allocatedAmt = amt * (pct / 100);
        if (defaultSegments[name] !== undefined) {
          defaultSegments[name] += allocatedAmt;
        } else {
          defaultSegments[name] = (defaultSegments[name] || 0) + allocatedAmt;
        }
        aggregatedSegmentSum += allocatedAmt;
      });
    } else if (inv.segment) {
      const name = inv.segment;
      if (defaultSegments[name] !== undefined) {
        defaultSegments[name] += amt;
      } else {
        defaultSegments[name] = (defaultSegments[name] || 0) + amt;
      }
      aggregatedSegmentSum += amt;
    }
  });

  // Calculate percentages (no mock fallbacks, only real data)
  const segmentsData = Object.keys(defaultSegments).map(name => {
    const amount = defaultSegments[name];
    let percentage = 0;
    if (aggregatedSegmentSum > 0) {
      percentage = Math.round((amount / aggregatedSegmentSum) * 100);
    }
    return {
      segment: name,
      amount: Math.round(amount),
      percentage
    };
  });

  // 5) Monthly Investment Inflow, ROI Trends, & Withdrawal flow (FY 2025 / 12-Month logs)
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  
  // Initialize monthly buckets
  const monthlyInflowMap = Array(12).fill(0);
  const monthlyRoiMap = Array(12).fill(0);
  const monthlyWithdrawalMap = Array(12).fill(0);

  // Group active investments by month
  activeInvestmentsList.forEach(inv => {
    const date = inv.investmentDate ? new Date(inv.investmentDate) : new Date();
    const monthIndex = date.getMonth();
    monthlyInflowMap[monthIndex] += (inv.investmentAmount || 0);
  });

  // Group paid ROI payouts by month
  paidRoiPayouts.forEach(p => {
    // Expected format "Jan 2025" or parsed Date
    let monthIndex = new Date().getMonth();
    if (p.payoutMonth) {
      const part = p.payoutMonth.split(' ')[0];
      const idx = monthNames.indexOf(part);
      if (idx !== -1) monthIndex = idx;
    } else if (p.processedDate) {
      monthIndex = new Date(p.processedDate).getMonth();
    }
    monthlyRoiMap[monthIndex] += (p.amount || 0);
  });
  paidPayouts.forEach(p => {
    if (p.payoutDate) {
      const parts = p.payoutDate.split('-');
      if (parts.length === 3) {
        const monthIndex = parseInt(parts[1], 10) - 1;
        if (monthIndex >= 0 && monthIndex < 12) {
          monthlyRoiMap[monthIndex] += (p.amount || 0);
        }
      }
    } else if (p.paidAt) {
      monthlyRoiMap[new Date(p.paidAt).getMonth()] += (p.amount || 0);
    }
  });

  // Group approved withdrawals by month
  allTransactions.forEach(tx => {
    if (tx.status === 'approved' && tx.type === 'withdrawal') {
      const date = tx.actionAt ? new Date(tx.actionAt) : new Date(tx.createdAt);
      monthlyWithdrawalMap[date.getMonth()] += (tx.amount || 0);
    }
  });

  // Build chart timeline payload
  const monthlyCharts = monthNames.map((name, index) => ({
    month: name,
    inflow: monthlyInflowMap[index],
    inflows: monthlyInflowMap[index],
    investment: monthlyInflowMap[index],
    investments: monthlyInflowMap[index],
    roiPaid: monthlyRoiMap[index],
    roi: monthlyRoiMap[index],
    roiAmount: monthlyRoiMap[index],
    withdrawal: monthlyWithdrawalMap[index],
    withdrawals: monthlyWithdrawalMap[index]
  }));

  // 6) Agent Performance & Contribution rankings
  const agentPerformanceList = [];
  for (const agent of allAgents) {
    // Count active clients assigned to this agent
    const assignedClients = allClients.filter(c => String(c.assignedAgent) === String(agent._id));
    const clientIds = assignedClients.map(c => String(c._id));

    // Sum client investment amount
    const clientInvestments = activeInvestmentsList.filter(inv => clientIds.includes(String(inv.clientId)));
    const totalVolume = clientInvestments.reduce((sum, inv) => sum + (inv.investmentAmount || 0), 0);

    agentPerformanceList.push({
      agentId: agent._id,
      name: agent.name,
      agentName: agent.name,
      code: agent.clientCode || 'AGT-XXX',
      agentCode: agent.clientCode || 'AGT-XXX',
      clientsCount: assignedClients.length,
      clientCount: assignedClients.length,
      totalClients: assignedClients.length,
      investmentVolume: totalVolume,
      totalInvestment: totalVolume,
      totalVolume,
      amount: totalVolume,
      value: totalVolume
    });
  }

  // Sort by investment volume descending
  agentPerformanceList.sort((a, b) => b.investmentVolume - a.investmentVolume);

  // Take top 10 for contribution chart
  const topAgentsContribution = agentPerformanceList.slice(0, 10).map(agent => ({
    name: agent.name,
    agentName: agent.name,
    code: agent.code,
    agentCode: agent.code,
    amount: agent.investmentVolume,
    value: agent.investmentVolume,
    investmentVolume: agent.investmentVolume,
    totalInvestment: agent.investmentVolume,
    totalVolume: agent.investmentVolume
  }));

  // 7) Top Investors List
  const investorPerformanceMap = {};
  activeInvestmentsList.forEach(inv => {
    const key = String(inv.clientId);
    if (!investorPerformanceMap[key]) {
      investorPerformanceMap[key] = {
        name: inv.clientName || 'Unknown',
        code: inv.clientCode || 'KFPL-XXX',
        totalActiveAmt: 0
      };
    }
    investorPerformanceMap[key].totalActiveAmt += (inv.investmentAmount || 0);
  });

  const topInvestorsList = Object.values(investorPerformanceMap)
    .sort((a, b) => b.totalActiveAmt - a.totalActiveAmt)
    .slice(0, 10);

  // 8) Investment Status Donut Split
  const closedInvestmentsCount = await Investment.countDocuments({ status: { $in: ['completed', 'cancelled'] } });
  const pendingDepositsCount = await Transaction.countDocuments({ type: 'deposit', status: 'pending' });

  const investmentStatusSplit = {
    active: activeInvestmentsCount,
    activeInvestments: activeInvestmentsCount,
    pending: pendingDepositsCount,
    pendingDeposits: pendingDepositsCount,
    closed: closedInvestmentsCount,
    closedInvestments: closedInvestmentsCount,
    total: activeInvestmentsCount + pendingDepositsCount + closedInvestmentsCount
  };

  // 9) Recent Activity Feed (compile last 10 actions)
  const recentActivities = [];

  // Track newly onboarded client users
  const sortedClients = [...allClients].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 5);
  sortedClients.forEach(c => {
    recentActivities.push({
      type: 'onboarding',
      message: `New investor ${c.name} onboarded`,
      timestamp: c.createdAt
    });
  });

  // Track recent approved ROI payouts
  const allPaidRois = [...paidRoiPayouts, ...paidPayouts]
    .sort((a, b) => new Date(b.createdAt || b.paidAt) - new Date(a.createdAt || a.paidAt))
    .slice(0, 5);
  allPaidRois.forEach(roi => {
    recentActivities.push({
      type: 'roi_payment',
      message: `ROI payment of ₹${roi.amount.toLocaleString('en-IN')} marked as paid`,
      timestamp: roi.createdAt || roi.paidAt
    });
  });

  // Track recent pending / approved / rejected transactions
  allTransactions.slice(0, 5).forEach(tx => {
    const action = tx.type === 'deposit' ? 'Deposit' : 'Withdrawal';
    recentActivities.push({
      type: tx.type,
      message: `${action} request of ₹${tx.amount.toLocaleString('en-IN')} is ${tx.status}`,
      timestamp: tx.createdAt
    });
  });

  // Sort all activities combined descending and slice top 10
  recentActivities.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  const finalActivitiesFeed = recentActivities.slice(0, 10).map(act => {
    // Relative human-readable time calculation
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

  // 10) Response payload
  res.status(200).json({
    success: true,
    data: {
      // Flat properties at the root of data for direct front-end consumption
      totalInvestors: totalClientsCount,
      totalClients: totalClientsCount,
      totalInvestmentAmount,
      totalInvestment: totalInvestmentAmount,
      totalInvestments: totalInvestmentAmount,
      totalInvestmentsAmount: totalInvestmentAmount,
      totalRoiPaid,
      roiPaid: totalRoiPaid,
      totalAgents: totalAgentsCount,
      pendingApprovals: pendingApprovalsCount,
      activeInvestments: activeInvestmentsCount,
      activeInvestmentsCount,
      pendingApprovalsCount,

      // Nested stats object (for backward compatibility / alternative fetch patterns)
      stats: {
        totalInvestors: totalClientsCount,
        totalClients: totalClientsCount,
        totalInvestmentAmount,
        totalInvestment: totalInvestmentAmount,
        totalInvestments: totalInvestmentAmount,
        totalInvestmentsAmount: totalInvestmentAmount,
        totalRoiPaid,
        roiPaid: totalRoiPaid,
        totalAgents: totalAgentsCount,
        pendingApprovals: pendingApprovalsCount,
        activeInvestments: activeInvestmentsCount,
        activeInvestmentsCount,
        pendingApprovalsCount,
      },

      // Nested banner object (for banner pills)
      banner: {
        activeInvestmentsCount,
        pendingApprovalsCount,
        activeInvestments: activeInvestmentsCount,
        pendingApprovals: pendingApprovalsCount,
      },

      segments: segmentsData,
      monthlyCharts,
      agentPerformance: agentPerformanceList,
      topAgentsContribution,
      topInvestors: topInvestorsList,
      investmentStatus: investmentStatusSplit,
      recentActivity: finalActivitiesFeed
    }
  });
});

module.exports = {
  getAdminDashboard,
};
