/**
 * ROI Scheduler Service
 * Automatically creates monthly ROI payouts for clients and monthly commissions for agents.
 *
 * Runs every hour via setInterval. On each tick:
 *   1. processMonthlyRoiPayouts()  — creates PAID RoiPayout records for every month elapsed since investmentDate
 *   2. processMonthlyAgentCommissions() — creates PENDING AgentCommission records for every month elapsed
 */

const mongoose = require('mongoose');
const Investment = require('../models/Investment.model');
const RoiPayout = require('../models/RoiPayout.model');
const User = require('../models/User.model');
const ClientProfile = require('../models/ClientProfile.model');
const AgentCommission = require('../models/AgentCommission.model');
const CommissionSlab = require('../models/CommissionSlab.model');
const { ROLES } = require('../constants/roles');

const SCHEDULER_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

/**
 * Format a Date to "MMM YYYY" string (e.g. "Oct 2026")
 */
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * Format a Date to "MMM YYYY" string (e.g. "Sep 2026") consistently across all platforms
 */
const formatMonthYear = (date) => {
  const d = new Date(date);
  return `${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`;
};

/**
 * Normalize any month string to 3-letter month (e.g. "Sept 2026" -> "Sep 2026")
 */
const normalizeMonthStr = (str) => {
  if (!str) return '';
  return String(str).replace(/\bSept\b/i, 'Sep').trim();
};

/**
 * Calculate how many full months have elapsed between two dates.
 * A month is "complete" strictly when the day-of-month of `now` >= day-of-month of `startDate`.
 * Example: startDate = 15-Aug-2026, now = 15-Sep-2026 → 1 month elapsed
 *          startDate = 18-Aug-2026, now = 16-Sep-2026 → 0 months elapsed (due in 2 days)
 */
const getElapsedMonths = (startDate, now) => {
  const start = new Date(startDate);
  const current = new Date(now);

  let months = (current.getFullYear() - start.getFullYear()) * 12 + (current.getMonth() - start.getMonth());

  // If the current day hasn't reached the investment day yet, subtract 1
  if (current.getDate() < start.getDate()) {
    months -= 1;
  }

  return Math.max(0, months);
};

/**
 * Get the due date for a specific month offset from the investment date.
 * Strictly preserves the anniversary day while preventing date rollover on month boundaries.
 */
const getDueDateForMonth = (investmentDate, monthOffset) => {
  const start = new Date(investmentDate);
  const targetYear = start.getFullYear() + Math.floor((start.getMonth() + monthOffset) / 12);
  const targetMonth = (start.getMonth() + monthOffset) % 12;
  const originalDay = start.getDate();
  const lastDay = new Date(targetYear, targetMonth + 1, 0).getDate();
  return new Date(targetYear, targetMonth, Math.min(originalDay, lastDay), start.getHours(), start.getMinutes(), start.getSeconds());
};

// ──────────────────────────────────────────────────────────────
// 1. AUTO ROI PAYOUTS FOR CLIENTS
// ──────────────────────────────────────────────────────────────

const processMonthlyRoiPayouts = async () => {
  try {
    // Fetch all active investments
    const activeInvestments = await Investment.find({ status: 'active' }).lean();
    if (activeInvestments.length === 0) return;

    const now = new Date();
    let createdCount = 0;

    for (const inv of activeInvestments) {
      try {
        const investmentDate = new Date(inv.investmentDate);
        if (isNaN(investmentDate.getTime())) continue;

        const clientId = inv.clientId;
        if (!clientId) continue;

        // How many ROI payouts are due?
        const maxMonths = inv.durationMonths || 18;
        const elapsedMonths = getElapsedMonths(investmentDate, now);
        const dueMonths = Math.min(elapsedMonths, maxMonths);

        if (dueMonths <= 0) continue;

        // Fetch client profile to get configured ROI rate
        const [profile, existingPayouts] = await Promise.all([
          ClientProfile.findOne({ userId: clientId }).lean(),
          RoiPayout.find({ clientId }).lean()
        ]);

        // ROI rate: prefer profile.monthlyRoi, fallback to investment.roiPercentage
        const roiRate = (profile && profile.monthlyRoi !== undefined && profile.monthlyRoi !== null && String(profile.monthlyRoi).trim() !== '')
          ? Number(profile.monthlyRoi)
          : (inv.roiPercentage || 0);

        if (roiRate <= 0) continue;

        // Calculate ROI amount for this specific investment
        const roiAmount = Math.round((inv.investmentAmount * roiRate) / 100);
        if (roiAmount <= 0) continue;

        // Build a set of existing payout months for this client to avoid duplicates (normalizing Sept vs Sep)
        const existingMonthSet = new Set(
          existingPayouts.map(p => normalizeMonthStr(p.payoutMonth))
        );

        // Create payouts for each due month that doesn't already exist
        for (let m = 1; m <= dueMonths; m++) {
          const dueDate = getDueDateForMonth(investmentDate, m);
          const monthStr = formatMonthYear(dueDate);
          const normalizedStr = normalizeMonthStr(monthStr);

          if (existingMonthSet.has(normalizedStr)) continue;

          await RoiPayout.create({
            clientId,
            payoutMonth: monthStr,
            amount: roiAmount,
            roiPercentage: roiRate,
            roiRate: `${roiRate}%`,
            status: 'PAID',
            processedDate: dueDate,
            paymentMode: '',
            transactionRefId: '',
          });

          existingMonthSet.add(normalizedStr); // Prevent duplicate within same run
          createdCount++;
        }
      } catch (invErr) {
        console.error(`[ROI Scheduler] Error processing investment ${inv._id}:`, invErr.message);
      }
    }

    if (createdCount > 0) {
      console.log(`[ROI Scheduler] Auto-created ${createdCount} ROI payout(s).`);
    }
  } catch (err) {
    console.error('[ROI Scheduler] Fatal error in processMonthlyRoiPayouts:', err.message);
  }
};

