const mongoose = require('mongoose');

const assetSchema = new mongoose.Schema({
  assetTag: { type: String, required: true, unique: true, trim: true },
  name: { type: String, required: true, trim: true },
  category: { type: mongoose.Schema.Types.ObjectId, ref: 'AssetCategory', required: true },
  vendor: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor' },
  serialNumber: { type: String, trim: true },
  model: { type: String, trim: true },
  brand: { type: String, trim: true },
  purchaseDate: { type: Date },
  purchaseCost: { type: Number, default: 0 },
  warrantyExpiry: { type: Date },
  location: { type: mongoose.Schema.Types.ObjectId, ref: 'Location' },
  status: {
    type: String,
    enum: ['Available', 'Assigned', 'In Repair', 'Retired', 'Scrapped'],
    default: 'Available'
  },
  condition: { type: String, enum: ['New', 'Good', 'Fair', 'Poor'], default: 'New' },
  specifications: { type: mongoose.Schema.Types.Mixed },
  notes: { type: String, trim: true }
}, { timestamps: true });

assetSchema.index({ name: 'text', assetTag: 'text', serialNumber: 'text', brand: 'text', model: 'text' });

module.exports = mongoose.model('Asset', assetSchema);
