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

  const sumInvRoi = investments.reduce((sum, inv) => {
    const rate = (inv.roiPercentage !== undefined && inv.roiPercentage !== null) ? Number(inv.roiPercentage) : configuredRoiRate;
    return sum + Math.round(((inv.investmentAmount || inv.amount || 0) * rate) / 100);
  }, 0);

  const calculatedRoiAmount = sumInvRoi > 0 ? sumInvRoi : Math.round((totalInv * configuredRoiRate) / 100);

  // If client has 0 active investment, do not show any ROI payout list
  if (totalInv === 0) {
    return {
      totalRoiPaid: 0,
      totalRoiPending: 0,
      roiHistory: [],
    };
  }

  let payouts = [];

  if (paidPayouts && paidPayouts.length > 0) {
    payouts = paidPayouts.map(p => {
      let mStr = '—';
      if (p.payoutDate) {
        const parts = String(p.payoutDate).split('-');
        if (parts.length >= 2) {
          const dObj = new Date(parts[0], parseInt(parts[1], 10) - 1, parts[2] ? parseInt(parts[2], 10) : 1);
          mStr = new Intl.DateTimeFormat('en-IN', { month: 'short', year: 'numeric' }).format(dObj);
        }
      }
      return {
        _id: p._id,
        clientId: realClientId,
        payoutMonth: mStr !== '—' ? mStr : (p.period || 'Aug 2026'),
        amount: Number(p.amount || 0),
        roiPercentage: p.roiPercentage,
        roiRate: p.roiRate || (p.commissionType ? p.commissionType.match(/ROI\s*\((\d+(\.\d+)?%?)\)/i)?.[1] : ''),
        status: (p.status || 'paid').toUpperCase(),
        processedDate: p.paidAt || p.payoutDate || p.createdAt,
        createdAt: p.createdAt,
        updatedAt: p.updatedAt
      };
    });
  } else if (existingRoiPayouts.length > 0) {
    payouts = [...existingRoiPayouts];
  } else {
    const currentMonthStr = new Date().toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
    payouts.push({
      _id: `gen_roi_${realClientId}`,
      clientId: realClientId,
      payoutMonth: currentMonthStr,
      amount: calculatedRoiAmount,
      roiRate: `${configuredRoiRate}%`,
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

  // Enrich payouts with locked ROI %, status & processedDate
  const enrichedPayouts = payouts.map(p => {
    const isPaidInDb = String(p.status || '').toUpperCase() === 'PAID' || String(p.status || '').toUpperCase() === 'APPROVED';
    let finalStatus = isPaidInDb ? String(p.status).toUpperCase() : ((totalInv > 0 && hasRealPaidPayout) ? 'PAID' : 'PENDING');
    let finalProcessedDate = (finalStatus === 'PAID' || finalStatus === 'APPROVED') 
      ? (p.processedDate ? new Date(p.processedDate).toISOString().split('T')[0] : (p.paidAt ? new Date(p.paidAt).toISOString().split('T')[0] : new Date().toISOString().split('T')[0])) 
      : '—';

    let finalAmount = Number(p.amount || 0);
    if (totalInv === 0) {
      finalAmount = 0;
    } else if (finalAmount <= 0) {
      finalAmount = calculatedRoiAmount;
    }

    const storedRate = p.roiRate || p.roiPercentage || p.rate;
    let finalRateStr;
    if (storedRate) {
      finalRateStr = String(storedRate).endsWith('%') ? String(storedRate) : `${storedRate}%`;
    } else if (finalAmount > 0 && totalInv > 0 && isPaidInDb) {
      const calcRate = Math.round((finalAmount / totalInv) * 100 * 10) / 10;
      finalRateStr = `${calcRate}%`;
    } else {
      finalRateStr = `${configuredRoiRate}%`;
    }

    return {
      _id: p._id,
      clientId: p.clientId,
      payoutMonth: p.payoutMonth || 'Aug 2026',
      amount: finalAmount,
      status: finalStatus,
      processedDate: finalProcessedDate,
      roiRate: finalRateStr,
      roiPercentage: parseFloat(finalRateStr.replace('%', '')) || configuredRoiRate,
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


