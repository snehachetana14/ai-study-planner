// Minimal HS256 JSON Web Token implementation using Node's crypto module.
const crypto = require('node:crypto');

const b64url = (value) => Buffer.from(value).toString('base64url');

function sign(payload, secret, ttlSeconds) {
  const now = Math.floor(Date.now() / 1000);
  const body = { iat: now, ...payload };
  if (ttlSeconds) body.exp = now + ttlSeconds;
  const head = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const data = b64url(JSON.stringify(body));
  const sig = crypto.createHmac('sha256', secret).update(`${head}.${data}`).digest('base64url');
  return `${head}.${data}.${sig}`;
}

function verify(token, secret) {
  const parts = String(token || '').split('.');
  if (parts.length !== 3) return null;
  const expected = crypto.createHmac('sha256', secret).update(`${parts[0]}.${parts[1]}`).digest();
  const given = Buffer.from(parts[2], 'base64url');
  if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) return null;
  try {
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    if (payload.exp && payload.exp * 1000 < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

module.exports = { sign, verify };
