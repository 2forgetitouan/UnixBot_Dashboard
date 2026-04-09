const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const config = require('../../config/config');

const dbPath = path.resolve(process.cwd(), config.database.path);
const schemaPath = path.resolve(__dirname, 'schema.sql');

let db;

function getDb() {
  if (!db) {
    db = new Database(dbPath);
    db.pragma('foreign_keys = ON');
  }
  return db;
}

function runSchema() {
  const schemaSql = fs.readFileSync(schemaPath, 'utf8');
  getDb().exec(schemaSql);
}

function bootstrapGuilds(connection) {
  const count = connection.prepare('SELECT COUNT(*) as count FROM guilds').get();
  if (count.count > 0) return;

  const seedGuilds = [
    { id: '100000000000000001', name: 'UnixBot Community' },
    { id: '100000000000000002', name: 'UnixBot Support' },
  ];

  const insertGuild = connection.prepare(
    `INSERT INTO guilds (id, name, icon, updated_at)
     VALUES (?, ?, NULL, strftime('%s','now'))`
  );
  const insertSettings = connection.prepare('INSERT OR IGNORE INTO guild_settings (guild_id) VALUES (?)');

  const tx = connection.transaction(() => {
    seedGuilds.forEach((guild) => {
      insertGuild.run(guild.id, guild.name);
      insertSettings.run(guild.id);
    });
  });

  tx();
}

function bootstrapModules(connection) {
  const modules = [
    { key: 'moderation', name: 'Modération', description: 'Commandes de modération et sécurité', enabled: 1 },
    { key: 'giveaways', name: 'Giveaways', description: 'Création et gestion des giveaways', enabled: 1 },
    { key: 'autobump', name: 'Auto-Bump', description: 'Automatisation des bumps de serveurs', enabled: 0 },
    { key: 'messages', name: 'Messages', description: 'Messages, annonces et automation', enabled: 1 },
    { key: 'utility', name: 'Utilitaires', description: 'Fonctions utilitaires diverses', enabled: 1 },
  ];

  const insertModule = connection.prepare(
    `INSERT OR IGNORE INTO bot_modules (module_key, display_name, description, default_enabled)
     VALUES (@key, @name, @description, @enabled)`
  );

  const guildRows = connection.prepare('SELECT id FROM guilds').all();
  const insertGuildModule = connection.prepare(
    `INSERT OR IGNORE INTO guild_modules (guild_id, module_key, enabled, updated_at)
     VALUES (?, ?, ?, strftime('%s','now'))`
  );

  const tx = connection.transaction(() => {
    modules.forEach((module) => insertModule.run(module));
    guildRows.forEach((guild) => {
      modules.forEach((module) => {
        insertGuildModule.run(guild.id, module.key, module.enabled);
      });
    });
  });

  tx();
}

function bootstrapRolesAndUsers(connection) {
  const guildRows = connection.prepare('SELECT id FROM guilds').all();
  const roleCount = connection.prepare('SELECT COUNT(*) as count FROM guild_roles').get();
  const userCount = connection.prepare('SELECT COUNT(*) as count FROM guild_users').get();
  if (roleCount.count > 0 && userCount.count > 0) return;

  const roleSeed = [
    { id: '1', name: 'Owner', position: 100, perms: '8', managed: 0, canSettings: 1, canModules: 1, canUsers: 1 },
    { id: '2', name: 'Admin', position: 90, perms: '8', managed: 0, canSettings: 1, canModules: 1, canUsers: 1 },
    { id: '3', name: 'Moderator', position: 50, perms: '32', managed: 0, canSettings: 0, canModules: 1, canUsers: 0 },
  ];

  const usersSeed = [
    { id: 'demo-owner', username: 'DemoOwner', displayName: 'Demo Owner', admin: 1, roles: ['1'] },
    { id: 'demo-admin', username: 'DemoAdmin', displayName: 'Demo Admin', admin: 1, roles: ['2'] },
    { id: 'demo-mod', username: 'DemoMod', displayName: 'Demo Moderator', admin: 0, roles: ['3'] },
  ];

  const insertRole = connection.prepare(
    `INSERT OR IGNORE INTO guild_roles (guild_id, role_id, name, position, permissions, is_managed, synced_at)
     VALUES (?, ?, ?, ?, ?, ?, strftime('%s','now'))`
  );
  const insertRolePerm = connection.prepare(
    `INSERT OR IGNORE INTO role_dashboard_permissions (
      guild_id, role_id, can_manage_settings, can_manage_modules, can_manage_users, updated_at
    ) VALUES (?, ?, ?, ?, ?, strftime('%s','now'))`
  );
  const insertUser = connection.prepare(
    `INSERT OR IGNORE INTO guild_users (guild_id, user_id, username, display_name, is_admin, synced_at)
     VALUES (?, ?, ?, ?, ?, strftime('%s','now'))`
  );
  const insertUserRole = connection.prepare(
    `INSERT OR IGNORE INTO guild_user_roles (guild_id, user_id, role_id)
     VALUES (?, ?, ?)`
  );

  const tx = connection.transaction(() => {
    guildRows.forEach((guild) => {
      roleSeed.forEach((role) => {
        insertRole.run(guild.id, role.id, role.name, role.position, role.perms, role.managed);
        insertRolePerm.run(guild.id, role.id, role.canSettings, role.canModules, role.canUsers);
      });

      usersSeed.forEach((user) => {
        insertUser.run(guild.id, user.id, user.username, user.displayName, user.admin);
        user.roles.forEach((roleId) => {
          insertUserRole.run(guild.id, user.id, roleId);
        });
      });
    });
  });

  tx();
}

function initDatabase() {
  runSchema();
  const connection = getDb();
  bootstrapGuilds(connection);
  bootstrapModules(connection);
  bootstrapRolesAndUsers(connection);
  return connection;
}

function closeDatabase() {
  if (db) {
    db.close();
    db = null;
  }
}

module.exports = {
  initDatabase,
  closeDatabase,
  getDb,
};
