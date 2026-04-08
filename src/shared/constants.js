/**
 * Constantes partagées entre Bot, API et Web
 * @module shared/constants
 */

// Permissions Discord (bitfield)
const DISCORD_PERMISSIONS = {
  ADMINISTRATOR: 0x8,
  MANAGE_GUILD: 0x20,
  MANAGE_ROLES: 0x10000000,
  MANAGE_CHANNELS: 0x10,
  KICK_MEMBERS: 0x2,
  BAN_MEMBERS: 0x4,
  MANAGE_MESSAGES: 0x2000,
};

// Scopes OAuth2 Discord
const OAUTH_SCOPES = {
  IDENTIFY: "identify",
  GUILDS: "guilds",
  EMAIL: "email",
  BOT: "bot",
  APPLICATIONS_COMMANDS: "applications.commands",
};

// URLs Discord API
const DISCORD_API = {
  BASE: "https://discord.com/api/v10",
  CDN: "https://cdn.discordapp.com",
  OAUTH_AUTHORIZE: "https://discord.com/oauth2/authorize",
  OAUTH_TOKEN: "https://discord.com/api/oauth2/token",
  OAUTH_REVOKE: "https://discord.com/api/oauth2/token/revoke",
};

// Statuts des giveaways
const GIVEAWAY_STATUS = {
  ACTIVE: "active",
  ENDED: "ended",
  CANCELLED: "cancelled",
  PAUSED: "paused",
};

// Types de logs
const LOG_TYPES = {
  INFO: "INFO",
  WARN: "WARN",
  ERROR: "ERROR",
  COMMAND: "COMMAND",
  GIVEAWAY: "GIVEAWAY",
  CONFIG: "CONFIG",
  AUTH: "AUTH",
  MESSAGE: "MESSAGE",
  AUDIT: "AUDIT",
};

// Rôles système
const SYSTEM_ROLES = {
  SUPERUSER: "superuser", // Droits globaux sur tous les serveurs
  GUILD_OWNER: "guild_owner", // Propriétaire du serveur Discord
  BOT_ADMIN: "bot_admin", // Admin configuré du bot sur un serveur
  MODERATOR: "moderator", // Modérateur avec droits limités
};

// Limites et rate limiting
const LIMITS = {
  MAX_GIVEAWAYS_PER_GUILD: 50,
  MAX_WINNERS_PER_GIVEAWAY: 20,
  MAX_GIVEAWAY_DURATION_MS: 30 * 24 * 60 * 60 * 1000, // 30 jours
  MIN_GIVEAWAY_DURATION_MS: 60 * 1000, // 1 minute
  API_RATE_LIMIT_WINDOW_MS: 60 * 1000,
  API_RATE_LIMIT_MAX_REQUESTS: 100,
  SESSION_MAX_AGE_MS: 30 * 24 * 60 * 60 * 1000, // 30 jours
  TOKEN_REFRESH_BEFORE_MS: 5 * 60 * 1000, // Refresh 5 min avant expiration
};

// Langues supportées
const SUPPORTED_LANGUAGES = {
  FR: "fr",
  EN: "en",
};

// Configuration par défaut d'un serveur
const DEFAULT_GUILD_SETTINGS = {
  language: SUPPORTED_LANGUAGES.FR,
  prefix: "/",
  welcomeEnabled: false,
  welcomeChannelId: null,
  welcomeMessage: "Bienvenue {user} sur {server} !",
  logChannelId: null,
  modLogChannelId: null,
  giveawayChannelId: null,
  autoUnarchive: false,
  commandsEnabled: {},
};

// Catégories de commandes
const COMMAND_CATEGORIES = {
  ADMIN: "admin",
  FUN: "fun",
  INFOS: "infos",
  EVENEMENTS: "evenements",
  UTILITAIRE: "utilitaire",
  UTILS: "utils",
};

// Codes d'erreur API
const API_ERRORS = {
  UNAUTHORIZED: {
    code: "UNAUTHORIZED",
    status: 401,
    message: "Authentification requise",
  },
  FORBIDDEN: { code: "FORBIDDEN", status: 403, message: "Accès refusé" },
  NOT_FOUND: {
    code: "NOT_FOUND",
    status: 404,
    message: "Ressource introuvable",
  },
  VALIDATION_ERROR: {
    code: "VALIDATION_ERROR",
    status: 400,
    message: "Données invalides",
  },
  RATE_LIMITED: {
    code: "RATE_LIMITED",
    status: 429,
    message: "Trop de requêtes",
  },
  INTERNAL_ERROR: {
    code: "INTERNAL_ERROR",
    status: 500,
    message: "Erreur interne",
  },
  BOT_NOT_IN_GUILD: {
    code: "BOT_NOT_IN_GUILD",
    status: 400,
    message: "Le bot n'est pas présent sur ce serveur",
  },
  GUILD_NOT_FOUND: {
    code: "GUILD_NOT_FOUND",
    status: 404,
    message: "Serveur introuvable",
  },
  INSUFFICIENT_PERMISSIONS: {
    code: "INSUFFICIENT_PERMISSIONS",
    status: 403,
    message: "Permissions insuffisantes",
  },
};

module.exports = {
  DISCORD_PERMISSIONS,
  OAUTH_SCOPES,
  DISCORD_API,
  GIVEAWAY_STATUS,
  LOG_TYPES,
  SYSTEM_ROLES,
  LIMITS,
  SUPPORTED_LANGUAGES,
  DEFAULT_GUILD_SETTINGS,
  COMMAND_CATEGORIES,
  API_ERRORS,
};
