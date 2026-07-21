const User = require('../../models/User.model');
const ClientProfile = require('../../models/ClientProfile.model');
const OtpRecord = require('../../models/OtpRecord.model');
const transporter = require('../../config/mailer');
const AppError = require('../../utils/AppError');
const asyncHandler = require('../../utils/asyncHandler');
const { signToken, getCookieOptions } = require('../../utils/helpers');
const { ROLES } = require('../../constants/roles');

/**
 * Client Login Handler
 * POST /api/client/auth/login
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

  // 3) Enforce role = client restriction. Return 403 if non-client.
  if (user.role !== ROLES.CLIENT) {
    return next(new AppError('Access Denied. Only client accounts are permitted to log in to this portal.', 403));
  }

  // 4) Verify account is active and KYC verified
  const profile = await ClientProfile.findOne({ userId: user._id });
  if (profile && profile.kycStatus === 'PENDING') {
    return next(new AppError('Your account is pending KYC verification and approval. You will receive an email once approved.', 403));
  }
  if (profile && profile.kycStatus === 'REJECTED') {
    return next(new AppError('Your account KYC registration has been rejected. Please contact support.', 403));
  }
  if (!user.isActive) {
    return next(new AppError('Your account has been deactivated. Please contact support.', 403));
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

    // Send OTP to user's email
    await transporter.sendMail({
      from: process.env.EMAIL_USER || process.env.SMTP_FROM || 'noreply@krossfilmproductions.com',
      to: user.email,
      subject: 'Your Kinetoscope Client Login OTP',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px; border: 1px solid #e5e7eb; border-radius: 8px;">
          <h2 style="color: #1a1a2e; margin-bottom: 16px;">Client Portal Login Verification</h2>
          <p>Hello ${user.name},</p>
          <p>Your one-time password (OTP) for logging into your Kinetoscope Client dashboard is:</p>
          <div style="font-size: 36px; font-weight: bold; letter-spacing: 8px; color: #1e3a8a; margin: 24px 0; text-align: center; background: #f8fafc; padding: 12px; border-radius: 6px;">${otp}</div>
          <p>This code is valid for <strong>10 minutes</strong>. Do not share this code with anyone.</p>
          <p style="color: #94a3b8; font-size: 11px; margin-top: 24px;">If you did not attempt to log in, please secure your account immediately.</p>
        </div>
      `,
    });

    console.log(`[Client 2FA OTP] Code sent to ${user.email}`);

    return res.status(200).json({
      success: true,
      message: 'OTP sent to your registered email address.',
      requires2FA: true,
    });
  }

  // 6) Regular login without 2FA: sign token and update lastLogin
  user.lastLogin = new Date();
  await user.save({ validateBeforeSave: false });

  // Profile already fetched above

  const token = signToken(user._id, user.role);
  const cookieOptions = getCookieOptions();
  res.cookie('jwt', token, cookieOptions);

  user.password = undefined;

  res.status(200).json({
    success: true,
    message: 'Logged in successfully to client portal.',
    token,
    data: {
      user,
      profile,
    },
  });
});

/**
 * Client 2FA OTP Verification Handler
 * POST /api/client/auth/verify-2fa
 */