// ──────────────────────────────────────────────────────────────
// 2. AUTO MONTHLY COMMISSIONS FOR AGENTS
// ──────────────────────────────────────────────────────────────

const processMonthlyAgentCommissions = async () => {
  try {
    // Fetch all clients that have an assigned agent
    const clientsWithAgents = await User.find({
      role: ROLES.CLIENT,
      assignedAgent: { $ne: null }
    }).lean();

    if (clientsWithAgents.length === 0) return;

    // Fetch all monthly commission slabs once
    const monthlySlabs = await CommissionSlab.find({ type: 'monthly' }).sort({ minAmount: 1 }).lean();

    const getSlabRate = (amount) => {
      if (!monthlySlabs || monthlySlabs.length === 0) return 0;
      for (let i = monthlySlabs.length - 1; i >= 0; i--) {
        const slab = monthlySlabs[i];
        if (amount >= slab.minAmount) {
          if (slab.maxAmount === null || slab.maxAmount === undefined || amount <= slab.maxAmount) {
            return slab.commissionPercentage;
          }
        }
      }
      return 0;
    };

    const now = new Date();
    let createdCount = 0;

    for (const client of clientsWithAgents) {
      try {
        const clientId = client._id;
        const agentId = client.assignedAgent;

        // Fetch active investments for this client
        const investments = await Investment.find({
          clientId,
          status: 'active'
        }).lean();

        if (investments.length === 0) continue;

        const totalActiveAmount = investments.reduce((sum, inv) => sum + (inv.investmentAmount || 0), 0);
        if (totalActiveAmount <= 0) continue;

        // Earliest investment date determines commission start
        const earliestDate = investments.reduce((min, inv) => {
          const d = new Date(inv.investmentDate || inv.createdAt);
          return d < min ? d : min;
        }, new Date(investments[0].investmentDate || investments[0].createdAt));

        // Monthly commission starts from the NEXT month after investment
        const elapsedMonths = getElapsedMonths(earliestDate, now);
        if (elapsedMonths <= 0) continue;

        // Fetch existing commissions for this agent-client pair
        const existingComms = await AgentCommission.find({
          agentId,
          clientId,
          $or: [{ type: 'MONTHLY' }, { slabType: 'monthly' }]
        }).lean();

        const existingPeriodSet = new Set(existingComms.map(c => normalizeMonthStr(c.period)));

        const commRate = getSlabRate(totalActiveAmount);
        if (commRate <= 0) continue;

        const commAmount = Math.round((totalActiveAmount * commRate) / 100);
        if (commAmount <= 0) continue;

        // Create monthly commissions for each due month (starting from month 1 after investment)
        for (let m = 1; m <= elapsedMonths; m++) {
          const dueDate = getDueDateForMonth(earliestDate, m);
          const periodStr = formatMonthYear(dueDate);
          const normalizedPeriod = normalizeMonthStr(periodStr);

          if (existingPeriodSet.has(normalizedPeriod)) continue;

          await AgentCommission.create({
            agentId,
            clientId,
            type: 'MONTHLY',
            slabType: 'monthly',
            period: periodStr,
            investmentAmount: totalActiveAmount,
            slabPercentage: commRate,
            amount: commAmount,
            status: 'PAID',
            paymentMode: '',
            transactionRefId: '',
            date: dueDate
          });

          existingPeriodSet.add(normalizedPeriod);
          createdCount++;
        }
      } catch (clientErr) {
        console.error(`[Commission Scheduler] Error processing client ${client._id}:`, clientErr.message);
      }
    }

    if (createdCount > 0) {
      console.log(`[Commission Scheduler] Auto-created ${createdCount} monthly commission(s).`);
    }
  } catch (err) {
    console.error('[Commission Scheduler] Fatal error in processMonthlyAgentCommissions:', err.message);
  }
};

// ──────────────────────────────────────────────────────────────
// 3. SCHEDULER ENTRY POINT
// ──────────────────────────────────────────────────────────────

const runSchedulerTick = async () => {
  await Promise.all([
    processMonthlyRoiPayouts(),
    processMonthlyAgentCommissions()
  ]);
};

const startRoiScheduler = () => {
  // Run immediately on startup
  runSchedulerTick().catch(err => {
    console.error('[ROI Scheduler] Startup tick error:', err.message);
  });

  // Then run every hour
  setInterval(async () => {
    try {
      await runSchedulerTick();
    } catch (err) {
      console.error('[ROI Scheduler] Interval tick error:', err.message);
    }
  }, SCHEDULER_INTERVAL_MS);

  console.log('[ROI Scheduler] Auto ROI payout & agent commission scheduler started (interval: 1h).');
};

module.exports = {
  startRoiScheduler,
  processMonthlyRoiPayouts,
  processMonthlyAgentCommissions,
  runSchedulerTick,
};
