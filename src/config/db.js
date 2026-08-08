require('dotenv').config();
const mongoose = require('mongoose');

// Use global cache for the database connection promise to handle Vercel serverless environments
let cachedConnection = global.mongooseConnection;

if (!cachedConnection) {
  cachedConnection = global.mongooseConnection = { conn: null, promise: null };
}

const connectDB = async () => {
  if (mongoose.connection.readyState === 1) {
    cachedConnection.conn = mongoose.connection;
    return cachedConnection.conn;
  }

  if (cachedConnection.conn) {
    return cachedConnection.conn;
  }

  if (!cachedConnection.promise) {
    const opts = {
      serverSelectionTimeoutMS: 15000,
      socketTimeoutMS: 45000,
    };

    const mongoUri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/kfpl';

    const syncExistingPayoutsToRoiPayouts = async () => {
      try {
        require('../models/Payout.model');
        require('../models/User.model');
        require('../models/RoiPayout.model');
        const Payout = mongoose.model('Payout');
        const User = mongoose.model('User');
        const RoiPayout = mongoose.model('RoiPayout');

        const payouts = await Payout.find({
          recipientType: { $in: ['Client Return (ROI)', 'CLIENT'] }
        });

        console.log(`[Database Migration] Syncing ${payouts.length} client payouts to RoiPayout...`);

        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

        for (const doc of payouts) {
          let clientUser = await User.findOne({ clientCode: doc.recipientId, role: 'client' });
          if (!clientUser && mongoose.Types.ObjectId.isValid(doc.recipientId)) {
            clientUser = await User.findOne({ _id: doc.recipientId, role: 'client' });
          }

          if (!clientUser) continue;

          const date = new Date(doc.payoutDate);
          if (isNaN(date.getTime())) continue;

          const payoutMonth = `${months[date.getMonth()]} ${date.getFullYear()}`;
          const targetStatus = doc.status === 'paid' ? 'PAID' : 'PENDING';

          await RoiPayout.findOneAndUpdate(
            { clientId: clientUser._id, payoutMonth },
            {
              $set: {
                amount: doc.amount,
                status: targetStatus,
                processedDate: targetStatus === 'PAID' ? (doc.paidAt || doc.createdAt) : undefined
              }
            },
            { upsert: true }
          );
        }
        console.log('[Database Migration] Sync completed successfully.');
      } catch (err) {
        console.error('[Database Migration Error]:', err.message);
      }
    };

    const connectWithRetry = async (retries = 2, delay = 1500) => {
      try {
        const mongooseInstance = await mongoose.connect(mongoUri, opts);
        console.log(`MongoDB Connected: ${mongooseInstance.connection.host}`);
        
        // Run migration in background
        setTimeout(() => {
          syncExistingPayoutsToRoiPayouts();
        }, 1000);

        return mongooseInstance;
      } catch (error) {
        if (retries > 0) {
          console.warn(`MongoDB Connection failed: ${error.message}. Retrying in ${delay / 1000}s... (${retries} retries left)`);
          await new Promise(resolve => setTimeout(resolve, delay));
          return connectWithRetry(retries - 1, delay);
        }
        throw error;
      }
    };
    
    cachedConnection.promise = connectWithRetry().catch((error) => {
      console.error(`Database connection error: ${error.message}`);
      cachedConnection.promise = null; // Clear cached promise on failure
      if (!process.env.VERCEL) {
        process.exit(1);
      }
      throw error;
    });
  }

  try {
    cachedConnection.conn = await cachedConnection.promise;
  } catch (e) {
    cachedConnection.promise = null;
    throw e;
  }

  return cachedConnection.conn;
};

module.exports = connectDB;
