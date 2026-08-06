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
 * Validation rules for creating a Dividend Pool.
 */
const createPoolValidationRules = [
  body('poolAmount')
    .notEmpty().withMessage('Pool amount is required')
    .isNumeric().withMessage('Pool amount must be a number')
    .isFloat({ min: 0 }).withMessage('Pool amount cannot be negative'),

  body('name')
    .optional()
    .trim()
    .isString().withMessage('Name must be a string'),

  body('remarks')
    .optional()
    .trim()
    .isString().withMessage('Remarks must be a string'),

  body('projectId')
    .optional()
    .isMongoId().withMessage('Project ID must be a valid MongoDB ObjectId'),

  validate,
];

/**
 * Validation rules for creating a Dividend Allotment.
 */
const createAllotmentValidationRules = [
  body('clientId')
    .notEmpty().withMessage('Client ID is required')
    .isMongoId().withMessage('Client ID must be a valid MongoDB ObjectId'),

  body('projectId')
    .notEmpty().withMessage('Project ID is required')
    .isMongoId().withMessage('Project ID must be a valid MongoDB ObjectId'),

  body('allottedAmount')
    .notEmpty().withMessage('Allotted amount is required')
    .isNumeric().withMessage('Allotted amount must be a number')
    .isFloat({ min: 0.01 }).withMessage('Allotted amount must be greater than 0'),

  body('remarks')
    .optional()
    .trim()
    .isString().withMessage('Remarks must be a string'),

  validate,
];

module.exports = {
  createPoolValidationRules,
  createAllotmentValidationRules,
};
