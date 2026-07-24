const mongoose = require('mongoose');

/**
 * SystemSetting Schema
 * Stores global support desk contact configurations (email, phone, whatsapp) for Client and Agent portals.
 */
const systemSettingSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      required: true,
      unique: true,
      default: 'system_config',
    },
    // Client Support Details
    clientSupportEmail: {
      type: String,
      default: 'support@kfpl.com',
    },
    clientSupportPhone: {
      type: String,
      default: '+91 98765 43210',
    },
    clientSupportWhatsapp: {
      type: String,
      default: '919876543210',
    },
    // Agent Support Details
    agentSupportEmail: {
      type: String,
      default: 'support@kfpl.in',
    },
    agentSupportPhone: {
      type: String,
      default: '+91 99999 99999',
    },
    agentSupportWhatsapp: {
      type: String,
      default: '919999999999',
    },
    supportHours: {
      type: String,
      default: 'Mon - Sat, 10 AM to 6 PM IST',
    },
  },
  {
    timestamps: true,
  }
);

const SystemSetting = mongoose.model('SystemSetting', systemSettingSchema);

module.exports = SystemSetting;
