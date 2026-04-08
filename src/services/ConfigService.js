/**
 * Service de gestion des configurations
 * Gère la config globale (superuser) et la config par guilde (owners)
 */

const { getDatabase } = require("../database/init");

class ConfigService {
  constructor() {
    this.db = getDatabase();
  }

  // ============================================
  // CONFIGURATION GLOBALE (superuser uniquement)
  // ============================================

  /**
   * Obtenir une valeur de config globale
   * @param {string} key - Clé de configuration
   * @param {string} defaultValue - Valeur par défaut si non trouvée
   * @returns {string} Valeur de la configuration
   */
  getGlobalConfig(key, defaultValue = null) {
    try {
      const row = this.db
        .prepare("SELECT value FROM global_config WHERE key = ?")
        .get(key);

      return row ? row.value : defaultValue;
    } catch (err) {
      console.error("Erreur lecture config globale:", err);
      return defaultValue;
    }
  }

  /**
   * Définir une valeur de config globale
   * @param {string} key - Clé de configuration
   * @param {string} value - Valeur
   * @param {string} userId - ID du superuser qui modifie
   */
  setGlobalConfig(key, value, userId) {
    try {
      const now = Math.floor(Date.now() / 1000);
      this.db
        .prepare(
          `
          INSERT INTO global_config (key, value, updated_at, updated_by)
          VALUES (?, ?, ?, ?)
          ON CONFLICT(key) 
          DO UPDATE SET value = ?, updated_at = ?, updated_by = ?
        `
        )
        .run(key, value, now, userId, value, now, userId);

      console.log(`✅ Config globale "${key}" = "${value}"`);
      return true;
    } catch (err) {
      console.error("Erreur écriture config globale:", err);
      return false;
    }
  }

  /**
   * Obtenir toutes les configs globales
   * @returns {Array} Liste des configurations
   */
  getAllGlobalConfig() {
    try {
      return this.db.prepare("SELECT * FROM global_config ORDER BY key").all();
    } catch (err) {
      console.error("Erreur lecture configs globales:", err);
      return [];
    }
  }

  /**
   * Supprimer une config globale
   * @param {string} key - Clé à supprimer
   */
  deleteGlobalConfig(key) {
    try {
      this.db.prepare("DELETE FROM global_config WHERE key = ?").run(key);
      console.log(`✅ Config globale "${key}" supprimée`);
      return true;
    } catch (err) {
      console.error("Erreur suppression config globale:", err);
      return false;
    }
  }

  // ============================================
  // CONFIGURATION PAR GUILD (owners)
  // ============================================

  /**
   * Obtenir une valeur de config pour une guilde
   * @param {string} guildId - ID de la guilde
   * @param {string} key - Clé de configuration
   * @param {string} defaultValue - Valeur par défaut
   * @returns {string} Valeur de la configuration
   */
  getGuildConfig(guildId, key, defaultValue = null) {
    try {
      const row = this.db
        .prepare(
          `
          SELECT value FROM guild_config 
          WHERE guild_id = ? AND key = ?
        `
        )
        .get(guildId, key);

      return row ? row.value : defaultValue;
    } catch (err) {
      console.error("Erreur lecture config guilde:", err);
      return defaultValue;
    }
  }

  /**
   * Définir une valeur de config pour une guilde
   * @param {string} guildId - ID de la guilde
   * @param {string} key - Clé de configuration
   * @param {string} value - Valeur
   * @param {string} userId - ID de l'owner qui modifie
   */
  setGuildConfig(guildId, key, value, userId) {
    try {
      const now = Math.floor(Date.now() / 1000);
      this.db
        .prepare(
          `
          INSERT INTO guild_config (guild_id, key, value, updated_at, updated_by)
          VALUES (?, ?, ?, ?, ?)
          ON CONFLICT(guild_id, key) 
          DO UPDATE SET value = ?, updated_at = ?, updated_by = ?
        `
        )
        .run(guildId, key, value, now, userId, value, now, userId);

      console.log(`✅ Config guilde ${guildId} "${key}" = "${value}"`);
      return true;
    } catch (err) {
      console.error("Erreur écriture config guilde:", err);
      return false;
    }
  }

  /**
   * Obtenir toutes les configs d'une guilde
   * @param {string} guildId - ID de la guilde
   * @returns {Array} Liste des configurations
   */
  getAllGuildConfig(guildId) {
    try {
      return this.db
        .prepare("SELECT * FROM guild_config WHERE guild_id = ? ORDER BY key")
        .all(guildId);
    } catch (err) {
      console.error("Erreur lecture configs guilde:", err);
      return [];
    }
  }

  /**
   * Supprimer une config de guilde
   * @param {string} guildId - ID de la guilde
   * @param {string} key - Clé à supprimer
   */
  deleteGuildConfig(guildId, key) {
    try {
      this.db
        .prepare("DELETE FROM guild_config WHERE guild_id = ? AND key = ?")
        .run(guildId, key);

      console.log(`✅ Config guilde ${guildId} "${key}" supprimée`);
      return true;
    } catch (err) {
      console.error("Erreur suppression config guilde:", err);
      return false;
    }
  }

  /**
   * Supprimer toutes les configs d'une guilde
   * @param {string} guildId - ID de la guilde
   */
  resetGuildConfig(guildId) {
    try {
      this.db
        .prepare("DELETE FROM guild_config WHERE guild_id = ?")
        .run(guildId);

      console.log(`✅ Configs guilde ${guildId} réinitialisées`);
      return true;
    } catch (err) {
      console.error("Erreur réinitialisation configs guilde:", err);
      return false;
    }
  }
}

// Export singleton
module.exports = new ConfigService();
