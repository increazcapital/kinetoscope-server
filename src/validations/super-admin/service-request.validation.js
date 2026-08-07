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

const createRequestRules = [
  body('category')
    .trim()
    .notEmpty().withMessage('Request category is required')
    .isString().withMessage('Category must be a string'),

  body('subject')
    .trim()
    .notEmpty().withMessage('Request subject is required')
    .isLength({ max: 250 }).withMessage('Subject cannot exceed 250 characters'),

  body('description')
    .trim()
    .notEmpty().withMessage('Request description is required'),

  validate,
];

const updateRequestStatusRules = [
  body('status')
    .trim()
    .notEmpty().withMessage('Status is required')
    .custom((val) => {
      const allowed = ['OPEN', 'IN PROGRESS', 'RESOLVED', 'CLOSED'];
      if (!allowed.includes(val.toUpperCase())) {
        throw new Error('Invalid status selected');
      }
      return true;
    }),

  body('adminRemarks')
    .optional()
    .trim()
    .isString().withMessage('Remarks must be a string'),

  validate,
];

module.exports = {
  createRequestRules,
  updateRequestStatusRules,
};
