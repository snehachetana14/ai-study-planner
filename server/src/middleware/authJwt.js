// Checks the Bearer token and loads the logged-in user into req.user.
const jwt = require('../utils/jwt');
const { HttpError, asyncHandler } = require('./errorHandler');

const authJwt = asyncHandler(async (req, res, next) => {
  const header = req.headers.authorization || '';
  const token = header.replace(/^Bearer\s+/i, '');
  const payload = jwt.verify(token, req.ctx.config.jwtSecret);
  if (!payload || !payload.sub) throw new HttpError(401, 'Please log in again');

  const user = await req.ctx.store.users.findOne({ id: payload.sub });
  if (!user) throw new HttpError(401, 'Account not found, please log in again');

  req.user = user;
  req.userId = user.id;
  next();
});

module.exports = authJwt;
