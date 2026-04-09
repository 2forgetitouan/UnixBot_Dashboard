const { getDb } = require('../database/init');

class ModuleRepository {
  constructor(db = getDb()) {
    this.db = db;
  }

  listCatalog() {
    return this.db
      .prepare('SELECT module_key as key, display_name as name, description, default_enabled FROM bot_modules ORDER BY module_key ASC')
      .all();
  }

  ensureGuildModules(guildId) {
    const modules = this.listCatalog();
    const insert = this.db.prepare(
      `INSERT OR IGNORE INTO guild_modules (guild_id, module_key, enabled, updated_at)
       VALUES (?, ?, ?, strftime('%s','now'))`
    );

    const tx = this.db.transaction(() => {
      modules.forEach((module) => {
        insert.run(guildId, module.key, module.default_enabled ? 1 : 0);
      });
    });

    tx();
  }

  listGuildModules(guildId) {
    this.ensureGuildModules(guildId);
    return this.db
      .prepare(
        `SELECT gm.module_key as key, bm.display_name as name, bm.description,
                gm.enabled, gm.updated_by, gm.updated_at
         FROM guild_modules gm
         INNER JOIN bot_modules bm ON bm.module_key = gm.module_key
         WHERE gm.guild_id = ?
         ORDER BY gm.module_key ASC`
      )
      .all(guildId)
      .map((row) => ({
        ...row,
        enabled: row.enabled === 1,
      }));
  }

  updateGuildModule(guildId, moduleKey, enabled, actor) {
    this.db.prepare(
      `UPDATE guild_modules
       SET enabled = ?, updated_by = ?, updated_at = strftime('%s','now')
       WHERE guild_id = ? AND module_key = ?`
    ).run(enabled ? 1 : 0, actor, guildId, moduleKey);

    return this.db
      .prepare(
        `SELECT gm.module_key as key, bm.display_name as name, bm.description,
                gm.enabled, gm.updated_by, gm.updated_at
         FROM guild_modules gm
         INNER JOIN bot_modules bm ON bm.module_key = gm.module_key
         WHERE gm.guild_id = ? AND gm.module_key = ?`
      )
      .get(guildId, moduleKey);
  }
}

module.exports = {
  ModuleRepository,
};
