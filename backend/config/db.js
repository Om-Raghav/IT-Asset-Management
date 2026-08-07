const mongoose = require('mongoose');

let memoryServer = null;

/**
 * Connects to MongoDB.
 *
 * If USE_MEMORY_DB=true is set in .env, an in-memory MongoDB instance is
 * spun up automatically via mongodb-memory-server - no local MongoDB
 * install or cloud account needed. Great for demos/learning, but data
 * is wiped every time the server restarts, so re-run `npm run seed`
 * after each restart in this mode.
 *
 * Otherwise it connects to MONGO_URI as normal (local MongoDB or Atlas).
 */
const connectDB = async () => {
  try {
    let uri = process.env.MONGO_URI;

    if (process.env.USE_MEMORY_DB === 'true') {
      const { MongoMemoryServer } = require('mongodb-memory-server');
      memoryServer = await MongoMemoryServer.create();
      uri = memoryServer.getUri();
      console.log('Using in-memory MongoDB (USE_MEMORY_DB=true) - data resets on restart.');
    }

    const conn = await mongoose.connect(uri);
    console.log(`MongoDB connected: ${conn.connection.host}`);
  } catch (err) {
    console.error(`MongoDB connection error: ${err.message}`);
    process.exit(1);
  }
};

const closeDB = async () => {
  await mongoose.connection.close();
  if (memoryServer) await memoryServer.stop();
};

module.exports = connectDB;
module.exports.closeDB = closeDB;
