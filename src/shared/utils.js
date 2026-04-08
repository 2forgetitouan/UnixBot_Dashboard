/**
 * Utilitaires partagés entre Bot, API et Web
 * @module shared/utils
 */

const { DISCORD_API, DISCORD_PERMISSIONS } = require("./constants");

/**
 * Formate un tag Discord (username#discriminator ou juste username)
 * @param {Object} user - Objet utilisateur Discord
 * @returns {string} Tag formaté
 */
function formatUserTag(user) {
  if (!user) return "Inconnu";
  if (user.discriminator === "0" || user.discriminator === "0000") {
    return user.username;
  }
  return `${user.username}#${user.discriminator}`;
}

/**
 * Génère l'URL de l'avatar Discord
 * @param {Object} user - Objet utilisateur avec id et avatar
 * @param {number} size - Taille de l'avatar (64, 128, 256, 512, 1024)
 * @returns {string} URL de l'avatar
 */
function getAvatarUrl(user, size = 256) {
  if (!user) return "";
  if (user.avatar) {
    const ext = user.avatar.startsWith("a_") ? "gif" : "png";
    return `${DISCORD_API.CDN}/avatars/${user.id}/${user.avatar}.${ext}?size=${size}`;
  }
  // Avatar par défaut Discord
  const defaultIndex =
    user.discriminator === "0"
      ? (BigInt(user.id) >> 22n) % 6n
      : Number(user.discriminator) % 5;
  return `${DISCORD_API.CDN}/embed/avatars/${defaultIndex}.png`;
}

/**
 * Génère l'URL de l'icône d'un serveur
 * @param {Object} guild - Objet serveur avec id et icon
 * @param {number} size - Taille de l'icône
 * @returns {string|null} URL de l'icône ou null
 */
function getGuildIconUrl(guild, size = 256) {
  if (!guild || !guild.icon) return null;
  const ext = guild.icon.startsWith("a_") ? "gif" : "png";
  return `${DISCORD_API.CDN}/icons/${guild.id}/${guild.icon}.${ext}?size=${size}`;
}

/**
 * Vérifie si un utilisateur a la permission ADMINISTRATOR sur un serveur
 * @param {string|number} permissions - Bitfield des permissions
 * @returns {boolean}
 */
function hasAdminPermission(permissions) {
  const permBigInt = BigInt(permissions);
  return (permBigInt & BigInt(DISCORD_PERMISSIONS.ADMINISTRATOR)) !== 0n;
}

/**
 * Vérifie si un utilisateur peut gérer le serveur (ADMINISTRATOR ou MANAGE_GUILD)
 * @param {string|number} permissions - Bitfield des permissions
 * @returns {boolean}
 */
function canManageGuild(permissions) {
  const permBigInt = BigInt(permissions);
  const adminBit = BigInt(DISCORD_PERMISSIONS.ADMINISTRATOR);
  const manageGuildBit = BigInt(DISCORD_PERMISSIONS.MANAGE_GUILD);
  return (permBigInt & adminBit) !== 0n || (permBigInt & manageGuildBit) !== 0n;
}

/**
 * Sanitize une adresse IP (retire le préfixe IPv6 des IPv4)
 * @param {string} ip - Adresse IP
 * @returns {string}
 */
function sanitizeIp(ip) {
  if (!ip) return "Inconnue";
  return ip.replace(/^::ffff:/, "").trim();
}

/**
 * Extrait l'IP client depuis les headers
 * @param {Object} req - Requête Express
 * @returns {string}
 */
function getClientIp(req) {
  const forwarded =
    req.headers["x-forwarded-for"] ||
    req.headers["cf-connecting-ip"] ||
    req.headers["x-real-ip"];

  if (forwarded) {
    const first = Array.isArray(forwarded)
      ? forwarded[0]
      : forwarded.split(",")[0];
    if (first) return sanitizeIp(first);
  }
  return sanitizeIp(req.ip || "");
}

/**
 * Génère un ID unique
 * @param {number} length - Longueur de l'ID
 * @returns {string}
 */
function generateId(length = 16) {
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

/**
 * Parse une durée en millisecondes
 * @param {string} duration - Durée (ex: "1d", "2h", "30m", "1w")
 * @returns {number|null} Millisecondes ou null si invalide
 */
function parseDuration(duration) {
  if (!duration || typeof duration !== "string") return null;

  const match = duration.match(/^(\d+)(s|m|h|d|w)$/i);
  if (!match) return null;

  const value = parseInt(match[1], 10);
  const unit = match[2].toLowerCase();

  const multipliers = {
    s: 1000,
    m: 60 * 1000,
    h: 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000,
    w: 7 * 24 * 60 * 60 * 1000,
  };

  return value * multipliers[unit];
}

/**
 * Formate une durée en texte lisible
 * @param {number} ms - Millisecondes
 * @returns {string}
 */
function formatDuration(ms) {
  if (!ms || ms < 0) return "0s";

  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}j ${hours % 24}h`;
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
}

/**
 * Formate un timestamp en date lisible
 * @param {number} timestamp - Timestamp Unix (secondes ou millisecondes)
 * @param {string} locale - Locale (fr, en, etc.)
 * @returns {string}
 */
function formatDate(timestamp, locale = "fr-FR") {
  // Convertir en millisecondes si nécessaire
  const ms = timestamp < 10000000000 ? timestamp * 1000 : timestamp;
  return new Date(ms).toLocaleString(locale, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Tronque un texte avec ellipsis
 * @param {string} text - Texte à tronquer
 * @param {number} maxLength - Longueur maximale
 * @returns {string}
 */
function truncate(text, maxLength = 100) {
  if (!text || text.length <= maxLength) return text || "";
  return text.substring(0, maxLength - 3) + "...";
}

/**
 * Échappe les caractères HTML dangereux
 * @param {string} text - Texte à échapper
 * @returns {string}
 */
function escapeHtml(text) {
  if (!text) return "";
  const htmlEntities = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  };
  return text.replace(/[&<>"']/g, (char) => htmlEntities[char]);
}

/**
 * Délai asynchrone
 * @param {number} ms - Millisecondes
 * @returns {Promise<void>}
 */
function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Retry une fonction avec backoff exponentiel
 * @param {Function} fn - Fonction à exécuter
 * @param {number} maxRetries - Nombre max de tentatives
 * @param {number} baseDelay - Délai de base en ms
 * @returns {Promise<any>}
 */
async function retryWithBackoff(fn, maxRetries = 3, baseDelay = 1000) {
  let lastError;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt < maxRetries - 1) {
        const delayMs = baseDelay * Math.pow(2, attempt);
        await delay(delayMs);
      }
    }
  }
  throw lastError;
}

module.exports = {
  formatUserTag,
  getAvatarUrl,
  getGuildIconUrl,
  hasAdminPermission,
  canManageGuild,
  sanitizeIp,
  getClientIp,
  generateId,
  parseDuration,
  formatDuration,
  formatDate,
  truncate,
  escapeHtml,
  delay,
  retryWithBackoff,
};
