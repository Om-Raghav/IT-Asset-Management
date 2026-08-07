const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  title: { type: String, required: true, trim: true },
  message: { type: String, required: true, trim: true },
  type: { type: String, enum: ['Info', 'Warning', 'Alert'], default: 'Info' },
  isRead: { type: Boolean, default: false },
  link: { type: String, trim: true }
}, { timestamps: true });

module.exports = mongoose.model('Notification', notificationSchema);
