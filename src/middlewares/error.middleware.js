const sendErrorDev = (err, res) => {
  res.status(err.statusCode).json({
    status: err.status,
    message: err.message,
  });
};

const sendErrorProd = (err, res) => {
  // Always log the full error for server-side debugging
  console.error('PROD ERROR 💥:', err.message, err.stack);

  // Operational, trusted error: send message to client
  if (err.isOperational) {
    res.status(err.statusCode).json({
      status: err.status,
      message: err.message,
    });
  } else {
    // Programming or other unknown error — still send the message for debugging
    res.status(err.statusCode || 500).json({
      status: 'error',
      message: err.message || 'Something went very wrong!',
    });
  }
};

module.exports = (err, req, res, next) => {
  err.statusCode = err.statusCode || 500;
  err.status = err.status || 'error';

  let error = { ...err };
  error.message = err.message;
  error.statusCode = err.statusCode;
  error.status = err.status;
  error.isOperational = err.isOperational;

  const AppError = require('../utils/AppError');

  // Handle Mongoose cast errors
  if (err.name === 'CastError') {
    const message = `Invalid ${err.path}: ${err.value}.`;
    error = new AppError(message, 400);
  }

  // Handle Mongoose duplicate key errors
  if (err.code === 11000) {
    const value = err.errmsg ? err.errmsg.match(/(["'])(\\?.)*?\1/)[0] : '';
    const message = `Duplicate field value: ${value}. Please use another value!`;
    error = new AppError(message, 400);
  }

  // Handle Mongoose validation errors
  if (err.name === 'ValidationError') {
    const errors = Object.values(err.errors).map(el => el.message);
    const message = `Invalid input data. ${errors.join('. ')}`;
    error = new AppError(message, 400);
  }

  // Handle JWT web token errors
  if (err.name === 'JsonWebTokenError') {
    error = new AppError('Invalid token. Please log in again!', 401);
  }

  // Handle JWT token expiration errors
  if (err.name === 'TokenExpiredError') {
    error = new AppError('Your token has expired! Please log in again.', 401);
  }

  if (process.env.NODE_ENV === 'development') {
    // Only log full stack trace for actual server errors (500+), skip noisy 401/404 auth errors
    if (error.statusCode >= 500) {
      console.error('DEV ERROR 💥:', err);
    }
    sendErrorDev(error, res);
  } else {
    sendErrorProd(error, res);
  }
};
