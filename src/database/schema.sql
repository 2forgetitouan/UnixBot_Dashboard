-- ============================================
-- Schema SQLite v2 pour UnixBot
-- Architecture multi-serveur scalable
-- ============================================

-- ============================================
-- TABLES PRINCIPALES
-- ============================================

-- Table des guildes (serveurs Discord)
CREATE TABLE IF NOT EXISTS guilds (
  guild_id TEXT PRIMARY KEY,
  guild_name TEXT,
  icon TEXT,
  owner_id TEXT,
  member_count INTEGER DEFAULT 0,
  prefix TEXT NOT NULL DEFAULT '/',
  language TEXT NOT NULL DEFAULT 'fr',
  joined_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
  left_at INTEGER DEFAULT NULL,
  is_active INTEGER NOT NULL DEFAULT 1,
  premium_tier INTEGER DEFAULT 0,
  updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
);

-- Table des utilisateurs Discord (global)
CREATE TABLE IF NOT EXISTS users (
  user_id TEXT PRIMARY KEY,
  username TEXT NOT NULL,
  discriminator TEXT DEFAULT '0',
  avatar TEXT,
  email TEXT,
  locale TEXT DEFAULT 'fr',
  first_seen INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
  last_seen INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
  is_banned INTEGER NOT NULL DEFAULT 0,
  ban_reason TEXT
);

-- Table de liaison guildes-utilisateurs avec rôles
CREATE TABLE IF NOT EXISTS guild_users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'member', -- 'owner', 'admin', 'moderator', 'member'
  permissions TEXT, -- JSON des permissions spécifiques
  joined_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
  left_at INTEGER DEFAULT NULL,
  is_member INTEGER NOT NULL DEFAULT 1,
  FOREIGN KEY (guild_id) REFERENCES guilds(guild_id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
  UNIQUE (guild_id, user_id)
);

-- ============================================
-- SESSIONS & AUTHENTIFICATION
-- ============================================

-- Sessions utilisateur (OAuth2)
CREATE TABLE IF NOT EXISTS user_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL UNIQUE,
  user_id TEXT NOT NULL,
  access_token TEXT NOT NULL,
  refresh_token TEXT,
  token_type TEXT DEFAULT 'Bearer',
  expires_at INTEGER NOT NULL,
  scope TEXT,
  ip_address TEXT,
  user_agent TEXT,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
  last_used_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
  is_valid INTEGER NOT NULL DEFAULT 1,
  FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_sessions_user ON user_sessions(user_id, is_valid);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON user_sessions(expires_at);

-- ============================================
-- CONFIGURATION PAR SERVEUR
-- ============================================

-- Paramètres de serveur (structure fixe, pas clé/valeur)
CREATE TABLE IF NOT EXISTS guild_settings (
  guild_id TEXT PRIMARY KEY,
  -- Salons configurés
  welcome_channel_id TEXT,
  log_channel_id TEXT,
  mod_log_channel_id TEXT,
  giveaway_channel_id TEXT,
  bump_channel_id TEXT,
  -- Messages personnalisés
  welcome_message TEXT DEFAULT 'Bienvenue {user} sur {server} !',
  goodbye_message TEXT DEFAULT '{user} a quitté le serveur.',
  -- Fonctionnalités activées/désactivées
  welcome_enabled INTEGER NOT NULL DEFAULT 0,
  goodbye_enabled INTEGER NOT NULL DEFAULT 0,
  auto_unarchive_enabled INTEGER NOT NULL DEFAULT 0,
  bump_reminder_enabled INTEGER NOT NULL DEFAULT 0,
  -- Modération
  auto_mod_enabled INTEGER NOT NULL DEFAULT 0,
  spam_protection_enabled INTEGER NOT NULL DEFAULT 0,
  -- Timestamps
  updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
  updated_by TEXT,
  FOREIGN KEY (guild_id) REFERENCES guilds(guild_id) ON DELETE CASCADE
);

-- Permissions de commandes par serveur
CREATE TABLE IF NOT EXISTS command_permissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT NOT NULL,
  command_name TEXT NOT NULL,
  is_enabled INTEGER NOT NULL DEFAULT 1,
  -- Restrictions (JSON arrays d'IDs)
  allowed_roles TEXT DEFAULT '[]',
  denied_roles TEXT DEFAULT '[]',
  allowed_channels TEXT DEFAULT '[]',
  denied_channels TEXT DEFAULT '[]',
  -- Cooldown personnalisé (en secondes)
  cooldown_seconds INTEGER DEFAULT 0,
  updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
  updated_by TEXT,
  FOREIGN KEY (guild_id) REFERENCES guilds(guild_id) ON DELETE CASCADE,
  UNIQUE (guild_id, command_name)
);

