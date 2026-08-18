const fs = require('fs');
const mongoose = require('mongoose');
const User = require('../../models/User.model');
const AgentProfile = require('../../models/AgentProfile.model');
const ClientProfile = require('../../models/ClientProfile.model');
const Investment = require('../../models/Investment.model');
const AgentCommission = require('../../models/AgentCommission.model');
const Transaction = require('../../models/Transaction.model');
const { deleteFromCloudinary, processDocumentUploadsInBackground, uploadDocumentsToCloudinaryParallelBackground } = require('../../services/cloudinary.service');
const { sendWelcomeEmail } = require('../../services/email.service');
const AppError = require('../../utils/AppError');
const asyncHandler = require('../../utils/asyncHandler');
const { ROLES } = require('../../constants/roles');

const { generateTempPassword } = require('../../utils/generate-password');
const agentDetailsService = require('../../services/agent-details.service');

/**
 * Cleanup helper for local temporary multer files
 */
const cleanupLocalFiles = (files) => {
  if (!files) return;
  Object.values(files).forEach(fileArray => {
    fileArray.forEach(file => {
      if (fs.existsSync(file.path)) {
        try {
          fs.unlinkSync(file.path);
        } catch (err) {
          console.error(`[Cleanup] Failed to delete local temp file ${file.path}:`, err.message);
        }
      }
    });
  });
};

/**
 * Cleanup helper to remove uploaded files from Cloudinary storage in case of db rollback
 */
const deleteCloudinaryFiles = async (urls) => {
  for (const url of urls) {
    if (url) {
      try {
        await deleteFromCloudinary(url);
      } catch (err) {
        console.error(`[Cleanup] Failed to purge file ${url} from Cloudinary:`, err.message);
      }
    }
  }
};

/**
 * Create a new Agent Account and Portal Profile (Super Admin only)
 * POST /api/super-admin/agents
 */
const createAgent = asyncHandler(async (req, res, next) => {
  const {
    fullName,
    phone,
    email,
    address,
    residencyStatus,
    panNumber,
    aadhaarNumber,
    bankName,
    accountNumber,
    ifscCode,
    oneTimeCommission,
    monthlySlab,
    specialCommission,
    nomineeName,
    nomineeRelation,
    nomineePhone,
    nomineeEmail,
    nomineeResidency,
    password,
    portalPassword,
    status,
    citizenship,
  } = req.body;

  // 1) Check if email is already registered in the system (case-insensitive & trimmed)
  const cleanEmail = email ? String(email).trim().toLowerCase() : '';
  if (!cleanEmail) {
    return next(new AppError('Email address is required.', 400));
  }
  const existingUser = await User.findOne({ email: { $regex: new RegExp(`^${cleanEmail.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&')}$`, 'i') } });
  if (existingUser) {
    return next(new AppError(`Email address (${cleanEmail}) is already in use by another account.`, 400));
  }

  // 2) Generate a sequential unique agent code starting from KFPL-AG-1001 with gap-filling
  const agentUsers = await User.find({ clientCode: { $regex: /^KFPL-AG-/i } }, { clientCode: 1 }).lean();
  const usedSeqs = new Set();
  agentUsers.forEach(a => {
    if (a.clientCode) {
      const digits = a.clientCode.match(/(\d+)$/);
      if (digits) {
        let seq = parseInt(digits[1], 10);
        if (seq < 1000 && seq > 0) seq = 1000 + seq;
        if (!isNaN(seq)) usedSeqs.add(seq);
      }
    }
  });

  let nextSeq = 1001;
  while (usedSeqs.has(nextSeq) || await User.findOne({ clientCode: `KFPL-AG-${nextSeq}` })) {
    nextSeq++;
  }
  const agentCode = `KFPL-AG-${nextSeq}`;

  // 3) Use provided custom password or generate a secure temporary password
  const tempPassword = password || portalPassword || generateTempPassword();

  const finalResidencyStatus = residencyStatus || (citizenship === 'International' ? 'International' : 'National (Domestic)');

  // Define database variables outside to perform rollback on error
  let createdUser, createdProfile;

  try {
    // 4) Create the User document
    createdUser = await User.create({
      name: fullName,
      email: cleanEmail,
      clientCode: agentCode,
      password: tempPassword,
      role: ROLES.AGENT,
      phone: phone || '',
      isActive: status !== 'inactive',
      isEmailVerified: true,
      createdBy: req.user?.id,
    });

    // 5) Create the AgentProfile document
    createdProfile = await AgentProfile.create({
      userId: createdUser._id,
      clientCode: agentCode,
      fullName,
      phone: phone || '',
      email: cleanEmail,
      address: address || '',
      residencyStatus: finalResidencyStatus,
      panNumber: panNumber ? panNumber.toUpperCase() : '',
      aadhaarNumber: aadhaarNumber || '',
      bankName: bankName || '',
      accountNumber: accountNumber || '',
      ifscCode: ifscCode ? ifscCode.toUpperCase() : '',
      oneTimeCommission: oneTimeCommission !== undefined ? Number(oneTimeCommission) : 0,
      monthlySlab: monthlySlab || '',
      specialCommission: specialCommission !== undefined ? Number(specialCommission) : 0,
      nomineeName,
      nomineeRelation,
      nomineePhone,
      nomineeEmail,
      nomineeResidency: nomineeResidency || 'National (Domestic)',
      panDocument: '',
      idProofDocument: '',
      idProofBackDocument: '',
      bankProofDocument: '',
      nomineeProofDocument: '',
      documentStatus: 'pending_upload',
      status: status || 'active',
      portalPassword: tempPassword,
    });
  } catch (dbError) {
    if (createdUser) {
      await User.findByIdAndDelete(createdUser._id);
    }
    return next(new AppError(`Database transaction failed: ${dbError.message}`, 500));
  }

  // 6) Trigger parallel in-memory background uploads (Vercel-safe using waitUntil)
  const uploadFileFields = [
    'panDocument',
    'idProofDocument',
    'idProofBackDocument',
    'aadhaarDocument',
    'aadhaarBackDocument',
    'bankProofDocument',
    'nomineeProofDocument',
  ];

  uploadDocumentsToCloudinaryParallelBackground({
    files: req.files,
    fileFields: uploadFileFields,
    Model: AgentProfile,
    filter: { userId: createdUser._id },
    entityLabel: 'Agent',
  });

  try {
    const loginUrl = process.env.AGENT_PORTAL_URL || 'https://partner.kinetoscopefilms.com';
    await sendWelcomeEmail(cleanEmail, fullName, agentCode, tempPassword, loginUrl);
  } catch (emailError) {
    console.error(`Welcome email failed to dispatch to ${cleanEmail}:`, emailError.message);
  }

  createdUser.password = undefined;

  res.status(201).json({
    success: true,
    message: 'Agent onboarding initiated. Documents are uploading in the background.',
    data: {
      user: createdUser,
      profile: createdProfile,
      credentials: {
        agentCode,
        email: cleanEmail,
        temporaryPassword: tempPassword,
      },
    },
  });
});


