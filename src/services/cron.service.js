const cron = require('node-cron');
const mongoose = require('mongoose');
const Investment = require('../models/Investment.model');
const RoiPayout = require('../models/RoiPayout.model');
const AgentCommission = require('../models/AgentCommission.model');
const User = require('../models/User.model');
const CommissionSlab = require('../models/CommissionSlab.model');
const AgentOverride = require('../models/AgentOverride.model');

/**
 * Check and generate monthly ROI and Commissions for active investments
 */
const generateMonthlyPayouts = async () => {
  console.log(`[Cron] Running monthly ROI and Commission generation at ${new Date().toISOString()}`);
  
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    // Find all active investments
    const activeInvestments = await Investment.find({ status: 'active' }).populate('clientId', 'assignedAgent');
    
    for (const inv of activeInvestments) {
      if (!inv.investmentDate) continue;
      
      const invDate = new Date(inv.investmentDate);
      invDate.setHours(0, 0, 0, 0);
      
      let diffMonths = (today.getFullYear() - invDate.getFullYear()) * 12 + (today.getMonth() - invDate.getMonth());
      if (today.getDate() < invDate.getDate()) {
        diffMonths -= 1;
      }
      
      // Generate ROI for all elapsed months (not just exact anniversary day)
      if (diffMonths > 0) {
        const maxMonths = inv.durationMonths || 18;
        const dueMonths = Math.min(diffMonths, maxMonths);

        for (let m = 1; m <= dueMonths; m++) {
          // Calculate the exact due date for this month offset
          const startD = new Date(invDate);
          const tYear = startD.getFullYear() + Math.floor((startD.getMonth() + m) / 12);
          const tMonth = (startD.getMonth() + m) % 12;
          const origDay = startD.getDate();
          const lastDay = new Date(tYear, tMonth + 1, 0).getDate();
          const dueDate = new Date(tYear, tMonth, Math.min(origDay, lastDay));

          const MONTH_NAMES_CRON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
          const payoutMonthStr = `${MONTH_NAMES_CRON[dueDate.getMonth()]} ${dueDate.getFullYear()}`;
          
          // 1. Generate Client ROI
          const existingRoi = await RoiPayout.findOne({
            clientId: inv.clientId._id,
            payoutMonth: payoutMonthStr
          });

          if (!existingRoi) {
            const roiAmount = Math.round(inv.investmentAmount * ((inv.roiPercentage || 0) / 100));
            if (roiAmount > 0) {
              await RoiPayout.create({
                clientId: inv.clientId._id,
                investmentId: inv._id,
                payoutMonth: payoutMonthStr,
                amount: roiAmount,
                status: 'PAID',
                processedDate: dueDate,
                roiPercentage: inv.roiPercentage,
                roiRate: `${inv.roiPercentage}%`
              });
              console.log(`[Cron] Auto-generated PAID ROI for Client ${inv.clientCode || inv.clientId._id}, Month: ${payoutMonthStr}, Amount: ${roiAmount}`);
            }
          }

          // 2. Generate Agent Commission (MONTHLY)
          if (inv.clientId && inv.clientId.assignedAgent) {
            const agentId = inv.clientId.assignedAgent;
            const existingCommission = await AgentCommission.findOne({
              agentId: agentId,
              clientId: inv.clientId._id,
              period: payoutMonthStr,
              type: 'MONTHLY'
            });

            if (!existingCommission) {
              // Calculate monthly commission based on slab
              const depositAmount = inv.investmentAmount;
              const allSlabs = await CommissionSlab.find({ type: 'monthly' }).sort({ minAmount: 1 }).lean();
              const agentOverride = await AgentOverride.findOne({ agentId: agentId }).lean();
              
              let matchedSlab = null;
              for (const slab of allSlabs) {
                const max = slab.maxAmount === null || slab.maxAmount === undefined ? Infinity : slab.maxAmount;
                if (depositAmount >= slab.minAmount && depositAmount <= max) {
                  matchedSlab = slab;
                  break;
                }
              }

              if (matchedSlab) {
                let pct = matchedSlab.commissionPercentage;
                if (agentOverride && agentOverride.commissionOverride !== undefined) {
                  // Agent override takes precedence if set
                  pct = agentOverride.commissionOverride; 
                }

                const commAmount = Math.round(depositAmount * (pct / 100));
                if (commAmount > 0) {
                  await AgentCommission.create({
                    agentId: agentId,
                    clientId: inv.clientId._id,
                    period: payoutMonthStr,
                    date: dueDate,
                    type: 'MONTHLY',
                    amount: commAmount,
                    status: 'PAID',
                    remarks: `Auto-calculated monthly commission from investment ₹${depositAmount.toLocaleString('en-IN')} at ${pct}%`,
                    investmentAmount: depositAmount,
                    slabPercentage: pct,
                    slabType: 'monthly'
                  });
                  console.log(`[Cron] Auto-generated PENDING MONTHLY Commission for Agent ${agentId}, Amount: ${commAmount}`);
                }
              }
            }
          }
        }
      }
    }
  } catch (error) {
    console.error(`[Cron Error] Error in generateMonthlyPayouts: ${error.message}`);
  }
};

/**
 * Initialize all cron jobs
 */
const initCronJobs = () => {
  // Run every day at 00:05 (5 minutes past midnight)
  cron.schedule('5 0 * * *', async () => {
    await generateMonthlyPayouts();
  });
  
  console.log('[Cron] Cron jobs initialized successfully');
};

module.exports = {
  initCronJobs,
  generateMonthlyPayouts
};
