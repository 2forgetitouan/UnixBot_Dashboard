const express = require('express');
const config = require('../../config/config');
const { requireAuthPage } = require('../middleware/auth');

const router = express.Router();

router.use((req, res, next) => {
  res.locals.user = req.session?.user || null;
  res.locals.discordOAuthEnabled = Boolean(
    config.discord.clientId && config.discord.clientSecret && config.discord.redirectUri
  );
  next();
});

router.get('/', (req, res) => {
  res.render('home', {
    title: 'UnixBot Dashboard',
    page: 'home',
    subtitle: 'Administration centralisée des serveurs UnixBot',
  });
});

router.get('/login', (req, res) => {
  if (req.session?.user) {
    return res.redirect('/dashboard');
  }

  return res.render('login', {
    title: 'Connexion',
    page: 'login',
    errorCode: req.query?.error || null,
  });
});

router.get('/dashboard', requireAuthPage, (req, res) => {
  res.render('dashboard', {
    title: 'Dashboard',
    page: 'dashboard',
  });
});

module.exports = router;