/**
 * Auto-fix helper to ensure all agent accounts have unique, non-duplicate sequential KFPL-AG-100X codes.
 */
const deduplicateAgentCodes = async () => {
  try {
    const agents = await User.find({ role: ROLES.AGENT }).sort({ createdAt: 1 });
    const seenCodes = new Set();
    let maxSeq = 1000;

    agents.forEach(a => {
      if (a.clientCode) {
        const digits = a.clientCode.match(/\d+/);
        if (digits) {
          let seq = parseInt(digits[0], 10);
          if (seq < 1000 && seq > 0) seq = 1000 + seq;
          if (seq > maxSeq) maxSeq = seq;
        }
      }
    });

    for (const agent of agents) {
      const code = agent.clientCode ? agent.clientCode.toUpperCase().trim() : '';
      if (!code || seenCodes.has(code)) {
        maxSeq += 1;
        const newCode = `KFPL-AG-${maxSeq}`;
        console.log(`[DeduplicateAgents] Fixing duplicate/missing code for agent ${agent.name} (${agent._id}) from "${code}" -> "${newCode}"`);
        await User.updateOne({ _id: agent._id }, { clientCode: newCode });
        seenCodes.add(newCode);
      } else {
        seenCodes.add(code);
      }
    }
  } catch (err) {
    console.error('[DeduplicateAgents Error]:', err.message);
  }
};

/**
 * Get all Agents (Supports Search, Status Filter, and Pagination)
 * GET /api/super-admin/agents
 */
const getAllAgents = asyncHandler(async (req, res, next) => {
  // Ensure agent codes are strictly deduplicated
  await deduplicateAgentCodes();

  const { search, status, page, limit } = req.query;

  // Build user query targeting agent role
  const userQuery = { role: { $in: [ROLES.AGENT, 'agent', 'AGENT'] } };

  if (search) {
    userQuery.$or = [
      { name: { $regex: search, $options: 'i' } },
      { email: { $regex: search, $options: 'i' } },
      { clientCode: { $regex: search, $options: 'i' } },
    ];
  }

  // Filter based on profile status
  if (status) {
    const statusRegex = new RegExp(`^${status}$`, 'i');
    const profilesMatchingStatus = await AgentProfile.find({ status: statusRegex }, { userId: 1 });
    const userIds = profilesMatchingStatus.map(p => p.userId).filter(Boolean);
    userQuery._id = { $in: userIds };
  }

  let users, total;
  if (page === undefined && limit === undefined) {
    // Dropdown / non-paginated fetch: get all matching agents
    users = await User.find(userQuery)
      .populate('createdBy', 'name email')
      .sort({ name: 1 })
      .lean();
    total = users.length;
  } else {
    // Paginated table fetch
    const pageNum = parseInt(page, 10) || 1;
    const limitNum = parseInt(limit, 10) || 10000;
    const skip = (pageNum - 1) * limitNum;
    
    [users, total] = await Promise.all([
      User.find(userQuery)
        .populate('createdBy', 'name email')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .lean(),
      User.countDocuments(userQuery)
    ]);
  }

  const agentIds = users.map(u => u._id).filter(Boolean);

  // Fetch agent profiles, assigned clients, and agent commissions in parallel in bulk
  const [profiles, allClients, allCommissions] = await Promise.all([
    AgentProfile.find({ userId: { $in: agentIds } }).lean(),
    User.find(
      { role: { $in: [ROLES.CLIENT, 'client', 'CLIENT'] }, assignedAgent: { $in: agentIds } },
      { _id: 1, assignedAgent: 1 }
    ).lean(),
    AgentCommission.find({ agentId: { $in: agentIds } }).lean()
  ]);

  const profileMap = {};
  profiles.forEach(p => {
    if (p && p.userId) {
      profileMap[p.userId.toString()] = p;
    }
  });

  // Map agent ID to their total commissions
  const agentCommissionMap = {};
  agentIds.forEach(id => {
    if (id) {
      agentCommissionMap[id.toString()] = 0;
    }
  });

  allCommissions.forEach(com => {
    if (com && com.agentId && String(com.status).toUpperCase() === 'PAID') {
      const agId = com.agentId.toString();
      if (agentCommissionMap[agId] !== undefined) {
        const invAmt = Number(com.investmentAmount || 0);
        const ratePct = Number(com.slabPercentage || 1);
        const actualAmt = (invAmt > 0 && ratePct > 0) ? Math.round((invAmt * ratePct) / 100) : Number(com.amount || 0);
        agentCommissionMap[agId] += actualAmt;
      }
    }
  });

  // Map agent ID to their list of client IDs
  const agentClientsMap = {};
  agentIds.forEach(id => {
    if (id) {
      agentClientsMap[id.toString()] = [];
    }
  });
  
  const allClientIds = [];
  allClients.forEach(c => {
    if (c && c.assignedAgent) {
      const agentIdStr = c.assignedAgent.toString();
      if (agentClientsMap[agentIdStr]) {
        agentClientsMap[agentIdStr].push(c._id.toString());
      }
      allClientIds.push(c._id);
    }
  });

  // Fetch active investments, approved deposits, and client profiles in bulk
  let investmentMap = {}; // Maps clientId -> total investment
  if (allClientIds.length > 0) {
    const [investments, approvedDeposits, clientProfiles] = await Promise.all([
      Investment.find(
        { clientId: { $in: allClientIds } },
        { clientId: 1, investmentAmount: 1, status: 1 }
      ).lean(),
      Transaction.find(
        { clientId: { $in: allClientIds }, type: 'deposit', status: 'approved' },
        { clientId: 1, amount: 1 }
      ).lean(),
      ClientProfile.find(
        { userId: { $in: allClientIds } },
        { userId: 1, totalInvestment: 1 }
      ).lean()
    ]);

    const clientInvMap = {};
    const clientDepMap = {};
    const clientProfMap = {};

    investments.forEach(inv => {
      if (inv && inv.clientId && inv.status !== 'cancelled') {
        const cid = inv.clientId.toString();
        clientInvMap[cid] = (clientInvMap[cid] || 0) + (Number(inv.investmentAmount) || 0);
      }
    });

    approvedDeposits.forEach(tx => {
      if (tx && tx.clientId) {
        const cid = tx.clientId.toString();
        clientDepMap[cid] = (clientDepMap[cid] || 0) + (Number(tx.amount) || 0);
      }
    });

    clientProfiles.forEach(p => {
      if (p && p.userId) {
        const cid = p.userId.toString();
        clientProfMap[cid] = Number(p.totalInvestment) || 0;
      }
    });

    allClientIds.forEach(idObj => {
      const cid = idObj.toString();
      const invAmt = clientInvMap[cid] || 0;
      const depAmt = clientDepMap[cid] || 0;
      const profAmt = clientProfMap[cid] || 0;
      investmentMap[cid] = Math.max(invAmt, depAmt, profAmt);
    });
  }

  // Assemble final records
  const agentRecords = users.map(user => {
    if (!user || !user._id) return null;
    const userIdStr = user._id.toString();
    const profile = profileMap[userIdStr] || null;
    const clientIdsForAgent = agentClientsMap[userIdStr] || [];
    const clientsCount = clientIdsForAgent.length;
    let totalInvestment = 0;
    clientIdsForAgent.forEach(cid => {
      totalInvestment += (investmentMap[cid] || 0);
    });

    const commissionPaidVal = totalInvestment > 0 ? (agentCommissionMap[userIdStr] || 0) : 0;

    return {
      _id: user._id,
      agentId: user.clientCode || (profile && profile.clientCode) || '',
      name: user.name || (profile && profile.fullName) || '',
      status: (profile && profile.status) || 'active',
      email: user.email,
      clientCode: user.clientCode,
      isActive: user.isActive,
      createdAt: user.createdAt,
      profilePic: (profile && profile.profilePic) || user.profilePic || '',
      user,
      profile,
      clientsCount,
      totalInvestment,
      commissionPaid: Math.round(commissionPaidVal),
      totalCommissionsPaid: Math.round(commissionPaidVal),
      totalCommission: Math.round(commissionPaidVal),
    };
  }).filter(Boolean);

  res.status(200).json({
    success: true,
    count: agentRecords.length,
    pagination: {
      total,
      page: page ? Number(page) : 1,
      limit: limit ? Number(limit) : total,
      pages: limit ? Math.ceil(total / limit) : 1,
    },
    data: {
      agents: agentRecords,
    },
  });
});

