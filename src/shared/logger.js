/**
 * Utilitaire de logging (compatible avec l'ancien système)
 * Utilise maintenant LogService avec stockage en base de données SQLite
 * Supporte le logging par guilde
 */

const LogService = require("../services/LogService");

/**
 * Enregistre un log
 * @param {string} type - Type de log (INFO, WARN, ERROR, etc.)
 * @param {string} message - Message du log
 * @param {object} meta - Métadonnées additionnelles (guildId, userId, channelId, etc.)
 */
function log(type, message, meta = {}) {
  const now = new Date();

  // Format HH:MM:SS pour l'affichage terminal
  const hours = String(now.getHours()).padStart(2, "0");
  const minutes = String(now.getMinutes()).padStart(2, "0");
  const seconds = String(now.getSeconds()).padStart(2, "0");
  const displayTime = `${hours}:${minutes}:${seconds}`;

  // Extraire les données pour la DB
  const guildId = meta.guildId || null;
  const userId = meta.userId || null;
  const channelId = meta.channelId || null;

  // Nettoyer meta des champs spéciaux
  const metadata = { ...meta };
  delete metadata.guildId;
  delete metadata.userId;
  delete metadata.channelId;

  // Sauvegarder en DB
  LogService.log(
    guildId,
    type,
    message,
    userId,
    channelId,
    Object.keys(metadata).length > 0 ? metadata : null
  );

  // Afficher dans le terminal
  console.log(`[${displayTime}] [${type}] ${message}`, meta);
}

/**
 * Récupère les logs
 * @param {number} limit - Nombre maximum de logs
 * @param {string} guildId - ID de la guilde (optionnel, null pour logs globaux)
 * @returns {Array}
 */
function getLogs(limit = 100, guildId = null) {
  const logs = LogService.getLogs(guildId, limit);

  // Convertir au format de l'ancien système pour compatibilité
  return logs.map((log) => ({
    time: new Date(log.timestamp).toISOString(),
    type: log.log_type,
    message: log.message,
    ...(log.user_id && { userId: log.user_id }),
    ...(log.channel_id && { channelId: log.channel_id }),
    ...(log.metadata && log.metadata),
  }));
}

module.exports = { log, getLogs };
