/* ============================================================
   Controller: sub-admin.controller.js
   Description: CRUD operations for Sub Admin management
   ============================================================ */

const SubAdmin = require('../../models/SubAdmin.model');
const asyncHandler = require('../../utils/asyncHandler');
const AppError = require('../../utils/AppError');

// ── Helper: sanitize permissions object ───────────────────────
const VALID_MODULES = [
  'manageClients', 'manageAgents',
  'manageInvestments', 'transactionDetails', 'investmentStatus', 'portfolio',
  'depositWithdrawal', 'perksRecognition', 'commissionSlabs', 'rewardsConfig',
  'emailNotifications', 'serviceRequests', 'newsMedia', 'faqManagement',
  'settings', 'subAdmins',
];

const sanitizePermissions = (rawPerms = {}) => {
  const result = {};
  for (const mod of VALID_MODULES) {
    if (rawPerms[mod]) {
      result[mod] = {
        view:   Boolean(rawPerms[mod].view),
        create: Boolean(rawPerms[mod].create),
        edit:   Boolean(rawPerms[mod].edit),
        delete: Boolean(rawPerms[mod].delete),
      };
    }
  }
  return result;
};

// ── Format sub admin for response ───────────────────────
const formatSubAdmin = (doc) => ({
  id: doc._id,
  name: doc.name,
  email: doc.email,
  isActive: doc.isActive,
  permissions: doc.permissions || {},
  createdBy: doc.createdBy,
  createdAt: doc.createdAt,
  updatedAt: doc.updatedAt,
});

/* ────────────────────────────────────────────────────────────────
   POST /api/super-admin/sub-admins
   Create a new sub admin
──────────────────────────────────────────────────────────────── */
exports.createSubAdmin = asyncHandler(async (req, res, next) => {
  const { name, email, password, permissions } = req.body;

  if (!name || !email || !password) {
    return next(new AppError('Name, email, and password are required.', 400));
  }

  const existing = await SubAdmin.findOne({ email: email.toLowerCase().trim() });
  if (existing) {
    return next(new AppError('A sub admin with this email already exists.', 409));
  }

  const subAdmin = await SubAdmin.create({
    name: name.trim(),
    email: email.toLowerCase().trim(),
    password,
    permissions: sanitizePermissions(permissions),
    createdBy: req.user._id,
  });

  res.status(201).json({
    success: true,
    message: 'Sub admin created successfully.',
    data: formatSubAdmin(subAdmin),
  });
});

/* ────────────────────────────────────────────────────────────────
   GET /api/super-admin/sub-admins
   List all sub admins (with optional ?status=active|inactive filter)
──────────────────────────────────────────────────────────────── */
exports.getAllSubAdmins = asyncHandler(async (req, res) => {
  const { status } = req.query;

  const filter = {};
  if (status === 'active')   filter.isActive = true;
  if (status === 'inactive') filter.isActive = false;

  const subAdmins = await SubAdmin.find(filter)
    .sort({ createdAt: -1 })
    .lean();

  res.status(200).json({
    success: true,
    count: subAdmins.length,
    data: subAdmins.map(formatSubAdmin),
  });
});

/* ────────────────────────────────────────────────────────────────
   GET /api/super-admin/sub-admins/:id
   Get single sub admin by ID
──────────────────────────────────────────────────────────────── */
exports.getSubAdminById = asyncHandler(async (req, res, next) => {
  const subAdmin = await SubAdmin.findById(req.params.id).lean();
  if (!subAdmin) {
    return next(new AppError('Sub admin not found.', 404));
  }

  res.status(200).json({
    success: true,
    data: formatSubAdmin(subAdmin),
  });
});

/* ────────────────────────────────────────────────────────────────
   PATCH /api/super-admin/sub-admins/:id
   Update sub admin details and/or permissions
──────────────────────────────────────────────────────────────── */
exports.updateSubAdmin = asyncHandler(async (req, res, next) => {
  const { name, email, password, permissions } = req.body;

  const subAdmin = await SubAdmin.findById(req.params.id).select('+password');
  if (!subAdmin) {
    return next(new AppError('Sub admin not found.', 404));
  }

  if (name)  subAdmin.name  = name.trim();
  if (email) {
    const emailLower = email.toLowerCase().trim();
    if (emailLower !== subAdmin.email) {
      const dup = await SubAdmin.findOne({ email: emailLower, _id: { $ne: subAdmin._id } });
      if (dup) return next(new AppError('This email is already in use by another sub admin.', 409));
      subAdmin.email = emailLower;
    }
  }
  if (password && password.trim().length >= 8) {
    subAdmin.password = password.trim();
  }
  if (permissions) {
    subAdmin.permissions = sanitizePermissions(permissions);
  }

  await subAdmin.save();

  res.status(200).json({
    success: true,
    message: 'Sub admin updated successfully.',
    data: formatSubAdmin(subAdmin),
  });
});

/* ────────────────────────────────────────────────────────────────
   PATCH /api/super-admin/sub-admins/:id/status
   Toggle active / inactive status
──────────────────────────────────────────────────────────────── */
exports.toggleSubAdminStatus = asyncHandler(async (req, res, next) => {
  const subAdmin = await SubAdmin.findById(req.params.id);
  if (!subAdmin) {
    return next(new AppError('Sub admin not found.', 404));
  }

  subAdmin.isActive = !subAdmin.isActive;
  await subAdmin.save();

  res.status(200).json({
    success: true,
    message: `Sub admin ${subAdmin.isActive ? 'activated' : 'deactivated'} successfully.`,
    data: formatSubAdmin(subAdmin),
  });
});

/* ────────────────────────────────────────────────────────────────
   DELETE /api/super-admin/sub-admins/:id
   Permanently delete a sub admin
──────────────────────────────────────────────────────────────── */
exports.deleteSubAdmin = asyncHandler(async (req, res, next) => {
  const subAdmin = await SubAdmin.findByIdAndDelete(req.params.id);
  if (!subAdmin) {
    return next(new AppError('Sub admin not found.', 404));
  }

  res.status(200).json({
    success: true,
    message: 'Sub admin deleted successfully.',
  });
});
