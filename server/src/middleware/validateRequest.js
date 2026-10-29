// Runs a validator on req.body. A validator returns { field: 'message' } for each problem.
const { HttpError } = require('./errorHandler');

const validateRequest = (validator, options) => (req, res, next) => {
  const errors = validator(req.body || {}, options);
  const fields = Object.keys(errors);
  if (fields.length) {
    return next(new HttpError(400, errors[fields[0]], errors));
  }
  return next();
};

module.exports = validateRequest;
