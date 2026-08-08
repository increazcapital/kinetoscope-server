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

const port = process.env.PORT || 5000;
const server = http.createServer(app);

// Handle server startup / port errors
server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`❌ Port ${port} is already in use (EADDRINUSE). Exiting process so nodemon can restart cleanly...`);
    process.exit(1);
  } else {
    console.error('Server error:', err);
    process.exit(1);
  }
});

// Initialize Socket.io (for future use)
socketService.init(server);

const startServer = async () => {
  try {
    // Await database connection before listening and running background jobs
    await connectDB();

    server.listen(port, '0.0.0.0', () => {
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

    // Handle unhandled rejections — log but DON'T crash server
    process.on('unhandledRejection', (err) => {
      console.error('UNHANDLED REJECTION:', err?.message || err);
    });
  } catch (err) {
    console.error('Failed to connect to database on startup:', err.message);
    process.exit(1);
  }
};

startServer();

module.exports = server;
