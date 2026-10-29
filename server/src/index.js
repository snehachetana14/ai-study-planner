// Starts the API server, the database connection and the reminder worker.
const config = require('./config');
const { connectStore } = require('./db');
const { createAIClient } = require('./ai/AIClient');
const { createApp } = require('./app');
const { startWorker } = require('./services/NotificationService');
const logger = require('./utils/logger');

async function main() {
  const store = await connectStore(config);
  const aiClient = createAIClient(config);
  logger.info(aiClient
    ? `[ai] Using ${aiClient.provider} (${aiClient.model})`
    : '[ai] No AI key set: using the rule-based planner');

  const app = createApp({ store, config, aiClient });
  const server = app.listen(config.port, () => {
    logger.info(`[server] API running on http://localhost:${config.port}`);
  });
  const stopWorker = startWorker(store);

  const shutdown = async () => {
    stopWorker();
    server.close();
    await store.close();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  logger.error('[server] Failed to start:', err.message);
  process.exit(1);
});
