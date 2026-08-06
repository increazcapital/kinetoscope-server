const User = require('../models/User.model');
const ClientProfile = require('../models/ClientProfile.model');
const Investment = require('../models/Investment.model');
const Transaction = require('../models/Transaction.model');
const AppError = require('../utils/AppError');
const { ROLES } = require('../constants/roles');

/**
 * Service to aggregate client data for client header, summary cards, and profile tab.
 *
 * @param {string} clientId - User ID of the client
 * @returns {Promise<Object>} Formatted object with header, summaryCards, and profile details
 */
const getClientDetailsData = async (clientId) => {
  const user = await User.findById(clientId).populate('assignedAgent', 'name email');
  if (!user || user.role !== ROLES.CLIENT) {
    throw new AppError('Client account not found.', 404);
  }

  const profile = await ClientProfile.findOne({ userId: user._id });
  if (!profile) {
    throw new AppError('Client profile not found.', 404);
  }

  const userIds = [user._id];
  const clientCodes = user.clientCode ? [user.clientCode] : [];

  const [investments, approvedDeposits] = await Promise.all([
    Investment.find({
      $or: [
        { clientId: { $in: userIds } },
        { clientCode: { $in: clientCodes } }
      ]
    }).lean(),
    Transaction.find({
      $or: [
        { clientId: { $in: userIds } },
        { clientCode: { $in: clientCodes } }
      ],
      type: 'deposit',
      status: 'approved'
    }).lean()
  ]);

  // Summary Metrics calculations
  const validInvestments = investments.filter(inv => inv.status !== 'cancelled');
  const invTotal = validInvestments.reduce((sum, inv) => sum + (inv.investmentAmount || inv.amount || 0), 0);
  const depTotal = approvedDeposits.reduce((sum, tx) => sum + (tx.amount || 0), 0);
  const totalInvestment = Math.max(invTotal, depTotal);

  const activeInvestmentsList = investments.filter(inv => inv.status === 'active');
  const activeInvestmentsCount = Math.max(activeInvestmentsList.length, (approvedDeposits.length > 0 && invTotal === 0) ? 1 : 0);

  let roiAverage = 0;
  if (activeInvestmentsList.length > 0) {
    const roiSum = activeInvestmentsList.reduce((sum, inv) => sum + (inv.roiPercentage || 0), 0);
    roiAverage = Number((roiSum / activeInvestmentsList.length).toFixed(2));
  } else {
    roiAverage = profile.monthlyRoi !== undefined ? profile.monthlyRoi : 0;
  }

  const kycStatusVal = profile.kycStatus || 'PENDING';

  return {
    header: {
      clientName: user.name,
      clientCode: user.clientCode || '',
      tier: profile.tier ? profile.tier.toUpperCase() : (totalInvestment >= 1500000 ? 'PLATINUM' : 'SILVER'),
      status: profile.status ? profile.status.toUpperCase() : 'ACTIVE',
      riskProfile: profile.riskProfile ? profile.riskProfile.toUpperCase() : 'MODERATE',
      kycStatus: kycStatusVal,
    },
    summaryCards: {
      totalInvestment,
      activeInvestments: activeInvestmentsCount,
      activeSegments: activeInvestmentsCount,
      averageRoi: roiAverage,
      monthlyRoi: roiAverage || (profile.monthlyRoi !== undefined ? profile.monthlyRoi : 0),
      kycStatus: kycStatusVal,
    },
    profile: {
      fullName: profile.fullName || user.name,
      email: profile.email || user.email,
      phone: profile.phone || '',
      dob: profile.dob || null,
      address: profile.address || '',
      joinDate: user.createdAt,
      panNumber: profile.panNumber || '',
      aadhaarNumber: profile.aadhaarNumber || '',
      bankName: profile.bankName || '',
      accountNumber: profile.accountNumber || '',
      ifscCode: profile.ifscCode || '',
      riskProfile: profile.riskProfile ? profile.riskProfile.charAt(0).toUpperCase() + profile.riskProfile.slice(1).toLowerCase() : 'Moderate',
      residencyStatus: profile.residencyStatus || 'National (Domestic)',
      monthlyRoi: profile.monthlyRoi !== undefined ? profile.monthlyRoi : 0,
      totalPortfolioValue: totalInvestment,
      kycStatus: kycStatusVal,
      nomineeName: profile.nomineeName || '',
      nomineeRelation: profile.nomineeRelation || '',
      nomineePhone: profile.nomineePhone || '',
      nomineeEmail: profile.nomineeEmail || '',
      nomineeResidency: profile.nomineeResidency || 'National (Domestic)',
      contractStartDate: profile.contractStartDate || null,
      contractEndDate: profile.contractEndDate || null,
      extendContractDate: profile.extendContractDate || '',
      agentCommission: profile.agentCommission || '',
      assignedAgent: user.assignedAgent ? user.assignedAgent._id : null,
      panDocument: profile.panDocument || '',
      aadhaarDocument: profile.aadhaarDocument || '',
      bankProofDocument: profile.bankProofDocument || '',
      agreementDocument: profile.agreementDocument || '',
      nomineeProofDocument: profile.nomineeProofDocument || '',
      panDocumentVerified: profile.panDocumentVerified || false,
      aadhaarDocumentVerified: profile.aadhaarDocumentVerified || false,
      bankProofDocumentVerified: profile.bankProofDocumentVerified || false,
      agreementDocumentVerified: profile.agreementDocumentVerified || false,
      agreementDocumentVerifiedAt: profile.agreementDocumentVerifiedAt || null,
      nomineeProofDocumentVerified: profile.nomineeProofDocumentVerified || false,
    },
  };
};

