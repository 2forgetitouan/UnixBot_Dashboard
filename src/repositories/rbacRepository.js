const { getDb } = require('../database/init');

class RbacRepository {
  constructor(db = getDb()) {
    this.db = db;
  }

  listRolePermissions(guildId) {
    return this.db
      .prepare(
        `SELECT grp.role_id as roleId,
                gr.name as roleName,
                grp.can_manage_settings,
                grp.can_manage_modules,
                grp.can_manage_users,
                grp.updated_at
         FROM role_dashboard_permissions grp
         INNER JOIN guild_roles gr ON gr.guild_id = grp.guild_id AND gr.role_id = grp.role_id
         WHERE grp.guild_id = ?
         ORDER BY gr.position DESC, gr.name ASC`
      )
      .all(guildId)
      .map((row) => ({
        roleId: row.roleId,
        roleName: row.roleName,
        canManageSettings: row.can_manage_settings === 1,
        canManageModules: row.can_manage_modules === 1,
        canManageUsers: row.can_manage_users === 1,
        updatedAt: row.updated_at,
      }));
  }

  ensureDefaultRolePermissions(guildId) {
    this.db.prepare(
      `INSERT OR IGNORE INTO role_dashboard_permissions (guild_id, role_id)
       SELECT guild_id, role_id FROM guild_roles WHERE guild_id = ?`
    ).run(guildId);
  }

  upsertRolePermission(guildId, roleId, payload) {
    this.db.prepare(
      `INSERT INTO role_dashboard_permissions (
          guild_id, role_id, can_manage_settings, can_manage_modules, can_manage_users, updated_at
       ) VALUES (?, ?, ?, ?, ?, strftime('%s','now'))
       ON CONFLICT(guild_id, role_id) DO UPDATE SET
          can_manage_settings = excluded.can_manage_settings,
          can_manage_modules = excluded.can_manage_modules,
          can_manage_users = excluded.can_manage_users,
          updated_at = strftime('%s','now')`
    ).run(
      guildId,
      roleId,
      payload.canManageSettings ? 1 : 0,
      payload.canManageModules ? 1 : 0,
      payload.canManageUsers ? 1 : 0
    );
  }
}

module.exports = {
  RbacRepository,
};
