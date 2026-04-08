/**
 * Service de gestion des logs par guilde
 * Remplace le système de fichier de logs
 */

const { getDatabase } = require("../database/init");

class LogService {
  constructor() {
    this.db = getDatabase();
  }

  /**
   * Enregistre un log dans la base de données
   * @param {string} guildId - ID de la guilde (null pour logs globaux)
   * @param {string} logType - Type de log (INFO, WARN, ERROR, COMMAND, etc.)
   * @param {string} message - Message du log
   * @param {string} userId - ID de l'utilisateur concerné (optionnel)
   * @param {string} channelId - ID du canal concerné (optionnel)
   * @param {object} metadata - Données additionnelles (optionnel)
   * @returns {boolean}
   */
  log(
    guildId,
    logType,
    message,
    userId = null,
    channelId = null,
    metadata = null
  ) {
    try {
      this.db
        .prepare(
          `
        INSERT INTO logs (guild_id, log_type, message, user_id, channel_id, metadata)
        VALUES (?, ?, ?, ?, ?, ?)
      `
        )
        .run(
          guildId,
          logType.toUpperCase(),
          message,
          userId,
          channelId,
          metadata ? JSON.stringify(metadata) : null
        );

      return true;
    } catch (error) {
      console.error("❌ Erreur log:", error);
      return false;
    }
  }

  /**
   * Enregistre un log de type INFO
   * @param {string} guildId - ID de la guilde
   * @param {string} message - Message du log
   * @param {Object} metadata - Données additionnelles (optionnel)
   * @returns {boolean}
   */
  info(guildId, message, metadata = null) {
    return this.log(guildId, "INFO", message, null, null, metadata);
  }

  /**
   * Enregistre un log de type WARN
   * @param {string} guildId - ID de la guilde
   * @param {string} message - Message du log
   * @param {Object} metadata - Données additionnelles (optionnel)
   * @returns {boolean}
   */
  warn(guildId, message, metadata = null) {
    return this.log(guildId, "WARN", message, null, null, metadata);
  }

  /**
   * Enregistre un log de type ERROR
   * @param {string} guildId - ID de la guilde
   * @param {string} message - Message du log
   * @param {Object} metadata - Données additionnelles (optionnel)
   * @returns {boolean}
   */
  error(guildId, message, metadata = null) {
    return this.log(guildId, "ERROR", message, null, null, metadata);
  }

  /**
   * Enregistre un log de type COMMAND
   * @param {string} guildId - ID de la guilde
   * @param {string} message - Message du log
   * @param {string} userId - ID de l'utilisateur
   * @param {string} channelId - ID du canal
   * @param {Object} metadata - Données additionnelles (optionnel)
   * @returns {boolean}
   */
  command(guildId, message, userId, channelId, metadata = null) {
    return this.log(guildId, "COMMAND", message, userId, channelId, metadata);
  }

  /**
   * Récupère les logs d'une guilde
   * @param {string} guildId - ID de la guilde (null pour logs globaux)
   * @param {number} limit - Nombre maximum de logs
   * @param {string} logType - Filtrer par type (optionnel)
   * @returns {Array}
   */
  getLogs(guildId = null, limit = 100, logType = null) {
    try {
      let query = "SELECT * FROM logs WHERE 1=1";
      const params = [];

      if (guildId !== null) {
        query += " AND guild_id = ?";
        params.push(guildId);
      }

      if (logType) {
        query += " AND log_type = ?";
        params.push(logType.toUpperCase());
      }

      query += " ORDER BY timestamp DESC LIMIT ?";
      params.push(limit);

      const logs = this.db.prepare(query).all(...params);

      // Parser metadata et convertir timestamp
      return logs.map((log) => ({
        ...log,
        timestamp: log.timestamp * 1000,
        metadata: log.metadata ? JSON.parse(log.metadata) : null,
      }));
    } catch (error) {
      console.error("❌ Erreur getLogs:", error);
      return [];
    }
  }

