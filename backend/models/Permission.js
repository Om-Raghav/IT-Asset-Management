const mongoose = require('mongoose');

const permissionSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true, trim: true }, // e.g. asset:create
  module: { type: String, required: true, trim: true },
  description: { type: String, trim: true }
}, { timestamps: true });

module.exports = mongoose.model('Permission', permissionSchema);
