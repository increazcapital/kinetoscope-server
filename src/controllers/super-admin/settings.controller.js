const User = require('../../models/User.model');
const AppError = require('../../utils/AppError');
const asyncHandler = require('../../utils/asyncHandler');

/**
 * Get current Super Admin security settings (including 2FA state)
 * GET /api/super-admin/settings
 */
const getSettings = asyncHandler(async (req, res, next) => {
  // req.user is already populated by protect middleware
  const user = await User.findById(req.user.id);

  if (!user) {
    return next(new AppError('User not found', 404));
  }

  res.status(200).json({
    success: true,
    message: 'Settings retrieved successfully',
    data: {
      settings: {
        is2FAEnabled: user.is2FAEnabled,
        email: user.email,
        name: user.name,
      },
    },
  });
});

/**
 * Toggle Two-Factor Authentication (2FA) for the Super Admin
 * PATCH /api/super-admin/settings/2fa
 * Body: { is2FAEnabled: true | false }
 */
const toggle2FA = asyncHandler(async (req, res, next) => {
  const { is2FAEnabled } = req.body;

  // Strict boolean check
  if (typeof is2FAEnabled !== 'boolean') {
    return next(new AppError('is2FAEnabled must be a boolean value (true or false)', 400));
  }

  const user = await User.findByIdAndUpdate(
    req.user.id,
    { is2FAEnabled },
    { new: true, runValidators: true }
  );

  if (!user) {
    return next(new AppError('User not found', 404));
  }

  res.status(200).json({
    success: true,
    message: `Two-Factor Authentication has been ${is2FAEnabled ? 'enabled' : 'disabled'} successfully`,
    data: {
      is2FAEnabled: user.is2FAEnabled,
    },
  });
});

const { ROLES } = require('../../constants/roles');

/**
 * Toggle 2FA for all clients globally (Super Admin only)
 * PATCH /api/super-admin/settings/client-2fa
 * Body: { is2FAEnabled: true | false }
 */
const toggleClient2FA = asyncHandler(async (req, res, next) => {
  const { is2FAEnabled } = req.body;

  if (typeof is2FAEnabled !== 'boolean') {
    return next(new AppError('is2FAEnabled must be a boolean value (true or false)', 400));
  }

  const result = await User.updateMany(
    { role: ROLES.CLIENT },
    { is2FAEnabled }
  );

  res.status(200).json({
    success: true,
    message: `Two-Factor Authentication has been ${is2FAEnabled ? 'enabled' : 'disabled'} globally for all clients successfully.`,
    data: {
      is2FAEnabled,
      affectedCount: result.modifiedCount,
    },
  });
});

/**
 * Toggle 2FA for all agents globally (Super Admin only)
 * PATCH /api/super-admin/settings/agent-2fa
 * Body: { is2FAEnabled: true | false }
 */
const toggleAgent2FA = asyncHandler(async (req, res, next) => {
  const { is2FAEnabled } = req.body;

  if (typeof is2FAEnabled !== 'boolean') {
    return next(new AppError('is2FAEnabled must be a boolean value (true or false)', 400));
  }

  const result = await User.updateMany(
    { role: ROLES.AGENT },
    { is2FAEnabled }
  );

  res.status(200).json({
    success: true,
    message: `Two-Factor Authentication has been ${is2FAEnabled ? 'enabled' : 'disabled'} globally for all agents successfully.`,
    data: {
      is2FAEnabled,
      affectedCount: result.modifiedCount,
    },
  });
});

const SystemSetting = require('../../models/SystemSetting.model');

/**
 * Get or initialize global support desk contact configurations
 */
const getOrCreateSupportSetting = async () => {
  let setting = await SystemSetting.findOne({ key: 'system_config' });
  if (!setting) {
    setting = await SystemSetting.create({ key: 'system_config' });
  }
  return setting;
};

/**
 * Get Support Settings (Public / Auth for Client & Agent Portals & Super Admin)
 * GET /api/system-settings/support or GET /api/super-admin/settings/support
 */
const getSupportSettings = asyncHandler(async (req, res, next) => {
  const setting = await getOrCreateSupportSetting();
  const data = setting.toObject ? setting.toObject() : { ...setting };
  
  if (!data.agentSupportEmail || !data.agentSupportEmail.includes('@')) {
    data.agentSupportEmail = 'support@kfpl.in';
  }
  if (!data.clientSupportEmail || !data.clientSupportEmail.includes('@')) {
    data.clientSupportEmail = 'support@kfpl.com';
  }

  res.status(200).json({
    success: true,
    data,
  });
});

/**
 * Update Support Settings (Super Admin only)
 * PUT /api/super-admin/settings/support
 */
