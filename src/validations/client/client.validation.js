const { body, validationResult } = require('express-validator');
const AppError = require('../../utils/AppError');
const mongoose = require('mongoose');

/**
 * Common validation parser middleware to accumulate express-validator errors.
 */
const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (errors.isEmpty()) {
    return next();
  }
  const message = errors.array().map(err => err.msg).join(', ');
  return next(new AppError(message, 400));
};

/**
 * Validation rules for onboarding a new client (multipart/form-data text fields)
 */
const createClientValidationRules = [
  body('fullName')
    .trim()
    .notEmpty().withMessage('Full name is required')
    .isLength({ max: 50 }).withMessage('Full name cannot exceed 50 characters'),
  body('phone')
    .trim()
    .notEmpty().withMessage('Phone number is required'),
  body('email')
    .trim()
    .notEmpty().withMessage('Email address is required')
    .isEmail().withMessage('Please provide a valid email address')
    .normalizeEmail(),
  body('dob')
    .notEmpty().withMessage('Date of birth is required')
    .isISO8601().withMessage('Date of birth must be a valid date (YYYY-MM-DD)'),
  body('address')
    .trim()
    .notEmpty().withMessage('Address is required'),
  body('emergencyContact')
    .optional({ checkFalsy: true })
    .trim(),
  body('riskProfile')
    .trim()
    .notEmpty().withMessage('Risk profile is required')
    .isIn(['conservative', 'moderate', 'aggressive', 'Conservative', 'Moderate', 'Aggressive']).withMessage('Risk profile must be Conservative, Moderate, or Aggressive'),
  body('residencyStatus')
    .trim()
    .notEmpty().withMessage('Residency / Citizenship is required')
    .isIn(['National (Domestic)', 'International']).withMessage('Residency must be either National (Domestic) or International'),
  body('monthlyRoi')
    .notEmpty().withMessage('Monthly ROI % is required')
    .isNumeric().withMessage('Monthly ROI % must be a number')
    .isFloat({ min: 0 }).withMessage('Monthly ROI % must be a non-negative number'),
  body('panNumber')
    .trim()
    .notEmpty().withMessage('PAN / Tax ID number is required')
    .custom((value, { req }) => {
      if (req.body.residencyStatus === 'International') {
        return true;
      }
      if (!/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/.test(value.toUpperCase())) {
        throw new Error('Please provide a valid 10-character alphanumeric PAN number');
      }
      return true;
    }),
  body('aadhaarNumber')
    .trim()
    .notEmpty().withMessage('Aadhaar / Passport number is required')
    .custom((value, { req }) => {
      if (req.body.residencyStatus === 'International') {
        return true;
      }
      if (!/^\d{12}$/.test(value)) {
        throw new Error('Please provide a valid 12-digit Aadhaar number');
      }
      return true;
    }),
  body('bankName')
    .trim()
    .notEmpty().withMessage('Bank name is required'),
  body('accountNumber')
    .trim()
    .notEmpty().withMessage('Account number is required'),
  body('confirmAccountNumber')
    .trim()
    .notEmpty().withMessage('Confirm account number is required')
    .custom((value, { req }) => {
      if (value !== req.body.accountNumber) {
        throw new Error('Account number and confirm account number must match');
      }
      return true;
    }),
  body('ifscCode')
    .trim()
    .notEmpty().withMessage('IFSC / SWIFT code is required')
    .custom((value, { req }) => {
      if (req.body.residencyStatus === 'International') {
        return true;
      }
      if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(value.toUpperCase())) {
        throw new Error('Please provide a valid 11-character alphanumeric IFSC code');
      }
      return true;
    }),
  body('nomineeName')
    .optional({ checkFalsy: true })
    .trim(),
  body('nomineeRelation')
    .optional({ checkFalsy: true })
    .trim(),
  body('nomineePhone')
    .optional({ checkFalsy: true })
    .trim(),
  body('nomineeEmail')
    .optional({ checkFalsy: true })
    .trim()
    .isEmail().withMessage('Please provide a valid nominee email address')
    .normalizeEmail(),
  body('nomineeResidency')
    .optional({ checkFalsy: true })
    .trim()
    .isIn(['National (Domestic)', 'International']).withMessage('Nominee Residency must be either National (Domestic) or International'),
  body('assignedAgent')
    .optional({ checkFalsy: true })
    .custom(value => {
      if (value && value !== 'Direct Client (No Agent)' && value !== 'null' && value !== 'undefined' && !mongoose.Types.ObjectId.isValid(value)) {
        throw new Error('Assigned Agent must be a valid MongoDB ID');
      }
      return true;
    }),
  body('tier')
    .optional({ checkFalsy: true })
    .isIn(['DIAMOND', 'PLATINUM', 'GOLD', 'SILVER']).withMessage('Tier must be either: DIAMOND, PLATINUM, GOLD, or SILVER'),
  body('contractStartDate')
    .optional({ checkFalsy: true })
    .isISO8601().withMessage('Contract Start Date must be a valid date'),
  body('contractEndDate')
    .optional({ checkFalsy: true })
    .isISO8601().withMessage('Contract End Date must be a valid date'),
  body('agentCommission')
    .optional({ checkFalsy: true })
    .trim(),
  body('kycStatus')
    .optional({ checkFalsy: true })
    .isIn(['PENDING', 'VERIFIED', 'FAILED', 'NOT_STARTED']).withMessage('KYC status must be: PENDING, VERIFIED, FAILED, or NOT_STARTED'),
  body('password')
    .optional({ checkFalsy: true })
    .isLength({ min: 8 }).withMessage('Password must be at least 8 characters long'),
  body('portalPassword')
    .optional({ checkFalsy: true })
    .isLength({ min: 8 }).withMessage('Password must be at least 8 characters long'),
  validate,
];

