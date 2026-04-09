PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;

CREATE TABLE IF NOT EXISTS sessions (
  sid TEXT PRIMARY KEY,
  expires INTEGER NOT NULL,
  data TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  username TEXT NOT NULL,
  avatar TEXT,
  global_name TEXT,
  email TEXT,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
  updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
);

CREATE TABLE IF NOT EXISTS guilds (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  icon TEXT,
  owner_id TEXT,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
  updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
);

CREATE TABLE IF NOT EXISTS user_guild_access (
  user_id TEXT NOT NULL,
  guild_id TEXT NOT NULL,
  permissions TEXT NOT NULL,
  is_admin INTEGER NOT NULL DEFAULT 0,
  source TEXT NOT NULL DEFAULT 'discord_oauth',
  synced_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
  PRIMARY KEY (user_id, guild_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (guild_id) REFERENCES guilds(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_access_user ON user_guild_access(user_id, is_admin);

CREATE TABLE IF NOT EXISTS guild_settings (
  guild_id TEXT PRIMARY KEY,
  prefix TEXT NOT NULL DEFAULT '/',
  language TEXT NOT NULL DEFAULT 'fr',
  welcome_enabled INTEGER NOT NULL DEFAULT 0,
  welcome_message TEXT NOT NULL DEFAULT 'Bienvenue {user} sur {server} !',
  log_channel_id TEXT,
  updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
  FOREIGN KEY (guild_id) REFERENCES guilds(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS bot_modules (
  module_key TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  description TEXT NOT NULL,
  default_enabled INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS guild_modules (
  guild_id TEXT NOT NULL,
  module_key TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  updated_by TEXT,
  updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
  PRIMARY KEY (guild_id, module_key),
  FOREIGN KEY (guild_id) REFERENCES guilds(id) ON DELETE CASCADE,
  FOREIGN KEY (module_key) REFERENCES bot_modules(module_key) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS guild_roles (
  guild_id TEXT NOT NULL,
  role_id TEXT NOT NULL,
  name TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  permissions TEXT NOT NULL DEFAULT '0',
  is_managed INTEGER NOT NULL DEFAULT 0,
  synced_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
  PRIMARY KEY (guild_id, role_id),
  FOREIGN KEY (guild_id) REFERENCES guilds(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS guild_users (
  guild_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  username TEXT NOT NULL,
  display_name TEXT,
  is_admin INTEGER NOT NULL DEFAULT 0,
  synced_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
  PRIMARY KEY (guild_id, user_id),
  FOREIGN KEY (guild_id) REFERENCES guilds(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS guild_user_roles (
  guild_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  role_id TEXT NOT NULL,
  PRIMARY KEY (guild_id, user_id, role_id),
  FOREIGN KEY (guild_id, user_id) REFERENCES guild_users(guild_id, user_id) ON DELETE CASCADE,
  FOREIGN KEY (guild_id, role_id) REFERENCES guild_roles(guild_id, role_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS role_dashboard_permissions (
  guild_id TEXT NOT NULL,
  role_id TEXT NOT NULL,
  can_manage_settings INTEGER NOT NULL DEFAULT 0,
  can_manage_modules INTEGER NOT NULL DEFAULT 0,
  can_manage_users INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
  PRIMARY KEY (guild_id, role_id),
  FOREIGN KEY (guild_id, role_id) REFERENCES guild_roles(guild_id, role_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor TEXT NOT NULL,
  action TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  payload TEXT,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
);