  /**
   * Récupère les logs avec pagination
   * @param {string} guildId - ID de la guilde
   * @param {number} page - Numéro de page (commence à 1)
   * @param {number} perPage - Logs par page
   * @returns {object}
   */
  getLogsPaginated(guildId = null, page = 1, perPage = 50) {
    try {
      const offset = (page - 1) * perPage;

      let countQuery = "SELECT COUNT(*) as count FROM logs WHERE 1=1";
      let dataQuery = "SELECT * FROM logs WHERE 1=1";
      const params = [];

      if (guildId !== null) {
        countQuery += " AND guild_id = ?";
        dataQuery += " AND guild_id = ?";
        params.push(guildId);
      }

      const totalCount = this.db.prepare(countQuery).get(...params).count;

      dataQuery += " ORDER BY timestamp DESC LIMIT ? OFFSET ?";
      const logs = this.db.prepare(dataQuery).all(...params, perPage, offset);

      return {
        logs: logs.map((log) => ({
          ...log,
          timestamp: log.timestamp * 1000,
          metadata: log.metadata ? JSON.parse(log.metadata) : null,
        })),
        page,
        perPage,
        totalCount,
        totalPages: Math.ceil(totalCount / perPage),
      };
    } catch (error) {
      console.error("❌ Erreur getLogsPaginated:", error);
      return {
        logs: [],
        page,
        perPage,
        totalCount: 0,
        totalPages: 0,
      };
    }
  }

  /**
   * Compte les logs d'une guilde
   * @param {string} guildId - ID de la guilde
   * @param {string} logType - Filtrer par type (optionnel)
   * @returns {number}
   */
  countLogs(guildId = null, logType = null) {
    try {
      let query = "SELECT COUNT(*) as count FROM logs WHERE 1=1";
      const params = [];

      if (guildId !== null) {
        query += " AND guild_id = ?";
        params.push(guildId);
      }

      if (logType) {
        query += " AND log_type = ?";
        params.push(logType.toUpperCase());
      }

      const result = this.db.prepare(query).get(...params);
      return result.count;
    } catch (error) {
      console.error("❌ Erreur countLogs:", error);
      return 0;
    }
  }

  /**
   * Nettoie les vieux logs (plus anciens que X jours)
   * @param {number} days - Nombre de jours à conserver
   * @returns {number} Nombre de logs supprimés
   */
  cleanOldLogs(days = 30) {
    try {
      const cutoffTimestamp =
        Math.floor(Date.now() / 1000) - days * 24 * 60 * 60;

      const result = this.db
        .prepare(
          `
        DELETE FROM logs WHERE timestamp < ?
      `
        )
        .run(cutoffTimestamp);

      console.log(
        `✅ ${result.changes} logs supprimés (plus vieux que ${days} jours)`
      );
      return result.changes;
    } catch (error) {
      console.error("❌ Erreur cleanOldLogs:", error);
      return 0;
    }
  }

  /**
   * Supprime tous les logs d'une guilde
   * @param {string} guildId - ID de la guilde
   * @returns {number} Nombre de logs supprimés
   */
  clearGuildLogs(guildId) {
    try {
      const result = this.db
        .prepare("DELETE FROM logs WHERE guild_id = ?")
        .run(guildId);

      console.log(`✅ ${result.changes} logs supprimés pour ${guildId}`);
      return result.changes;
    } catch (error) {
      console.error("❌ Erreur clearGuildLogs:", error);
      return 0;
    }
  }

  /**
   * Recherche dans les logs
   * @param {string} searchTerm - Terme de recherche
   * @param {string} guildId - ID de la guilde (optionnel)
   * @param {number} limit - Limite de résultats
   * @returns {Array}
   */
  searchLogs(searchTerm, guildId = null, limit = 100) {
    try {
      let query = "SELECT * FROM logs WHERE message LIKE ?";
      const params = [`%${searchTerm}%`];

      if (guildId) {
        query += " AND guild_id = ?";
        params.push(guildId);
      }

      query += " ORDER BY timestamp DESC LIMIT ?";
      params.push(limit);

      const logs = this.db.prepare(query).all(...params);

      return logs.map((log) => ({
        ...log,
        timestamp: log.timestamp * 1000,
        metadata: log.metadata ? JSON.parse(log.metadata) : null,
      }));
    } catch (error) {
      console.error("❌ Erreur searchLogs:", error);
      return [];
    }
  }
}

module.exports = new LogService();
