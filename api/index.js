require('dotenv').config();
const connectDB = require('../src/config/db');
const app = require('../src/app');

// Ensure MongoDB is connected before handling Vercel serverless requests
app.use(async (req, res, next) => {
  try {
    await connectDB();
    next();
  } catch (err) {
    console.error('Vercel DB Connection Error:', err);
    next(err);
  }
});

// Export the Express app as the Vercel serverless function handler
module.exports = app;
