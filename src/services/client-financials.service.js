const User = require('../models/User.model');
const ClientProfile = require('../models/ClientProfile.model');
const Investment = require('../models/Investment.model');
const RoiPayout = require('../models/RoiPayout.model');
const { findClientUser } = require('./client-details.service');
const AppError = require('../utils/AppError');
const { ROLES } = require('../constants/roles');
const mongoose = require('mongoose');

/**
 * Fetch and calculate metrics for the client investments tab.
 *
 * @param {string} clientId - Client User ID or slug
 * @returns {Promise<Object>} Object containing totalInvestment, activeInvestments, and the list of investments
 */
const getInvestmentsTab = async (clientId) => {
  const user = await findClientUser(clientId);
  if (!user || user.role !== ROLES.CLIENT) {
    throw new AppError('Client account not found.', 404);
  }
  const realClientId = user._id;

  const investments = await Investment.find({ clientId: realClientId }).sort({ investmentDate: -1 });

  // Calculate aggregates
  const validInvestments = investments.filter(inv => inv.status !== 'cancelled');
  const totalInvestment = validInvestments.reduce((sum, inv) => sum + inv.investmentAmount, 0);
  const activeInvestmentsCount = investments.filter(inv => inv.status === 'active').length;

  const formattedInvestments = investments.map(inv => ({
    _id: inv._id,
    clientId: inv.clientId,
    clientName: inv.clientName || user.name,
    clientCode: inv.clientCode || user.clientCode,
    segment: inv.segment,
    investmentAmount: inv.investmentAmount,
    roiPercentage: inv.roiPercentage,
    riskPercentage: inv.riskPercentage,
    investmentDate: inv.investmentDate,
    allocationDate: inv.investmentDate,
    status: (inv.status || 'active').toUpperCase(),
    remarks: inv.remarks,
    createdAt: inv.createdAt,
    updatedAt: inv.updatedAt,
  }));

  return {
    totalInvestment,
    activeInvestments: activeInvestmentsCount,
    investments: formattedInvestments,
  };
};

/**
 * Fetch and calculate metrics for the client ROI payouts tab.
 *
 * @param {string} clientId - Client User ID or slug
 * @returns {Promise<Object>} Object containing totalRoiPaid, totalRoiPending, and the payouts history list
 */
