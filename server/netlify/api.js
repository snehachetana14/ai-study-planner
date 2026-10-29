// Netlify Function that runs the whole Express API (routes under /api, see netlify.toml).
const serverless = require('serverless-http');
const config = require('../src/config');
const { connectStore } = require('../src/db');
const { createAIClient } = require('../src/ai/AIClient');
const { createApp } = require('../src/app');

const FUNCTION_PREFIX = '/.netlify/functions/api';

// The database connection and app are created once and reused while the function stays warm.
let ready = null;

async function build() {
  if (!config.mongoUri) {
    throw new Error('MONGODB_URI is not set. Add it in Netlify → Site configuration → Environment variables, then redeploy.');
  }
  const store = await connectStore(config);
  const app = createApp({ store, config: { ...config, clientDist: null }, aiClient: createAIClient(config) });
  return serverless(app, {
    // Netlify may pass the function path instead of /api/...; map it back so Express routes match.
    request(req) {
      if (req.url.startsWith(FUNCTION_PREFIX)) req.url = `/api${req.url.slice(FUNCTION_PREFIX.length)}`;
    },
  });
}

exports.handler = async (event, context) => {
  try {
    ready = ready || build();
    const handle = await ready;
    return await handle(event, context);
  } catch (err) {
    ready = null;
    console.error('[netlify api]', err);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: err.message }),
    };
  }
};