/**
 * Get Agent by ID
 * GET /api/super-admin/agents/:id
 */
const getAgentById = asyncHandler(async (req, res, next) => {
  const details = await agentDetailsService.getAgentDetailsData(req.params.id);
  const documentsData = await agentDetailsService.getAgentDocumentsData(req.params.id);

  res.status(200).json({
    success: true,
    data: {
      ...details,
      documents: documentsData.documents,
      kycStatus: documentsData.kycStatus,
      verificationStatus: documentsData.verificationStatus,
    },
  });
});

/**
 * Update Agent details and status (Super Admin only)
 * PATCH /api/super-admin/agents/:id
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

const findAgentUser = async (identifier) => {
  if (!identifier) return null;
  const str = String(identifier).trim();
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

const updateAgent = asyncHandler(async (req, res, next) => {
  const user = await findAgentUser(req.params.id);
  if (!user || user.role !== ROLES.AGENT) {
    return next(new AppError('Agent user record not found.', 404));
  }

  const userId = user._id;
  const profile = await AgentProfile.findOne({ userId });
  if (!profile) {
    return next(new AppError('Agent profile record not found.', 404));
  }

  // 2) Parse updates for the User model
  const userUpdates = {};
  if (req.body.fullName) {
    userUpdates.name = req.body.fullName;
  }
  if (req.body.status) {
    req.body.status = req.body.status.toLowerCase();
    userUpdates.isActive = req.body.status === 'active';
  }
  if (req.body.email) {
    const newEmail = req.body.email.toLowerCase().trim();
    if (newEmail !== user.email) {
      const duplicateUser = await User.findOne({ email: newEmail });
      if (duplicateUser) {
        cleanupLocalFiles(req.files);
        return next(new AppError('Email address is already in use by another account.', 400));
      }
      userUpdates.email = newEmail;
    }
  }

  const profileUpdates = {};

  if (req.body.password || req.body.portalPassword) {
    const newPwd = req.body.password || req.body.portalPassword;
    userUpdates.password = newPwd;
    profileUpdates.portalPassword = newPwd;
  }

  // Guard against masked bank account numbers from front-end input
  if (req.body.accountNumber && (req.body.accountNumber.includes('X') || req.body.accountNumber.includes('x') || req.body.accountNumber.includes('*'))) {
    delete req.body.accountNumber;
  }

  // 3) Parse updates for the AgentProfile model
  const profileFields = [
    'fullName',
    'phone',
    'address',
    'residencyStatus',
    'panNumber',
    'aadhaarNumber',
    'bankName',
    'accountNumber',
    'ifscCode',
    'oneTimeCommission',
    'monthlySlab',
    'specialCommission',
    'nomineeName',
    'nomineeRelation',
    'nomineePhone',
    'nomineeEmail',
    'nomineeResidency',
    'status',
    'kycStatus',
    'panDocumentVerified',
    'idProofDocumentVerified',
    'bankProofDocumentVerified',
    'agreementDocumentVerified',
    'agreementDocumentVerifiedAt',
    'nomineeProofDocumentVerified',
  ];

  profileFields.forEach(field => {
    if (req.body[field] !== undefined) {
      profileUpdates[field] = req.body[field];
    }
  });

  // Align status and isActive when kycStatus is updated to VERIFIED or core docs are verified
  const panVerified = profileUpdates.panDocumentVerified !== undefined ? profileUpdates.panDocumentVerified : profile.panDocumentVerified;
  const idVerified = profileUpdates.idProofDocumentVerified !== undefined ? profileUpdates.idProofDocumentVerified : profile.idProofDocumentVerified;
  const bankVerified = profileUpdates.bankProofDocumentVerified !== undefined ? profileUpdates.bankProofDocumentVerified : profile.bankProofDocumentVerified;

  if (req.body.kycStatus === 'VERIFIED' || (panVerified && idVerified && bankVerified)) {
    profileUpdates.kycStatus = 'VERIFIED';
    profileUpdates.status = 'active';
    userUpdates.isActive = true;
  }

  // Align User model isActive when agent status is updated
  if (req.body.status) {
    const normalizedStatus = req.body.status.toLowerCase();
    profileUpdates.status = normalizedStatus;
    userUpdates.isActive = (normalizedStatus === 'active');
  }

  if (userUpdates.email) {
    profileUpdates.email = userUpdates.email;
  }

  // 4) Process optional document uploads using buffer upload to Cloudinary (in-memory)
  // Process document removal requests from Super Admin
  const removedDocLabels = [];
  const removeDocMap = [
    { flag: 'removePanDocument', field: 'panDocument', verify: 'panDocumentVerified' },
    { flag: 'removeIdProofDocument', field: 'idProofDocument', verify: 'idProofDocumentVerified' },
    { flag: 'removeIdProofBackDocument', field: 'idProofBackDocument', verify: 'idProofBackDocumentVerified' },
    { flag: 'removeBankProofDocument', field: 'bankProofDocument', verify: 'bankProofDocumentVerified' },
    { flag: 'removeNomineeProofDocument', field: 'nomineeProofDocument', verify: 'nomineeProofDocumentVerified' },
    { flag: 'removeAgreementDocument', field: 'agreementDocument', verify: 'agreementDocumentVerified', extraField: 'signedAgreementUrl' },
  ];

  removeDocMap.forEach(cfg => {
    if (req.body[cfg.flag] === 'true' || req.body[cfg.field] === '') {
      profileUpdates[cfg.field] = '';
      if (cfg.verify) profileUpdates[cfg.verify] = false;
      if (cfg.extraField) profileUpdates[cfg.extraField] = '';
      if (['panDocument', 'idProofDocument', 'idProofBackDocument'].includes(cfg.field)) {
        profileUpdates.kycStatus = 'PENDING';
      }
      const labelMap = {
        panDocument: 'PAN Card Document',
        idProofDocument: 'ID Proof Document (Front Side)',
        idProofBackDocument: 'Aadhaar Card Back Side (Address Proof)',
        bankProofDocument: 'Bank Details Document (Cancelled Cheque)',
        nomineeProofDocument: 'Nominee ID Proof Document',
        agreementDocument: 'Signed Agent Service Agreement',
      };
      if (labelMap[cfg.field]) removedDocLabels.push(labelMap[cfg.field]);
    }
  });

  if (removedDocLabels.length > 0 && user.email) {
    const { sendDocumentReuploadRequiredEmail } = require('../../services/email.service');
    sendDocumentReuploadRequiredEmail({
      toEmail: user.email,
      userName: user.name,
      userRole: 'Agent',
      missingDocs: removedDocLabels,
    }).catch(err => console.error('[Email Trigger] Agent doc reupload email failed:', err.message));
  }

  const fileFields = [
    'panDocument',
    'idProofDocument',
    'idProofBackDocument',
    'aadhaarDocument',
    'aadhaarBackDocument',
    'bankProofDocument',
    'nomineeProofDocument',
    'agreementDocument',
  ];

  const { uploadBufferToCloudinary } = require('../../services/cloudinary.service');
  const uploadedUrls = [];
  try {
    if (req.files) {
      for (const field of fileFields) {
        if (req.files[field] && req.files[field].length > 0) {
          // Delete old document from Cloudinary if it exists
          if (profile[field]) {
            try {
              await deleteFromCloudinary(profile[field]);
            } catch (err) {
              console.error(`[Cleanup] Failed to delete old file ${profile[field]} from Cloudinary:`, err.message);
            }
          }

          // Upload memory buffer to Cloudinary
          const buffer = req.files[field][0].buffer;
          const newUrl = await uploadBufferToCloudinary(buffer, 'kinetoscope');
          profileUpdates[field] = newUrl;
          if (field === 'agreementDocument') {
            profileUpdates.signedAgreementUrl = newUrl;
            profileUpdates.agreementDocumentVerified = true;
          }
          if (field === 'panDocument') profileUpdates.panDocumentVerified = true;
          if (field === 'idProofDocument') profileUpdates.idProofDocumentVerified = true;
          if (field === 'bankProofDocument') profileUpdates.bankProofDocumentVerified = true;
          if (field === 'nomineeProofDocument') profileUpdates.nomineeProofDocumentVerified = true;
          uploadedUrls.push(newUrl);
        }
      }
    }
  } catch (uploadError) {
    await deleteCloudinaryFiles(uploadedUrls);
    return next(new AppError(`Document upload failed: ${uploadError.message}`, 500));
  }

  // Dynamic KYC Status Re-evaluation for Agent
  const finalPan = profileUpdates.panDocument !== undefined ? profileUpdates.panDocument : profile.panDocument;
  const finalPanVerified = profileUpdates.panDocumentVerified !== undefined ? profileUpdates.panDocumentVerified : profile.panDocumentVerified;

  const finalId = profileUpdates.idProofDocument !== undefined ? profileUpdates.idProofDocument : (profile.idProofDocument || profile.aadhaarDocument);
  const finalIdVerified = profileUpdates.idProofDocumentVerified !== undefined ? profileUpdates.idProofDocumentVerified : (profile.idProofDocumentVerified || profile.aadhaarDocumentVerified);

  const finalBank = profileUpdates.bankProofDocument !== undefined ? profileUpdates.bankProofDocument : profile.bankProofDocument;
  const finalBankVerified = profileUpdates.bankProofDocumentVerified !== undefined ? profileUpdates.bankProofDocumentVerified : profile.bankProofDocumentVerified;

  const finalAgreement = profileUpdates.agreementDocument !== undefined ? profileUpdates.agreementDocument : profile.agreementDocument;
  const finalAgreementVerified = profileUpdates.agreementDocumentVerified !== undefined ? profileUpdates.agreementDocumentVerified : profile.agreementDocumentVerified;

  const isPanOk = Boolean(finalPan && String(finalPan).trim() !== '' && finalPan !== 'null') && Boolean(finalPanVerified);
  const isIdOk = Boolean(finalId && String(finalId).trim() !== '' && finalId !== 'null') && Boolean(finalIdVerified);
  const isBankOk = Boolean(finalBank && String(finalBank).trim() !== '' && finalBank !== 'null') && Boolean(finalBankVerified);
  const isAgreementOk = Boolean(finalAgreement && String(finalAgreement).trim() !== '' && finalAgreement !== 'null') && Boolean(finalAgreementVerified);

  const isAgentFullyVerified = isPanOk && isIdOk && isBankOk && isAgreementOk;

  if (!isAgentFullyVerified) {
    profileUpdates.kycStatus = 'PENDING';
  } else if (isAgentFullyVerified && (req.body.kycStatus === 'VERIFIED' || profile.kycStatus === 'PENDING')) {
    profileUpdates.kycStatus = 'VERIFIED';
  }

  // 5) Perform database updates
  const updatedUser = await User.findByIdAndUpdate(userId, { $set: userUpdates }, { new: true, runValidators: true });
  const updatedProfile = await AgentProfile.findOneAndUpdate(
    { userId },
    { $set: profileUpdates },
    { new: true, runValidators: true }
  );

  res.status(200).json({
    success: true,
    message: 'Agent updated successfully',
    data: {
      user: updatedUser,
      profile: updatedProfile,
    },
  });
});

/**
 * Delete an Agent User, Profile, and documents stored on Firebase (Super Admin only)
 * DELETE /api/super-admin/agents/:id
 */
