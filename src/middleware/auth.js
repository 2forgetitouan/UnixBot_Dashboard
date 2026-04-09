const { UserRepository } = require('../repositories/userRepository');

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

function requireGuildAdmin(req, res, next) {
  if (!req.session?.user) {
    return res.status(401).json({ ok: false, error: 'Unauthorized' });
  }

  if (req.session.user.role === 'local_admin') {
    return next();
  }

  const { guildId } = req.params;
  if (!guildId) {
    return res.status(400).json({ ok: false, error: 'Missing guildId' });
  }

  const userRepository = new UserRepository();
  const hasAccess = userRepository.hasGuildAdminAccess(req.session.user.id, guildId);

  if (!hasAccess) {
    return res.status(403).json({ ok: false, error: 'Forbidden: missing guild admin permissions' });
  }

  return next();
}

module.exports = {
  requireAuth,
  requireAuthPage,
  requireGuildAdmin,
};
