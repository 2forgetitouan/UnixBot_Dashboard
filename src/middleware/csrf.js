const crypto = require('crypto');
const { safeEqual } = require('../lib/security');

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

function ensureCsrfToken(req, res, next) {
  if (!req.session) return next();
  if (!req.session.csrfToken) {
    req.session.csrfToken = crypto.randomBytes(32).toString('hex');
  }
  res.locals.csrfToken = req.session.csrfToken;
  return next();
}

function csrfProtection(req, res, next) {
  if (SAFE_METHODS.has(req.method)) return next();

  const token =
    req.get('x-csrf-token') ||
    req.body?._csrf ||
    req.query?._csrf ||
    '';
  const expected = req.session?.csrfToken || '';

  if (!token || !expected || !safeEqual(token, expected)) {
    return res.status(403).json({ ok: false, error: 'Invalid CSRF token' });
  }

  return next();
}

module.exports = {
  ensureCsrfToken,
  csrfProtection,
};
