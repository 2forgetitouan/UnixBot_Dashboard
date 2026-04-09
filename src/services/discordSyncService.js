const config = require('../../config/config');

const DISCORD_API = 'https://discord.com/api/v10';

class DiscordSyncService {
  isConfigured() {
    return Boolean(config.discord.botToken);
  }

  async fetchGuildRoles(guildId) {
    if (!this.isConfigured()) {
      throw new Error('Discord bot token not configured');
    }

    const response = await fetch(`${DISCORD_API}/guilds/${guildId}/roles`, {
      headers: {
        Authorization: `Bot ${config.discord.botToken}`,
      },
    });

    if (!response.ok) {
      throw new Error('Failed to fetch roles from Discord');
    }

    return response.json();
  }

  async fetchGuildMembers(guildId, limit = 200) {
    if (!this.isConfigured()) {
      throw new Error('Discord bot token not configured');
    }

    const response = await fetch(`${DISCORD_API}/guilds/${guildId}/members?limit=${Math.max(1, Math.min(limit, 1000))}`, {
      headers: {
        Authorization: `Bot ${config.discord.botToken}`,
      },
    });

    if (!response.ok) {
      throw new Error('Failed to fetch members from Discord');
    }

    return response.json();
  }

  normalizeMembers(payload) {
    return payload.map((member) => ({
      id: member.user?.id,
      username: member.user?.username || 'unknown',
      displayName: member.nick || member.user?.global_name || null,
      roles: Array.isArray(member.roles) ? member.roles : [],
      isAdmin: false,
    })).filter((member) => Boolean(member.id));
  }
}

module.exports = {
  DiscordSyncService,
};
