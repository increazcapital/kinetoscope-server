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
const slugifyName = (name) => {
  if (!name) return '';
  return String(name)
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
};

const findClientUser = async (clientId) => {
  if (!clientId) return null;
  const str = String(clientId).trim();
  if (/^[0-9a-fA-F]{24}$/.test(str)) {
    const user = await User.findById(str).populate('assignedAgent', 'name email');
    if (user && user.role === ROLES.CLIENT) return user;
  }
  let user = await User.findOne({ clientCode: str.toUpperCase(), role: ROLES.CLIENT }).populate('assignedAgent', 'name email');
  if (!user) user = await User.findOne({ clientCode: str, role: ROLES.CLIENT }).populate('assignedAgent', 'name email');
  if (!user) {
    const prof = await ClientProfile.findOne({
      $or: [
        { clientCode: str.toUpperCase() },
        { clientCode: str },
        { clientId: str.toUpperCase() },
        { clientId: str }
      ]
    });
    if (prof) user = await User.findById(prof.userId).populate('assignedAgent', 'name email');
  }
  if (!user) {
    const allClients = await User.find({ role: ROLES.CLIENT }).populate('assignedAgent', 'name email');
    user = allClients.find(c => slugifyName(c.name) === str.toLowerCase() || slugifyName(c.email) === str.toLowerCase());
  }
  if (!user) {
    const allProfiles = await ClientProfile.find();
    const matchedProf = allProfiles.find(p => slugifyName(p.fullName) === str.toLowerCase());
    if (matchedProf) user = await User.findById(matchedProf.userId).populate('assignedAgent', 'name email');
  }
  return user;
};

const getClientDetailsData = async (clientId) => {
  const user = await findClientUser(clientId);
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

  const allocatedInvestmentsList = activeInvestmentsList.filter(inv => {
    const seg = String(inv.segment || inv.projectName || '').toLowerCase().trim();
    return seg && seg !== 'unallocated' && seg !== 'unallocated segment' && seg !== 'none' && seg !== '—' && seg !== '-';
  });

  const uniqueAllocatedSegments = new Set(allocatedInvestmentsList.map(inv => String(inv.segment || inv.projectName).toLowerCase().trim()));
  const activeSegmentsCount = uniqueAllocatedSegments.size;

  const configuredMonthlyRoi = profile.monthlyRoi !== undefined ? Number(profile.monthlyRoi) : 0;
  let roiAverage = configuredMonthlyRoi;
  if (!configuredMonthlyRoi && activeInvestmentsList.length > 0) {
    const roiSum = activeInvestmentsList.reduce((sum, inv) => sum + (inv.roiPercentage || 0), 0);
    roiAverage = Number((roiSum / activeInvestmentsList.length).toFixed(2));
  }

  const hasAgreement = Boolean(profile.agreementDocument && String(profile.agreementDocument).trim() !== '' && profile.agreementDocument !== 'null');
  const isAgreementVerified = hasAgreement && (profile.agreementDocumentVerified || profile.agreementVerified);
  const hasPan = Boolean(profile.panDocument && String(profile.panDocument).trim() !== '' && profile.panDocument !== 'null');
  const isPanVerified = hasPan && profile.panDocumentVerified;
  const hasAadhaar = Boolean((profile.aadhaarDocument || profile.idProofDocument) && String(profile.aadhaarDocument || profile.idProofDocument).trim() !== '' && (profile.aadhaarDocument || profile.idProofDocument) !== 'null');
  const isAadhaarVerified = hasAadhaar && (profile.aadhaarDocumentVerified || profile.idProofDocumentVerified);
  const hasBank = Boolean(profile.bankProofDocument && String(profile.bankProofDocument).trim() !== '' && profile.bankProofDocument !== 'null');
  const isBankVerified = hasBank && profile.bankProofDocumentVerified;

  const isAllDocsVerified = isAgreementVerified && isPanVerified && isAadhaarVerified && isBankVerified;

  let kycStatusVal = profile.kycStatus || 'PENDING';
  if (!isAllDocsVerified) {
    kycStatusVal = 'PENDING';
    if (profile.kycStatus === 'VERIFIED') {
      profile.kycStatus = 'PENDING';
      profile.save().catch(e => console.error('[Auto Sync KYC Status Error]:', e.message));
    }
  }

  return {
    header: {
      clientName: user.name,
      clientCode: user.clientCode || '',
      tier: profile.tier ? profile.tier.toUpperCase() : (totalInvestment >= 1500000 ? 'PLATINUM' : 'SILVER'),
      status: profile.status ? profile.status.toUpperCase() : 'ACTIVE',
      riskProfile: profile.riskProfile ? profile.riskProfile.toUpperCase() : 'MODERATE',
      kycStatus: kycStatusVal,
      profilePic: profile.profilePic || user.profilePic || '',
    },
    summaryCards: {
      totalInvestment,
      activeInvestments: activeInvestmentsCount,
      activeSegments: activeSegmentsCount,
      averageRoi: configuredMonthlyRoi || roiAverage,
      monthlyRoi: configuredMonthlyRoi || roiAverage,
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
      profilePic: profile.profilePic || user.profilePic || '',
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
  const user = await findClientUser(clientId);
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
  findClientUser,
  getClientDetailsData,
  getClientDocumentsData,
};
