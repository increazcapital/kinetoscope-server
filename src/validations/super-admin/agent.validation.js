const { body, validationResult } = require('express-validator');
const AppError = require('../../utils/AppError');

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
 * Validation rules for onboarding a new agent (multipart/form-data text fields)
 */
const createAgentValidationRules = [
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
  body('residencyStatus')
    .trim()
    .notEmpty().withMessage('Residency / Citizenship is required')
    .isIn(['National (Domestic)', 'International']).withMessage('Residency must be either National (Domestic) or International'),
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
  body('oneTimeCommission')
    .optional({ checkFalsy: true })
    .isNumeric().withMessage('One-time commission must be a number')
    .isFloat({ min: 0 }).withMessage('One-time commission must be a non-negative number'),
  body('monthlySlab')
    .optional({ checkFalsy: true })
    .trim(),
  body('specialCommission')
    .optional({ checkFalsy: true })
    .isNumeric().withMessage('Special commission must be a number')
    .isFloat({ min: 0 }).withMessage('Special commission must be a non-negative number'),
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
    .custom((val) => {
      if (val && !/^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/.test(val)) {
        throw new Error('Please provide a valid nominee email address');
      }
      return true;
    }),
  body('nomineeResidency')
    .optional({ checkFalsy: true })
    .trim()
    .isIn(['National (Domestic)', 'International', '']).withMessage('Nominee Residency must be either National (Domestic) or International'),
  body('password')
    .optional({ checkFalsy: true })
    .isLength({ min: 8 }).withMessage('Password must be at least 8 characters long'),
  body('portalPassword')
    .optional({ checkFalsy: true })
    .isLength({ min: 8 }).withMessage('Password must be at least 8 characters long'),
  validate,
];

/**
 * Validation rules for admin-initiated agent updates
 */
const updateAgentRulesByAdmin = [
  body('fullName')
    .optional({ checkFalsy: true })
    .trim()
    .notEmpty().withMessage('Full name cannot be empty'),
  body('email')
    .optional({ checkFalsy: true })
    .trim()
    .isEmail().withMessage('Please provide a valid email address')
    .normalizeEmail(),
  body('phone')
    .optional({ checkFalsy: true })
    .trim()
    .notEmpty().withMessage('Phone number cannot be empty'),
  body('residencyStatus')
    .optional({ checkFalsy: true })
    .isIn(['National (Domestic)', 'International']).withMessage('Residency must be either National (Domestic) or International'),
  body('panNumber')
    .optional({ checkFalsy: true })
    .trim()
    .custom(async (value, { req }) => {
      let resStatus = req.body.residencyStatus;
      if (!resStatus) {
        const AgentProfile = require('../../models/AgentProfile.model');
        const profile = await AgentProfile.findOne({ userId: req.params.id });
        resStatus = profile ? profile.residencyStatus : 'National (Domestic)';
      }
      if (resStatus === 'International') {
        return true;
      }
      if (!/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/.test(value.toUpperCase())) {
        throw new Error('Please provide a valid 10-character alphanumeric PAN number');
      }
      return true;
    }),
  body('aadhaarNumber')
    .optional({ checkFalsy: true })
    .trim()
    .custom(async (value, { req }) => {
      let resStatus = req.body.residencyStatus;
      if (!resStatus) {
        const AgentProfile = require('../../models/AgentProfile.model');
        const profile = await AgentProfile.findOne({ userId: req.params.id });
        resStatus = profile ? profile.residencyStatus : 'National (Domestic)';
      }
      if (resStatus === 'International') {
        return true;
      }
      if (!/^\d{12}$/.test(value)) {
        throw new Error('Please provide a valid 12-digit Aadhaar number');
      }
      return true;
    }),

  body('bankName')
    .optional({ checkFalsy: true })
    .trim()
    .notEmpty().withMessage('Bank name cannot be empty'),
  body('accountNumber')
    .optional({ checkFalsy: true })
    .trim()
    .notEmpty().withMessage('Account number cannot be empty')
    .custom((value, { req }) => {
      if (value && value !== req.body.confirmAccountNumber) {
        throw new Error('Account number and confirm account number must match');
      }
      return true;
    }),
  body('confirmAccountNumber')
    .optional({ checkFalsy: true })
    .trim()
    .custom((value, { req }) => {
      if (req.body.accountNumber && value !== req.body.accountNumber) {
        throw new Error('Account number and confirm account number must match');
      }
      return true;
    }),
  body('ifscCode')
    .optional({ checkFalsy: true })
    .trim()
    .custom(async (value, { req }) => {
      let resStatus = req.body.residencyStatus;
      if (!resStatus) {
        const AgentProfile = require('../../models/AgentProfile.model');
        const profile = await AgentProfile.findOne({ userId: req.params.id });
        resStatus = profile ? profile.residencyStatus : 'National (Domestic)';
      }
      if (resStatus === 'International') {
        return true;
      }
      if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(value.toUpperCase())) {
        throw new Error('Please provide a valid IFSC code');
      }
      return true;
    }),
  body('oneTimeCommission')
    .optional({ nullable: true })
    .isNumeric().withMessage('One-time commission must be a number')
    .isFloat({ min: 0 }).withMessage('One-time commission must be a non-negative number'),
  body('monthlySlab')
    .optional({ nullable: true })
    .trim(),
  body('specialCommission')
    .optional({ nullable: true })
    .isNumeric().withMessage('Special commission must be a number')
    .isFloat({ min: 0 }).withMessage('Special commission must be a non-negative number'),
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
    .custom((val) => {
      if (val && !/^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/.test(val)) {
        throw new Error('Please provide a valid nominee email address');
      }
      return true;
    }),
  body('nomineeResidency')
    .optional({ checkFalsy: true })
    .trim()
    .isIn(['National (Domestic)', 'International', '']).withMessage('Nominee Residency must be either National (Domestic) or International'),
  body('status')
    .optional()
    .custom(val => {
      const lower = val.toLowerCase();
      if (!['active', 'inactive', 'suspended', 'blocked', 'hold'].includes(lower)) {
        throw new Error('Status must be active, inactive, suspended, blocked, or hold');
      }
      return true;
    }),
  body('password')
    .optional({ checkFalsy: true })
    .isLength({ min: 8 }).withMessage('Password must be at least 8 characters long'),
  body('portalPassword')
    .optional({ checkFalsy: true })
    .isLength({ min: 8 }).withMessage('Password must be at least 8 characters long'),
  validate,
];

module.exports = {
  createAgentValidationRules,
  updateAgentRulesByAdmin,
};
