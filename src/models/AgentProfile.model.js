const mongoose = require('mongoose');
const { encrypt, decrypt } = require('../utils/crypto');

/**
 * Agent Profile Schema containing agent-specific details, documents, bank details, commissions, and nominee info.
 */
const agentProfileSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User reference is required'],
      unique: true,
    },
    // Personal Details
    fullName: {
      type: String,
      required: [true, 'Full name is required'],
      trim: true,
    },
    phone: {
      type: String,
      required: [true, 'Phone number is required'],
      trim: true,
    },
    address: {
      type: String,
      default: '',
      trim: true,
    },
    email: {
      type: String,
      required: [true, 'Email address is required'],
      unique: true,
      lowercase: true,
      trim: true,
      match: [
        /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/,
        'Please provide a valid email address',
      ],
    },
    residencyStatus: {
      type: String,
      required: [true, 'Residency / Citizenship is required'],
      enum: {
        values: ['National (Domestic)', 'International'],
        message: 'Residency must be either National (Domestic) or International',
      },
      default: 'National (Domestic)',
    },
    panNumber: {
      type: String,
      required: [true, 'PAN / Tax ID number is required'],
      trim: true,
      uppercase: true,
      set: encrypt,
      get: decrypt,
      validate: {
        validator: function(v) {
          const decryptedVal = decrypt(v);
          if (!decryptedVal) return false;
          const cleanPan = decryptedVal.replace(/\s/g, '').toUpperCase();
          if (this.residencyStatus === 'International') {
            return cleanPan.trim().length > 0;
          }
          return /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/.test(cleanPan);
        },
        message: 'Please provide a valid PAN number',
      },
    },
    aadhaarNumber: {
      type: String,
      required: [true, 'Aadhaar / Passport number is required'],
      trim: true,
      set: encrypt,
      get: decrypt,
      validate: {
        validator: function(v) {
          const decryptedVal = decrypt(v);
          if (!decryptedVal) return false;
          const cleanDigits = decryptedVal.replace(/\s/g, '');
          if (this.residencyStatus === 'International') {
            return cleanDigits.trim().length > 0;
          }
          return /^\d{12}$/.test(cleanDigits);
        },
        message: 'Please provide a valid 12-digit Aadhaar number',
      },
    },
    // Bank Details
    bankName: {
      type: String,
      required: [true, 'Bank name is required'],
      trim: true,
    },
    accountNumber: {
      type: String,
      required: [true, 'Account number is required'],
      trim: true,
      set: encrypt,
      get: decrypt,
    },
    ifscCode: {
      type: String,
      required: [true, 'IFSC / SWIFT code is required'],
      trim: true,
      uppercase: true,
      set: encrypt,
      get: decrypt,
      validate: {
        validator: function(v) {
          const decryptedVal = decrypt(v);
          if (!decryptedVal) return false;
          const cleanIfsc = decryptedVal.replace(/\s/g, '').toUpperCase();
          if (this.residencyStatus === 'International') {
            return cleanIfsc.trim().length > 0;
          }
          return /^[A-Z]{4}0[A-Z0-9]{6}$/.test(cleanIfsc);
        },
        message: 'Please provide a valid IFSC code',
      },
    },
    // Documents (Stored on Cloudinary — populated asynchronously after initial save)
    panDocument: {
      type: String,
      default: '',
    },
    idProofDocument: {
      type: String,
      default: '',
    },
    idProofBackDocument: {
      type: String,
      default: '',
    },
    bankProofDocument: {
      type: String,
      default: '',
    },
    nomineeProofDocument: {
      type: String,
      default: '',
    },
    agreementDocument: {
      type: String,
      default: '',
    },
    panDocumentVerified: {
      type: Boolean,
      default: false,
    },
    idProofDocumentVerified: {
      type: Boolean,
      default: false,
    },
    idProofBackDocumentVerified: {
      type: Boolean,
      default: false,
    },
    bankProofDocumentVerified: {
      type: Boolean,
      default: false,
    },
    nomineeProofDocumentVerified: {
      type: Boolean,
      default: false,
    },
    agreementDocumentVerified: {
      type: Boolean,
      default: false,
    },
    // Tracks whether background Cloudinary upload is complete
    documentStatus: {
      type: String,
      enum: {
        values: ['pending_upload', 'uploaded', 'upload_failed'],
        message: 'Document status must be pending_upload, uploaded, or upload_failed',
      },
      default: 'pending_upload',
    },
    // Commission Configuration
    oneTimeCommission: {
      type: Number,
      default: 0,
    },
    monthlySlab: {
      type: String,
      default: '',
    },
    specialCommission: {
      type: Number,
      default: 0,
    },
    profilePic: {
      type: String,
      default: '',
    },
    // Nominee Details (Optional for Agents)
    nomineeName: {
      type: String,
      default: '',
      trim: true,
    },
    nomineeRelation: {
      type: String,
      default: '',
      trim: true,
    },
    nomineePhone: {
      type: String,
      default: '',
      trim: true,
    },
    nomineeEmail: {
      type: String,
      default: '',
      trim: true,
      lowercase: true,
    },
    nomineeResidency: {
      type: String,
      enum: {
        values: ['National (Domestic)', 'International', ''],
        message: 'Nominee Residency must be either National (Domestic) or International',
      },
      default: 'National (Domestic)',
    },
    // Status & Portal Password
    // Per-document verification status (Super Admin verifies each individually)
    panDocumentVerified: {
      type: Boolean,
      default: false,
    },
    idProofDocumentVerified: {
      type: Boolean,
      default: false,
    },
    bankProofDocumentVerified: {
      type: Boolean,
      default: false,
    },
    nomineeProofDocumentVerified: {
      type: Boolean,
      default: false,
    },
    kycStatus: {
      type: String,
      enum: {
        values: ['PENDING', 'VERIFIED', 'FAILED', 'NOT_STARTED'],
        message: 'KYC status must be: PENDING, VERIFIED, FAILED, or NOT_STARTED',
      },
      default: 'PENDING',
    },
    status: {
      type: String,
      enum: {
        values: ['active', 'inactive', 'suspended', 'blocked', 'hold', 'pending'],
        message: 'Status must be active, inactive, suspended, blocked, hold, or pending',
      },
      default: 'active',
    },
    portalPassword: {
      type: String,
      default: '',
      set: encrypt,
      get: decrypt,
    },
  },
  {
    timestamps: true, // Automatically manages createdAt and updatedAt fields
    toJSON: { getters: true },
    toObject: { getters: true },
  }
);

// Optimize query performance for agent listing and profile searches
// userId: 1 index is already automatically created as unique: true in the schema
agentProfileSchema.index({ status: 1 });

const AgentProfile = mongoose.model('AgentProfile', agentProfileSchema);

module.exports = AgentProfile;
