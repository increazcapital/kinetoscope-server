require('dotenv').config();
const app = require('../src/app');

// Export the Express app as the Vercel serverless function handler
module.exports = app;
