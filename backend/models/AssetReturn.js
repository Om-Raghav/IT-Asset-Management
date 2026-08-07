const mongoose = require('mongoose');

const assetReturnSchema = new mongoose.Schema({
  assignment: { type: mongoose.Schema.Types.ObjectId, ref: 'AssetAssignment', required: true },
  asset: { type: mongoose.Schema.Types.ObjectId, ref: 'Asset', required: true },
  employee: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true },
  returnDate: { type: Date, default: Date.now },
  condition: { type: String, enum: ['New', 'Good', 'Fair', 'Poor', 'Damaged'], default: 'Good' },
  remarks: { type: String, trim: true },
  receivedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

module.exports = mongoose.model('AssetReturn', assetReturnSchema);
