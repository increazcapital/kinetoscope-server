require('dotenv').config();
const http = require('http');
const app = require('./app');
const connectDB = require('./config/db');
const socketService = require('./services/socket.service');

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
  console.error('UNCAUGHT EXCEPTION! Shutting down...');
  console.error(err.name, err.message, err.stack);
  process.exit(1);
});

// Connect Database
connectDB();

const port = process.env.PORT || 5000;
const server = http.createServer(app);

// Initialize Socket.io (for future use)
socketService.init(server);

// Start server
const activeServer = server.listen(port, () => {
  console.log(`KFPL server running on port ${port}...`);
  try {
    const { startScheduledEmailCheck } = require('./controllers/super-admin/notification.controller');
    startScheduledEmailCheck();
    const { runInvestmentBackfill } = require('./controllers/super-admin/transaction.controller');
    runInvestmentBackfill();
  } catch (err) {
    console.error('Failed to start scheduled services:', err.message);
  }
});
module.exports = server;

// Handle unhandled rejections
process.on('unhandledRejection', (err) => {
  console.error('UNHANDLED REJECTION! Shutting down gracefully...');
  console.error(err.name, err.message, err.stack);
  activeServer.close(() => {
    process.exit(1);
  });
});
