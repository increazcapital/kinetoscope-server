/* ============================================================
   Model: SubAdmin.model.js
   Description: Sub Admin accounts with granular module permissions
   ============================================================ */

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

// ── Permission sub-schema (per module) ───────────────────────
const permissionSchema = new mongoose.Schema(
  {
    view:   { type: Boolean, default: false },
    create: { type: Boolean, default: false },
    edit:   { type: Boolean, default: false },
    delete: { type: Boolean, default: false },
  },
  { _id: false }
);

// ── SubAdmin Schema ───────────────────────
const subAdminSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Please provide a name'],
      trim: true,
      maxlength: [80, 'Name cannot exceed 80 characters'],
    },
    email: {
      type: String,
      required: [true, 'Please provide an email address'],
      unique: true,
      lowercase: true,
      trim: true,
      match: [
        /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/,
        'Please provide a valid email address',
      ],
    },
    password: {
      type: String,
      required: [true, 'Please provide a password'],
      minlength: [8, 'Password must be at least 8 characters long'],
      select: false,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },

    // ── Module Permissions ───────────────────────
    permissions: {
      // People & Accounts
      manageClients:    { type: permissionSchema, default: () => ({}) },
      manageAgents:     { type: permissionSchema, default: () => ({}) },

      // Portals
      clientPortal:     { type: permissionSchema, default: () => ({}) },
      agentPortal:      { type: permissionSchema, default: () => ({}) },

      // Investment Management
      manageInvestments:  { type: permissionSchema, default: () => ({}) },
      transactionDetails: { type: permissionSchema, default: () => ({}) },
      investmentStatus:   { type: permissionSchema, default: () => ({}) },
      portfolio:          { type: permissionSchema, default: () => ({}) },

      // Finance & Rewards
      depositWithdrawal: { type: permissionSchema, default: () => ({}) },
      perksRecognition:  { type: permissionSchema, default: () => ({}) },
      commissionSlabs:   { type: permissionSchema, default: () => ({}) },
      rewardsConfig:     { type: permissionSchema, default: () => ({}) },

      // Operations
      emailNotifications: { type: permissionSchema, default: () => ({}) },
      serviceRequests:    { type: permissionSchema, default: () => ({}) },
      newsMedia:          { type: permissionSchema, default: () => ({}) },
      faqManagement:      { type: permissionSchema, default: () => ({}) },

      // Admin
      settings:   { type: permissionSchema, default: () => ({}) },
      subAdmins:  { type: permissionSchema, default: () => ({}) },
    },
  },
  {
    timestamps: true,
  }
);

// ── Password hashing (Mongoose 9 async hook — no `next` parameter) ───────────────────────
subAdminSchema.pre('save', async function () {
  if (!this.isModified('password')) return;
  const salt = await bcrypt.genSalt(12);
  this.password = await bcrypt.hash(this.password, salt);
});

// ── Instance method: compare password ───────────────────────
subAdminSchema.methods.comparePassword = async function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

// ── Indexes ───────────────────────
subAdminSchema.index({ email: 1 });
subAdminSchema.index({ isActive: 1 });
subAdminSchema.index({ createdAt: -1 });

const SubAdmin = mongoose.model('SubAdmin', subAdminSchema);
module.exports = SubAdmin;
