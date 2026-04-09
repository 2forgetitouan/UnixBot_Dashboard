const crypto = require('crypto');
const express = require('express');
const config = require('../../../config/config');
const { hashPassword, safeEqual } = require('../../lib/security');
const { DiscordOAuthService } = require('../../services/discordOAuthService');
const { UserRepository } = require('../../repositories/userRepository');
const { GuildRepository } = require('../../repositories/guildRepository');
const { ModuleRepository } = require('../../repositories/moduleRepository');

const router = express.Router();
const discordOAuth = new DiscordOAuthService();
const userRepository = new UserRepository();
const guildRepository = new GuildRepository();
const moduleRepository = new ModuleRepository();

function avatarUrl(user) {
  if (!user?.id || !user?.avatar) return null;
  return `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=128`;
}

router.get('/me', (req, res) => {
  if (!req.session?.user) {
    return res.status(401).json({ ok: false, error: 'Unauthorized' });
  }

  return res.json({
    ok: true,
    user: {
      id: req.session.user.id || null,
      username: req.session.user.username,
      role: req.session.user.role,
      provider: req.session.user.provider,
      avatarUrl: req.session.user.avatarUrl || null,
    },
    csrfToken: req.session.csrfToken,
    discordOAuthEnabled: discordOAuth.isConfigured(),
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
    id: 'local-admin',
    username: expectedUsername,
    role: 'local_admin',
    provider: 'local',
    avatarUrl: null,
  };

  return res.json({ ok: true });
});

router.get('/discord/login', (req, res) => {
  if (!discordOAuth.isConfigured()) {
    return res.status(503).json({ ok: false, error: 'Discord OAuth is not configured' });
  }

  const state = crypto.randomBytes(24).toString('hex');
  req.session.oauthState = state;
  return res.redirect(discordOAuth.getAuthorizationUrl(state));
});

router.get('/discord/callback', async (req, res) => {
  try {
    if (!discordOAuth.isConfigured()) {
      return res.redirect('/login?error=oauth_not_configured');
    }

    const { code, state } = req.query;
    if (!code || !state || state !== req.session.oauthState) {
      return res.redirect('/login?error=oauth_invalid_state');
    }

    const tokens = await discordOAuth.exchangeCode(String(code));
    const user = await discordOAuth.fetchUser(tokens.access_token);
    const guilds = await discordOAuth.fetchGuilds(tokens.access_token);

    const mappedGuilds = guilds.map((guild) => ({
      id: guild.id,
      name: guild.name,
      icon: guild.icon,
      owner_id: guild.owner ? user.id : null,
      permissions: guild.permissions,
      isAdmin: discordOAuth.hasGuildAdminPermissions(guild.permissions),
    }));

    userRepository.upsertDiscordUser(user);
    mappedGuilds.forEach((guild) => {
      guildRepository.upsertGuild(guild);
      moduleRepository.ensureGuildModules(guild.id);
    });

    userRepository.replaceUserGuildAccess(user.id, mappedGuilds);

    req.session.user = {
      id: user.id,
      username: user.global_name || user.username,
      role: 'guild_admin',
      provider: 'discord',
      avatarUrl: avatarUrl(user),
    };

    req.session.oauthTokens = {
      accessToken: tokens.access_token,
      expiresAt: Date.now() + ((tokens.expires_in || 3600) * 1000),
      scope: tokens.scope,
    };

    delete req.session.oauthState;

    return res.redirect('/dashboard');
  } catch {
    return res.redirect('/login?error=oauth_failed');
  }
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie(config.session.cookieName);
    res.json({ ok: true });
  });
});

module.exports = router;
