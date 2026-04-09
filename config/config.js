require('dotenv').config();

function parseIntEnv(name, fallback) {
  const value = Number.parseInt(process.env[name], 10);
  return Number.isFinite(value) ? value : fallback;
}

function requiredInProduction(value, field) {
  if (process.env.NODE_ENV === 'production' && !value) {
    throw new Error(`Missing required environment variable: ${field}`);
  }
  return value;
}

const sessionSecret = process.env.SESSION_SECRET || 'dev-only-session-secret-change-me';

module.exports = {
  env: process.env.NODE_ENV || 'development',
  port: parseIntEnv('PORT', 3000),
  baseUrl: process.env.BASE_URL || 'http://localhost:3000',
  session: {
    secret: requiredInProduction(sessionSecret, 'SESSION_SECRET'),
    cookieName: 'unixbot.dashboard.sid',
    ttlMs: parseIntEnv('SESSION_TTL_MS', 1000 * 60 * 60 * 8),
  },
  database: {
    path: process.env.DB_PATH || 'unixbot_dashboard.db',
  },
  auth: {
    adminUser: process.env.DASHBOARD_ADMIN_USER || 'admin',
    adminPassword: requiredInProduction(
      process.env.DASHBOARD_ADMIN_PASSWORD || 'change-me-in-production',
      'DASHBOARD_ADMIN_PASSWORD'
    ),
  },
  discord: {
    clientId: process.env.DISCORD_CLIENT_ID || '',
    clientSecret: process.env.DISCORD_CLIENT_SECRET || '',
    redirectUri: process.env.DISCORD_REDIRECT_URI || 'http://localhost:3000/api/auth/discord/callback',
    botToken: process.env.DISCORD_BOT_TOKEN || '',
    scope: process.env.DISCORD_OAUTH_SCOPE || 'identify guilds',
  },
  security: {
    trustProxy: parseIntEnv('TRUST_PROXY', 1),
    rateLimitWindowMs: parseIntEnv('RATE_LIMIT_WINDOW_MS', 60_000),
    rateLimitMax: parseIntEnv('RATE_LIMIT_MAX', 120),
    loginRateLimitMax: parseIntEnv('LOGIN_RATE_LIMIT_MAX', 10),
  },
};
