const mongoose = require('mongoose');
require('dotenv').config({ path: __dirname + '/../../.env' });
const Investment = require('../models/Investment.model');
const RoiPayout = require('../models/RoiPayout.model');
const AgentCommission = require('../models/AgentCommission.model');
const CommissionSlab = require('../models/CommissionSlab.model');
const AgentOverride = require('../models/AgentOverride.model');
const User = require('../models/User.model');
const Transaction = require('../models/Transaction.model');

// Load database connection
const connectDB = require('../config/db');

const runBackfill = async () => {
  await connectDB();
  console.log('--- Started ROI and Commission Backfill ---');

  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // 1. Clear old auto-generated ROI (you can adjust if you want to keep some)
    // The user requested: "old entry bani h vo remove karke fir se new or sahi entry bana do"
    // We will clear all existing RoiPayouts (since Payouts handles the manual withdrawals)
    await RoiPayout.deleteMany({});
    console.log('Cleared all old RoiPayout entries.');

    // Note: We might also want to clear AgentCommissions that are MONTHLY
    await AgentCommission.deleteMany({ $or: [{ type: 'MONTHLY' }, { slabType: 'monthly' }] });
    console.log('Cleared all old MONTHLY AgentCommission entries.');

    const activeInvestments = await Investment.find({ status: 'active' }).populate('clientId', 'assignedAgent clientCode name');
    
    // Fetch Agent slabs and overrides for Commissions
    const allSlabs = await CommissionSlab.find({ type: 'monthly' }).sort({ minAmount: 1 }).lean();
    const overrides = await AgentOverride.find({}).lean();

    for (const inv of activeInvestments) {
      if (!inv.investmentDate) continue;

      const invDate = new Date(inv.investmentDate);
      invDate.setHours(0, 0, 0, 0);

      const diffMonths = (today.getFullYear() - invDate.getFullYear()) * 12 + (today.getMonth() - invDate.getMonth());
      let elapsedMonths = diffMonths;

      // Adjust if the exact day hasn't passed yet in the current month
      if (today.getDate() < invDate.getDate()) {
        elapsedMonths -= 1;
      }

      if (elapsedMonths > 0) {
        for (let m = 1; m <= elapsedMonths; m++) {
          // Calculate the exact date for this past month
          let targetDate = new Date(invDate);
          targetDate.setMonth(targetDate.getMonth() + m);
          
          // Handle end-of-month day rolling
          let targetDay = invDate.getDate();
          const daysInTargetMonth = new Date(targetDate.getFullYear(), targetDate.getMonth() + 1, 0).getDate();
          if (targetDay > daysInTargetMonth) {
            targetDate.setDate(daysInTargetMonth);
          } else {
            targetDate.setDate(targetDay);
          }

          const payoutMonthStr = new Intl.DateTimeFormat('en-IN', { month: 'short', year: 'numeric' }).format(targetDate);
          
          // Generate Client ROI (Past ones should be PAID)
          const roiAmount = (inv.investmentAmount * ((inv.roiPercentage || 0) / 100));
          if (roiAmount > 0) {
            await RoiPayout.create({
              clientId: inv.clientId._id,
              investmentId: inv._id,
              payoutMonth: payoutMonthStr,
              amount: roiAmount,
              status: 'PAID', // Forced to PAID because the date has passed
              processedDate: targetDate, // The date it was supposed to be paid
              paymentMode: '',
              roiPercentage: inv.roiPercentage,
              roiRate: `${inv.roiPercentage}%`
            });
            console.log(`Created PAID ROI for Client ${inv.clientId.clientCode}, Month: ${payoutMonthStr}, Amount: ${roiAmount}`);
          }

          // Generate Agent Commission (MONTHLY)
          if (inv.clientId && inv.clientId.assignedAgent) {
            const agentId = inv.clientId.assignedAgent;
            const depositAmount = inv.investmentAmount;
            
            let matchedSlab = null;
            for (const slab of allSlabs) {
              const max = slab.maxAmount === null || slab.maxAmount === undefined ? Infinity : slab.maxAmount;
              if (depositAmount >= slab.minAmount && depositAmount <= max) {
                matchedSlab = slab;
                break;
              }
            }

            if (matchedSlab) {
              const override = overrides.find(o => String(o.agentId) === String(agentId));
              let pct = matchedSlab.commissionPercentage;
              if (override && override.commissionOverride !== undefined) {
                pct = override.commissionOverride; 
              }

              const commAmount = Math.round(depositAmount * (pct / 100));
              if (commAmount > 0) {
                await AgentCommission.create({
                  agentId: agentId,
                  clientId: inv.clientId._id,
                  period: payoutMonthStr,
                  date: targetDate,
                  type: 'MONTHLY',
                  amount: commAmount,
                  status: 'PAID', // Forced to PAID
                  paidAt: targetDate,
                  paymentMode: '',
                  remarks: `Auto-backfilled monthly commission from investment ₹${depositAmount.toLocaleString('en-IN')} at ${pct}%`,
                  investmentAmount: depositAmount,
                  slabPercentage: pct,
                  slabType: 'monthly'
                });
                console.log(`Created PAID MONTHLY Commission for Agent ${agentId}, Month: ${payoutMonthStr}, Amount: ${commAmount}`);
              }
            }
          }
        }
      }
    }
    console.log('--- Backfill Completed Successfully ---');
    process.exit(0);
  } catch (err) {
    console.error('Error during backfill:', err);
    process.exit(1);
  }
};

runBackfill();
