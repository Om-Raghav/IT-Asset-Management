const mongoose = require('mongoose');

const assetCategorySchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true, trim: true }, // Laptop, Desktop, Printer, Server, Monitor, Software
  description: { type: String, trim: true },
  depreciationRateYears: { type: Number, default: 3 }
}, { timestamps: true });

module.exports = mongoose.model('AssetCategory', assetCategorySchema);
