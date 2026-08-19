const fs = require('fs');
const mongoose = require('mongoose');
const User = require('../../models/User.model');
const ClientProfile = require('../../models/ClientProfile.model');
const Investment = require('../../models/Investment.model');
const Transaction = require('../../models/Transaction.model');
const AgentProfile = require('../../models/AgentProfile.model');
const { deleteFromCloudinary, processDocumentUploadsInBackground, uploadDocumentsToCloudinaryParallelBackground } = require('../../services/cloudinary.service');
const { sendWelcomeEmail, sendKycVerificationNotification } = require('../../services/email.service');
const { calculateDashboardData } = require('../client/client-dashboard.controller');
const AppError = require('../../utils/AppError');
const asyncHandler = require('../../utils/asyncHandler');
const { ROLES } = require('../../constants/roles');

const { generateTempPassword } = require('../../utils/generate-password');
const clientDetailsService = require('../../services/client-details.service');

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
  await Promise.all(
    urls.filter(Boolean).map(url =>
      deleteFromCloudinary(url).catch(err =>
        console.error(`[Cleanup] Failed to purge file ${url} from Cloudinary:`, err.message)
      )
    )
  );
};

/**
 * Create a new Client Account and Portal Profile (Super Admin only)
 * POST /api/super-admin/clients
 */