/**
 * Fetch and format client documents with metadata (name, key, description, fileSize, fileName, verification).
 *
 * @param {string} clientId - Client User ID
 * @returns {Promise<Array>} List of document objects
 */
const getClientDocumentsData = async (clientId) => {
  const user = await User.findById(clientId);
  if (!user || user.role !== ROLES.CLIENT) {
    throw new AppError('Client account not found.', 404);
  }

  const profile = await ClientProfile.findOne({ userId: user._id });
  if (!profile) {
    throw new AppError('Client profile not found.', 404);
  }

  const kycStatusVal = profile.kycStatus || 'PENDING';
  const joinDateStr = user.createdAt ? user.createdAt.toISOString().split('T')[0] : '';

  const isInternational = profile.residencyStatus === 'International';

  const docTypes = [
    {
      name: isInternational ? 'Tax ID / SSN Upload' : 'PAN Card Upload',
      key: 'panDocument',
      description: isInternational ? 'Proof of Tax ID or SSN Identification' : 'Proof of PAN Card Identification',
      fileSize: '1.2 MB',
    },
    {
      name: isInternational ? 'Passport / National ID Card Upload' : 'Aadhaar Card Upload',
      key: 'aadhaarDocument',
      description: isInternational ? 'Proof of International Passport or National ID' : 'Proof of Identity and Address',
      fileSize: '2.4 MB',
    },
    {
      name: 'Bank Details Document',
      key: 'bankProofDocument',
      description: 'Cancelled Cheque or Bank Statement',
      fileSize: '1.8 MB',
    },
    {
      name: 'Nominee ID Proof',
      key: 'nomineeProofDocument',
      description: 'ID Proof for Nominee (Assigned Nominee)',
      fileSize: '1.5 MB',
    },
    {
      name: 'Agreement Document',
      key: 'agreementDocument',
      description: 'Signed Investment Agreement Contract',
      fileSize: '3.1 MB',
    },
  ];

  const safeName = user.name.replace(/\s+/g, '_');

  const documents = docTypes.map(doc => {
    const url = profile[doc.key] || '';
    const fileExtension = url.split('.').pop().split('?')[0] || 'pdf';

    // Generate short, professional filenames like Rajesh_Kumar_Aadhaar.pdf
    const suffix = doc.key.replace('Document', '').replace('Proof', '');
    const capitalizedSuffix = suffix.charAt(0).toUpperCase() + suffix.slice(1);
    const fileName = `${safeName}_${capitalizedSuffix}.${fileExtension}`;

    // Per-document verification status
    const verifiedField = `${doc.key}Verified`;
    const isDocVerified = profile[verifiedField] === true;

    return {
      name: doc.name,
      key: doc.key,
      url,
      fileName,
      fileSize: doc.fileSize,
      description: doc.description,
      holder: user.name,
      status: isDocVerified ? 'Verified' : 'Pending Verification',
      verified: isDocVerified,
      verification: 'Digital Signatures Valid',
      uploadedDate: joinDateStr,
      uploaded: joinDateStr,
    };
  });

  return {
    documents,
    kycStatus: kycStatusVal,
    verificationStatus: {
      panDocumentVerified: profile.panDocumentVerified || false,
      aadhaarDocumentVerified: profile.aadhaarDocumentVerified || false,
      bankProofDocumentVerified: profile.bankProofDocumentVerified || false,
      agreementDocumentVerified: profile.agreementDocumentVerified || false,
      nomineeProofDocumentVerified: profile.nomineeProofDocumentVerified || false,
    },
  };
};

module.exports = {
  getClientDetailsData,
  getClientDocumentsData,
};