const deleteAgent = asyncHandler(async (req, res, next) => {
  const targetId = req.params.id;

  let user = null;
  let profile = null;

  if (mongoose.Types.ObjectId.isValid(targetId)) {
    user = await User.findById(targetId);
    if (!user) {
      profile = await AgentProfile.findById(targetId);
      if (profile && profile.userId) {
        user = await User.findById(profile.userId);
      }
    }
  }

  if (!user) {
    user = await User.findOne({ clientCode: targetId });
  }

  if (!profile && user) {
    profile = await AgentProfile.findOne({ userId: user._id });
  }

  if (!profile && !user) {
    profile = await AgentProfile.findOne({ agentCode: targetId });
    if (profile && profile.userId) {
      user = await User.findById(profile.userId);
    }
  }

  if (!user && !profile) {
    return next(new AppError('Agent record not found.', 404));
  }

  // 1) Purge documents from Cloudinary storage if they exist
  if (profile) {
    const documentsToPurge = [
      profile.panDocument,
      profile.idProofDocument,
      profile.bankProofDocument,
      profile.nomineeProofDocument,
    ];
    await deleteCloudinaryFiles(documentsToPurge);
    await AgentProfile.findByIdAndDelete(profile._id);
  }

  // 2) Delete associated AgentCommissions, Transactions, and User record
  if (user) {
    await Promise.all([
      User.updateMany({ assignedAgent: user._id }, { $unset: { assignedAgent: '' } }),
      AgentCommission.deleteMany({ agentId: user._id }),
      Transaction.deleteMany({ agentId: user._id, isAgentWithdrawal: true }),
      User.findByIdAndDelete(user._id)
    ]);
  }

  res.status(200).json({
    success: true,
    message: 'Agent account, profile, documents, and associated records deleted successfully.',
  });
});