const createClient = asyncHandler(async (req, res, next) => {
  const requiredFileFields = [
    'panDocument',
    'aadhaarDocument',
  ];

  // 1) Validate that mandatory KYC documents are present in the request
  if (!req.files) {
    return next(new AppError('No documents were uploaded. Please upload PAN Card and Aadhaar Card.', 400));
  }

  for (const field of requiredFileFields) {
    if (!req.files[field] || req.files[field].length === 0) {
      return next(new AppError(`Required document missing: ${field}`, 400));
    }
  }

  const {
    fullName,
    phone,
    email,
    dob,
    address,
    emergencyContact,
    riskProfile,
    residencyStatus,
    monthlyRoi,
    panNumber,
    aadhaarNumber,
    bankName,
    accountNumber,
    ifscCode,
    nomineeName,
    nomineeRelation,
    nomineePhone,
    nomineeEmail,
    nomineeResidency,
    assignedAgent,
    tier,
    contractStartDate,
    contractEndDate,
    agentCommission,
    kycStatus,
    password,
    portalPassword,
  } = req.body;

  const finalTier = tier || 'SILVER';

  // Validate initial tier eligibility (since new clients have 0 investments, they must start as SILVER)
  if (finalTier.toUpperCase() !== 'SILVER') {
    cleanupLocalFiles(req.files);
    const minRequiredStr = finalTier.toUpperCase() === 'GOLD' ? '₹25 Lakh' : 
                           finalTier.toUpperCase() === 'PLATINUM' ? '₹1 Crore' : 
                           finalTier.toUpperCase() === 'DIAMOND' ? '₹3 Crore' : '₹0';
    return next(new AppError(`This client is not eligible for the ${tier} category. Minimum investment required is ${minRequiredStr}. Current total investment is ₹0.`, 400));
  }
  let finalContractStartDate = contractStartDate ? new Date(contractStartDate) : new Date();
  let finalContractEndDate = contractEndDate ? new Date(contractEndDate) : null;
  if (!finalContractEndDate) {
    const d = new Date(finalContractStartDate);
    d.setFullYear(d.getFullYear() + 2);
    finalContractEndDate = d;
  }
  let finalAgentCommission = agentCommission;
  if (!finalAgentCommission) {
    if (finalTier === 'DIAMOND') finalAgentCommission = '0.75% monthly';
    else if (finalTier === 'PLATINUM') finalAgentCommission = '1% monthly';
    else if (finalTier === 'GOLD') finalAgentCommission = '0.5% monthly';
    else finalAgentCommission = '0.5% monthly';
  }

  // 2) Check if email is already registered in the system (case-insensitive & trimmed)
  const cleanEmail = email ? String(email).trim().toLowerCase() : '';
  if (!cleanEmail) {
    return next(new AppError('Email address is required.', 400));
  }
  const existingUser = await User.findOne({ email: { $regex: new RegExp(`^${cleanEmail.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&')}$`, 'i') } });
  if (existingUser) {
    console.log(`[CreateClient] Duplicate email match found:`, { id: existingUser._id, name: existingUser.name, email: existingUser.email, role: existingUser.role });
    return next(new AppError(`Email address (${cleanEmail}) is already in use by another account.`, 400));
  }

  // 3) Generate a sequential client code starting from KFPL-CL-1001 with gap-filling (reuses deleted IDs)
  const activeClientUsers = await User.find({
    role: { $in: [ROLES.CLIENT, 'client', 'CLIENT'] },
    clientCode: { $exists: true, $ne: null }
  }, { clientCode: 1 }).lean();

  const usedSeqs = new Set();
  activeClientUsers.forEach(c => {
    if (c.clientCode) {
      const digits = c.clientCode.match(/(\d+)$/);
      if (digits) {
        const seq = parseInt(digits[1], 10);
        if (!isNaN(seq)) usedSeqs.add(seq);
      }
    }
  });

  let nextSeq = 1001;
  while (usedSeqs.has(nextSeq) || await User.findOne({ clientCode: `KFPL-CL-${nextSeq}` })) {
    nextSeq++;
  }
  const clientCode = `KFPL-CL-${nextSeq}`;

  // 4) Use provided custom password or generate a secure temporary password
  const tempPassword = password || portalPassword || generateTempPassword();

  // Define database variables outside to perform rollback on error
  let createdUser, createdProfile;

  try {
    // 6) Create the User document
    console.log('[CreateClient] Step 6: Creating User document...');
    const isAgent = req.user && (req.user.role === ROLES.AGENT || req.user.role === 'agent');
    const effectiveAssignedAgent = isAgent
      ? req.user.id
      : ((assignedAgent && mongoose.Types.ObjectId.isValid(assignedAgent)) ? assignedAgent : undefined);

    createdUser = await User.create({
      name: fullName,
      email,
      password: tempPassword,
      role: ROLES.CLIENT,
      isActive: true,
      is2FAEnabled: false, // Default false for smooth temp password login
      clientCode,
      assignedAgent: effectiveAssignedAgent,
      createdBy: req.user.id,
    });
    console.log('[CreateClient] Step 6: User created successfully:', createdUser._id);

    // 7) Create the ClientProfile document
    console.log('[CreateClient] Step 7: Creating ClientProfile document...');
    createdProfile = await ClientProfile.create({
      userId: createdUser._id,
      fullName,
      phone,
      email,
      dob,
      address,
      emergencyContact: emergencyContact || '',
      riskProfile,
      residencyStatus: residencyStatus || 'National (Domestic)',
      monthlyRoi: monthlyRoi !== undefined ? Number(monthlyRoi) : 0,
      panNumber,
      aadhaarNumber,
      bankName,
      accountNumber,
      ifscCode,
      nomineeName,
      nomineeRelation,
      nomineePhone,
      nomineeEmail,
      nomineeResidency: nomineeResidency || 'National (Domestic)',
      panDocument: '',
      aadhaarDocument: '',
      bankProofDocument: '',
      agreementDocument: '',
      nomineeProofDocument: '',
      documentStatus: 'pending_upload',
      status: 'active',
      kycStatus: kycStatus || 'PENDING',
      tier: finalTier,
      contractStartDate: finalContractStartDate,
      contractEndDate: finalContractEndDate,
      agentCommission: finalAgentCommission,
      portalPassword: tempPassword,
    });
    console.log('[CreateClient] Step 7: ClientProfile created successfully:', createdProfile._id);
  } catch (dbError) {
    console.error('[CreateClient] DATABASE ERROR:', dbError.message, dbError.stack);
    // Rollback: Delete user if created user profile creation fails
    if (createdUser) {
      await User.findByIdAndDelete(createdUser._id);
    }
    return next(new AppError(`Database transaction failed: ${dbError.message}`, 500));
  }

  // 8) Trigger parallel in-memory background uploads (Vercel-safe using waitUntil)
  const uploadFileFields = [
    'panDocument',
    'aadhaarDocument',
    'aadhaarBackDocument',
    'bankProofDocument',
    'agreementDocument',
    'nomineeProofDocument',
  ];

  uploadDocumentsToCloudinaryParallelBackground({
    files: req.files,
    fileFields: uploadFileFields,
    Model: ClientProfile,
    filter: { userId: createdUser._id },
    entityLabel: 'Client',
  });

  try {
    // 9) Send Welcome Email containing credentials
    const loginUrl = process.env.CLIENT_PORTAL_URL || 'https://cp.kinetoscopefilms.com/login';
    await sendWelcomeEmail(email, fullName, clientCode, tempPassword, loginUrl);
  } catch (emailError) {
    console.error(`Welcome email failed to dispatch to ${email}:`, emailError.message);
  }

  // Clear password from return payload
  createdUser.password = undefined;

  res.status(201).json({
    success: true,
    message: 'Client onboarding initiated. Documents are uploading in the background.',
    data: {
      user: createdUser,
      profile: createdProfile,
      credentials: {
        clientCode,
        email,
        temporaryPassword: tempPassword,
      },
    },
  });
});

/**
 * Get all Clients (Supports Search, Status Filter, and Pagination)
 * GET /api/super-admin/clients
 */
