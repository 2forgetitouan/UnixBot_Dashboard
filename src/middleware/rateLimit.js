const rateLimit = require('express-rate-limit');

function createRateLimiter({ windowMs, max }) {
  return rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      ok: false,
      error: 'Trop de requêtes',
    },
  });
}

module.exports = {
  createRateLimiter,
};
