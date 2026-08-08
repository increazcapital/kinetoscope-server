const mongoose = require('mongoose');
const { encrypt, decrypt } = require('../utils/crypto');

/**
 * Client Profile Schema containing client-specific details, KYC, Bank, Nominee info, and document URLs.
 */
const clientProfileSchema = new mongoose.Schema(
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
    dob: {
      type: Date,
      required: [true, 'Date of birth is required'],
    },
    address: {
      type: String,
      required: [true, 'Address is required'],
      trim: true,
    },
    emergencyContact: {
      type: String,
      default: '',
      trim: true,
    },
    riskProfile: {
      type: String,
      required: [true, 'Risk profile is required'],
      enum: {
        values: ['conservative', 'moderate', 'aggressive', 'Conservative', 'Moderate', 'Aggressive'],
        message: 'Risk profile must be conservative, moderate, aggressive, Conservative, Moderate, or Aggressive',
      },
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
    monthlyRoi: {
      type: Number,
      required: [true, 'Monthly ROI % is required'],
      min: [0, 'Monthly ROI % must be a non-negative number'],
      default: 1.2,
    },
    // KYC Details
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
          if (this.residencyStatus === 'International') {
            return decryptedVal && decryptedVal.trim().length > 0;
          }
          return /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/.test(decryptedVal);
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
          if (this.residencyStatus === 'International') {
            return decryptedVal && decryptedVal.trim().length > 0;
          }
          return /^\d{12}$/.test(decryptedVal);
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
      validate: {
        validator: function(v) {
          if (this.residencyStatus === 'International') {
            return v && v.trim().length > 0;
          }
          return /^[A-Z]{4}0[A-Z0-9]{6}$/.test(v);
        },
        message: 'Please provide a valid IFSC code',
      },
    },
    // Nominee Details
    nomineeName: {
      type: String,
      required: [true, 'Nominee name is required'],
      trim: true,
    },
    nomineeRelation: {
      type: String,
      required: [true, 'Nominee relation is required'],
      trim: true,
    },
    nomineePhone: {
      type: String,
      required: [true, 'Nominee phone number is required'],
      trim: true,
    },
    nomineeEmail: {
      type: String,
      required: [true, 'Nominee email address is required'],
      trim: true,
      lowercase: true,
      match: [
        /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/,
        'Please provide a valid nominee email address',
      ],
    },
    nomineeResidency: {
      type: String,
      required: [true, 'Nominee Residency / Citizenship is required'],
      enum: {
        values: ['National (Domestic)', 'International'],
        message: 'Nominee Residency must be either National (Domestic) or International',
      },
      default: 'National (Domestic)',
    },
    profilePic: {
      type: String,
      default: '',
    },
    // Document URLs (Stored on Cloudinary — populated asynchronously after initial save)
    panDocument: {
      type: String,
      default: '',
    },
    aadhaarDocument: {
      type: String,
      default: '',
    },
    bankProofDocument: {
      type: String,
      default: '',
    },
    agreementDocument: {
      type: String,
      default: '',
    },
    nomineeProofDocument: {
      type: String,
      default: '',
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
    // Per-document verification status (Super Admin verifies each individually)
    panDocumentVerified: {
      type: Boolean,
      default: false,
    },
    aadhaarDocumentVerified: {
      type: Boolean,
      default: false,
    },
    bankProofDocumentVerified: {
      type: Boolean,
      default: false,
    },
    agreementDocumentVerified: {
      type: Boolean,
      default: false,
    },
    nomineeProofDocumentVerified: {
      type: Boolean,
      default: false,
    },
    status: {
      type: String,
      enum: {
        values: ['active', 'inactive', 'suspended', 'blocked', 'hold'],
        message: 'Status must be active, inactive, suspended, blocked, or hold',
      },
      default: 'active',
    },
    kycStatus: {
      type: String,
      enum: {
        values: ['PENDING', 'VERIFIED', 'FAILED', 'NOT_STARTED'],
        message: 'KYC status must be: PENDING, VERIFIED, FAILED, or NOT_STARTED',
      },
      default: 'PENDING',
    },
    tier: {
      type: String,
      enum: {
        values: ['DIAMOND', 'PLATINUM', 'GOLD', 'SILVER'],
        message: 'Tier must be either: DIAMOND, PLATINUM, GOLD, or SILVER',
      },
      default: 'SILVER',
    },
    contractStartDate: {
      type: Date,
    },
    contractEndDate: {
      type: Date,
    },
    extendContractDate: {
      type: String,
      default: '',
    },
    agentCommission: {
      type: String,
      default: '0.5% monthly',
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

// Optimize query performance for client listing and profile searches
// userId: 1 index is already automatically created as unique: true in the schema
clientProfileSchema.index({ status: 1 });
clientProfileSchema.index({ tier: 1 });
clientProfileSchema.index({ residencyStatus: 1 });
clientProfileSchema.index({ status: 1, tier: 1, residencyStatus: 1 });

const ClientProfile = mongoose.model('ClientProfile', clientProfileSchema);

module.exports = ClientProfile;