/**
 * Get Clients assigned to a specific Agent (Super Admin only)
 * GET /api/super-admin/agents/:id/clients
 */
const getAgentClients = asyncHandler(async (req, res, next) => {
  const agentId = req.params.id;

  // 1) Verify agent exists (check by User ID, AgentProfile ID, agentCode, or name slug)
  let agentUser = null;
  let agentProfile = null;

  if (mongoose.Types.ObjectId.isValid(agentId)) {
    agentUser = await User.findById(agentId);
    if (!agentUser) {
      agentProfile = await AgentProfile.findById(agentId);
      if (agentProfile) agentUser = await User.findById(agentProfile.userId);
    }
  }

  if (!agentUser) {
    agentUser = await User.findOne({
      $or: [
        { clientCode: agentId },
        { name: { $regex: new RegExp(`^${agentId.replace(/-/g, ' ')}$`, 'i') } },
        { name: { $regex: new RegExp(`^${agentId.replace(/-/g, '.*')}$`, 'i') } }
      ],
      role: ROLES.AGENT
    });
  }

  if (!agentUser) {
    const AgentProfileModel = require('../../models/AgentProfile.model');
    agentProfile = await AgentProfileModel.findOne({
      $or: [
        { agentCode: agentId },
        { clientCode: agentId }
      ]
    });
    if (agentProfile) agentUser = await User.findById(agentProfile.userId);
  }

  if (!agentUser && !agentProfile) {
    return next(new AppError('Agent account not found.', 404));
  }

  const targetUserId = agentUser ? agentUser._id : agentProfile.userId;
  const targetProfileId = agentProfile ? agentProfile._id : null;
  const rawCodes = [agentUser?.clientCode, agentProfile?.agentId, agentUser?.name, agentProfile?.fullName].filter(Boolean);

  const extraCodes = [];
  rawCodes.forEach(code => {
    if (typeof code === 'string') {
      if (code.startsWith('KFPL-AG-')) extraCodes.push(code.replace('KFPL-AG-', 'KFPL-AGT-'));
      if (code.startsWith('KFPL-AGT-')) extraCodes.push(code.replace('KFPL-AGT-', 'KFPL-AG-'));
    }
  });

  const allAgentIdentifiers = [...new Set([
    agentId,
    targetUserId ? targetUserId.toString() : null,
    targetProfileId ? targetProfileId.toString() : null,
    ...rawCodes,
    ...extraCodes
  ].filter(Boolean))];

  const objectIds = allAgentIdentifiers.filter(id => mongoose.Types.ObjectId.isValid(id)).map(id => new mongoose.Types.ObjectId(id));

  const monthlySlabStr = (agentProfile && agentProfile.monthlySlab) ? String(agentProfile.monthlySlab).replace('%', '') : '0.5';
  const monthlySlabPct = parseFloat(monthlySlabStr) || 0.5;
  const months = 3;

  const formattedAgentCommission = 'Automatic (Slab)';

  // 2) Find all clients assigned to this agent via User.assignedAgent (ObjectId ref)
  const matchingUsers = objectIds.length > 0
    ? await User.find({
        role: ROLES.CLIENT,
        assignedAgent: { $in: objectIds }
      }).lean()
    : [];

  const clientUserIds = matchingUsers.map(u => u._id);

  const clients = await User.find({
    role: ROLES.CLIENT,
    _id: { $in: clientUserIds }
  }).sort({ createdAt: -1 });

  const clientIds = clients.map(c => c._id);

  // Bulk fetch profiles, investments, and approved deposit transactions
  const [profiles, investments, approvedDeposits] = await Promise.all([
    ClientProfile.find({ userId: { $in: clientIds } }).lean(),
    Investment.find({ clientId: { $in: clientIds }, status: 'active' }).lean(),
    Transaction.find({ clientId: { $in: clientIds }, type: 'deposit', status: 'approved' }).lean()
  ]);

  const profileMap = {};
  profiles.forEach(p => {
    profileMap[p.userId.toString()] = p;
  });

  const investmentsMap = {};
  const depositsMap = {};
  clientIds.forEach(id => {
    const idStr = id.toString();
    investmentsMap[idStr] = [];
    depositsMap[idStr] = 0;
  });

  investments.forEach(inv => {
    const cidStr = inv.clientId.toString();
    if (investmentsMap[cidStr]) {
      investmentsMap[cidStr].push(inv);
    }
  });

  approvedDeposits.forEach(tx => {
    const cidStr = tx.clientId ? tx.clientId.toString() : '';
    if (cidStr && depositsMap[cidStr] !== undefined) {
      depositsMap[cidStr] += (tx.amount || 0);
    }
  });

  const clientRecords = clients.map(client => {
    const cidStr = client._id.toString();
    const profile = profileMap[cidStr];
    const clientInvestments = investmentsMap[cidStr] || [];
    const invTotal = clientInvestments.reduce((sum, inv) => sum + (inv.investmentAmount || 0), 0);
    const depTotal = depositsMap[cidStr] || 0;
    const totalInvestment = Math.max(invTotal, depTotal);

    const commissionPaid = totalInvestment * (monthlySlabPct / 100) * months;

    return {
      clientId: client.clientCode || '',
      id: client._id,
      name: client.name,
      email: client.email,
      phone: profile ? profile.phone : '',
      joinDate: client.createdAt,
      contractStartDate: profile ? profile.contractStartDate : client.createdAt,
      contractEndDate: profile ? profile.contractEndDate : '',
      extendContractDate: profile ? profile.extendContractDate : '',
      totalInvestment,
      roi: profile ? profile.monthlyRoi : 0,
      monthlyRoi: profile ? profile.monthlyRoi : 0,
      commissionPaid: Math.round(commissionPaid),
      agentCommission: formattedAgentCommission,
      agentCommissionMonthly: formattedAgentCommission,
      status: profile ? profile.status : 'active',
      
      // Dual-compatibility nested structure
      user: {
        _id: client._id,
        name: client.name,
        email: client.email,
        clientCode: client.clientCode || '',
        createdAt: client.createdAt,
      },
      profile: {
        _id: profile ? profile._id : null,
        phone: profile ? profile.phone : '',
        status: profile ? profile.status : 'active',
        monthlyRoi: profile ? profile.monthlyRoi : 1.2,
      },
    };
  });

  res.status(200).json({
    success: true,
    count: clientRecords.length,
    data: {
      clients: clientRecords,
    },
  });
});