const getRoiTab = async (clientId) => {
  const user = await findClientUser(clientId);
  if (!user || user.role !== ROLES.CLIENT) {
    throw new AppError('Client account not found.', 404);
  }
  const realClientId = user._id;

  const profile = await ClientProfile.findOne({ userId: realClientId });
  const configuredRoiRate = profile ? (profile.monthlyRoi || 1.2) : 1.2;

  const Payout = require('../models/Payout.model');
  const Transaction = require('../models/Transaction.model');

  const idMatches = Array.from(new Set([
    String(realClientId),
    String(user._id),
    user.clientCode,
    user.clientCode?.toUpperCase(),
    user.name,
    String(clientId)
  ].filter(Boolean)));

  // Fetch paid payout distributions and transaction records across Payout, Transaction, and RoiPayout collections
  const [paidPayouts, paidTxs, existingRoiPayouts, investments] = await Promise.all([
    Payout.find({
      $or: [
        { recipientId: { $in: idMatches } },
        { clientId: { $in: idMatches } }
      ],
      recipientType: { $ne: 'Agent Commission' },
      status: { $regex: /^(paid|approved|credited|completed)$/i }
    }).sort({ createdAt: -1 }).lean(),
    Transaction.find({
      $or: [
        { clientId: { $in: idMatches } },
        { recipientId: { $in: idMatches } }
      ],
      type: { $ne: 'agent_commission' },
      status: { $regex: /^(paid|approved|credited|completed)$/i }
    }).sort({ createdAt: -1 }).lean(),
    RoiPayout.find({ clientId: realClientId }).sort({ createdAt: 1 }).lean(),
    Investment.find({ clientId: realClientId, status: 'active' }).lean()
  ]);

  const totalInv = investments.reduce((sum, inv) => sum + (inv.investmentAmount || 0), 0);

  const allPaidRecords = [...paidPayouts, ...paidTxs];
  const isClientPaid = allPaidRecords.length > 0;
  const latestPaidRecord = isClientPaid ? allPaidRecords[0] : null;

  let payouts = existingRoiPayouts;

  // If no payout records exist, generate current month payout entry
  if (payouts.length === 0) {
    const currentMonthStr = new Date().toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
    const fallbackAmount = latestPaidRecord ? (latestPaidRecord.amount || 0) : Math.round((totalInv * configuredRoiRate) / 100);
    payouts.push({
      _id: latestPaidRecord ? (latestPaidRecord._id || latestPaidRecord.id) : `gen_roi_${realClientId}`,
      clientId: realClientId,
      payoutMonth: latestPaidRecord ? (latestPaidRecord.payoutDate || currentMonthStr) : currentMonthStr,
      amount: fallbackAmount,
      status: isClientPaid ? 'PAID' : 'PENDING',
      processedDate: isClientPaid ? (latestPaidRecord.paidAt || latestPaidRecord.createdAt || new Date()) : null,
      createdAt: new Date(),
      updatedAt: new Date()
    });
  }

  // Calculate dynamic ROI %
  let effectiveRoiRate = configuredRoiRate;
  if (latestPaidRecord) {
    if (latestPaidRecord.roiPercentage || latestPaidRecord.roiRate) {
      effectiveRoiRate = parseFloat(latestPaidRecord.roiPercentage || latestPaidRecord.roiRate);
    } else if (latestPaidRecord.commissionType && String(latestPaidRecord.commissionType).includes('%')) {
      const match = String(latestPaidRecord.commissionType).match(/(\d+(\.\d+)?)%/);
      if (match) effectiveRoiRate = parseFloat(match[1]);
    } else if (latestPaidRecord.amount && totalInv > 0) {
      const calcPct = (latestPaidRecord.amount / totalInv) * 100;
      if (calcPct > 0) effectiveRoiRate = Number(calcPct.toFixed(1));
    }
  }

  // Enrich payouts with dynamic ROI %, status & processedDate
  const enrichedPayouts = payouts.map(p => {
    let finalStatus = (p.status || 'PENDING').toUpperCase();
    let finalProcessedDate = (finalStatus === 'PAID' && p.processedDate) ? new Date(p.processedDate).toISOString().split('T')[0] : '—';
    let finalAmount = p.amount || 0;

    if (isClientPaid) {
      finalStatus = 'PAID';
      const rawDate = latestPaidRecord.paidAt || latestPaidRecord.createdAt || new Date();
      finalProcessedDate = new Date(rawDate).toISOString().split('T')[0];
      if (latestPaidRecord.amount) finalAmount = latestPaidRecord.amount;
    }

    return {
      _id: p._id,
      clientId: p.clientId,
      payoutMonth: p.payoutMonth || 'Aug 2026',
      amount: finalAmount,
      status: finalStatus,
      processedDate: finalProcessedDate,
      roiRate: `${effectiveRoiRate}%`,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
    };
  });

  const totalRoiPaid = enrichedPayouts
    .filter(p => p.status === 'PAID')
    .reduce((sum, p) => sum + p.amount, 0);

  const totalRoiPending = enrichedPayouts
    .filter(p => p.status === 'PENDING')
    .reduce((sum, p) => sum + p.amount, 0);

  return {
    totalRoiPaid,
    totalRoiPending,
    roiHistory: enrichedPayouts,
  };
};

/**
 * Mark a pending ROI payout as paid.
 *
 * @param {string} clientId - Client User ID
 * @param {string} payoutId - ROI Payout ID to transition
 * @returns {Promise<Object>} The updated RoiPayout object
 */
const payRoiPayout = async (clientId, payoutId) => {
  let payout;
  const isObjectId = mongoose.Types.ObjectId.isValid(payoutId);

  if (isObjectId) {
    payout = await RoiPayout.findOne({ _id: payoutId, clientId });
    if (!payout) {
      throw new AppError('ROI payout record not found for this client.', 404);
    }
    if (payout.status === 'PAID') {
      throw new AppError('ROI payout is already marked as PAID.', 400);
    }
    payout.status = 'PAID';
    payout.processedDate = new Date();
    await payout.save();
  } else {
    // Custom/string formatted ID (like "201"). Query raw collection directly to avoid Mongoose ObjectId cast error.
    const clientObjectId = mongoose.Types.ObjectId.isValid(clientId) ? new mongoose.Types.ObjectId(clientId) : clientId;
    const rawPayout = await RoiPayout.collection.findOne({ _id: payoutId, clientId: clientObjectId });
    if (!rawPayout) {
      throw new AppError('ROI payout record not found for this client.', 404);
    }
    if (rawPayout.status === 'PAID') {
      throw new AppError('ROI payout is already marked as PAID.', 400);
    }
    
    await RoiPayout.collection.updateOne(
      { _id: payoutId, clientId: clientObjectId },
      { $set: { status: 'PAID', processedDate: new Date() } }
    );
    
    const updatedRaw = await RoiPayout.collection.findOne({ _id: payoutId, clientId: clientObjectId });
    payout = RoiPayout.hydrate(updatedRaw);
  }

  return payout;
};

module.exports = {
  getInvestmentsTab,
  getRoiTab,
  payRoiPayout,
};
