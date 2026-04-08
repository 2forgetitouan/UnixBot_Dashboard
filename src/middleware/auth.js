function requireAuth(req, res, next) {
  if (!req.session?.user) {
    return res.status(401).json({ ok: false, error: 'Unauthorized' });
  }
  return next();
}

function requireAuthPage(req, res, next) {
  if (!req.session?.user) {
    return res.redirect('/login');
  }
  return next();
}

module.exports = {
  requireAuth,
  requireAuthPage,
};
