const jwt = require('jsonwebtoken');
const User = require('../models/User.model');
const SubAdmin = require('../models/SubAdmin.model');
const AppError = require('../utils/AppError');
const asyncHandler = require('../utils/asyncHandler');
const { ROLES } = require('../constants/roles');

/**
 * Protect middleware — verifies JWT token and attaches the authenticated user to req.user.
 * Supports both regular users (User model) and sub-admins (SubAdmin model).
 */
const protect = asyncHandler(async (req, res, next) => {
  let token;

  // 1) Extract token from Authorization header or cookie
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1];
  } else if (req.cookies && req.cookies.jwt) {
    token = req.cookies.jwt;
  }

  if (!token) {
    return next(new AppError('You are not logged in. Please log in to get access.', 401));
  }

  // 2) Verify token validity and decode payload
  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET || 'kfpl_super_secure_jwt_secret_key_2026');
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return next(new AppError('Your session has expired. Please log in again.', 401));
    }
    return next(new AppError('Invalid authentication token. Please log in again.', 401));
  }

  // 3a) Try finding as a regular User first
  let currentUser = await User.findById(decoded.id);

  // 3b) Fallback: try finding as a Sub Admin
  if (!currentUser && decoded.role === ROLES.SUB_ADMIN) {
    const subAdmin = await SubAdmin.findById(decoded.id);
    if (subAdmin) {
      // Attach a synthetic role field so restrictTo() works
      subAdmin.role = ROLES.SUB_ADMIN;
      currentUser = subAdmin;
    }
  }

  if (!currentUser) {
    return next(new AppError('The user belonging to this token no longer exists.', 401));
  }

  // 4) Verify account is still active
  if (!currentUser.isActive) {
    return next(new AppError('Your account has been deactivated. Please contact support.', 403));
  }

  // 5) Attach authenticated user to request object
  req.user = currentUser;
  next();
});


/**
 * Restrict access to specific user roles.
 * Usage: restrictTo('super-admin', 'agent')
 * @param {...string} roles - Allowed roles
 */
const restrictTo = (...roles) => {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return next(new AppError('You do not have permission to perform this action.', 403));
    }
    next();
  };
};

/**
 * Fine-grained module & action permission check for Sub Admins.
 * Super Admin bypasses all checks.
 * Sub Admin must have the specified permission (e.g. perms[moduleKey][action] === true).
 */
const requirePermission = (moduleKey, action = 'view') => {
  return (req, res, next) => {
    if (!req.user) {
      return next(new AppError('You are not logged in. Please log in to get access.', 401));
    }
    // Super Admin has full access to everything
    if (req.user.role === ROLES.SUPER_ADMIN) {
      return next();
    }
    // Agents allowed on shared endpoints
    if (req.user.role === ROLES.AGENT) {
      return next();
    }
    // Sub Admin permission check
    if (req.user.role === ROLES.SUB_ADMIN) {
      const perms = req.user.permissions || {};
      const modPerm = perms[moduleKey] || {};

      // If action is view, also grant if create, edit, or delete is true
      if (action === 'view') {
        if (modPerm.view || modPerm.create || modPerm.edit || modPerm.delete) {
          return next();
        }
      } else if (modPerm[action] === true) {
        return next();
      }

      return next(new AppError('You do not have permission to perform this action.', 403));
    }

    return next(new AppError('You do not have permission to perform this action.', 403));
  };
};

module.exports = {
  protect,
  restrictTo,
  requirePermission,
};
