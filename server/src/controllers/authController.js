const jwt = require('../utils/jwt');
const { hashPassword, verifyPassword } = require('../utils/password');
const { HttpError } = require('../middleware/errorHandler');
const { DEFAULT_SETTINGS } = require('../services/settingsService');

const publicUser = (u) => ({ id: u.id, name: u.name, email: u.email, createdAt: u.createdAt });
const tokenFor = (user, config) => jwt.sign({ sub: user.id }, config.jwtSecret, config.jwtTtlSeconds);

async function signup(req, res) {
  const { store, config } = req.ctx;
  const email = String(req.body.email).trim().toLowerCase();
  if (await store.users.findOne({ email })) {
    throw new HttpError(409, 'An account with this email already exists', { email: 'Email already registered' });
  }
  let user;
  try {
    user = await store.users.insert({
      name: String(req.body.name).trim(),
      email,
      passwordHash: hashPassword(String(req.body.password)),
      settings: { ...DEFAULT_SETTINGS },
    });
  } catch (err) {
    if (err.code === 11000) throw new HttpError(409, 'An account with this email already exists');
    throw err;
  }
  res.status(201).json({ token: tokenFor(user, config), user: publicUser(user) });
}

async function login(req, res) {
  const { store, config } = req.ctx;
  const email = String(req.body.email).trim().toLowerCase();
  const user = await store.users.findOne({ email });
  if (!user || !verifyPassword(String(req.body.password), user.passwordHash)) {
    throw new HttpError(401, 'Wrong email or password');
  }
  res.json({ token: tokenFor(user, config), user: publicUser(user) });
}

async function me(req, res) {
  res.json({ user: publicUser(req.user) });
}

module.exports = { signup, login, me, publicUser };
