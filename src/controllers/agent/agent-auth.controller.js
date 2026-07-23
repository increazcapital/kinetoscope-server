const User = require('../../models/User.model');
const AgentProfile = require('../../models/AgentProfile.model');
const OtpRecord = require('../../models/OtpRecord.model');
const transporter = require('../../config/mailer');
const AppError = require('../../utils/AppError');
const asyncHandler = require('../../utils/asyncHandler');
const { signToken, getCookieOptions } = require('../../utils/helpers');
const { ROLES } = require('../../constants/roles');

/**
 * Agent Login Handler
 * POST /api/agent/auth/login
 */
const login = asyncHandler(async (req, res, next) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return next(new AppError('Please provide email and password', 400));
  }

  // 1) Find user by email and select password field
  const user = await User.findOne({ email }).select('+password');
  if (!user) {
    return next(new AppError('Invalid email address or password', 401));
  }

  // 2) Verify user password match
  const isMatch = await user.comparePassword(password);
  if (!isMatch) {
    return next(new AppError('Invalid email address or password', 401));
  }

  // 3) Enforce role = agent restriction. Return 403 if non-agent.
  if (user.role !== ROLES.AGENT) {
    return next(new AppError('Access Denied. Only agent accounts are permitted to log in to this portal.', 403));
  }

  // 4) Verify account is active
  if (!user.isActive) {
    return next(new AppError('Your account has been deactivated or blocked. Please contact admin.', 403));
  }

  // 5) Check if 2FA (OTP Verification) is enabled
  if (user.is2FAEnabled) {
    // Invalidate existing login-2fa OTPs
    await OtpRecord.deleteMany({ userId: user._id, purpose: 'login-2fa' });

    // Generate a secure 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    // Hash OTP before storing
    const otpHash = await OtpRecord.hashOtp(otp);
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    // Create OtpRecord
    await OtpRecord.create({
      userId: user._id,
      currentEmail: user.email,
      purpose: 'login-2fa',
      otpHash,
      expiresAt,
      lastSentAt: new Date(),
    });

    // Send OTP to agent's email
    await transporter.sendMail({
      from: process.env.EMAIL_USER || process.env.SMTP_FROM || 'noreply@krossfilmproductions.com',
      to: user.email,
      subject: 'Your Kinetoscope Agent Login OTP',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px; border: 1px solid #e5e7eb; border-radius: 8px;">
          <h2 style="color: #1a1a2e; margin-bottom: 16px;">Agent Portal Login Verification</h2>
          <p>Hello ${user.name},</p>
          <p>Your one-time password (OTP) for logging into your Kinetoscope Agent dashboard is:</p>
          <div style="font-size: 36px; font-weight: bold; letter-spacing: 8px; color: #10b981; margin: 24px 0; text-align: center; background: #f8fafc; padding: 12px; border-radius: 6px;">${otp}</div>
          <p>This code is valid for <strong>10 minutes</strong>. Do not share this code with anyone.</p>
          <p style="color: #94a3b8; font-size: 11px; margin-top: 24px;">If you did not attempt to log in, please secure your account immediately.</p>
        </div>
      `,
    });

    console.log(`[Agent 2FA OTP] Code sent to ${user.email}`);

    return res.status(200).json({
      success: true,
      message: 'OTP sent to your registered email address.',
      requires2FA: true,
    });
  }

  // 6) Regular login without 2FA: sign token and update lastLogin
  user.lastLogin = new Date();
  await user.save({ validateBeforeSave: false });

  // Fetch agent profile to return alongside user data
  const profile = await AgentProfile.findOne({ userId: user._id });

  const token = signToken(user._id, user.role);
  const cookieOptions = getCookieOptions();
  res.cookie('jwt', token, cookieOptions);

  user.password = undefined;

  res.status(200).json({
    success: true,
    message: 'Logged in successfully to agent portal.',
    token,
    data: {
      user,
      profile,
    },
  });
});

/**
 * Agent 2FA OTP Verification Handler
 * POST /api/agent/auth/verify-2fa
 */
const verify2FA = asyncHandler(async (req, res, next) => {
  const { email, otp } = req.body;

  if (!email || !otp) {
    return next(new AppError('Please provide email and OTP code.', 400));
  }

  // 1) Find user by email
  const user = await User.findOne({ email });
  if (!user || user.role !== ROLES.AGENT) {
    return next(new AppError('Authentication failed. User not found.', 401));
  }

  // 2) Find active OTP record for login-2fa purpose
  const otpRecord = await OtpRecord.findOne({
    userId: user._id,
    purpose: 'login-2fa',
    isUsed: false,
    expiresAt: { $gt: new Date() },
  }).select('+otpHash');

  if (!otpRecord) {
    return next(new AppError('No valid OTP found. Please request a new OTP.', 400));
  }

  // 3) Verify OTP hash using bcrypt
  const isMatch = await otpRecord.verifyOtp(otp);
  if (!isMatch) {
    return next(new AppError('Invalid OTP code. Please check and try again.', 401));
  }

  // 4) Invalidate OTP record immediately
  await OtpRecord.deleteMany({ userId: user._id, purpose: 'login-2fa' });

  // 5) Update user lastLogin
  user.lastLogin = new Date();
  await user.save({ validateBeforeSave: false });

  // Fetch agent profile
  const profile = await AgentProfile.findOne({ userId: user._id });

  // 6) Sign JWT and set cookie
  const token = signToken(user._id, user.role);
  const cookieOptions = getCookieOptions();
  res.cookie('jwt', token, cookieOptions);

  res.status(200).json({
    success: true,
    message: 'OTP verified. Access granted.',
    token,
    data: {
      user,
      profile,
    },
  });
});

/**
 * Agent Logout Handler
 * POST /api/agent/auth/logout
 */
const logout = asyncHandler(async (req, res, next) => {
  res.cookie('jwt', 'loggedout', {
    expires: new Date(Date.now() + 10 * 1000), // expire in 10 seconds
    httpOnly: true,
  });

  res.status(200).json({
    success: true,
    message: 'Logged out successfully from agent portal.',
  });
});

/**
 * Get currently authenticated agent's session details
 * GET /api/agent/auth/me
 */
const getMe = asyncHandler(async (req, res, next) => {
  if (req.user.role !== ROLES.AGENT) {
    return next(new AppError('Access Denied. Only agent accounts are permitted.', 403));
  }

  const profile = await AgentProfile.findOne({ userId: req.user.id });

  res.status(200).json({
    success: true,
    data: {
      user: req.user,
      profile,
    },
  });
});

/**
 * Register a new Agent (Self-registration from agent portal)
 * POST /api/agent/auth/register
 */
const registerAgent = asyncHandler(async (req, res, next) => {
  // 1) Normalize files mapping to accommodate various frontend naming conventions
  if (!req.files) {
    return next(new AppError('No documents were uploaded. Please upload all 4 required documents.', 400));
  }

  const filesMap = {
    panDocument: req.files.panDocument?.[0] || req.files.panCard?.[0] || req.files.pan?.[0],
    idProofDocument: req.files.idProofDocument?.[0] || req.files.idProof?.[0],
    bankProofDocument: req.files.bankProofDocument?.[0] || req.files.bankStatementProof?.[0] || req.files.bankProof?.[0],
    nomineeProofDocument: req.files.nomineeProofDocument?.[0] || req.files.nomineeProof?.[0]
  };

  const fileFields = [
    'panDocument',
    'idProofDocument',
    'bankProofDocument',
    'nomineeProofDocument',
  ];

  for (const field of fileFields) {
    if (!filesMap[field]) {
      return next(new AppError(`Required document missing: ${field}`, 400));
    }
  }

  // Override req.files with normalized keys for background Cloudinary uploader
  req.files = {
    panDocument: [filesMap.panDocument],
    idProofDocument: [filesMap.idProofDocument],
    bankProofDocument: [filesMap.bankProofDocument],
    nomineeProofDocument: [filesMap.nomineeProofDocument]
  };

  const {
    fullName,
    phone,
    email,
    residencyStatus,
    citizenship, // fallback mapping
    panNumber,
    aadhaarNumber,
    bankName,
    accountNumber,
    ifscCode,
    nomineeName,
    nomineeRelation,
    relation, // fallback mapping
    nomineePhone,
    nomineeEmail,
    nomineeResidency,
    password,
  } = req.body;

  if (!fullName || !email || !phone || !password) {
    return next(new AppError('Please provide fullName, email, phone, and password.', 400));
  }

  // 2) Check if email is already registered in the system
  const existingUser = await User.findOne({ email: email.toLowerCase().trim() });
  if (existingUser) {
    return next(new AppError('Email address is already in use by another account.', 400));
  }

  // 3) Generate a sequential agent code starting from AGT-001
  const agents = await User.find({ role: ROLES.AGENT }, { clientCode: 1 });
  let maxSeq = 0;
  agents.forEach(a => {
    if (a.clientCode && a.clientCode.startsWith('AGT-')) {
      const parts = a.clientCode.split('-');
      const seq = parseInt(parts[1], 10);
      if (!isNaN(seq) && seq > maxSeq) {
        maxSeq = seq;
      }
    }
  });
  const agentCode = `AGT-${String(maxSeq + 1).padStart(3, '0')}`;

  // Define database variables outside to perform rollback on error
  let createdUser, createdProfile;

  try {
    // 4) Create the User document
    createdUser = await User.create({
      name: fullName,
      email: email.toLowerCase().trim(),
      password,
      role: ROLES.AGENT,
      isActive: false, // Inactive by default until admin verification
      is2FAEnabled: false,
      clientCode: agentCode,
    });

    // 5) Create the AgentProfile document
    createdProfile = await AgentProfile.create({
      userId: createdUser._id,
      fullName,
      phone,
      email: email.toLowerCase().trim(),
      residencyStatus: residencyStatus || citizenship || 'National (Domestic)',
      panNumber,
      aadhaarNumber,
      bankName,
      accountNumber,
      ifscCode,
      oneTimeCommission: 0,
      monthlySlab: '',
      specialCommission: 0,
      nomineeName,
      nomineeRelation: nomineeRelation || relation || '',
      nomineePhone,
      nomineeEmail,
      nomineeResidency: nomineeResidency || 'National (Domestic)',
      panDocument: '',
      idProofDocument: '',
      bankProofDocument: '',
      nomineeProofDocument: '',
      documentStatus: 'pending_upload',
      status: 'pending', // Pending status by default
      portalPassword: password,
    });
  } catch (dbError) {
    // Rollback: Delete user if created user profile creation fails
    if (createdUser) {
      await User.findByIdAndDelete(createdUser._id);
    }
    return next(new AppError(`Database transaction failed: ${dbError.message}`, 500));
  }

  // 6) Trigger parallel in-memory background uploads (Vercel-safe using waitUntil)
  const { uploadDocumentsToCloudinaryParallelBackground } = require('../../services/cloudinary.service');
  uploadDocumentsToCloudinaryParallelBackground({
    files: req.files,
    fileFields,
    Model: AgentProfile,
    filter: { userId: createdUser._id },
    entityLabel: 'Agent',
  });

  // Clear password from return payload
  createdUser.password = undefined;

  res.status(201).json({
    success: true,
    message: 'Agent registration successful. Documents are uploading in the background. Access is pending admin verification.',
    data: {
      user: createdUser,
      profile: createdProfile,
    },
  });
});

/**
 * Agent self toggle 2FA
 * PATCH /api/agent/profile/2fa
 */
const toggleAgentSelf2FA = asyncHandler(async (req, res, next) => {
  const { is2FAEnabled } = req.body;
  if (typeof is2FAEnabled !== 'boolean') {
    return next(new AppError('is2FAEnabled must be a boolean value', 400));
  }
  const user = await User.findByIdAndUpdate(
    req.user._id,
    { is2FAEnabled },
    { new: true, runValidators: true }
  );
  if (!user) {
    return next(new AppError('User not found', 404));
  }
  res.status(200).json({
    status: 'success',
    message: `2FA ${is2FAEnabled ? 'enabled' : 'disabled'} successfully`,
    is2FAEnabled: user.is2FAEnabled,
  });
});

module.exports = {
  login,
  verify2FA,
  logout,
  getMe,
  registerAgent,
  toggleAgentSelf2FA,
};

