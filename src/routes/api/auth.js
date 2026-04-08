const express = require('express');
const config = require('../../../config/config');
const { hashPassword, safeEqual } = require('../../lib/security');

const router = express.Router();

router.get('/me', (req, res) => {
  if (!req.session?.user) {
    return res.status(401).json({ ok: false, error: 'Unauthorized' });
  }

  return res.json({
    ok: true,
    user: {
      username: req.session.user.username,
      role: req.session.user.role,
    },
  });
});

router.post('/login', (req, res) => {
  const username = String(req.body?.username || '').trim();
  const password = String(req.body?.password || '');

  if (!username || !password) {
    return res.status(400).json({ ok: false, error: 'Missing credentials' });
  }

  const expectedUsername = config.auth.adminUser;
  const expectedHash = hashPassword(config.auth.adminPassword);
  const incomingHash = hashPassword(password);

  const validUsername = safeEqual(username, expectedUsername);
  const validPassword = safeEqual(incomingHash, expectedHash);

  if (!validUsername || !validPassword) {
    return res.status(401).json({ ok: false, error: 'Invalid credentials' });
  }

  req.session.user = {
    username: expectedUsername,
    role: 'admin',
  };

  return res.json({ ok: true });
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie(config.session.cookieName);
    res.json({ ok: true });
  });
});

module.exports = router;
