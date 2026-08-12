const mongoose = require('mongoose');

/**
 * UserNotificationStatus Schema
 * Stores user-level read and deleted notification IDs so notification states persist across logouts and sessions.
 */
const userNotificationStatusSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
      index: true,
    },
    readIds: {
      type: [String],
      default: [],
    },
    deletedIds: {
      type: [String],
      default: [],
    },
  },
  {
    timestamps: true,
  }
);

const UserNotificationStatus = mongoose.model('UserNotificationStatus', userNotificationStatusSchema);

module.exports = UserNotificationStatus;
