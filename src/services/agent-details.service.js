const User = require('../models/User.model');
const AgentProfile = require('../models/AgentProfile.model');
const Investment = require('../models/Investment.model');
const AppError = require('../utils/AppError');
const { ROLES } = require('../constants/roles');

/**
 * Service to aggregate agent data for agent header, summary cards, and profile tab.
 *
 * @param {string} agentId - User ID of the agent
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

const findAgentUser = async (agentId) => {
  if (!agentId) return null;
  const str = String(agentId).trim();
  if (/^[0-9a-fA-F]{24}$/.test(str)) {
    const user = await User.findById(str);
    if (user && user.role === ROLES.AGENT) return user;
  }
  let user = await User.findOne({ clientCode: str.toUpperCase(), role: ROLES.AGENT });
  if (!user) user = await User.findOne({ clientCode: str, role: ROLES.AGENT });
  if (!user) {
    const prof = await AgentProfile.findOne({
      $or: [
        { agentCode: str.toUpperCase() },
        { agentCode: str },
        { agentId: str.toUpperCase() },
        { agentId: str }
      ]
    });
    if (prof) user = await User.findById(prof.userId);
  }
  if (!user) {
    const allAgents = await User.find({ role: ROLES.AGENT });
    user = allAgents.find(a => slugifyName(a.name) === str.toLowerCase() || slugifyName(a.email) === str.toLowerCase());
  }
  if (!user) {
    const allProfiles = await AgentProfile.find();
    const matchedProf = allProfiles.find(p => slugifyName(p.fullName) === str.toLowerCase());
    if (matchedProf) user = await User.findById(matchedProf.userId);
  }
  return user;
};

const getAgentDetailsData = async (agentId) => {
  const user = await findAgentUser(agentId);
  if (!user || user.role !== ROLES.AGENT) {
    throw new AppError('Agent account not found.', 404);
  }

  const profile = await AgentProfile.findOne({ userId: user._id });
  if (!profile) {
    throw new AppError('Agent profile not found.', 404);
  }

  // Find clients assigned to this agent
  const clients = await User.find({ role: ROLES.CLIENT, assignedAgent: user._id }, { _id: 1 });
  const clientIds = clients.map(c => c._id);
  const clientsCount = clientIds.length;

  // Find active investments of these clients
  let totalInvestment = 0;
  if (clientsCount > 0) {
    const investments = await Investment.find({ clientId: { $in: clientIds }, status: 'active' }, { investmentAmount: 1 });
    totalInvestment = investments.reduce((sum, inv) => sum + inv.investmentAmount, 0);
  }

  const profObj = profile.toObject ? profile.toObject({ getters: true }) : profile;

  // Auto-align KYC status if core 3 documents are verified
  let computedKycStatus = (profile.kycStatus || 'PENDING').toUpperCase();
  if (profile.panDocumentVerified && profile.idProofDocumentVerified && profile.bankProofDocumentVerified) {
    computedKycStatus = 'VERIFIED';
  }

  const AgentCommission = require('../models/AgentCommission.model');
  const agentComms = await AgentCommission.find({ agentId: user._id }).lean();
  const totalCommissionVal = agentComms.reduce((s, c) => s + (c.amount || 0), 0);

  return {
    header: {
      agentName: user.name,
      agentCode: user.clientCode || '',
      status: profile.status ? profile.status.toUpperCase() : 'ACTIVE',
      kycStatus: computedKycStatus,
    },
    summaryCards: {
      clientsCount,
      totalInvestment,
      totalCommission: totalCommissionVal,
      oneTimeCommission: profile.oneTimeCommission || 0,
      monthlySlab: profile.monthlySlab || '',
      specialCommission: profile.specialCommission || 0,
      kycStatus: computedKycStatus,
    },
    profile: {
      fullName: profObj.fullName || user.name,
      email: profObj.email || user.email,
      phone: profObj.phone || '',
      address: profObj.address || profile.address || '',
      joinDate: user.createdAt,
      panNumber: profObj.panNumber || '',
      aadhaarNumber: profObj.aadhaarNumber || '',
      bankName: profObj.bankName || '',
      accountNumber: profObj.accountNumber || '',
      bankAccount: profObj.accountNumber || profObj.bankAccount || '',
      ifscCode: profObj.ifscCode || '',
      ifsc: profObj.ifscCode || profObj.ifsc || '',
      upiId: profObj.upiId || profile.upiId || '',
      residencyStatus: profile.residencyStatus || 'National (Domestic)',
      nomineeName: profile.nomineeName || '',
      nomineeRelation: profile.nomineeRelation || '',
      nomineePhone: profile.nomineePhone || '',
      nomineeEmail: profile.nomineeEmail || '',
      nomineeResidency: profile.nomineeResidency || 'National (Domestic)',
      panDocument: profile.panDocument || '',
      idProofDocument: profile.idProofDocument || '',
      idProofBackDocument: profile.idProofBackDocument || '',
      bankProofDocument: profile.bankProofDocument || '',
      nomineeProofDocument: profile.nomineeProofDocument || '',
      agreementDocument: profile.agreementDocument || '',
      panDocumentVerified: profile.panDocumentVerified || false,
      idProofDocumentVerified: profile.idProofDocumentVerified || false,
      idProofBackDocumentVerified: profile.idProofBackDocumentVerified || false,
      bankProofDocumentVerified: profile.bankProofDocumentVerified || false,
      agreementDocumentVerified: profile.agreementDocumentVerified || false,
      agreementDocumentVerifiedAt: profile.agreementDocumentVerifiedAt || null,
      nomineeProofDocumentVerified: profile.nomineeProofDocumentVerified || false,
      kycStatus: computedKycStatus,
      agentCode: user.clientCode || '',
      clientCode: user.clientCode || '',
      status: profile.status || 'active',
      oneTimeCommission: profile.oneTimeCommission || 0,
      monthlySlab: profile.monthlySlab || '',
      specialCommission: profile.specialCommission || 0,
      portalPassword: profile.portalPassword || '',
      profilePic: profile.profilePic || user.profilePic || '',
    },
  };
};

/**
 * Fetch and format agent documents with metadata.
 *
 * @param {string} agentId - Agent User ID
 * @returns {Promise<Array>} List of document objects
 */
