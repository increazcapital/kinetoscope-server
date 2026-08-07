const mongoose = require('mongoose');

/**
 * ServiceRequest Schema
 * Represents a support or query request submitted by an Agent or Client.
 */
const serviceRequestSchema = new mongoose.Schema(
  {
    requestId: {
      type: String,
      unique: true,
      sparse: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Request creator reference is required'],
    },
    category: {
      type: String,
      enum: {
        values: [
          'Profile Update',
          'Nominee Update',
          'Commission Query',
          'Client Query',
          'Reward Issue',
          'Withdrawal Issue',
          'Investment Query',
          'Risk Profile Change',
          'Contract Period Extended',
          'Payment Issue',
          'Document Request',
          'Project Investment Request',
          'Other',
        ],
        message: 'Invalid request category option',
      },
      required: [true, 'Request category is required'],
    },
    subject: {
      type: String,
      required: [true, 'Request subject is required'],
      trim: true,
    },
    description: {
      type: String,
      required: [true, 'Request description is required'],
      trim: true,
    },
    attachment: {
      type: String, // Cloudinary URL to file
      default: '',
    },
    status: {
      type: String,
      enum: {
        values: ['OPEN', 'IN PROGRESS', 'RESOLVED', 'CLOSED'],
        message: 'Invalid status option',
      },
      default: 'OPEN',
    },
    adminRemarks: {
      type: String,
      default: '',
      trim: true,
    },
    adminNote: {
      type: String,
      default: '',
      trim: true,
    },
    remarks: {
      type: String,
      default: '',
      trim: true,
    },
  },
  {
    timestamps: true,
  }
);

// Auto-generate requestId sequence (SR-101, SR-102, etc.)
serviceRequestSchema.pre('save', async function () {
  if (!this.isNew) return;
  if (this.requestId) return;

  const count = await mongoose.model('ServiceRequest').countDocuments({});
  const nextSeq = 101 + count;
  this.requestId = `SR-${String(nextSeq).padStart(3, '0')}`;
});

// Indexes for quick lookup
serviceRequestSchema.index({ createdBy: 1 });
serviceRequestSchema.index({ status: 1 });
serviceRequestSchema.index({ createdAt: -1 });

const ServiceRequest = mongoose.model('ServiceRequest', serviceRequestSchema);

module.exports = ServiceRequest;