const getAllClients = asyncHandler(async (req, res, next) => {
  const { search, status, page, limit } = req.query;

  // Build user query targeting role=client
  const userQuery = { role: ROLES.CLIENT };

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
    const profilesMatchingStatus = await ClientProfile.find({ status: statusRegex }, { userId: 1 });
    const userIds = profilesMatchingStatus.map(p => p.userId);
    userQuery._id = { $in: userIds };
  }

  let users, total;
  if (page === undefined && limit === undefined) {
    // Dropdown / non-paginated fetch: get all matching clients
    users = await User.find(userQuery)
      .populate('assignedAgent', 'name email')
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
        .populate('assignedAgent', 'name email')
        .populate('createdBy', 'name email')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .lean(),
      User.countDocuments(userQuery)
    ]);
  }

  const userIds = users.map(u => u._id);
  const clientCodes = users.map(u => u.clientCode).filter(Boolean);

  const profiles = await ClientProfile.find({
    $or: [
      { userId: { $in: userIds } },
      { email: { $in: users.map(u => u.email).filter(Boolean) } }
    ]
  }).lean();
  
  const profileMap = {};
  profiles.forEach(p => {
    if (p.userId) profileMap[p.userId.toString()] = p;
    if (p.email) profileMap[p.email.toLowerCase()] = p;
  });

  // Fetch active investments, approved deposit transactions, and assigned Agent profiles
  const agentUserIds = users.map(u => u.assignedAgent?._id || u.assignedAgent).filter(Boolean);
  const [activeInvestments, approvedDeposits, agentProfiles] = await Promise.all([
    Investment.find({
      $or: [
        { clientId: { $in: userIds } },
        { clientCode: { $in: clientCodes } }
      ],
      status: 'active'
    }).lean(),
    Transaction.find({
      $or: [
        { clientId: { $in: userIds } },
        { clientCode: { $in: clientCodes } }
      ],
      type: 'deposit',
      status: 'approved'
    }).lean(),
    AgentProfile.find({
      $or: [
        { userId: { $in: agentUserIds } },
        { _id: { $in: agentUserIds } }
      ]
    }).lean()
  ]);

  const agentProfileMap = {};
  agentProfiles.forEach(ap => {
    if (ap.userId) agentProfileMap[ap.userId.toString()] = ap;
    if (ap._id) agentProfileMap[ap._id.toString()] = ap;
  });

  const investmentMap = {};
  activeInvestments.forEach(inv => {
    const amt = inv.investmentAmount || inv.amount || 0;
    const idKey = inv.clientId ? inv.clientId.toString() : '';
    const codeKey = inv.clientCode || '';
    if (idKey) investmentMap[idKey] = (investmentMap[idKey] || 0) + amt;
    if (codeKey) investmentMap[codeKey] = (investmentMap[codeKey] || 0) + amt;
  });

  const depositMap = {};
  approvedDeposits.forEach(tx => {
    const amt = tx.amount || 0;
    const idKey = tx.clientId ? tx.clientId.toString() : '';
    const codeKey = tx.clientCode || '';
    if (idKey) depositMap[idKey] = (depositMap[idKey] || 0) + amt;
    if (codeKey) depositMap[codeKey] = (depositMap[codeKey] || 0) + amt;
  });

  const clientRecords = users.map(user => {
    const userIdStr = user._id.toString();
    const codeStr = user.clientCode || '';
    const emailStr = (user.email || '').toLowerCase();
    
    const profile = profileMap[userIdStr] || profileMap[emailStr] || null;
    const invAmt = Math.max(investmentMap[userIdStr] || 0, investmentMap[codeStr] || 0);
    const depAmt = Math.max(depositMap[userIdStr] || 0, depositMap[codeStr] || 0);
    const totalInv = Math.max(invAmt, depAmt);

    const monthlyRoi = profile && profile.monthlyRoi !== undefined ? (parseFloat(profile.monthlyRoi) || 0) : 0;

    const assignedAgentObj = user.assignedAgent;
    let agentCommissionStr = '—';
    if (assignedAgentObj) {
      const agId = (assignedAgentObj._id || assignedAgentObj).toString();
      const agProf = agentProfileMap[agId];
      if (agProf) {
        agentCommissionStr = 'Automatic (Slab)';
      } else if (profile && profile.agentCommission) {
        agentCommissionStr = 'Automatic (Slab)';
      } else {
        agentCommissionStr = 'Automatic (Slab)';
      }
    }

    const startDt = (profile && profile.contractStartDate) || user.createdAt;
    let endDt = (profile && profile.contractEndDate);
    if (!endDt && startDt) {
      const d = new Date(startDt);
      d.setMonth(d.getMonth() + 18);
      endDt = d;
    }

    return {
      _id: user._id,
      clientId: user.clientCode || (profile && profile.clientCode) || '',
      name: user.name || (profile && profile.fullName) || '',
      email: user.email,
      status: (profile && profile.status) || 'active',
      totalInvestment: totalInv,
      monthlyRoi,
      roi: monthlyRoi,
      roiPercentage: monthlyRoi,
      contractStartDate: startDt,
      contractEndDate: endDt,
      durationMonths: 18,
      assignedAgent: assignedAgentObj,
      assignedAgentName: assignedAgentObj?.name || '',
      agentCommissionMonthly: agentCommissionStr,
      agentCommission: agentCommissionStr,
      profilePic: (profile && profile.profilePic) || user.profilePic || '',
      user,
      profile
    };
  });

  res.status(200).json({
    success: true,
    count: clientRecords.length,
    pagination: {
      total,
      page: page ? Number(page) : 1,
      limit: limit ? Number(limit) : total,
      pages: limit ? Math.ceil(total / limit) : 1,
    },
    data: {
      clients: clientRecords,
    },
  });
});

