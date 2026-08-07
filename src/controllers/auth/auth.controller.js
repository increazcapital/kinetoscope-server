const User = require('../../models/User.model');
const SubAdmin = require('../../models/SubAdmin.model');
const OtpRecord = require('../../models/OtpRecord.model');
const AppError = require('../../utils/AppError');
const asyncHandler = require('../../utils/asyncHandler');
const { signToken, getCookieOptions } = require('../../utils/helpers');
const { ROLES } = require('../../constants/roles');
const transporter = require('../../config/mailer');

/**
 * One-time Super Admin Setup
 * POST /api/v1/auth/setup-admin
 */
const setupAdmin = asyncHandler(async (req, res, next) => {
  const { name, email, password } = req.body;

  // 1) Verify if any Super Admin already exists in the system
  const existingAdmin = await User.findOne({ role: ROLES.SUPER_ADMIN });
  if (existingAdmin) {
    return next(new AppError('A Super Admin already exists in the system. Setup is blocked.', 409));
  }

  // 2) Check if email is already taken by another user type (e.g. client/agent)
  const existingEmail = await User.findOne({ email });
  if (existingEmail) {
    return next(new AppError('Email address is already in use.', 400));
  }

  // 3) Create the Super Admin
  const admin = await User.create({
    name,
    email,
    password,
    role: ROLES.SUPER_ADMIN,
    isActive: true,
  });

  // Remove password from response payload
  admin.password = undefined;

  res.status(201).json({
    success: true,
    message: 'Super Admin created successfully. One-time setup completed.',
    data: {
      user: admin,
    },
  });
});

/**
 * Authentication Login Handler
 * POST /api/v1/auth/login
 */
const login = asyncHandler(async (req, res, next) => {
  const { email, password } = req.body;

  // 1) Find user by email — check User model first, then SubAdmin model
  let user = await User.findOne({ email }).select('+password');
  let isSubAdmin = false;

  if (!user) {
    // Check SubAdmin model as fallback
    const subAdmin = await SubAdmin.findOne({ email: email.toLowerCase().trim() }).select('+password');
    if (subAdmin) {
      user = subAdmin;
      isSubAdmin = true;
    }
  }

  if (!user) {
    return next(new AppError('Invalid email address or password', 401));
  }

  // 2) Verify user password match
  const isMatch = await user.comparePassword(password);
  if (!isMatch) {
    return next(new AppError('Invalid email address or password', 401));
  }

  // 3) Sub Admin login — bypass 2FA and role portal check, just validate isActive
  if (isSubAdmin) {
    if (!user.isActive) {
      return next(new AppError('Your sub-admin account has been deactivated. Please contact the Super Admin.', 403));
    }
    const token = signToken(user._id, ROLES.SUB_ADMIN);
    const cookieOptions = getCookieOptions();
    res.cookie('jwt', token, cookieOptions);

    return res.status(200).json({
      success: true,
      message: 'Logged in successfully',
      token,
      data: {
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          role: ROLES.SUB_ADMIN,
          permissions: user.permissions,
          isActive: user.isActive,
        },
      },
    });
  }

  // 4) Enforce dynamic role restriction based on origin/referer headers to prevent cross-portal authentication
  const origin = req.headers.origin || req.headers.referer || '';
  let expectedRole = ROLES.SUPER_ADMIN;

  if (origin.includes('clientadmin') || origin.includes('localhost:5174') || origin.includes('localhost:3000')) {
    expectedRole = ROLES.CLIENT;
  } else if (origin.includes('agentadmin') || origin.includes('localhost:5175')) {
    expectedRole = ROLES.AGENT;
  } else if (origin.includes('superadmin') || origin.includes('localhost:5173')) {
    expectedRole = ROLES.SUPER_ADMIN;
  } else {
    expectedRole = user.role;
  }

  if (user.role !== expectedRole) {
    if (expectedRole === ROLES.CLIENT) {
      return next(new AppError('Access Denied. Only client accounts are permitted to log in to this portal.', 403));
    } else if (expectedRole === ROLES.AGENT) {
      return next(new AppError('Access Denied. Only agent accounts are permitted to log in to this portal.', 403));
    } else {
      return next(new AppError('Access Denied. Only super admin accounts are permitted to log in to this portal.', 403));
    }
  }

  // 5) Verify account is active
  if (!user.isActive) {
    return next(new AppError('Your account has been deactivated. Please contact support.', 403));
  }

  // 6) Check if 2FA (OTP Verification) is enabled
  if (user.is2FAEnabled) {
    // 1) Invalidate any existing login-2fa OTPs for this user
    await OtpRecord.deleteMany({ userId: user._id, purpose: 'login-2fa' });

    // 2) Generate a secure 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    // 3) Hash OTP before storing
    const otpHash = await OtpRecord.hashOtp(otp);
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    // 4) Create OtpRecord
    await OtpRecord.create({
      userId: user._id,
      currentEmail: user.email,
      purpose: 'login-2fa',
      otpHash,
      expiresAt,
      lastSentAt: new Date(),
    });

    let portalLabel = 'Super Admin';
    if (user.role === ROLES.CLIENT) {
      portalLabel = 'Client Portal';
    } else if (user.role === ROLES.AGENT) {
      portalLabel = 'Agent Portal';
    }

    const { buildOtpEmailHtml } = require('../../services/email.service');
    await transporter.sendMail({
      from: process.env.EMAIL_USER || process.env.SMTP_FROM || 'noreply@kinetoscopefilmproduction.com',
      to: user.email,
      subject: `Your Kinetoscope ${portalLabel} Login OTP`,
      html: buildOtpEmailHtml({
        title: `${portalLabel} Login Verification`,
        subtitle: `Hello <strong>${user.name}</strong>, enter the OTP below to complete your ${portalLabel} sign-in.`,
        otp,
        expiryMinutes: 10
      }),
    });

    console.log(`[2FA OTP] Code sent to ${user.email} (${portalLabel})`);

    return res.status(200).json({
      success: true,
      message: 'OTP sent to your registered email address.',
      requires2FA: true,
      otp,
    });
  }

  // 7) Regular login without 2FA: sign token and update lastLogin
  user.lastLogin = new Date();
  await user.save({ validateBeforeSave: false });

  const token = signToken(user._id, user.role);
  const cookieOptions = getCookieOptions();
  res.cookie('jwt', token, cookieOptions);

  user.password = undefined;

  res.status(200).json({
    success: true,
    message: 'Logged in successfully',
    token,
    data: {
      user,
    },
  });
});

