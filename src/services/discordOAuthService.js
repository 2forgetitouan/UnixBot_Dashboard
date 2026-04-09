const config = require('../../config/config');

const DISCORD_API = 'https://discord.com/api/v10';
const ADMINISTRATOR = 0x8n;
const MANAGE_GUILD = 0x20n;

class DiscordOAuthService {
  isConfigured() {
    return Boolean(config.discord.clientId && config.discord.clientSecret && config.discord.redirectUri);
  }

  getAuthorizationUrl(state) {
    const params = new URLSearchParams({
      client_id: config.discord.clientId,
      redirect_uri: config.discord.redirectUri,
      response_type: 'code',
      scope: config.discord.scope,
      state,
      prompt: 'none',
    });
    return `https://discord.com/oauth2/authorize?${params.toString()}`;
  }

  async exchangeCode(code) {
    const body = new URLSearchParams({
      client_id: config.discord.clientId,
      client_secret: config.discord.clientSecret,
      grant_type: 'authorization_code',
      code,
      redirect_uri: config.discord.redirectUri,
    });

    const response = await fetch(`${DISCORD_API}/oauth2/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body,
    });

    if (!response.ok) {
      throw new Error('Discord token exchange failed');
    }

    return response.json();
  }

  async fetchUser(accessToken) {
    const response = await fetch(`${DISCORD_API}/users/@me`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      throw new Error('Discord user fetch failed');
    }

    return response.json();
  }

  async fetchGuilds(accessToken) {
    const response = await fetch(`${DISCORD_API}/users/@me/guilds`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      throw new Error('Discord guilds fetch failed');
    }

    return response.json();
  }

  hasGuildAdminPermissions(permissions) {
    try {
      const perms = BigInt(String(permissions || '0'));
      return (perms & ADMINISTRATOR) !== 0n || (perms & MANAGE_GUILD) !== 0n;
    } catch {
      return false;
    }
  }
}

module.exports = {
  DiscordOAuthService,
};