/**
 * Get Commission history for a specific Agent (Super Admin only)
 * GET /api/super-admin/agents/:id/commissions
 */
const getAgentCommissions = asyncHandler(async (req, res, next) => {
  const agentParam = req.params.id;

  // 1) Verify agent exists (by ObjectId, clientCode, agentCode, or name/slug)
  let agent = null;
  if (mongoose.Types.ObjectId.isValid(agentParam)) {
    agent = await User.findById(agentParam);
  }
  if (!agent) {
    agent = await User.findOne({
      $or: [
        { clientCode: agentParam },
        { name: { $regex: new RegExp(`^${agentParam.replace(/-/g, ' ')}$`, 'i') } },
        { name: { $regex: new RegExp(`^${agentParam.replace(/-/g, '.*')}$`, 'i') } }
      ],
      role: ROLES.AGENT
    });
  }
  if (!agent) {
    const AgentProfile = require('../../models/AgentProfile.model');
    const profile = await AgentProfile.findOne({
      $or: [
        { agentCode: agentParam },
        { clientCode: agentParam }
      ]
    });
    if (profile) agent = await User.findById(profile.userId);
  }

  if (!agent || agent.role !== ROLES.AGENT) {
    return next(new AppError('Agent account not found.', 404));
  }

  const agentId = agent._id;

  // 2) Fetch assigned clients for this agent
  const clients = await User.find({ role: ROLES.CLIENT, assignedAgent: agentId }).lean();
  const clientObjectIds = clients.map(c => c._id);

  // 3) Fetch DB records in parallel: investments, profiles, deposits, slabs, agent override, existing commissions
  const CommissionSlab = require('../../models/CommissionSlab.model');
  const AgentOverride = require('../../models/AgentOverride.model');
  const Investment = require('../../models/Investment.model');
  const ClientProfile = require('../../models/ClientProfile.model');
  const Transaction = require('../../models/Transaction.model');

  const [investments, clientProfiles, approvedDeposits, slabs, agentOverride, existingComms] = await Promise.all([
    Investment.find({ clientId: { $in: clientObjectIds }, status: { $ne: 'cancelled' } }).lean(),
    ClientProfile.find({ userId: { $in: clientObjectIds } }).lean(),
    Transaction.find({
      clientId: { $in: clientObjectIds },
      type: { $regex: /deposit/i },
      status: { $regex: /^(paid|approved|credited|completed)$/i }
    }).lean(),
    CommissionSlab.find({}).sort({ minAmount: 1 }).lean(),
    AgentOverride.findOne({ agentId }).lean(),
    AgentCommission.find({ agentId }).populate('clientId', 'name email clientCode').sort({ createdAt: -1 })
  ]);

  // 4) Map each client's active investment amount
  const clientInvestmentMap = {};
  clients.forEach(c => {
    const cidStr = String(c._id);
    const invs = investments.filter(i => String(i.clientId) === cidStr);
    const invSum = invs.reduce((s, i) => s + (i.investmentAmount || i.amount || 0), 0);
    const prof = clientProfiles.find(p => String(p.userId) === cidStr);
    const profSum = prof ? (prof.totalInvestment || 0) : 0;
    const deps = approvedDeposits.filter(d => String(d.clientId) === cidStr);
    const depSum = deps.reduce((s, d) => s + (d.amount || 0), 0);

    clientInvestmentMap[cidStr] = Math.max(invSum, profSum, depSum);
  });

  // Helper: calculate commission rate from DB slabs or agent override
  const getSlabRate = (amount, slabType = 'one-time') => {
    if (agentOverride && agentOverride.commissionOverride !== undefined && agentOverride.commissionOverride !== null) {
      return Number(agentOverride.commissionOverride);
    }
    const typeSlabs = slabs.filter(s => s.type === slabType);
    for (const s of typeSlabs) {
      const min = s.minAmount || 0;
      const max = (s.maxAmount === null || s.maxAmount === undefined) ? Infinity : s.maxAmount;
      if (amount >= min && amount <= max) {
        return s.commissionPercentage !== undefined ? s.commissionPercentage : (s.percentage || 0);
      }
    }
    if (slabType === 'one-time') {
      if (amount <= 10000) return 1;
      if (amount <= 2500000) return 2;
      if (amount <= 5000000) return 3;
      if (amount <= 10000000) return 4;
      return 5;
    } else {
      if (amount <= 1500000) return 0.5;
      if (amount <= 2500000) return 0.75;
      if (amount <= 5000000) return 1;
      if (amount <= 10000000) return 1.5;
      return 2;
    }
  };

  // 5) Sync and clean up PENDING commissions in database
  const validCommissions = [];
  const processedKeys = new Set();

  for (const doc of existingComms) {
    const c = doc.toObject ? doc.toObject() : doc;

    // Keep PAID commissions as pristine history
    if (String(c.status).toUpperCase() === 'PAID') {
      validCommissions.push(c);
      continue;
    }

    // For PENDING commissions:
    const cidStr = c.clientId ? (c.clientId._id ? String(c.clientId._id) : String(c.clientId)) : null;
    const activeInvAmt = cidStr ? (clientInvestmentMap[cidStr] || 0) : 0;

    // If client is missing, unassigned, or has 0 active investment => delete stale record from DB
    if (!cidStr || activeInvAmt <= 0) {
      await AgentCommission.deleteOne({ _id: c._id });
      continue;
    }

    // Deduplicate PENDING commissions per deposit transaction
    const slabTypeNorm = (c.slabType || (c.type === 'MONTHLY' ? 'monthly' : 'one-time')).toLowerCase();
    const isOneTime = slabTypeNorm === 'one-time' || c.type === 'ONE TIME';
    const periodNorm = (c.period || 'Aug 2026').replace('Sept', 'Sep');
    c.period = periodNorm;
    c.month = periodNorm;
    
    const txId = c.sourceTransactionId ? c.sourceTransactionId.toString() : (c.investmentAmount || '');
    const dateStr = c.date ? new Date(c.date).toISOString().split('T')[0] : '';
    const key = isOneTime
      ? (c._id ? c._id.toString() : `${cidStr}_ONE_TIME_${txId}_${dateStr}`)
      : `${cidStr}_MONTHLY_${periodNorm}`;

    if (processedKeys.has(key)) {
      // Duplicate PENDING record => delete from DB
      await AgentCommission.deleteOne({ _id: c._id });
      continue;
    }
    processedKeys.add(key);

    validCommissions.push(c);
  }

  res.status(200).json({
    success: true,
    count: validCommissions.length,
    data: {
      commissions: validCommissions,
    },
  });
});