const getClientById = asyncHandler(async (req, res, next) => {
  const { findClientUser } = require('../../services/client-details.service');
  const clientUser = await findClientUser(req.params.id);
  if (!clientUser || clientUser.role !== ROLES.CLIENT) {
    return next(new AppError('Client not found.', 404));
  }

  if (req.user.role === ROLES.AGENT) {
    const assignedAgentId = clientUser.assignedAgent?._id || clientUser.assignedAgent;
    if (!assignedAgentId || assignedAgentId.toString() !== req.user.id.toString()) {
      return next(new AppError('Access Denied. This client is not assigned to you.', 403));
    }
  }

  const details = await clientDetailsService.getClientDetailsData(req.params.id);

  res.status(200).json({
    success: true,
    data: details,
  });
});

/**
 * Update Client details and status (Super Admin only)
 * PATCH /api/super-admin/clients/:id
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

const findClientUser = async (identifier) => {
  if (!identifier) return null;
  const str = String(identifier).trim();
  
  if (/^[0-9a-fA-F]{24}$/.test(str)) {
    let user = await User.findById(str);
    if (user && (user.role === ROLES.CLIENT || String(user.role).toLowerCase() === 'client')) return user;

    const profById = await ClientProfile.findById(str);
    if (profById && profById.userId) {
      user = await User.findById(profById.userId);
      if (user) return user;
    }
  }

  let user = await User.findOne({ clientCode: str.toUpperCase() });
  if (!user) user = await User.findOne({ clientCode: str });
  if (!user) {
    const prof = await ClientProfile.findOne({
      $or: [
        { clientCode: str.toUpperCase() },
        { clientCode: str },
        { clientId: str.toUpperCase() },
        { clientId: str }
      ]
    });
    if (prof) user = await User.findById(prof.userId);
  }

  if (!user) {
    const allClients = await User.find({});
    user = allClients.find(c => slugifyName(c.name) === str.toLowerCase() || slugifyName(c.email) === str.toLowerCase());
  }

  if (!user) {
    const allProfiles = await ClientProfile.find();
    const matchedProf = allProfiles.find(p => slugifyName(p.fullName) === str.toLowerCase());
    if (matchedProf) user = await User.findById(matchedProf.userId);
  }

  return user;
};

const updateClient = asyncHandler(async (req, res, next) => {
  const user = await findClientUser(req.params.id);
  if (!user || user.role !== ROLES.CLIENT) {
    return next(new AppError('Client user record not found.', 404));
  }

  const userId = user._id;
  const profile = await ClientProfile.findOne({ userId });
  if (!profile) {
    return next(new AppError('Client profile record not found.', 404));
  }

  // Validate tier change eligibility if tier is being modified
  if (req.body.tier) {
    const normalizedTier = req.body.tier.toUpperCase();
    const investments = await Investment.find({ clientId: userId }).lean();
    const validInvestments = investments.filter(inv => inv.status !== 'cancelled');
    const totalInvestment = validInvestments.reduce((sum, inv) => sum + inv.investmentAmount, 0);

    const TIER_LIMITS = {
      SILVER: 0,
      GOLD: 500000,       // 5 Lakh
      PLATINUM: 1500000,  // 15 Lakh
      DIAMOND: 5000000    // 50 Lakh
    };

    const minRequired = TIER_LIMITS[normalizedTier];
    if (minRequired === undefined) {
      cleanupLocalFiles(req.files);
      return next(new AppError(`Invalid tier category: ${req.body.tier}`, 400));
    }

    if (totalInvestment < minRequired) {
      cleanupLocalFiles(req.files);
      
      const minRequiredStr = normalizedTier === 'GOLD' ? '₹5 Lakh' : 
                             normalizedTier === 'PLATINUM' ? '₹15 Lakh' : 
                             normalizedTier === 'DIAMOND' ? '₹50 Lakh' : '₹0';
                             
      const formatter = new Intl.NumberFormat('en-IN', {
        style: 'currency',
        currency: 'INR',
        maximumFractionDigits: 0
      });

      return next(new AppError(`This client is not eligible for the ${req.body.tier} category. Minimum investment required is ${minRequiredStr}. Current total investment is ${formatter.format(totalInvestment)}.`, 400));
    }
  }

  // 2) Parse updates for the User model
  const userUpdates = {};
  if (req.body.fullName) {
    userUpdates.name = req.body.fullName;
  }
  if (req.body.assignedAgent !== undefined) {
    userUpdates.assignedAgent = (req.body.assignedAgent && mongoose.Types.ObjectId.isValid(req.body.assignedAgent)) ? req.body.assignedAgent : null;
  }
  if (req.body.status) {
    req.body.status = req.body.status.toLowerCase();
    userUpdates.isActive = req.body.status === 'active';
  }
  if (req.body.kycStatus) {
    const normKyc = String(req.body.kycStatus).toUpperCase();
    if (['VERIFIED', 'APPROVED'].includes(normKyc)) {
      userUpdates.isActive = true;
    }
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

  // 3) Parse updates for the ClientProfile model
  const profileFields = [
    'fullName',
    'phone',
    'dob',
    'address',
    'emergencyContact',
    'riskProfile',
    'residencyStatus',
    'monthlyRoi',
    'bankName',
    'accountNumber',
    'ifscCode',
    'nomineeName',
    'nomineeRelation',
    'nomineePhone',
    'nomineeEmail',
    'nomineeResidency',
    'status',
    'tier',
    'contractStartDate',
    'contractEndDate',
    'extendContractDate',
    'agentCommission',
    'kycStatus',
    'panNumber',
    'aadhaarNumber',
    'portalPassword',
  ];

  profileFields.forEach(field => {
    if (req.body[field] !== undefined) {
      profileUpdates[field] = req.body[field];
    }
  });

  if (userUpdates.email) {
    profileUpdates.email = userUpdates.email;
  }

  // Process document removal requests from Super Admin
  const removedDocLabels = [];
  const removeDocMap = [
    { flag: 'removePanDocument', field: 'panDocument', verify: 'panDocumentVerified' },
    { flag: 'removeAadhaarDocument', field: 'aadhaarDocument', verify: 'aadhaarDocumentVerified', extra: 'idProofDocument' },
    { flag: 'removeAadhaarBackDocument', field: 'aadhaarBackDocument', verify: 'aadhaarBackDocumentVerified' },
    { flag: 'removeBankProofDocument', field: 'bankProofDocument', verify: 'bankProofDocumentVerified' },
    { flag: 'removeNomineeProofDocument', field: 'nomineeProofDocument', verify: 'nomineeProofDocumentVerified' },
    { flag: 'removeAgreementDocument', field: 'agreementDocument', verify: 'agreementVerified', extra: 'signedAgreementUrl' },
  ];

  removeDocMap.forEach(cfg => {
    if (req.body[cfg.flag] === 'true' || req.body[cfg.field] === '') {
      profileUpdates[cfg.field] = '';
      if (cfg.extra) profileUpdates[cfg.extra] = '';
      if (cfg.verify) profileUpdates[cfg.verify] = false;
      if (cfg.field === 'agreementDocument') {
        profileUpdates.agreementDocumentVerified = false;
        profileUpdates.agreementVerified = false;
        profileUpdates.agreementDocumentVerifiedAt = null;
        profileUpdates.agreementReuploadRequested = true;
      }
      if (['panDocument', 'aadhaarDocument', 'aadhaarBackDocument', 'agreementDocument'].includes(cfg.field)) {
        profileUpdates.kycStatus = 'PENDING';
      }
      const labelMap = {
        panDocument: 'PAN Card Document',
        aadhaarDocument: 'ID Proof Document (Aadhaar Front / Passport)',
        aadhaarBackDocument: 'Aadhaar Card Back Side (Address Proof)',
        bankProofDocument: 'Bank Details Document (Cancelled Cheque)',
        nomineeProofDocument: 'Nominee ID Proof Document',
        agreementDocument: 'Signed Client Participation Agreement',
      };
      if (labelMap[cfg.field]) removedDocLabels.push(labelMap[cfg.field]);
    }
  });

  if (removedDocLabels.length > 0 && user.email) {
    const { sendDocumentReuploadRequiredEmail } = require('../../services/email.service');
    sendDocumentReuploadRequiredEmail({
      toEmail: user.email,
      userName: user.name,
      userRole: 'Client',
      missingDocs: removedDocLabels,
    }).catch(err => console.error('[Email Trigger] Client doc reupload email failed:', err.message));
  }

  // 4) Process optional document uploads using buffer upload to Cloudinary (in-memory)
  const fileFields = [
    'panDocument',
    'aadhaarDocument',
    'aadhaarBackDocument',
    'bankProofDocument',
    'agreementDocument',
    'nomineeProofDocument',
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
            profileUpdates.agreementVerified = true;
          }
          uploadedUrls.push(newUrl);
        }
      }
    }
  } catch (uploadError) {
    await deleteCloudinaryFiles(uploadedUrls);
    return next(new AppError(`Document upload failed: ${uploadError.message}`, 500));
  }

  // Dynamic KYC Status Re-evaluation for Client
  const finalPan = profileUpdates.panDocument !== undefined ? profileUpdates.panDocument : profile.panDocument;
  const finalPanVerified = profileUpdates.panDocumentVerified !== undefined ? profileUpdates.panDocumentVerified : profile.panDocumentVerified;

  const finalAadhaar = profileUpdates.aadhaarDocument !== undefined ? profileUpdates.aadhaarDocument : (profile.aadhaarDocument || profile.idProofDocument);
  const finalAadhaarVerified = profileUpdates.aadhaarDocumentVerified !== undefined ? profileUpdates.aadhaarDocumentVerified : (profile.aadhaarDocumentVerified || profile.idProofDocumentVerified);

  const finalBank = profileUpdates.bankProofDocument !== undefined ? profileUpdates.bankProofDocument : profile.bankProofDocument;
  const finalBankVerified = profileUpdates.bankProofDocumentVerified !== undefined ? profileUpdates.bankProofDocumentVerified : profile.bankProofDocumentVerified;

  const finalAgreement = profileUpdates.agreementDocument !== undefined ? profileUpdates.agreementDocument : profile.agreementDocument;
  const finalAgreementVerified = profileUpdates.agreementDocumentVerified !== undefined ? profileUpdates.agreementDocumentVerified : (profile.agreementDocumentVerified || profile.agreementVerified);

  const isPanOk = Boolean(finalPan && String(finalPan).trim() !== '' && finalPan !== 'null') && Boolean(finalPanVerified);
  const isAadhaarOk = Boolean(finalAadhaar && String(finalAadhaar).trim() !== '' && finalAadhaar !== 'null') && Boolean(finalAadhaarVerified);
  const isBankOk = Boolean(finalBank && String(finalBank).trim() !== '' && finalBank !== 'null') && Boolean(finalBankVerified);
  const isAgreementOk = Boolean(finalAgreement && String(finalAgreement).trim() !== '' && finalAgreement !== 'null') && Boolean(finalAgreementVerified);

  const isFullyVerified = isPanOk && isAadhaarOk && isBankOk && isAgreementOk;

  if (req.body.kycStatus && ['REJECTED', 'HOLD', 'INACTIVE'].includes(String(req.body.kycStatus).toUpperCase())) {
    profileUpdates.kycStatus = String(req.body.kycStatus).toUpperCase();
  } else if (!isFullyVerified || !finalBank || String(finalBank).trim() === '') {
    profileUpdates.kycStatus = 'PENDING';
  } else if (isFullyVerified && (req.body.kycStatus === 'VERIFIED' || profile.kycStatus === 'PENDING')) {
    profileUpdates.kycStatus = 'VERIFIED';
  }

  // 5) Perform database updates
  const updatedUser = await User.findByIdAndUpdate(userId, { $set: userUpdates }, { new: true, runValidators: true });
  const updatedProfile = await ClientProfile.findOneAndUpdate(
    { userId },
    { $set: profileUpdates },
    { new: true, runValidators: true }
  );

  if (profileUpdates.monthlyRoi !== undefined) {
    const newRoiNum = Number(profileUpdates.monthlyRoi) || 0;
    await Investment.updateMany(
      { clientId: userId, status: 'active' },
      { $set: { roiPercentage: newRoiNum } }
    ).catch(e => console.error('[Sync Investments ROI Error]:', e.message));
  }

  res.status(200).json({
    success: true,
    message: 'Client updated successfully',
    data: {
      user: updatedUser,
      profile: updatedProfile,
    },
  });
});

/**
 * Delete a Client User, Profile, and documents stored on Firebase (Super Admin only)
 * DELETE /api/super-admin/clients/:id
 */
