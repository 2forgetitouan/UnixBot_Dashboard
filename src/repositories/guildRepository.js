const { getDb } = require('../database/init');

class GuildRepository {
  constructor(db = getDb()) {
    this.db = db;
  }

  upsertGuild(guild) {
    this.db.prepare(
      `INSERT INTO guilds (id, name, icon, owner_id, updated_at)
       VALUES (@id, @name, @icon, @owner_id, strftime('%s','now'))
       ON CONFLICT(id) DO UPDATE SET
         name = excluded.name,
         icon = excluded.icon,
         owner_id = excluded.owner_id,
         updated_at = strftime('%s','now')`
    ).run({
      id: guild.id,
      name: guild.name,
      icon: guild.icon || null,
      owner_id: guild.owner_id || null,
    });

    this.db.prepare('INSERT OR IGNORE INTO guild_settings (guild_id) VALUES (?)').run(guild.id);
  }

  listGuildsForUser(userId, isLocalAdmin = false) {
    if (isLocalAdmin) {
      return this.db
        .prepare('SELECT id, name, icon, updated_at FROM guilds ORDER BY name ASC')
        .all();
    }

    return this.db
      .prepare(
        `SELECT g.id, g.name, g.icon, g.updated_at
         FROM guilds g
         INNER JOIN user_guild_access uga ON uga.guild_id = g.id
         WHERE uga.user_id = ? AND uga.is_admin = 1
         ORDER BY g.name ASC`
      )
      .all(userId);
  }

  getGuildById(guildId) {
    return this.db
      .prepare('SELECT id, name, icon, owner_id, updated_at FROM guilds WHERE id = ?')
      .get(guildId);
  }

  getGuildSettings(guildId) {
    return this.db
      .prepare(
        `SELECT prefix, language, welcome_enabled, welcome_message, log_channel_id, updated_at
         FROM guild_settings WHERE guild_id = ?`
      )
      .get(guildId);
  }

  updateGuildSettings(guildId, data) {
    const allowedKeys = ['prefix', 'language', 'welcome_enabled', 'welcome_message', 'log_channel_id'];
    const keys = Object.keys(data).filter((key) => allowedKeys.includes(key));
    if (!keys.length) return null;

    const sets = keys.map((key) => `${key} = @${key}`);
    this.db.prepare(
      `UPDATE guild_settings
       SET ${sets.join(', ')}, updated_at = strftime('%s','now')
       WHERE guild_id = @guild_id`
    ).run({ guild_id: guildId, ...data });

    return this.getGuildSettings(guildId);
  }

  getGuildOverview(guildId) {
    const guild = this.getGuildById(guildId);
    const settings = this.getGuildSettings(guildId);

    const moduleStats = this.db
      .prepare('SELECT COUNT(*) as total, SUM(enabled) as enabled FROM guild_modules WHERE guild_id = ?')
      .get(guildId);
    const userCount = this.db.prepare('SELECT COUNT(*) as count FROM guild_users WHERE guild_id = ?').get(guildId);
    const roleCount = this.db.prepare('SELECT COUNT(*) as count FROM guild_roles WHERE guild_id = ?').get(guildId);

    return {
      guild,
      settings,
      metrics: {
        modulesTotal: moduleStats?.total || 0,
        modulesEnabled: moduleStats?.enabled || 0,
        usersTotal: userCount?.count || 0,
        rolesTotal: roleCount?.count || 0,
      },
    };
  }

  syncGuildRoles(guildId, roles) {
    const clear = this.db.prepare('DELETE FROM guild_roles WHERE guild_id = ?');
    const insert = this.db.prepare(
      `INSERT INTO guild_roles (guild_id, role_id, name, position, permissions, is_managed, synced_at)
       VALUES (?, ?, ?, ?, ?, ?, strftime('%s','now'))`
    );

    this.db.transaction(() => {
      clear.run(guildId);
      roles.forEach((role) => {
        insert.run(
          guildId,
          String(role.id),
          String(role.name || 'Role'),
          Number(role.position || 0),
          String(role.permissions || '0'),
          role.managed ? 1 : 0
        );
      });
    })();
  }

  syncGuildUsers(guildId, users) {
    const clearUsers = this.db.prepare('DELETE FROM guild_users WHERE guild_id = ?');
    const clearLinks = this.db.prepare('DELETE FROM guild_user_roles WHERE guild_id = ?');
    const insertUser = this.db.prepare(
      `INSERT INTO guild_users (guild_id, user_id, username, display_name, is_admin, synced_at)
       VALUES (?, ?, ?, ?, ?, strftime('%s','now'))`
    );
    const insertRole = this.db.prepare(
      `INSERT OR IGNORE INTO guild_user_roles (guild_id, user_id, role_id)
       VALUES (?, ?, ?)`
    );

    this.db.transaction(() => {
      clearLinks.run(guildId);
      clearUsers.run(guildId);
      users.forEach((member) => {
        insertUser.run(
          guildId,
          String(member.id),
          String(member.username || 'unknown'),
          member.displayName ? String(member.displayName) : null,
          member.isAdmin ? 1 : 0
        );

        (member.roles || []).forEach((roleId) => {
          insertRole.run(guildId, String(member.id), String(roleId));
        });
      });
    })();
  }

  listGuildRoles(guildId) {
    return this.db
      .prepare(
        `SELECT role_id as id, name, position, permissions, is_managed as managed, synced_at
         FROM guild_roles WHERE guild_id = ? ORDER BY position DESC, name ASC`
      )
      .all(guildId);
  }

  listGuildUsers(guildId) {
    const rows = this.db
      .prepare(
        `SELECT gu.user_id as id, gu.username, gu.display_name, gu.is_admin,
                GROUP_CONCAT(gur.role_id) as role_ids
         FROM guild_users gu
         LEFT JOIN guild_user_roles gur ON gur.guild_id = gu.guild_id AND gur.user_id = gu.user_id
         WHERE gu.guild_id = ?
         GROUP BY gu.user_id, gu.username, gu.display_name, gu.is_admin
         ORDER BY gu.username ASC`
      )
      .all(guildId);

    return rows.map((row) => ({
      id: row.id,
      username: row.username,
      displayName: row.display_name,
      isAdmin: row.is_admin === 1,
      roles: row.role_ids ? row.role_ids.split(',') : [],
    }));
  }
}

module.exports = {
  GuildRepository,
};