/**
 * Update Agent account status (Super Admin only)
 * PATCH /api/super-admin/agents/:id/status
 */
const updateAgentStatus = asyncHandler(async (req, res, next) => {
  const { status } = req.body;
  const userId = req.params.id;

  if (!status) {
    return next(new AppError('Status is required.', 400));
  }

  const normalizedStatus = status.toLowerCase();
  const allowedStatuses = ['active', 'inactive', 'suspended', 'blocked', 'hold'];
  if (!allowedStatuses.includes(normalizedStatus)) {
    return next(new AppError('Invalid status value.', 400));
  }

  // 1) Find the target agent
  const user = await User.findById(userId);
  if (!user || user.role !== ROLES.AGENT) {
    return next(new AppError('Agent user record not found.', 404));
  }

  // 2) Update User isActive field based on status
  const isActive = normalizedStatus === 'active';
  
  await User.findByIdAndUpdate(userId, { isActive });
  const updatedProfile = await AgentProfile.findOneAndUpdate(
    { userId },
    { status: normalizedStatus },
    { new: true, runValidators: true }
  );

  if (!updatedProfile) {
    return next(new AppError('Agent profile record not found.', 404));
  }

  res.status(200).json({
    success: true,
    message: `Agent status successfully updated to ${normalizedStatus}`,
    data: {
      userId,
      status: normalizedStatus,
      isActive,
    },
  });
});

/**
 * Verify a single KYC document for an agent (Super Admin only)
 * PATCH /api/super-admin/agents/:id/verify-document
/**
 * Verify an Agent Document (Super Admin only)
 * PATCH /api/super-admin/agents/:id/verify-document
 */
const verifyAgentDocument = asyncHandler(async (req, res, next) => {
  const { id } = req.params;
  const targetField = req.body.documentField || req.body.fieldName || req.body.field || req.body.docField;

  const allowedFields = [
    'panDocument',
    'idProofDocument',
    'bankProofDocument',
    'agreementDocument',
    'nomineeProofDocument',
  ];

  if (!targetField || !allowedFields.includes(targetField)) {
    return next(new AppError(`Invalid document field. Must be one of: ${allowedFields.join(', ')}`, 400));
  }

  const agentUser = await findAgentUser(id);
  if (!agentUser) {
    return next(new AppError('Agent account not found.', 404));
  }

  let profile = await AgentProfile.findOne({ userId: agentUser._id });
  if (!profile) {
    return next(new AppError('Agent profile not found.', 404));
  }

  const verifiedField = `${targetField}Verified`;
  profile[verifiedField] = true;

  const updateFields = {
    [verifiedField]: true,
  };

  if (targetField === 'agreementDocument') {
    profile.agreementDocumentVerified = true;
    profile.agreementDocumentVerifiedAt = new Date();
    updateFields.agreementDocumentVerified = true;
    updateFields.agreementDocumentVerifiedAt = profile.agreementDocumentVerifiedAt;
  }

  // Check if core required documents (pan, idProof, bankProof) are verified
  const panOk = targetField === 'panDocument' ? true : !!profile.panDocumentVerified;
  const idOk = targetField === 'idProofDocument' ? true : !!profile.idProofDocumentVerified;
  const bankOk = targetField === 'bankProofDocument' ? true : !!profile.bankProofDocumentVerified;
  const isCoreVerified = panOk && idOk && bankOk;

  if (isCoreVerified) {
    updateFields.kycStatus = 'VERIFIED';
    updateFields.status = 'active';
    await User.findByIdAndUpdate(profile.userId, { isActive: true });
  }

  const updatedProfile = await AgentProfile.findByIdAndUpdate(
    profile._id,
    { $set: updateFields },
    { new: true, runValidators: false }
  );

  res.status(200).json({
    success: true,
    message: isCoreVerified
      ? 'All required documents verified. Agent KYC status updated to VERIFIED.'
      : `Document "${targetField}" verified successfully.`,
    data: {
      documentField: targetField,
      verified: true,
      kycStatus: updatedProfile.kycStatus,
      agreementDocumentVerified: updatedProfile.agreementDocumentVerified,
      agreementDocumentVerifiedAt: updatedProfile.agreementDocumentVerifiedAt,
      verificationStatus: {
        panDocumentVerified: updatedProfile.panDocumentVerified,
        idProofDocumentVerified: updatedProfile.idProofDocumentVerified,
        bankProofDocumentVerified: updatedProfile.bankProofDocumentVerified,
        agreementDocumentVerified: updatedProfile.agreementDocumentVerified,
        nomineeProofDocumentVerified: updatedProfile.nomineeProofDocumentVerified,
      },
    },
  });
});