CREATE INDEX IF NOT EXISTS idx_cmd_perms_guild ON command_permissions(guild_id);

-- Configuration des commandes par serveur (nouvelle table)
CREATE TABLE IF NOT EXISTS commands (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT NOT NULL,
  name TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  allowed_roles TEXT DEFAULT '[]',
  denied_roles TEXT DEFAULT '[]',
  allowed_channels TEXT DEFAULT '[]',
  cooldown INTEGER DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
  updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
  FOREIGN KEY (guild_id) REFERENCES guilds(guild_id) ON DELETE CASCADE,
  UNIQUE (guild_id, name)
);

CREATE INDEX IF NOT EXISTS idx_commands_guild ON commands(guild_id);

-- ============================================
-- SYSTÈME D'OWNERSHIP (amélioré)
-- ============================================

-- Owners par guild (utilisateurs avec droits admin bot)
CREATE TABLE IF NOT EXISTS owners (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  username TEXT,
  permission_level INTEGER NOT NULL DEFAULT 1, -- 1=basic, 2=full, 3=super
  added_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
  added_by TEXT,
  FOREIGN KEY (guild_id) REFERENCES guilds(guild_id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
  UNIQUE (guild_id, user_id)
);

-- Superusers (droits globaux cross-guild)
CREATE TABLE IF NOT EXISTS superusers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL UNIQUE,
  username TEXT,
  added_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
  FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
);

-- ============================================
-- SYSTÈME NOARCHIVE
-- ============================================

-- Forums protégés contre l'archivage
CREATE TABLE IF NOT EXISTS noarchive_forums (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT NOT NULL,
  forum_id TEXT NOT NULL,
  added_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
  added_by TEXT,
  FOREIGN KEY (guild_id) REFERENCES guilds(guild_id) ON DELETE CASCADE,
  UNIQUE (guild_id, forum_id)
);

-- ============================================
-- SYSTÈME GIVEAWAYS (amélioré)
-- ============================================

CREATE TABLE IF NOT EXISTS giveaways (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT NOT NULL,
  message_id TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  -- Contenu
  prize TEXT NOT NULL,
  description TEXT,
  image_url TEXT,
  -- Configuration
  winners_count INTEGER NOT NULL DEFAULT 1,
  end_time INTEGER NOT NULL,
  -- Restrictions
  required_roles TEXT DEFAULT '[]', -- JSON array
  blacklisted_roles TEXT DEFAULT '[]', -- JSON array
  min_account_age_days INTEGER DEFAULT 0,
  -- Créateur
  creator_id TEXT NOT NULL,
  creator_username TEXT,
  -- État
  participants TEXT NOT NULL DEFAULT '[]', -- JSON array
  winners TEXT DEFAULT NULL, -- JSON array
  status TEXT NOT NULL DEFAULT 'active', -- 'active', 'ended', 'cancelled', 'paused'
  -- Timestamps
  created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
  ended_at INTEGER DEFAULT NULL,
  paused_at INTEGER DEFAULT NULL,
  FOREIGN KEY (guild_id) REFERENCES guilds(guild_id) ON DELETE CASCADE,
  UNIQUE (guild_id, message_id)
);

CREATE INDEX IF NOT EXISTS idx_giveaways_active ON giveaways(guild_id, status, end_time);
CREATE INDEX IF NOT EXISTS idx_giveaways_channel ON giveaways(channel_id, status);

-- ============================================
-- SYSTÈME DE MESSAGES
-- ============================================