const deleteClient = asyncHandler(async (req, res, next) => {
  const targetId = req.params.id;

  const { findClientUser } = require('../../services/client-details.service');
  let user = await findClientUser(targetId);
  let profile = null;

  if (user) {
    profile = await ClientProfile.findOne({ userId: user._id });
  } else if (mongoose.Types.ObjectId.isValid(targetId)) {
    profile = await ClientProfile.findById(targetId);
    if (profile && profile.userId) {
      user = await User.findById(profile.userId);
    }
  }

  if (!profile && !user) {
    profile = await ClientProfile.findOne({ 
      $or: [
        { clientCode: targetId },
        { clientCode: targetId.toUpperCase() },
        { clientId: targetId },
        { clientId: targetId.toUpperCase() }
      ]
    });
    if (profile && profile.userId) {
      user = await User.findById(profile.userId);
    }
  }

  if (!user && !profile) {
    return next(new AppError('Client record not found.', 404));
  }

  // 1) Purge documents from Cloudinary storage if they exist
  if (profile) {
    const documentsToPurge = [
      profile.panDocument,
      profile.aadhaarDocument,
      profile.bankProofDocument,
      profile.agreementDocument,
      profile.nomineeProofDocument,
    ];
    await deleteCloudinaryFiles(documentsToPurge);
    await ClientProfile.findByIdAndDelete(profile._id);
  }

  // 2) Purge associated Investment, Transaction, Payouts, and User records
  if (user) {
    const Investment = require('../../models/Investment.model');
    const Transaction = require('../../models/Transaction.model');
    const RoiPayout = require('../../models/RoiPayout.model');
    const Payout = require('../../models/Payout.model');

    await Promise.all([
      Investment.deleteMany({ $or: [{ clientId: user._id }, { clientCode: user.clientCode }] }),
      Transaction.deleteMany({ $or: [{ clientId: user._id }, { clientCode: user.clientCode }] }),
      RoiPayout.deleteMany({ clientId: user._id }),
      Payout.deleteMany({ recipientId: user.clientCode }),
      User.findByIdAndDelete(user._id)
    ]);
  }

  res.status(200).json({
    success: true,
    message: 'Client account and associated records deleted successfully.',
  });
});