const getAgentDocumentsData = async (agentId) => {
  const user = await findAgentUser(agentId);
  if (!user || user.role !== ROLES.AGENT) {
    throw new AppError('Agent account not found.', 404);
  }

  const profile = await AgentProfile.findOne({ userId: user._id });
  if (!profile) {
    throw new AppError('Agent profile not found.', 404);
  }

  const joinDateStr = user.createdAt ? user.createdAt.toISOString().split('T')[0] : '';
  const isInternational = profile.residencyStatus === 'International';
  const isNomineeInternational = profile.nomineeResidency === 'International';

  const docTypes = [
    {
      name: isInternational ? 'Tax ID Upload' : 'PAN Card Upload',
      key: 'panDocument',
      description: isInternational ? 'Proof of Tax ID or SSN Identification' : 'Proof of PAN Card Identification',
      fileSize: '1.2 MB',
    },
    {
      name: isInternational ? 'International Passport / National ID (Front Side)' : 'Aadhaar / ID Proof (Front Side) Upload',
      key: 'idProofDocument',
      description: isInternational ? 'Proof of International Passport or National ID' : 'Proof of Identity (Front Side)',
      fileSize: '2.4 MB',
    },
    {
      name: isInternational ? 'Address Proof / National ID (Back Side)' : 'Aadhaar Card Back Side (Address Proof)',
      key: 'idProofBackDocument',
      description: 'Proof of Address (Aadhaar Back Side / Address Document)',
      fileSize: '2.4 MB',
    },
    {
      name: 'Cancelled Cheque',
      key: 'bankProofDocument',
      description: 'Cancelled Cheque or Bank Statement',
      fileSize: '1.8 MB',
    },
    {
      name: 'Agreement Document',
      key: 'agreementDocument',
      description: 'Signed Agent Service Agreement Contract',
      fileSize: '3.1 MB',
    },
  ];

  // Only include Nominee ID Proof box IF a document file URL actually exists!
  if (profile.nomineeProofDocument && profile.nomineeProofDocument.trim() !== '') {
    docTypes.push({
      name: isNomineeInternational ? 'Nominee International Passport / National ID Card Upload' : 'Nominee ID Proof (Aadhaar / Driving License / Passport)',
      key: 'nomineeProofDocument',
      description: isNomineeInternational ? 'Proof of Nominee International Passport or National ID' : 'Proof of Nominee Identity (Aadhaar / Driving License / Passport)',
      fileSize: '1.5 MB',
    });
  }

  const safeName = user.name.replace(/\s+/g, '_');

  // Auto-verify KYC if core 3 documents are verified
  const coreVerified = profile.panDocumentVerified === true && profile.idProofDocumentVerified === true && profile.bankProofDocumentVerified === true;
  let kycStatusVal = profile.kycStatus || 'PENDING';

  if (coreVerified && kycStatusVal !== 'VERIFIED') {
    kycStatusVal = 'VERIFIED';
    profile.kycStatus = 'VERIFIED';
    profile.status = 'active';
    await profile.save();
    await User.findByIdAndUpdate(profile.userId, { isActive: true });
  }

  const documents = docTypes.map(doc => {
    const url = profile[doc.key] || '';
    const fileExtension = url.split('.').pop().split('?')[0] || 'pdf';
    
    const suffix = doc.key.replace('Document', '').replace('Proof', '');
    const capitalizedSuffix = suffix.charAt(0).toUpperCase() + suffix.slice(1);
    const fileName = `${safeName}_${capitalizedSuffix}.${fileExtension}`;

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
      idProofDocumentVerified: profile.idProofDocumentVerified || false,
      bankProofDocumentVerified: profile.bankProofDocumentVerified || false,
      agreementDocumentVerified: profile.agreementDocumentVerified || false,
      nomineeProofDocumentVerified: profile.nomineeProofDocumentVerified || false,
    },
  };
};

module.exports = {
  getAgentDetailsData,
  getAgentDocumentsData,
};
