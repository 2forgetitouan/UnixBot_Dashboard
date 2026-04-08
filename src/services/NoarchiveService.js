/**
 * Service de gestion du système noarchive (protection des forums par guilde)
 * Remplace le système de fichier noarchive.json
 */

const { getDatabase } = require("../database/init");

class NoarchiveService {
  constructor() {
    this.db = getDatabase();
  }

  /**
   * Vérifie si un forum est protégé contre l'archivage dans une guilde
   * @param {string} guildId - ID de la guilde
   * @param {string} forumId - ID du forum
   * @returns {boolean}
   */
  isForumProtected(guildId, forumId) {
    try {
      const result = this.db
        .prepare(
          `
        SELECT COUNT(*) as count 
        FROM noarchive_forums 
        WHERE guild_id = ? AND forum_id = ?
      `
        )
        .get(guildId, forumId);

      return result.count > 0;
    } catch (error) {
      console.error("❌ Erreur isForumProtected:", error);
      return false;
    }
  }

  /**
   * Protège un forum contre l'archivage automatique
   * @param {string} guildId - ID de la guilde
   * @param {string} forumId - ID du forum
   * @param {string} addedBy - ID de l'utilisateur qui ajoute (optionnel)
   * @returns {boolean} Succès de l'opération
   */
  protectForum(guildId, forumId, addedBy = null) {
    try {
      // Vérifier si déjà protégé
      if (this.isForumProtected(guildId, forumId)) {
        console.log(`⚠️  Forum ${forumId} déjà protégé dans ${guildId}`);
        return false;
      }

      // Ajouter la protection
      this.db
        .prepare(
          `
        INSERT INTO noarchive_forums (guild_id, forum_id, added_by)
        VALUES (?, ?, ?)
      `
        )
        .run(guildId, forumId, addedBy);

      console.log(`✅ Forum protégé: ${forumId} dans ${guildId}`);
      return true;
    } catch (error) {
      console.error("❌ Erreur protectForum:", error);
      return false;
    }
  }

  /**
   * Retire la protection d'archivage d'un forum
   * @param {string} guildId - ID de la guilde
   * @param {string} forumId - ID du forum
   * @returns {boolean} Succès de l'opération
   */
  allowArchive(guildId, forumId) {
    try {
      const result = this.db
        .prepare(
          `
        DELETE FROM noarchive_forums 
        WHERE guild_id = ? AND forum_id = ?
      `
        )
        .run(guildId, forumId);

      if (result.changes > 0) {
        console.log(`✅ Protection retirée: ${forumId} dans ${guildId}`);
        return true;
      }

      console.log(`⚠️  Forum ${forumId} n'était pas protégé dans ${guildId}`);
      return false;
    } catch (error) {
      console.error("❌ Erreur allowArchive:", error);
      return false;
    }
  }

  /**
   * Récupère la liste des forums protégés d'une guilde
   * @param {string} guildId - ID de la guilde
   * @returns {Array} Liste des forum_id protégés
   */
  getProtectedForums(guildId) {
    try {
      const forums = this.db
        .prepare(
          `
        SELECT forum_id, added_at, added_by
        FROM noarchive_forums 
        WHERE guild_id = ?
        ORDER BY added_at ASC
      `
        )
        .all(guildId);

      return forums.map((f) => f.forum_id);
    } catch (error) {
      console.error("❌ Erreur getProtectedForums:", error);
      return [];
    }
  }

  /**
   * Active ou désactive l'auto-désarchivage pour une guilde
   * @param {string} guildId - ID de la guilde
   * @param {boolean} enabled - true pour activer, false pour désactiver
   * @returns {boolean} Succès de l'opération
   */
  setAutoUnarchive(guildId, enabled) {
    try {
      // Vérifier si une config existe déjà
      const existing = this.db
        .prepare(
          `
        SELECT * FROM noarchive_config WHERE guild_id = ?
      `
        )
        .get(guildId);

      if (existing) {
        // Mettre à jour
        this.db
          .prepare(
            `
          UPDATE noarchive_config 
          SET auto_unarchive = ?, updated_at = strftime('%s', 'now')
          WHERE guild_id = ?
        `
          )
          .run(enabled ? 1 : 0, guildId);
      } else {
        // Créer
        this.db
          .prepare(
            `
          INSERT INTO noarchive_config (guild_id, auto_unarchive)
          VALUES (?, ?)
        `
          )
          .run(guildId, enabled ? 1 : 0);
      }

      console.log(
        `✅ Auto-unarchive ${enabled ? "activé" : "désactivé"} pour ${guildId}`
      );
      return true;
    } catch (error) {
      console.error("❌ Erreur setAutoUnarchive:", error);
      return false;
    }
  }

  /**
   * Vérifie si l'auto-désarchivage est activé pour une guilde
   * @param {string} guildId - ID de la guilde
   * @returns {boolean}
   */
  shouldAutoUnarchive(guildId) {
    try {
      const config = this.db
        .prepare(
          `
        SELECT auto_unarchive FROM noarchive_config WHERE guild_id = ?
      `
        )
        .get(guildId);

      return config ? Boolean(config.auto_unarchive) : false;
    } catch (error) {
      console.error("❌ Erreur shouldAutoUnarchive:", error);
      return false;
    }
  }

  /**
   * Récupère l'état complet de la config noarchive d'une guilde
   * Compatible avec l'ancien getState() pour éviter de casser le code existant
   * @param {string} guildId - ID de la guilde
   * @returns {object} État complet { protectedForums: [], autoUnarchive: boolean }
   */
  getState(guildId) {
    try {
      return {
        protectedForums: this.getProtectedForums(guildId),
        autoUnarchive: this.shouldAutoUnarchive(guildId),
      };
    } catch (error) {
      console.error("❌ Erreur getState:", error);
      return {
        protectedForums: [],
        autoUnarchive: false,
      };
    }
  }

  /**
   * Compte le nombre de forums protégés dans une guilde
   * @param {string} guildId - ID de la guilde
   * @returns {number}
   */
  countProtectedForums(guildId) {
    try {
      const result = this.db
        .prepare(
          `
        SELECT COUNT(*) as count 
        FROM noarchive_forums 
        WHERE guild_id = ?
      `
        )
        .get(guildId);

      return result.count;
    } catch (error) {
      console.error("❌ Erreur countProtectedForums:", error);
      return 0;
    }
  }
}

module.exports = new NoarchiveService();
