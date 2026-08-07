/* ============================================================
   Middleware: auth.middleware.js
   Description: Authentication & authorization middlewares.
                Includes JWT protection, case-insensitive role restriction,
                and sub-admin granular permission checking.
   ============================================================ */

const jwt = require('jsonwebtoken');
const User = require('../models/User.model');
const AppError = require('../utils/AppError');
const asyncHandler = require('../utils/asyncHandler');
const { ROLES } = require('../constants/roles');

/**
 * Protect routes - Verify JWT token and attach user to request object
 */
const protect = asyncHandler(async (req, res, next) => {
  // 1) Get token from Authorization header or cookies
  let token;
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1];
  } else if (req.cookies && req.cookies.jwt) {
    token = req.cookies.jwt;
  }

  if (!token) {
    return next(new AppError('You are not logged in. Please log in to get access.', 401));
  }

  // 2) Verify token
  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET);
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return next(new AppError('Your session has expired. Please log in again.', 401));
    }
    return next(new AppError('Invalid authentication token. Please log in again.', 401));
  }

  // 3) Check if user or sub-admin still exists
  let currentUser = await User.findById(decoded.id);
  if (!currentUser) {
    const SubAdmin = require('../models/SubAdmin.model');
    currentUser = await SubAdmin.findById(decoded.id);
    if (currentUser && !currentUser.role) {
      currentUser.role = ROLES.SUB_ADMIN;
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
 * Restrict access to specific user roles (case-normalized).
 * Usage: restrictTo('super-admin', 'agent')
 * @param {...string} roles - Allowed roles
 */
const restrictTo = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return next(new AppError('You are not logged in. Please log in to get access.', 401));
    }

    const userRole = String(req.user.role || '').toLowerCase().trim();
    const allowedRoles = roles.map(r => String(r).toLowerCase().trim());

    if (!allowedRoles.includes(userRole)) {
      console.warn(`[Permission Denied] URL: ${req.originalUrl} | User: ${req.user._id} (${userRole}) | Allowed: ${allowedRoles.join(', ')}`);
      return next(new AppError('You do not have permission to perform this action.', 403));
    }
    next();
  };
};

/**
 * Fine-grained module & action permission check for Sub Admins.
 * Super Admin, Agent, and Client roles pass through safely.
 */
const requirePermission = (moduleKey, action = 'view') => {
  return (req, res, next) => {
    if (!req.user) {
      return next(new AppError('You are not logged in. Please log in to get access.', 401));
    }

    const userRole = String(req.user.role || '').toLowerCase().trim();

    // Super Admin, Agent, and Client roles bypass sub-admin permission checks
    if (
      userRole === ROLES.SUPER_ADMIN.toLowerCase() ||
      userRole === ROLES.AGENT.toLowerCase() ||
      userRole === ROLES.CLIENT.toLowerCase()
    ) {
      return next();
    }

    // Sub Admin permission check
    if (userRole === ROLES.SUB_ADMIN.toLowerCase()) {
      const perms = req.user.permissions || {};
      const keys = Array.isArray(moduleKey) ? moduleKey : [moduleKey];

      for (const k of keys) {
        const modPerm = perms[k] || {};
        if (action === 'view') {
          if (modPerm.view || modPerm.create || modPerm.edit || modPerm.delete) {
            return next();
          }
        } else if (modPerm[action] === true) {
          return next();
        }
      }

      console.warn(`[SubAdmin Permission Denied] URL: ${req.originalUrl} | SubAdmin: ${req.user._id} | Modules: ${keys.join(', ')} | Action: ${action}`);
      return next(new AppError('You do not have permission to perform this action.', 403));
    }

    next();
  };
};

module.exports = {
  protect,
  restrictTo,
  requirePermission,
};
