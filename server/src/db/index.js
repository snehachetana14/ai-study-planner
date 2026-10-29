// Picks the data store: MongoDB when MONGODB_URI is set, otherwise a local JSON file.
const logger = require('../utils/logger');

async function connectStore(config) {
  if (config.mongoUri) {
    const { createMongoStore } = require('./mongoStore');
    const store = await createMongoStore(config.mongoUri);
    logger.info('[db] Connected to MongoDB');
    return store;
  }
  const { createMemoryStore } = require('./memoryStore');
  logger.warn(`[db] MONGODB_URI not set. Using local file store: ${config.dataFile}`);
  return createMemoryStore({ file: config.dataFile });
}

module.exports = { connectStore };
