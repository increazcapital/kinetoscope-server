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

// Initialize Socket.io
socketService.init(server);

// Handle server startup / port errors cleanly
server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`[Port ${port} in use] Waiting 1s for socket release...`);
    process.exit(0);
  } else {
    console.error('Server error:', err);
    process.exit(1);
  }
});

// Handle nodemon restart signal gracefully
process.once('SIGUSR2', () => {
  server.close(() => {
    process.kill(process.pid, 'SIGUSR2');
  });
});

process.on('SIGINT', () => {
  server.close(() => {
    process.exit(0);
  });
});

const startServer = async () => {
  try {
    await connectDB();

    if (!server.listening) {
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
    }

    process.on('unhandledRejection', (err) => {
      console.error('UNHANDLED REJECTION:', err?.message || err);
    });
  } catch (err) {
    console.error('Failed to connect to database on startup:', err.message);
    process.exit(1);
  }
};

if (require.main === module) {
  startServer();
}

module.exports = server;