/**
 * Preview client dashboard metrics (Super Admin only)
 * GET /api/super-admin/client-dashboard/:clientId
 */
const previewClientDashboard = asyncHandler(async (req, res, next) => {
  const dashboardData = await calculateDashboardData(req.params.clientId);

  res.status(200).json({
    success: true,
    data: dashboardData,
  });
});

/**
 * Get all active Agents (Super Admin only)
 * GET /api/super-admin/agents
 */
const getAllAgents = asyncHandler(async (req, res, next) => {
  const agents = await User.find({ role: ROLES.AGENT, isActive: true }).select('name email clientCode');

  res.status(200).json({
    success: true,
    count: agents.length,
    data: {
      agents,
    },
  });
});

/**
 * Update client's Monthly ROI rate (Super Admin only)
 * PATCH /api/super-admin/clients/:id/roi-rate
 */
const updateClientRoiRate = asyncHandler(async (req, res, next) => {
  const { monthlyRoi } = req.body;
  const idOrSlug = req.params.id;

  if (monthlyRoi === undefined) {
    return next(new AppError('Monthly ROI rate is required.', 400));
  }

  const roiNum = Number(monthlyRoi);
  if (isNaN(roiNum) || roiNum < 0) {
    return next(new AppError('Monthly ROI rate must be a non-negative number.', 400));
  }

  const clientUser = await findClientUser(idOrSlug);
  if (!clientUser) {
    return next(new AppError('Client account not found.', 404));
  }

  let updatedProfile = await ClientProfile.findOneAndUpdate(
    { userId: clientUser._id },
    { $set: { monthlyRoi: roiNum } },
    { new: true, runValidators: true }
  );

  if (!updatedProfile) {
    updatedProfile = await ClientProfile.create({
      userId: clientUser._id,
      monthlyRoi: roiNum,
    });
  }

  // Also sync client's active investments to the new Monthly ROI %
  await Investment.updateMany(
    { clientId: clientUser._id, status: 'active' },
    { $set: { roiPercentage: roiNum } }
  ).catch(e => console.error('[Sync Investments ROI Error]:', e.message));

  // Sync pending payouts in Payout collection for this client to reflect the updated ROI %
  try {
    const Payout = require('../../models/Payout.model');
    const investments = await Investment.find({ clientId: clientUser._id, status: 'active' });
    const totalInv = investments.reduce((sum, inv) => sum + (inv.investmentAmount || 0), 0);
    const newAmount = Math.round((totalInv * roiNum) / 100);

    const idMatches = Array.from(new Set([
      String(clientUser._id),
      clientUser.clientCode,
      clientUser.clientCode?.toUpperCase()
    ].filter(Boolean)));

    const updateFields = { commissionType: `ROI (${roiNum}%)` };
    if (newAmount > 0) updateFields.amount = newAmount;

    await Payout.updateMany(
      {
        $or: [{ recipientId: { $in: idMatches } }, { clientId: { $in: idMatches } }],
        status: 'pending'
      },
      { $set: updateFields }
    );
  } catch (err) {
    console.error('[Sync Payouts ROI Error]:', err.message);
  }

  res.status(200).json({
    success: true,
    message: 'Monthly ROI rate updated successfully.',
    data: {
      userId: clientUser._id,
      monthlyRoi: roiNum,
    },
  });
});

