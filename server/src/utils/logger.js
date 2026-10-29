// Tiny logger so log lines are consistent and can be silenced in tests.
const silent = process.env.NODE_ENV === 'test';

const stamp = () => new Date().toISOString();

module.exports = {
  info: (...args) => { if (!silent) console.log(`[${stamp()}]`, ...args); },
  warn: (...args) => { if (!silent) console.warn(`[${stamp()}] WARN`, ...args); },
  error: (...args) => console.error(`[${stamp()}] ERROR`, ...args),
};