/**
 * Validation rules for client-initiated profile updates (only certain fields editable)
 */
const updateClientProfileRules = [
  body('phone')
    .optional()
    .trim()
    .notEmpty().withMessage('Phone number cannot be empty'),
  body('address')
    .optional()
    .trim()
    .notEmpty().withMessage('Address cannot be empty'),
  body('emergencyContact')
    .optional()
    .trim(),
  body('nomineeName')
    .optional()
    .trim()
    .notEmpty().withMessage('Nominee name cannot be empty'),
  body('nomineeRelation')
    .optional()
    .trim()
    .notEmpty().withMessage('Nominee relation cannot be empty'),
  body('nomineePhone')
    .optional()
    .trim()
    .notEmpty().withMessage('Nominee phone number cannot be empty'),
  body('nomineeEmail')
    .optional()
    .trim()
    .isEmail().withMessage('Please provide a valid nominee email address')
    .normalizeEmail(),
  body('nomineeResidency')
    .optional()
    .isIn(['National (Domestic)', 'International']).withMessage('Nominee Residency must be either National (Domestic) or International'),
  validate,
];

/**
 * Validation rules for admin-initiated client updates
 */
const updateClientRulesByAdmin = [
  body('fullName')
    .optional()
    .trim()
    .notEmpty().withMessage('Full name cannot be empty'),
  body('email')
    .optional()
    .trim()
    .isEmail().withMessage('Please provide a valid email address')
    .normalizeEmail(),
  body('phone')
    .optional()
    .trim()
    .notEmpty().withMessage('Phone number cannot be empty'),
  body('dob')
    .optional()
    .isISO8601().withMessage('Date of birth must be a valid date'),
  body('address')
    .optional()
    .trim()
    .notEmpty().withMessage('Address cannot be empty'),
  body('emergencyContact')
    .optional()
    .trim(),
  body('riskProfile')
    .optional()
    .isIn(['conservative', 'moderate', 'aggressive', 'Conservative', 'Moderate', 'Aggressive']).withMessage('Risk profile must be Conservative, Moderate, or Aggressive'),
  body('residencyStatus')
    .optional()
    .isIn(['National (Domestic)', 'International']).withMessage('Residency must be either National (Domestic) or International'),
  body('monthlyRoi')
    .optional()
    .isNumeric().withMessage('Monthly ROI % must be a number')
    .isFloat({ min: 0 }).withMessage('Monthly ROI % must be a non-negative number'),
  body('status')
    .optional()
    .custom(val => {
      const lower = val.toLowerCase();
      if (!['active', 'inactive', 'suspended', 'blocked', 'hold'].includes(lower)) {
        throw new Error('Status must be active, inactive, suspended, blocked, or hold');
      }
      return true;
    }),
  body('assignedAgent')
    .optional({ nullable: true, checkFalsy: true })
    .custom(value => {
      if (value && value !== 'null' && value !== 'undefined' && value !== 'Direct Client (No Agent)' && !mongoose.Types.ObjectId.isValid(value)) {
        throw new Error('Assigned Agent must be a valid MongoDB ID');
      }
      return true;
    }),
  body('tier')
    .optional({ checkFalsy: true })
    .isIn(['DIAMOND', 'PLATINUM', 'GOLD', 'SILVER']).withMessage('Tier must be either: DIAMOND, PLATINUM, GOLD, or SILVER'),
  body('contractStartDate')
    .optional({ checkFalsy: true })
    .isISO8601().withMessage('Contract Start Date must be a valid date'),
  body('contractEndDate')
    .optional({ checkFalsy: true })
    .isISO8601().withMessage('Contract End Date must be a valid date'),
  body('extendContractDate')
    .optional({ checkFalsy: true })
    .isISO8601().withMessage('Extend Contract Date must be a valid date'),
  body('agentCommission')
    .optional({ checkFalsy: true })
    .trim(),
  body('kycStatus')
    .optional({ checkFalsy: true })
    .isIn(['PENDING', 'VERIFIED', 'FAILED', 'NOT_STARTED']).withMessage('KYC status must be: PENDING, VERIFIED, FAILED, or NOT_STARTED'),
  body('bankName')
    .optional()
    .trim()
    .notEmpty().withMessage('Bank name cannot be empty'),
  body('accountNumber')
    .optional()
    .trim()
    .notEmpty().withMessage('Account number cannot be empty')
    .custom((value, { req }) => {
      if (value && value !== req.body.confirmAccountNumber) {
        throw new Error('Account number and confirm account number must match');
      }
      return true;
    }),
  body('confirmAccountNumber')
    .optional()
    .trim()
    .custom((value, { req }) => {
      if (req.body.accountNumber && value !== req.body.accountNumber) {
        throw new Error('Account number and confirm account number must match');
      }
      return true;
    }),
  body('ifscCode')
    .optional()
    .trim()
    .custom((value, { req }) => {
      if (req.body.residencyStatus === 'International') {
        return true;
      }
      if (req.body.residencyStatus === 'National (Domestic)' && !/^[A-Z]{4}0[A-Z0-9]{6}$/.test(value.toUpperCase())) {
        throw new Error('Please provide a valid IFSC code');
      }
      return true;
    }),
  body('nomineeName')
    .optional()
    .trim()
    .notEmpty().withMessage('Nominee name cannot be empty'),
  body('nomineeRelation')
    .optional()
    .trim()
    .notEmpty().withMessage('Nominee relation cannot be empty'),
  body('nomineePhone')
    .optional()
    .trim()
    .notEmpty().withMessage('Nominee phone number cannot be empty'),
  body('nomineeEmail')
    .optional()
    .trim()
    .isEmail().withMessage('Please provide a valid nominee email address')
    .normalizeEmail(),
  body('nomineeResidency')
    .optional()
    .isIn(['National (Domestic)', 'International']).withMessage('Nominee Residency must be either National (Domestic) or International'),
  body('panNumber')
    .optional()
    .trim()
    .custom((value, { req }) => {
      if (req.body.residencyStatus === 'International') {
        return true;
      }
      if (req.body.residencyStatus === 'National (Domestic)' && !/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/.test(value.toUpperCase())) {
        throw new Error('Please provide a valid 10-character alphanumeric PAN number');
      }
      return true;
    }),
  body('aadhaarNumber')
    .optional()
    .trim()
    .custom((value, { req }) => {
      if (req.body.residencyStatus === 'International') {
        return true;
      }
      if (req.body.residencyStatus === 'National (Domestic)' && !/^\d{12}$/.test(value)) {
        throw new Error('Please provide a valid 12-digit Aadhaar number');
      }
      return true;
    }),
  validate,
];

module.exports = {
  createClientValidationRules,
  updateClientProfileRules,
  updateClientRulesByAdmin,
};
