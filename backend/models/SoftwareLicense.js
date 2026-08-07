const mongoose = require('mongoose');

const softwareLicenseSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  vendor: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor' },
  licenseKey: { type: String, trim: true },
  licenseType: { type: String, enum: ['Perpetual', 'Subscription', 'OpenSource'], default: 'Subscription' },
  purchaseDate: { type: Date },
  expiryDate: { type: Date },
  seatsTotal: { type: Number, default: 1 },
  seatsUsed: { type: Number, default: 0 },
  cost: { type: Number, default: 0 },
  assignedTo: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Employee' }],
  assignedAssets: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Asset' }],
  status: { type: String, enum: ['Active', 'Expired', 'Cancelled'], default: 'Active' }
}, { timestamps: true });

module.exports = mongoose.model('SoftwareLicense', softwareLicenseSchema);