/**
 * Verify a single KYC document for a client (Super Admin only)
 * PATCH /api/super-admin/clients/:id/verify-document
 * Body: { documentField: "panDocument" | "aadhaarDocument" | "bankProofDocument" | "agreementDocument" | "nomineeProofDocument" }
 */
const verifyDocument = asyncHandler(async (req, res, next) => {
  const { id } = req.params;
  const { documentField } = req.body;

  // Allowed document fields that can be verified
  const allowedFields = [
    'panDocument',
    'aadhaarDocument',
    'aadhaarBackDocument',
    'bankProofDocument',
    'agreementDocument',
    'nomineeProofDocument',
  ];

  if (!documentField || !allowedFields.includes(documentField)) {
    return next(new AppError(`Invalid document field. Must be one of: ${allowedFields.join(', ')}`, 400));
  }

  const clientUser = await findClientUser(id);
  if (!clientUser) {
    return next(new AppError('Client account not found.', 404));
  }

  let profile = await ClientProfile.findOne({ userId: clientUser._id });
  if (!profile) {
    return next(new AppError('Client profile not found.', 404));
  }

  // Check that the document actually exists (has a URL)
  if (!profile[documentField]) {
    return next(new AppError(`Document "${documentField}" has not been uploaded yet.`, 400));
  }

  // Mark the specific document as verified
  const verifiedField = `${documentField}Verified`;
  profile[verifiedField] = true;
  if (documentField === 'agreementDocument') {
    profile.agreementDocumentVerified = true;
    profile.agreementDocumentVerifiedAt = new Date();
  }

  // Check if ALL documents are now verified
  const allVerified =
    (documentField === 'panDocument' ? true : profile.panDocumentVerified) &&
    (documentField === 'aadhaarDocument' ? true : profile.aadhaarDocumentVerified) &&
    (documentField === 'bankProofDocument' ? true : profile.bankProofDocumentVerified) &&
    (!profile.agreementDocument || documentField === 'agreementDocument' ? true : profile.agreementDocumentVerified) &&
    (!profile.nomineeProofDocument || documentField === 'nomineeProofDocument' ? true : profile.nomineeProofDocumentVerified);

  // Bank document must actually be uploaded (not just verified flag) for KYC to be VERIFIED
  const bankDocUploaded = profile.bankProofDocument && String(profile.bankProofDocument).trim() !== '';

  // Auto-update KYC status to VERIFIED when all documents are verified AND bank doc is uploaded
  if (allVerified && bankDocUploaded) {
    profile.kycStatus = 'VERIFIED';
  } else if (allVerified && !bankDocUploaded) {
    profile.kycStatus = 'PENDING';
  }

  await profile.save();

  // Send automated email notification to the client and their assigned agent (if any)
  try {
    if (clientUser && clientUser.email) {
      let agentEmail = null;
      if (clientUser.assignedAgent) {
        const agent = await User.findById(clientUser.assignedAgent);
        if (agent) agentEmail = agent.email;
      }

      sendKycVerificationNotification(
        clientUser.email,
        clientUser.name,
        agentEmail,
        documentField,
        profile.kycStatus
      ).catch((err) =>
        console.error('[KYC Notification Error]:', err.message)
      );
    }
  } catch (error) {
    console.error('[KYC Notification Processing Error]:', error.message);
  }

  res.status(200).json({
    success: true,
    message: allVerified
      ? 'All documents verified. KYC status updated to VERIFIED.'
      : `Document "${documentField}" verified successfully.`,
    data: {
      documentField,
      verified: true,
      kycStatus: profile.kycStatus,
      verificationStatus: {
        panDocumentVerified: profile.panDocumentVerified,
        aadhaarDocumentVerified: profile.aadhaarDocumentVerified,
        bankProofDocumentVerified: profile.bankProofDocumentVerified,
        agreementDocumentVerified: profile.agreementDocumentVerified,
        nomineeProofDocumentVerified: profile.nomineeProofDocumentVerified,
      },
    },
  });
});

