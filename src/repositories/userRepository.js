const { getDb } = require('../database/init');

class UserRepository {
  constructor(db = getDb()) {
    this.db = db;
  }

  upsertDiscordUser(user) {
    this.db.prepare(
      `INSERT INTO users (id, provider, username, avatar, global_name, email, updated_at)
       VALUES (@id, 'discord', @username, @avatar, @global_name, @email, strftime('%s','now'))
       ON CONFLICT(id) DO UPDATE SET
         username = excluded.username,
         avatar = excluded.avatar,
         global_name = excluded.global_name,
         email = excluded.email,
         updated_at = strftime('%s','now')`
    ).run({
      id: user.id,
      username: user.username,
      avatar: user.avatar || null,
      global_name: user.global_name || null,
      email: user.email || null,
    });
  }

  replaceUserGuildAccess(userId, guilds) {
    const clear = this.db.prepare('DELETE FROM user_guild_access WHERE user_id = ?');
    const insert = this.db.prepare(
      `INSERT INTO user_guild_access (user_id, guild_id, permissions, is_admin, source, synced_at)
       VALUES (?, ?, ?, ?, 'discord_oauth', strftime('%s','now'))`
    );

    this.db.transaction(() => {
      clear.run(userId);
      guilds.forEach((guild) => {
        insert.run(userId, guild.id, String(guild.permissions || '0'), guild.isAdmin ? 1 : 0);
      });
    })();
  }

  hasGuildAdminAccess(userId, guildId) {
    const row = this.db
      .prepare('SELECT 1 FROM user_guild_access WHERE user_id = ? AND guild_id = ? AND is_admin = 1')
      .get(userId, guildId);
    return Boolean(row);
  }
}

module.exports = {
  UserRepository,
};
