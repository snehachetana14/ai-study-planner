// Scheduled Netlify Function (every 15 minutes, see netlify.toml): the reminder worker.
// Reminders are also created whenever the app checks the bell, so this only fills the gaps.
const config = require('../src/config');
const { connectStore } = require('../src/db');
const { runChecks } = require('../src/services/NotificationService');

let storePromise = null;

exports.handler = async () => {
  if (!config.mongoUri) return { statusCode: 200, body: 'MONGODB_URI not set; skipped' };
  try {
    storePromise = storePromise || connectStore(config);
    const created = await runChecks(await storePromise);
    return { statusCode: 200, body: `Created ${created} reminder(s)` };
  } catch (err) {
    storePromise = null;
    console.error('[netlify reminders]', err);
    return { statusCode: 500, body: err.message };
  }
};
