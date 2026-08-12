const User = require('../models/User.model');
const ClientProfile = require('../models/ClientProfile.model');
const Investment = require('../models/Investment.model');
const RoiPayout = require('../models/RoiPayout.model');
const Payout = require('../models/Payout.model');
const Transaction = require('../models/Transaction.model');
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
  const profile = await ClientProfile.findOne({ userId: realClientId });

  const clientObjectIds = [user._id, profile?._id].filter(id => id && mongoose.Types.ObjectId.isValid(String(id)));
  const clientCodes = Array.from(new Set([user.clientCode, user.clientCode?.toUpperCase()].filter(Boolean)));

  const invQuery = {
    $or: [
      { clientId: { $in: clientObjectIds } },
      ...(clientCodes.length > 0 ? [{ clientCode: { $in: clientCodes } }] : [])
    ]
  };

  const investments = await Investment.find(invQuery).sort({ investmentDate: -1 });

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

  const clientObjectIds = [user._id, profile?._id]
    .filter(id => id && mongoose.Types.ObjectId.isValid(String(id)))
    .map(id => new mongoose.Types.ObjectId(String(id)));

  const stringMatches = Array.from(new Set([
    String(realClientId),
    user.clientCode,
    user.clientCode?.toUpperCase(),
    user.name,
    String(clientId)
  ].filter(Boolean)));

  const payoutQuery = {
    $or: [
      { recipientId: { $in: stringMatches } },
      { clientId: { $in: stringMatches } }
    ],
    recipientType: { $ne: 'Agent Commission' },
    status: { $regex: /^(paid|approved|credited|completed)$/i }
  };

  const txQuery = {
    $or: [
      { clientId: { $in: clientObjectIds } },
      ...(user.clientCode ? [{ clientCode: user.clientCode }] : [])
    ],
    type: { $in: ['roi', 'roi_payout', 'roi_return', 'client_roi'] },
    status: { $regex: /^(paid|approved|credited|completed)$/i }
  };

  const depositQuery = {
    $or: [
      { clientId: { $in: clientObjectIds } },
      { recipientId: { $in: stringMatches } },
      { clientCode: { $in: stringMatches } }
    ],
    type: { $regex: /deposit/i },
    status: { $regex: /^(paid|approved|credited|completed)$/i }
  };

  const invQuery = {
    $or: [
      { clientId: { $in: clientObjectIds } },
      ...(user.clientCode ? [{ clientCode: user.clientCode }] : []),
      ...(user.clientCode ? [{ clientCode: user.clientCode.toUpperCase() }] : [])
    ],
    status: { $ne: 'cancelled' }
  };

  // Fetch paid payout distributions, transaction records, investments, approved deposits, and profile
  const [paidPayouts, paidTxs, existingRoiPayouts, investments, approvedDeposits, clientProfileDoc] = await Promise.all([
    Payout.find(payoutQuery).sort({ createdAt: -1 }).lean(),
    Transaction.find(txQuery).sort({ createdAt: -1 }).lean(),
    RoiPayout.find({ clientId: { $in: clientObjectIds } }).sort({ createdAt: 1 }).lean(),
    Investment.find(invQuery).lean(),
    Transaction.find(depositQuery).lean(),
    ClientProfile.findOne({ userId: { $in: clientObjectIds } }).lean()
  ]);

  const invTotal = investments.reduce((sum, inv) => sum + (inv.investmentAmount || inv.amount || 0), 0);
  const depTotal = approvedDeposits.reduce((sum, tx) => sum + (tx.amount || 0), 0);
  const profileTotal = (profile?.totalInvestment || clientProfileDoc?.totalInvestment || 0);
  const totalInv = Math.max(invTotal, depTotal, profileTotal);

  const calculatedRoiAmount = totalInv > 0 ? Math.round((totalInv * configuredRoiRate) / 100) : 0;

  // If client has 0 active investment, do not show any ROI payout list
  if (totalInv === 0) {
    return {
      totalRoiPaid: 0,
      totalRoiPending: 0,
      roiHistory: [],
    };
  }

  let payouts = existingRoiPayouts.length > 0 ? [...existingRoiPayouts] : [];

  if (payouts.length === 0) {
    const currentMonthStr = new Date().toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
    payouts.push({
      _id: `gen_roi_${realClientId}`,
      clientId: realClientId,
      payoutMonth: currentMonthStr,
      amount: calculatedRoiAmount,
      status: 'PENDING',
      processedDate: null,
      createdAt: new Date(),
      updatedAt: new Date()
    });
  }

  // Check if a real paid record exists in Payout collection for ROI
  const hasRealPaidPayout = paidPayouts.some(p => 
    p.recipientType === 'Client Return (ROI)' && 
    String(p.status).toLowerCase() === 'paid'
  );

  // Calculate dynamic ROI %
  let effectiveRoiRate = configuredRoiRate;

  // Enrich payouts with dynamic ROI %, status & processedDate
  const enrichedPayouts = payouts.map(p => {
    let finalStatus = (totalInv > 0 && hasRealPaidPayout) ? 'PAID' : 'PENDING';
    let finalProcessedDate = (finalStatus === 'PAID' && p.processedDate) 
      ? new Date(p.processedDate).toISOString().split('T')[0] 
      : '—';

    let finalAmount = Number(p.amount || 0);
    if (totalInv === 0) {
      finalAmount = 0;
    } else if (finalAmount <= 0 || finalAmount >= totalInv) {
      finalAmount = calculatedRoiAmount;
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
// Nodemon restart trigger