/**
 * Clear all Clients (Super Admin only)
 * DELETE /api/super-admin/clients/clear
 */
const clearAllClients = asyncHandler(async (req, res, next) => {
  // Find all client users
  const clients = await User.find({ role: { $in: [ROLES.CLIENT, 'client', 'CLIENT'] } });
  const clientIds = clients.map(c => c._id);

  // Fetch client profiles
  const profiles = await ClientProfile.find({});
  
  // Purge documents from Cloudinary
  const documentUrls = [];
  profiles.forEach(profile => {
    if (profile.panDocument) documentUrls.push(profile.panDocument);
    if (profile.aadhaarDocument) documentUrls.push(profile.aadhaarDocument);
    if (profile.bankProofDocument) documentUrls.push(profile.bankProofDocument);
    if (profile.agreementDocument) documentUrls.push(profile.agreementDocument);
    if (profile.nomineeProofDocument) documentUrls.push(profile.nomineeProofDocument);
  });

  if (documentUrls.length > 0) {
    await deleteCloudinaryFiles(documentUrls);
  }

  // Delete all profiles, user accounts, investments, transactions, and payouts
  const Investment = require('../../models/Investment.model');
  const Transaction = require('../../models/Transaction.model');
  const RoiPayout = require('../../models/RoiPayout.model');
  const Payout = require('../../models/Payout.model');

  await Promise.all([
    ClientProfile.deleteMany({}),
    User.deleteMany({ role: { $in: [ROLES.CLIENT, 'client', 'CLIENT'] } }),
    Investment.deleteMany({}),
    Transaction.deleteMany({}),
    RoiPayout.deleteMany({}),
    Payout.deleteMany({})
  ]);

  res.status(200).json({
    success: true,
    message: `All client profiles, investments, transactions, and payout records cleared successfully.`,
    count: clients.length
  });
});

module.exports = {
  createClient,
  getAllClients,
  getClientById,
  updateClient,
  deleteClient,
  clearAllClients,
  previewClientDashboard,
  getAllAgents,
  updateClientRoiRate,
  verifyDocument,
};
