const express = require('express');
const helmet = require('helmet');
const path = require('path');
const session = require('express-session');
const config = require('../../config/config');
const { createRateLimiter } = require('../middleware/rateLimit');
const SQLiteStore = require('../session/sqliteStore');
const authRoutes = require('../routes/api/auth');
const guildRoutes = require('../routes/api/guilds');
const webRoutes = require('../routes/web');

function createApp(db) {
  const app = express();
  app.set('trust proxy', config.security.trustProxy);

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'"],
          imgSrc: ["'self'", 'data:'],
          connectSrc: ["'self'"],
          objectSrc: ["'none'"],
          frameAncestors: ["'none'"],
          baseUri: ["'self'"],
        },
      },
      referrerPolicy: { policy: 'no-referrer' },
    })
  );

  app.use(express.json({ limit: '250kb' }));
  app.use(express.urlencoded({ extended: false, limit: '100kb' }));

  app.use(
    session({
      name: config.session.cookieName,
      secret: config.session.secret,
      resave: false,
      saveUninitialized: false,
      store: new SQLiteStore({ db, ttlMs: config.session.ttlMs }),
      cookie: {
        httpOnly: true,
        sameSite: 'lax',
        secure: config.env === 'production',
        maxAge: config.session.ttlMs,
      },
    })
  );

  app.use(
    '/api',
    createRateLimiter({
      windowMs: config.security.rateLimitWindowMs,
      max: config.security.rateLimitMax,
    })
  );

  app.use('/api/auth/login', createRateLimiter({
    windowMs: config.security.rateLimitWindowMs,
    max: config.security.loginRateLimitMax,
  }));

  app.set('view engine', 'ejs');
  app.set('views', path.resolve(__dirname, '../web/views'));

  app.use('/assets', express.static(path.resolve(__dirname, '../web/public'), {
    immutable: true,
    maxAge: '1h',
  }));

  app.get('/health', (_req, res) => {
    res.json({ ok: true, service: 'unixbot-dashboard', timestamp: Date.now() });
  });

  app.use('/api/auth', authRoutes);
  app.use('/api/guilds', guildRoutes);
  app.use(webRoutes);

  app.use((req, res) => {
    if (req.path.startsWith('/api')) {
      return res.status(404).json({ ok: false, error: 'Not found' });
    }
    return res.status(404).render('404', { title: 'Page non trouvée', page: '404' });
  });

  app.use((err, req, res, _next) => {
    if (req.path.startsWith('/api')) {
      return res.status(500).json({ ok: false, error: 'Internal server error' });
    }
    return res.status(500).render('500', { title: 'Erreur serveur', page: '500' });
  });

  return app;
}

module.exports = {
  createApp,
};
