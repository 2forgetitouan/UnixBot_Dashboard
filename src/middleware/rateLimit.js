function createRateLimiter({ windowMs, max }) {
  const windows = new Map();

  return function rateLimiter(req, res, next) {
    const now = Date.now();
    const key = `${req.ip}:${req.path}`;
    const current = windows.get(key);

    if (!current || now - current.start > windowMs) {
      windows.set(key, { count: 1, start: now });
      return next();
    }

    if (current.count >= max) {
      return res.status(429).json({
        ok: false,
        error: 'Too many requests',
      });
    }

    current.count += 1;
    return next();
  };
}

module.exports = {
  createRateLimiter,
};
