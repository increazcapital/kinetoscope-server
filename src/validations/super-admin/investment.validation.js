const { body, validationResult } = require('express-validator');
const AppError = require('../../utils/AppError');

/**
 * Common middleware to compile express-validator errors and forward to global error handler.
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
 * Validation rules for assigning a new investment.
 * Investment records are immutable — no update or delete rules required.
 */
const createInvestmentValidationRules = [
  body('clientId')
    .notEmpty().withMessage('Client ID is required')
    .custom((value) => {
      const isMongoId = /^[0-9a-fA-F]{24}$/.test(value);
      const isClientCode = /^(?:KFPL|YIQ|YLDIQ)(?:-CL)?-\d+$/i.test(value) || /^\d+$/.test(value);
      if (!isMongoId && !isClientCode) {
        throw new Error('Client ID must be a valid MongoDB ObjectId or Client Code (e.g. YIQ-CL-1001)');
      }
      return true;
    }),



  body('segment')
    .optional()
    .trim()
    .isString().withMessage('Segment must be a string'),

  body('projectId')
    .optional()
    .isMongoId().withMessage('Project ID must be a valid MongoDB ObjectId'),

  body('segmentAllocation')
    .optional()
    .isArray().withMessage('Segment allocation must be an array'),

  body('investmentAmount')
    .notEmpty().withMessage('Investment amount is required')
    .isNumeric().withMessage('Investment amount must be a number')
    .isFloat({ min: 0.01 }).withMessage('Investment amount must be a positive number (minimum 0.01)'),

  body('roiPercentage')
    .notEmpty().withMessage('ROI percentage is required')
    .isNumeric().withMessage('ROI percentage must be a number')
    .isFloat({ min: 0 }).withMessage('ROI percentage must be a non-negative number'),

  body('riskPercentage')
    .notEmpty().withMessage('Risk percentage is required')
    .isNumeric().withMessage('Risk percentage must be a number')
    .isFloat({ min: 0 }).withMessage('Risk percentage must be a non-negative number'),

  body('investmentDate')
    .optional()
    .isISO8601().withMessage('Investment date must be a valid ISO 8601 date'),

  body('riskLevel')
    .optional()
    .isIn(['Low', 'Medium', 'High', 'Medium High']).withMessage('Risk level must be Low, Medium, High, or Medium High'),

  body('durationMonths')
    .optional()
    .isNumeric().withMessage('Duration must be a number'),

  body('contractEndDate')
    .optional()
    .isISO8601().withMessage('Contract end date must be a valid ISO 8601 date'),

  body('status')
    .optional()
    .isIn(['active', 'completed', 'cancelled']).withMessage('Status must be active, completed, or cancelled'),

  body('remarks')
    .optional()
    .isString().withMessage('Remarks must be a string'),

  validate,
];

/**
 * Validation rules for extending an investment contract.
 */
const extendContractValidationRules = [
  body('newEndDate')
    .notEmpty().withMessage('New end date is required')
    .isISO8601().withMessage('New end date must be a valid date'),

  validate,
];

module.exports = {
  createInvestmentValidationRules,
  extendContractValidationRules,
};