/**
 * 2FA OTP Verification Handler
 * POST /api/v1/auth/verify-2fa
 */
const verify2FA = asyncHandler(async (req, res, next) => {
  const { email, otp } = req.body;

  // 1) Find user by email
  const user = await User.findOne({ email });
  if (!user) {
    return next(new AppError('Authentication failed. User not found.', 401));
  }

  // Enforce dynamic role check on 2FA verify
  const origin = req.headers.origin || req.headers.referer || '';
  let expectedRole = ROLES.SUPER_ADMIN;

  if (origin.includes('clientadmin') || origin.includes('localhost:5174') || origin.includes('localhost:3000')) {
    expectedRole = ROLES.CLIENT;
  } else if (origin.includes('agentadmin') || origin.includes('localhost:5175')) {
    expectedRole = ROLES.AGENT;
  } else if (origin.includes('superadmin') || origin.includes('localhost:5173')) {
    expectedRole = ROLES.SUPER_ADMIN;
  } else {
    expectedRole = user.role;
  }

  if (user.role !== expectedRole) {
    return next(new AppError('Access Denied. You do not have permission to verify 2FA on this portal.', 403));
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

  // 4) Invalidate OTP record immediately (single-use enforcement)
  await OtpRecord.deleteMany({ userId: user._id, purpose: 'login-2fa' });

  // 5) Update user lastLogin
  user.lastLogin = new Date();
  await user.save({ validateBeforeSave: false });

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
    },
  });
});

/**
 * Get currently authenticated user profile
 * GET /api/v1/auth/profile
 */
const getProfile = asyncHandler(async (req, res, next) => {
  // req.user is populated by protect middleware
  res.status(200).json({
    success: true,
    data: {
      user: req.user,
    },
  });
});

/**
 * Update authenticated user profile
 * PATCH /api/v1/auth/profile
 */
const updateProfile = asyncHandler(async (req, res, next) => {
  // Only allow updating name and is2FAEnabled.
  // Email changes must go through the OTP-verified change-email flow.
  const allowedUpdates = ['name', 'is2FAEnabled'];
  const updates = {};

  for (const key of Object.keys(req.body)) {
    if (allowedUpdates.includes(key)) {
      updates[key] = req.body[key];
    }
  }

  const user = await User.findByIdAndUpdate(req.user.id, updates, {
    new: true,
    runValidators: true,
  });

  if (!user) {
    return next(new AppError('User profile session could not be found.', 404));
  }

  res.status(200).json({
    success: true,
    message: 'Profile updated successfully',
    data: {
      user,
    },
  });
});

/**
 * Change authenticated user password
 * PATCH /api/v1/auth/change-password
 */
const changePassword = asyncHandler(async (req, res, next) => {
  // Prevent Super Admin from bypassing OTP-verified flow
  if (req.user.role === 'super-admin') {
    return next(
      new AppError(
        'Super Admin must change their password using the OTP-verified flow under /api/super-admin/settings/change-password/send-otp',
        403
      )
    );
  }

  const { currentPassword, newPassword } = req.body;

  // 1) Find the user by ID and select their password
  const user = await User.findById(req.user.id).select('+password');
  if (!user) {
    return next(new AppError('User session not found.', 404));
  }

  // 2) Verify current password is correct
  const isMatch = await user.comparePassword(currentPassword);
  if (!isMatch) {
    return next(new AppError('Incorrect current password.', 401));
  }

  // 3) Set new password (this will trigger mongoose pre('save') hash hook)
  user.password = newPassword;
  await user.save();

  res.status(200).json({
    success: true,
    message: 'Password updated successfully. Please use your new password for subsequent logins.',
  });
});

/**
 * Log out authenticated user (Clears JWT Cookie)
 * POST /api/v1/auth/logout
 */
const logout = asyncHandler(async (req, res, next) => {
  res.cookie('jwt', 'loggedout', {
    expires: new Date(Date.now() + 10 * 1000), // set expiry to 10 seconds
    httpOnly: true,
  });

  res.status(200).json({
    success: true,
    message: 'Logged out successfully',
  });
});

module.exports = {
  setupAdmin,
  login,
  verify2FA,
  getProfile,
  updateProfile,
  changePassword,
  logout,
};