-- Log des messages envoyés via le dashboard
CREATE TABLE IF NOT EXISTS messages_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT NOT NULL,
  channel_id TEXT,
  target_user_id TEXT, -- Pour les DM
  message_type TEXT NOT NULL, -- 'channel', 'dm', 'embed'
  content TEXT NOT NULL,
  embed_data TEXT, -- JSON
  sent_by TEXT NOT NULL, -- User ID qui a envoyé depuis le dashboard
  sent_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
  message_id TEXT, -- ID du message Discord créé
  status TEXT NOT NULL DEFAULT 'sent', -- 'sent', 'failed', 'deleted'
  error_message TEXT,
  FOREIGN KEY (guild_id) REFERENCES guilds(guild_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_messages_guild ON messages_log(guild_id, sent_at DESC);

-- ============================================
-- AUDIT LOG
-- ============================================

CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT,
  user_id TEXT NOT NULL,
  action TEXT NOT NULL, -- 'config_update', 'giveaway_create', 'permission_change', etc.
  target_type TEXT, -- 'guild', 'user', 'giveaway', 'command', etc.
  target_id TEXT,
  old_value TEXT, -- JSON
  new_value TEXT, -- JSON
  ip_address TEXT,
  user_agent TEXT,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
  FOREIGN KEY (guild_id) REFERENCES guilds(guild_id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_audit_guild ON audit_log(guild_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_log(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_log(action, created_at DESC);

-- ============================================
-- SYSTÈME DE MONITORING
-- ============================================

-- Historique des pings
CREATE TABLE IF NOT EXISTS ping_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
  ping_ms INTEGER NOT NULL,
  ws_ping_ms INTEGER DEFAULT NULL
);

CREATE INDEX IF NOT EXISTS idx_ping_timestamp ON ping_history(timestamp);

-- Logs système
CREATE TABLE IF NOT EXISTS logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT,
  timestamp INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
  log_type TEXT NOT NULL,
  message TEXT NOT NULL,
  user_id TEXT,
  channel_id TEXT,
  metadata TEXT,
  FOREIGN KEY (guild_id) REFERENCES guilds(guild_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_logs_guild ON logs(guild_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_logs_type ON logs(guild_id, log_type, timestamp DESC);

-- ============================================
-- INDEXES ADDITIONNELS
-- ============================================

CREATE INDEX IF NOT EXISTS idx_guild_users_guild ON guild_users(guild_id, is_member);
CREATE INDEX IF NOT EXISTS idx_guild_users_user ON guild_users(user_id, is_member);
CREATE INDEX IF NOT EXISTS idx_owners_guild ON owners(guild_id);
CREATE INDEX IF NOT EXISTS idx_noarchive_guild ON noarchive_forums(guild_id);

-- ============================================
-- CONFIGURATION GLOBALE
-- ============================================

CREATE TABLE IF NOT EXISTS global_config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
  updated_by TEXT
);

-- ============================================
-- SYSTÈME AUTO-BUMP
-- ============================================

-- Configuration de l'auto-bump par serveur
CREATE TABLE IF NOT EXISTS autobump_configs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT NOT NULL UNIQUE,
  user_id TEXT NOT NULL,           -- ID de l'utilisateur qui a configuré
  channel_id TEXT NOT NULL,        -- Salon où envoyer les bumps
  -- Token chiffré (AES-256-GCM)
  encrypted_token TEXT NOT NULL,
  token_iv TEXT NOT NULL,          -- IV pour le chiffrement
  token_auth_tag TEXT NOT NULL,    -- Tag d'authentification
  -- Informations du compte Discord lié
  token_user_id TEXT NOT NULL,     -- ID Discord du compte lié
  token_username TEXT NOT NULL,    -- Username du compte lié
  token_avatar TEXT,               -- Avatar du compte lié
  -- État
  is_active INTEGER NOT NULL DEFAULT 0,
  -- Fréquences (en millisecondes)
  min_delay INTEGER NOT NULL DEFAULT 7200000,   -- 2h par défaut
  max_delay INTEGER NOT NULL DEFAULT 10800000,  -- 3h par défaut
  -- Services activés (JSON array)
  enabled_services TEXT NOT NULL DEFAULT '["disboard", "dinvite"]',
  -- Statistiques
  total_bumps INTEGER NOT NULL DEFAULT 0,
  last_bump_at INTEGER,
  last_error TEXT,
  consecutive_failures INTEGER NOT NULL DEFAULT 0,
  -- Timestamps
  created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
  updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
  FOREIGN KEY (guild_id) REFERENCES guilds(guild_id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_autobump_guild ON autobump_configs(guild_id);
CREATE INDEX IF NOT EXISTS idx_autobump_active ON autobump_configs(is_active);
CREATE INDEX IF NOT EXISTS idx_autobump_user ON autobump_configs(user_id);

-- Historique des bumps
CREATE TABLE IF NOT EXISTS autobump_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT NOT NULL,
  service TEXT NOT NULL,           -- 'disboard', 'dinvite', etc.
  status TEXT NOT NULL,            -- 'success', 'failed'
  error_message TEXT,
  bumped_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
  FOREIGN KEY (guild_id) REFERENCES guilds(guild_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_autobump_history_guild ON autobump_history(guild_id, bumped_at DESC);

-- Version du schéma pour migrations futures
INSERT OR REPLACE INTO global_config (key, value, updated_at) 
VALUES ('schema_version', '2.1.0', strftime('%s', 'now'));