/**
 * Directly update Agent KYC status (Super Admin only)
 * PATCH /api/super-admin/agents/:id/kyc
 * PATCH /api/super-admin/agents/:id/verify-kyc
 * PATCH /api/super-admin/agents/:id/kyc-status
 */
const updateAgentKycStatus = asyncHandler(async (req, res, next) => {
  const { id } = req.params;
  const newKycStatus = (req.body.kycStatus || req.body.kyc || req.body.status || 'VERIFIED').toUpperCase();

  let profile = await AgentProfile.findOne({ userId: id });
  if (!profile && mongoose.Types.ObjectId.isValid(id)) {
    profile = await AgentProfile.findById(id);
  }

  if (!profile) {
    return next(new AppError('Agent profile not found.', 404));
  }

  const updateFields = {
    kycStatus: newKycStatus
  };

  if (newKycStatus === 'VERIFIED') {
    updateFields.status = 'active';
    updateFields.panDocumentVerified = true;
    updateFields.idProofDocumentVerified = true;
    updateFields.bankProofDocumentVerified = true;
    if (profile.nomineeProofDocument) {
      updateFields.nomineeProofDocumentVerified = true;
    }
    await User.findByIdAndUpdate(profile.userId, { isActive: true });
  }

  const updatedProfile = await AgentProfile.findByIdAndUpdate(
    profile._id,
    { $set: updateFields },
    { new: true, runValidators: false }
  );

  res.status(200).json({
    success: true,
    message: `Agent KYC status updated to ${newKycStatus}`,
    data: {
      kycStatus: updatedProfile.kycStatus,
      status: updatedProfile.status,
    },
  });
});

const payAgentCommission = asyncHandler(async (req, res, next) => {
  const { commissionId } = req.params;

  const commission = await AgentCommission.findById(commissionId);
  if (!commission) {
    return next(new AppError('Commission record not found.', 404));
  }

  if (commission.status === 'PAID') {
    return next(new AppError('This commission record has already been marked as PAID.', 400));
  }

  commission.status = 'PAID';
  commission.date = new Date();
  await commission.save();

  // Retrieve agent email
  const agent = await User.findById(commission.agentId);
  if (agent && agent.email) {
    try {
      const { trackAndSendSystemEmail } = require('../../services/email.service');
      const subject = `Kinetoscope – Commission Payout Paid (${commission.period})`;
      const text = `Hello ${agent.name},\n\nYour commission of INR ${commission.amount.toLocaleString('en-IN')} for the period of ${commission.period} has been processed and marked as PAID.\n\nBest regards,\nKinetoscope Team`;
      const html = `
        <div style="font-family: Arial, sans-serif; max-width: 540px; margin: auto; padding: 32px; border: 1px solid #e5e7eb; border-radius: 8px;">
          <h2 style="color: #10b981; margin-bottom: 16px;">Commission Payout Approved</h2>
          <p style="color: #4b5563; font-size: 14px;">Hello <strong>${agent.name}</strong>,</p>
          <p style="color: #4b5563; font-size: 14px;">We are pleased to inform you that your commission payout has been successfully processed:</p>
          
          <div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 6px; padding: 20px; margin: 20px 0;">
            <table style="width: 100%; font-size: 14px; border-collapse: collapse;">
              <tr>
                <td style="padding: 6px 0; color: #64748b; font-weight: bold; width: 140px;">Period:</td>
                <td style="padding: 6px 0; color: #0f172a; font-weight: bold;">${commission.period}</td>
              </tr>
              <tr>
                <td style="padding: 6px 0; color: #64748b; font-weight: bold;">Amount:</td>
                <td style="padding: 6px 0; color: #16a34a; font-size: 16px; font-weight: bold;">INR ${commission.amount.toLocaleString('en-IN')}</td>
              </tr>
              <tr>
                <td style="padding: 6px 0; color: #64748b; font-weight: bold;">Status:</td>
                <td style="padding: 6px 0; color: #16a34a; font-weight: bold;">PAID</td>
              </tr>
            </table>
          </div>
          <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
          <p style="color: #94a3b8; font-size: 11px; text-align: center;">Kinetoscope Films Production Pvt Ltd</p>
        </div>
      `;

      await trackAndSendSystemEmail('commission_paid', {
        to: agent.email,
        subject,
        text,
        html,
        recipientGroup: 'Individual',
        targetSummary: `${agent.name}`,
        templateName: 'System Auto Notification'
      });
    } catch (emailErr) {
      console.error(`Failed to send commission paid email to agent ${agent._id}:`, emailErr.message);
    }
  }

  res.status(200).json({
    success: true,
    message: 'Commission successfully marked as PAID.',
    data: { commission }
  });
});

/**
 * Clear all Agents (Super Admin only)
 * DELETE /api/super-admin/agents/clear
 */
const clearAllAgents = asyncHandler(async (req, res, next) => {
  // Find all agent users
  const agents = await User.find({ role: { $in: [ROLES.AGENT, 'agent', 'AGENT'] } });
  const agentIds = agents.map(a => a._id);

  // Fetch agent profiles
  const profiles = await AgentProfile.find({});

  // Purge documents from Cloudinary
  const documentUrls = [];
  profiles.forEach(profile => {
    if (profile.panDocument) documentUrls.push(profile.panDocument);
    if (profile.idProofDocument) documentUrls.push(profile.idProofDocument);
    if (profile.bankProofDocument) documentUrls.push(profile.bankProofDocument);
    if (profile.nomineeProofDocument) documentUrls.push(profile.nomineeProofDocument);
  });

  if (documentUrls.length > 0) {
    await deleteCloudinaryFiles(documentUrls);
  }

  // Delete all profiles, user accounts, agent commissions, and agent transactions
  await Promise.all([
    AgentProfile.deleteMany({}),
    AgentCommission.deleteMany({}),
    Transaction.deleteMany({ isAgentWithdrawal: true }),
    User.updateMany({}, { $unset: { assignedAgent: '' } }),
    User.deleteMany({ role: { $in: [ROLES.AGENT, 'agent', 'AGENT'] } })
  ]);

  res.status(200).json({
    success: true,
    message: `All agent accounts, profiles, and commission logs cleared successfully.`,
    count: agents.length
  });
});

module.exports = {
  createAgent,
  getAllAgents,
  getAgentById,
  updateAgent,
  deleteAgent,
  clearAllAgents,
  getAgentClients,
  getAgentCommissions,
  updateAgentStatus,
  verifyAgentDocument,
  updateAgentKycStatus,
  payAgentCommission,
};

