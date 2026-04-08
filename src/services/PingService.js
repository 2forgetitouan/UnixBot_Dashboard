/**
 * Service de gestion de l'historique de ping (monitoring global du bot)
 * Remplace le système de fichier pingHistory.json
 */

const { getDatabase } = require("../database/init");

class PingService {
  constructor() {
    this.db = getDatabase();
    this.maxDataPoints = 2880; // 24h de données avec 30s d'intervalle
  }

  /**
   * Ajoute un point de données de ping
   * @param {number} pingMs - Latence en millisecondes
   * @param {number} wsPingMs - Latence WebSocket (optionnel)
   * @returns {boolean}
   */
  addPingData(pingMs, wsPingMs = null) {
    try {
      this.db
        .prepare(
          `
        INSERT INTO ping_history (ping_ms, ws_ping_ms)
        VALUES (?, ?)
      `
        )
        .run(pingMs, wsPingMs);

      // Nettoyer les anciennes données si nécessaire
      this.cleanOldData();

      return true;
    } catch (error) {
      console.error("❌ Erreur addPingData:", error);
      return false;
    }
  }

  /**
   * Récupère l'historique de ping
   * @param {number} limit - Nombre maximum de points à récupérer
   * @returns {Array}
   */
  getPingHistory(limit = 100) {
    try {
      const history = this.db
        .prepare(
          `
        SELECT timestamp, ping_ms, ws_ping_ms 
        FROM ping_history 
        ORDER BY timestamp DESC 
        LIMIT ?
      `
        )
        .all(limit);

      // Convertir timestamp en ms
      return history.map((h) => ({
        timestamp: h.timestamp * 1000,
        ping: h.ping_ms,
        wsPing: h.ws_ping_ms,
      }));
    } catch (error) {
      console.error("❌ Erreur getPingHistory:", error);
      return [];
    }
  }

  /**
   * Récupère toutes les données de ping (pour compatibilité)
   * @returns {object}
   */
  getAllPingData() {
    try {
      const history = this.getPingHistory(this.maxDataPoints);

      return {
        history: history,
        startTime:
          history.length > 0
            ? history[history.length - 1].timestamp
            : Date.now(),
        lastUpdate: history.length > 0 ? history[0].timestamp : null,
      };
    } catch (error) {
      console.error("❌ Erreur getAllPingData:", error);
      return {
        history: [],
        startTime: Date.now(),
        lastUpdate: null,
      };
    }
  }

  /**
   * Nettoie les anciennes données au-delà de maxDataPoints
   */
  cleanOldData() {
    try {
      // Garder seulement les N derniers points
      this.db
        .prepare(
          `
        DELETE FROM ping_history 
        WHERE id NOT IN (
          SELECT id FROM ping_history 
          ORDER BY timestamp DESC 
          LIMIT ?
        )
      `
        )
        .run(this.maxDataPoints);
    } catch (error) {
      console.error("❌ Erreur cleanOldData:", error);
    }
  }

  /**
   * Calcule la latence moyenne sur une période
   * @param {number} minutes - Nombre de minutes à analyser
   * @returns {object}
   */
  getAveragePing(minutes = 60) {
    try {
      const sinceTimestamp = Math.floor(Date.now() / 1000) - minutes * 60;

      const result = this.db
        .prepare(
          `
        SELECT 
          AVG(ping_ms) as avg_ping,
          MIN(ping_ms) as min_ping,
          MAX(ping_ms) as max_ping,
          AVG(ws_ping_ms) as avg_ws_ping,
          COUNT(*) as count
        FROM ping_history 
        WHERE timestamp >= ?
      `
        )
        .get(sinceTimestamp);

      return {
        average: Math.round(result.avg_ping || 0),
        min: result.min_ping || 0,
        max: result.max_ping || 0,
        averageWs: result.avg_ws_ping ? Math.round(result.avg_ws_ping) : null,
        count: result.count,
      };
    } catch (error) {
      console.error("❌ Erreur getAveragePing:", error);
      return {
        average: 0,
        min: 0,
        max: 0,
        averageWs: null,
        count: 0,
      };
    }
  }

  /**
   * Récupère les statistiques de ping
   * @returns {object}
   */
  getStats() {
    try {
      const last24h = this.getAveragePing(1440); // 24 heures
      const last1h = this.getAveragePing(60);
      const last5m = this.getAveragePing(5);

      return {
        last5Minutes: last5m,
        lastHour: last1h,
        last24Hours: last24h,
      };
    } catch (error) {
      console.error("❌ Erreur getStats:", error);
      return {
        last5Minutes: { average: 0, count: 0 },
        lastHour: { average: 0, count: 0 },
        last24Hours: { average: 0, count: 0 },
      };
    }
  }

  /**
   * Compte le nombre total de points de données
   * @returns {number}
   */
  countDataPoints() {
    try {
      const result = this.db
        .prepare("SELECT COUNT(*) as count FROM ping_history")
        .get();
      return result.count;
    } catch (error) {
      console.error("❌ Erreur countDataPoints:", error);
      return 0;
    }
  }

  /**
   * Supprime toutes les données de ping (reset)
   */
  clearAll() {
    try {
      this.db.prepare("DELETE FROM ping_history").run();
      console.log("✅ Historique de ping effacé");
      return true;
    } catch (error) {
      console.error("❌ Erreur clearAll:", error);
      return false;
    }
  }
}

module.exports = new PingService();
