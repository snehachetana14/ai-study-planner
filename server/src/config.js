// Loads settings from environment variables (and server/.env if present).
const fs = require('node:fs');
const path = require('node:path');

function loadEnvFile(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    if (!line.trim() || line.trim().startsWith('#')) continue;
    const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (!m) continue;
    let value = m[2];
    if (/^(['"]).*\1$/.test(value)) value = value.slice(1, -1);
    if (process.env[m[1]] === undefined) process.env[m[1]] = value;
  }
}

loadEnvFile(path.join(__dirname, '..', '.env'));

const env = process.env;

const config = {
  port: Number(env.PORT) || 5000,
  nodeEnv: env.NODE_ENV || 'development',
  jwtSecret: env.JWT_SECRET || 'dev-only-secret-change-me',
  jwtTtlSeconds: 7 * 24 * 60 * 60,
  mongoUri: env.MONGODB_URI || '',
  dataFile: env.DATA_FILE || path.join(__dirname, '..', 'data', 'dev-db.json'),
  geminiKey: env.GEMINI_API_KEY || '',
  geminiModel: env.GEMINI_MODEL || 'gemini-2.5-flash',
  openaiKey: env.OPENAI_API_KEY || '',
  openaiModel: env.OPENAI_MODEL || 'gpt-4o-mini',
  // Netlify functions stop after 10 s, so leave time for the rule-based fallback there.
  aiTimeoutMs: Number(env.AI_TIMEOUT_MS) || (env.AWS_LAMBDA_FUNCTION_NAME || env.NETLIFY ? 6000 : 8000),
  clientOrigin: env.CLIENT_ORIGIN || '',
  clientDist: path.join(__dirname, '..', '..', 'client', 'dist'),
};

if (config.nodeEnv === 'production' && config.jwtSecret === 'dev-only-secret-change-me') {
  console.warn('[config] WARNING: JWT_SECRET is not set. Set it before deploying.');
}

module.exports = config;
