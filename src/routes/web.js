const express = require('express');
const { requireAuthPage } = require('../middleware/auth');

const router = express.Router();

router.use((req, res, next) => {
  res.locals.user = req.session?.user || null;
  next();
});

router.get('/', (req, res) => {
  res.render('home', { title: 'UnixBot Dashboard', page: 'home' });
});

router.get('/login', (req, res) => {
  if (req.session?.user) {
    return res.redirect('/dashboard');
  }
  return res.render('login', { title: 'Connexion', page: 'login' });
});

router.get('/dashboard', requireAuthPage, (req, res) => {
  res.render('dashboard', {
    title: 'Dashboard',
    page: 'dashboard',
  });
});

module.exports = router;
