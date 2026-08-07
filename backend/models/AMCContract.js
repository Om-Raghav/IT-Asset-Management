const mongoose = require('mongoose');

const amcContractSchema = new mongoose.Schema({
  contractNumber: { type: String, required: true, unique: true, trim: true },
  asset: { type: mongoose.Schema.Types.ObjectId, ref: 'Asset' },
  vendor: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor', required: true },
  startDate: { type: Date, required: true },
  endDate: { type: Date, required: true },
  cost: { type: Number, default: 0 },
  coverageDetails: { type: String, trim: true },
  status: { type: String, enum: ['Active', 'Expired', 'Cancelled'], default: 'Active' }
}, { timestamps: true });

module.exports = mongoose.model('AMCContract', amcContractSchema);