const updateSupportSettings = asyncHandler(async (req, res, next) => {
  const {
    clientSupportEmail,
    clientSupportPhone,
    clientSupportWhatsapp,
    agentSupportEmail,
    agentSupportPhone,
    agentSupportWhatsapp,
    supportHours,
  } = req.body;

  let setting = await SystemSetting.findOne({ key: 'system_config' });
  if (!setting) {
    setting = new SystemSetting({ key: 'system_config' });
  }

  if (clientSupportEmail !== undefined) setting.clientSupportEmail = clientSupportEmail;
  if (clientSupportPhone !== undefined) setting.clientSupportPhone = clientSupportPhone;
  if (clientSupportWhatsapp !== undefined) setting.clientSupportWhatsapp = clientSupportWhatsapp;
  if (agentSupportEmail !== undefined) setting.agentSupportEmail = agentSupportEmail;
  if (agentSupportPhone !== undefined) setting.agentSupportPhone = agentSupportPhone;
  if (agentSupportWhatsapp !== undefined) setting.agentSupportWhatsapp = agentSupportWhatsapp;
  if (supportHours !== undefined) setting.supportHours = supportHours;

  await setting.save();

  res.status(200).json({
    success: true,
    message: 'Support Desk contact configuration updated successfully',
    data: setting,
  });
});

/**
 * Get Branding Settings (Public — used by all 3 dashboards)
 * GET /api/system-settings/branding or GET /api/super-admin/settings/branding
 */
const getBranding = asyncHandler(async (req, res, next) => {
  const setting = await getOrCreateSupportSetting();
  res.status(200).json({
    success: true,
    data: {
      companyName: setting.companyName || 'YieldIQ',
      tagline: setting.tagline || '',
      logoUrl: setting.logoUrl || '',
      faviconUrl: setting.faviconUrl || '',
    },
  });
});

/**
 * Update Branding Settings (Super Admin only)
 * PUT /api/super-admin/settings/branding
 * Supports multipart form with logo/favicon file uploads via Cloudinary
 */
const updateBranding = asyncHandler(async (req, res, next) => {
  const { companyName, tagline } = req.body;

  let setting = await SystemSetting.findOne({ key: 'system_config' });
  if (!setting) {
    setting = new SystemSetting({ key: 'system_config' });
  }

  if (companyName !== undefined) setting.companyName = companyName;
  if (tagline !== undefined) setting.tagline = tagline;

  // Handle logo upload if file is provided
  if (req.files) {
    const { uploadBufferToCloudinary } = require('../../services/cloudinary.service');

    if (req.files.logo && req.files.logo[0]) {
      try {
        const logoResult = await uploadBufferToCloudinary(
          req.files.logo[0].buffer,
          'yieldiq/branding',
          { resource_type: 'image' }
        );
        setting.logoUrl = typeof logoResult === 'string' ? logoResult : (logoResult?.secure_url || logoResult?.url || '');
      } catch (uploadErr) {
        console.error('[Branding] Logo Cloudinary upload failed, falling back to base64 data URI:', uploadErr.message);
        const mime = req.files.logo[0].mimetype || 'image/png';
        setting.logoUrl = `data:${mime};base64,${req.files.logo[0].buffer.toString('base64')}`;
      }
    }

    if (req.files.favicon && req.files.favicon[0]) {
      try {
        const faviconResult = await uploadBufferToCloudinary(
          req.files.favicon[0].buffer,
          'yieldiq/branding',
          { resource_type: 'image' }
        );
        setting.faviconUrl = typeof faviconResult === 'string' ? faviconResult : (faviconResult?.secure_url || faviconResult?.url || '');
      } catch (uploadErr) {
        console.error('[Branding] Favicon Cloudinary upload failed, falling back to base64 data URI:', uploadErr.message);
        const mime = req.files.favicon[0].mimetype || 'image/png';
        setting.faviconUrl = `data:${mime};base64,${req.files.favicon[0].buffer.toString('base64')}`;
      }
    }
  }

  // Also support direct url in body if provided
  if (req.body.logoUrl !== undefined && (!req.files || !req.files.logo)) {
    setting.logoUrl = req.body.logoUrl;
  }
  if (req.body.faviconUrl !== undefined && (!req.files || !req.files.favicon)) {
    setting.faviconUrl = req.body.faviconUrl;
  }

  await setting.save();

  res.status(200).json({
    success: true,
    message: 'Branding settings updated successfully',
    data: {
      companyName: setting.companyName || 'YieldIQ',
      tagline: setting.tagline || '',
      logoUrl: setting.logoUrl || '',
      faviconUrl: setting.faviconUrl || '',
    },
  });
});

module.exports = {
  getSettings,
  toggle2FA,
  toggleClient2FA,
  toggleAgent2FA,
  getSupportSettings,
  updateSupportSettings,
  getBranding,
  updateBranding,
};