const verify2FA = asyncHandler(async (req, res, next) => {
  const { email, otp } = req.body;

  if (!email || !otp) {
    return next(new AppError('Please provide email and OTP code.', 400));
  }

  // 1) Find user by email
  const user = await User.findOne({ email });
  if (!user || user.role !== ROLES.CLIENT) {
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

  // Fetch client profile
  const profile = await ClientProfile.findOne({ userId: user._id });

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
 * Client Logout Handler
 * POST /api/client/auth/logout
 */
const logout = asyncHandler(async (req, res, next) => {
  res.cookie('jwt', 'loggedout', {
    expires: new Date(Date.now() + 10 * 1000), // expire in 10 seconds
    httpOnly: true,
  });

  res.status(200).json({
    success: true,
    message: 'Logged out successfully from client portal.',
  });
});

/**
 * Get currently authenticated client's session details
 * GET /api/client/auth/me
 */
const getMe = asyncHandler(async (req, res, next) => {
  if (req.user.role !== ROLES.CLIENT) {
    return next(new AppError('Access Denied. Only client accounts are permitted.', 403));
  }

  const profile = await ClientProfile.findOne({ userId: req.user.id });

  let profileObj = null;
  if (profile) {
    profileObj = {
      ...profile.toObject(),
      clientCode: req.user.clientCode || '—',
      clientId: req.user.clientCode || '—',
    };
  }

  res.status(200).json({
    success: true,
    data: {
      user: req.user,
      profile: profileObj,
    },
  });
});

/**
 * Register a new Client (Self-registration from client portal)
 * POST /api/client/auth/register
 */
const registerClient = asyncHandler(async (req, res, next) => {
  const {
    fullName,
    email,
    phone,
    dob,
    address,
    riskProfile,
    residencyStatus,
    citizenship, // fallback mapping
    monthlyRoi,
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

  // 1) Check if email is already in use
  const existingUser = await User.findOne({ email: email.toLowerCase().trim() });
  if (existingUser) {
    return next(new AppError('Email address is already in use by another account.', 400));
  }

  // 2) Generate sequential clientCode KFPL-XXXX
  const clients = await User.find({ clientCode: /^KFPL-\d+$/ }, { clientCode: 1 });
  let maxSeq = 1000;
  clients.forEach(c => {
    if (c.clientCode) {
      const parts = c.clientCode.split('-');
      const seq = parseInt(parts[1], 10);
      if (!isNaN(seq) && seq > maxSeq) {
        maxSeq = seq;
      }
    }
  });
  const clientCode = `KFPL-${maxSeq + 1}`;

  // 3) Process file uploads flexibly
  const panFile = req.files && (req.files['panDocument']?.[0] || req.files['panCard']?.[0] || req.files['pan']?.[0]);
  const aadhaarFile = req.files && (req.files['aadhaarDocument']?.[0] || req.files['aadhaarCard']?.[0] || req.files['aadhaar']?.[0]);
  const bankFile = req.files && (req.files['bankProofDocument']?.[0] || req.files['bankStatementProof']?.[0] || req.files['bankProof']?.[0]);
  const nomineeFile = req.files && (req.files['nomineeProofDocument']?.[0] || req.files['nomineeProof']?.[0]);

  if (!panFile || !aadhaarFile || !bankFile) {
    return next(new AppError('Please upload all required KYC documents (PAN, Aadhaar, Bank Proof).', 400));
  }

  let panDocumentUrl = '';
  let aadhaarDocumentUrl = '';
  let bankProofDocumentUrl = '';
  let nomineeProofDocumentUrl = '';

  const { uploadBufferToCloudinary } = require('../../services/cloudinary.service');

  try {
    console.log('[Client Register] Uploading KYC files to Cloudinary...');
    panDocumentUrl = await uploadBufferToCloudinary(panFile.buffer, 'kinetoscope/clients/kyc');
    aadhaarDocumentUrl = await uploadBufferToCloudinary(aadhaarFile.buffer, 'kinetoscope/clients/kyc');
    bankProofDocumentUrl = await uploadBufferToCloudinary(bankFile.buffer, 'kinetoscope/clients/kyc');
    if (nomineeFile) {
      nomineeProofDocumentUrl = await uploadBufferToCloudinary(nomineeFile.buffer, 'kinetoscope/clients/kyc');
    }
  } catch (err) {
    return next(new AppError(`KYC document upload failed: ${err.message}`, 500));
  }

  let createdUser, createdProfile;

  try {
    // 4) Create User record (deactivated initially)
    createdUser = await User.create({
      name: fullName,
      email: email.toLowerCase().trim(),
      password: password || 'tempPassword123',
      role: ROLES.CLIENT,
      isActive: false, // Cannot login until super admin verifies & approves
      clientCode,
    });

    // 5) Create ClientProfile record
    createdProfile = await ClientProfile.create({
      userId: createdUser._id,
      fullName,
      phone,
      email: email.toLowerCase().trim(),
      dob: dob ? new Date(dob) : undefined,
      address,
      riskProfile: riskProfile || 'Conservative',
      residencyStatus: residencyStatus || citizenship || 'National (Domestic)',
      monthlyRoi: monthlyRoi !== undefined ? Number(monthlyRoi) : 0,
      panNumber,
      aadhaarNumber,
      bankName,
      accountNumber,
      ifscCode,
      nomineeName,
      nomineeRelation: nomineeRelation || relation || '',
      nomineePhone,
      nomineeEmail,
      nomineeResidency: nomineeResidency || 'National (Domestic)',
      panDocument: panDocumentUrl,
      aadhaarDocument: aadhaarDocumentUrl,
      bankProofDocument: bankProofDocumentUrl,
      nomineeProofDocument: nomineeProofDocumentUrl,
      kycStatus: 'PENDING',
      status: 'inactive', // inactive until approved
      portalPassword: password || 'tempPassword123',
    });
  } catch (err) {
    // Rollback if database save fails
    if (createdUser) {
      await User.findByIdAndDelete(createdUser._id);
    }
    return next(new AppError(`Database saving failed: ${err.message}`, 500));
  }

  res.status(201).json({
    success: true,
    message: 'Registration successful! Your account is pending KYC verification and approval by Kinetoscope Administrator.',
    data: {
      user: {
        _id: createdUser._id,
        name: createdUser.name,
        email: createdUser.email,
        clientCode: createdUser.clientCode,
        isActive: createdUser.isActive,
      },
      profile: createdProfile,
    },
  });
});

module.exports = {
  login,
  verify2FA,
  logout,
  getMe,
  registerClient,
};
