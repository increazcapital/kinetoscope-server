const mongoose = require('mongoose');

const payoutSchema = new mongoose.Schema(
  {
    recipientType: {
      type: String,
      required: [true, 'Recipient type is required'],
      enum: ['Client Return (ROI)', 'Agent Commission', 'CLIENT', 'AGENT']
    },
    recipientId: {
      type: String,
      required: [true, 'Recipient ID is required']
    },
    commissionType: {
      type: String,
      default: ''
    },
    clientId: {
      type: String,
      default: ''
    },
    amount: {
      type: Number,
      required: [true, 'Amount is required'],
      min: [0, 'Amount must be non-negative']
    },
    payoutDate: {
      type: String, // YYYY-MM-DD
      required: [true, 'Payout date is required']
    },
    paymentMode: {
      type: String,
      default: ''
    },
    transactionRefId: {
      type: String,
      unique: true,
      sparse: true,
      default: ''
    },
    status: {
      type: String,
      enum: ['pending', 'paid'],
      default: 'pending'
    },
    roiPercentage: {
      type: Number,
      default: null
    },
    roiRate: {
      type: String,
      default: ''
    },
    paidAt: {
      type: Date
    }
  },
  {
    timestamps: true
  }
);

payoutSchema.index({ recipientId: 1 });
payoutSchema.index({ status: 1 });

payoutSchema.post('save', async function (doc) {
  try {
    const isClientRoi = doc.recipientType === 'Client Return (ROI)' || doc.recipientType === 'CLIENT';
    if (!isClientRoi) return;

    const User = mongoose.model('User');
    const RoiPayout = mongoose.model('RoiPayout');

    // Find client user by clientCode or _id
    let clientUser = await User.findOne({ clientCode: doc.recipientId, role: 'client' });
    if (!clientUser && mongoose.Types.ObjectId.isValid(doc.recipientId)) {
      clientUser = await User.findOne({ _id: doc.recipientId, role: 'client' });
    }

    if (!clientUser) {
      console.log(`[Payout Sync Warning] Client user not found for recipientId: ${doc.recipientId}`);
      return;
    }

    // Parse month from payoutDate (format YYYY-MM-DD)
    const date = new Date(doc.payoutDate);
    if (isNaN(date.getTime())) {
      console.log(`[Payout Sync Warning] Invalid payoutDate: ${doc.payoutDate}`);
      return;
    }

    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const payoutMonth = `${months[date.getMonth()]} ${date.getFullYear()}`;

    const targetStatus = doc.status === 'paid' ? 'PAID' : 'PENDING';

    // Find if a RoiPayout already exists for this exact Payout doc._id or transactionRefId, or create a new one
    let roiPayout = await RoiPayout.findOne({
      $or: [
        { _id: doc._id },
        ...(doc.transactionRefId ? [{ transactionRefId: doc.transactionRefId, clientId: clientUser._id }] : [])
      ]
    });

    if (roiPayout) {
      roiPayout.status = targetStatus;
      roiPayout.amount = doc.amount;
      roiPayout.payoutMonth = payoutMonth;
      if (doc.roiPercentage) roiPayout.roiPercentage = doc.roiPercentage;
      if (doc.roiRate) roiPayout.roiRate = doc.roiRate;
      roiPayout.processedDate = targetStatus === 'PAID' ? (doc.paidAt || new Date()) : undefined;
      await roiPayout.save();
      console.log(`[Payout Sync] Automatically updated RoiPayout for ${clientUser.name} (${payoutMonth})`);
    } else {
      await RoiPayout.create({
        _id: doc._id,
        clientId: clientUser._id,
        payoutMonth,
        amount: doc.amount,
        roiPercentage: doc.roiPercentage,
        roiRate: doc.roiRate || (doc.roiPercentage ? `${doc.roiPercentage}%` : ''),
        status: targetStatus,
        transactionRefId: doc.transactionRefId || '',
        paymentMode: doc.paymentMode || '',
        processedDate: targetStatus === 'PAID' ? (doc.paidAt || new Date()) : undefined
      });
      console.log(`[Payout Sync] Automatically created distinct RoiPayout for ${clientUser.name} (${payoutMonth})`);
    }
  } catch (err) {
    console.error('[Payout Sync Error]:', err.message);
  }
});

const Payout = mongoose.model('Payout', payoutSchema);

module.exports = Payout;
