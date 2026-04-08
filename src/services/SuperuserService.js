/**
 * Service de gestion des superusers (droits globaux cross-guild)
 * Les superusers ont accès à toutes les guildes sans restriction
 */

const { getDatabase } = require("../database/init");
const UserService = require("./UserService");

class SuperuserService {
  constructor() {
    this.db = getDatabase();
  }

  /**
   * Vérifie si un utilisateur est superuser
   * @param {string} userId - ID de l'utilisateur
   * @returns {boolean}
   */
  isSuperuser(userId) {
    try {
      const result = this.db
        .prepare(
          `
        SELECT COUNT(*) as count 
        FROM superusers 
        WHERE user_id = ?
      `
        )
        .get(userId);

      return result.count > 0;
    } catch (error) {
      console.error("❌ Erreur isSuperuser:", error);
      return false;
    }
  }

  /**
   * Ajoute un superuser
   * @param {string} userId - ID de l'utilisateur
   * @param {string} username - Nom d'utilisateur (optionnel)
   * @returns {boolean} Succès de l'opération
   */
  addSuperuser(userId, username = null) {
    try {
      // S'assurer que l'utilisateur existe en DB
      UserService.ensureUser(userId, username);

      // Vérifier s'il n'est pas déjà superuser
      if (this.isSuperuser(userId)) {
        console.log(`⚠️  ${username || userId} est déjà superuser`);
        return false;
      }

      // Ajouter comme superuser
      this.db
        .prepare(
          `
        INSERT INTO superusers (user_id, username)
        VALUES (?, ?)
      `
        )
        .run(userId, username);

      console.log(`✅ Superuser ajouté: ${username || userId}`);
      return true;
    } catch (error) {
      console.error("❌ Erreur addSuperuser:", error);
      return false;
    }
  }

  /**
   * Retire le statut de superuser à un utilisateur
   * @param {string} userId - ID de l'utilisateur
   * @returns {boolean} Succès de l'opération
   */
  removeSuperuser(userId) {
    try {
      const result = this.db
        .prepare(
          `
        DELETE FROM superusers 
        WHERE user_id = ?
      `
        )
        .run(userId);

      if (result.changes > 0) {
        console.log(`✅ Superuser retiré: ${userId}`);
        return true;
      }

      console.log(`⚠️  ${userId} n'était pas superuser`);
      return false;
    } catch (error) {
      console.error("❌ Erreur removeSuperuser:", error);
      return false;
    }
  }

  /**
   * Récupère la liste de tous les superusers
   * @returns {Array} Liste des superusers
   */
  getAllSuperusers() {
    try {
      return this.db
        .prepare(
          `
        SELECT user_id, username, added_at
        FROM superusers 
        ORDER BY added_at ASC
      `
        )
        .all();
    } catch (error) {
      console.error("❌ Erreur getAllSuperusers:", error);
      return [];
    }
  }

  /**
   * Compte le nombre de superusers
   * @returns {number}
   */
  countSuperusers() {
    try {
      const result = this.db
        .prepare(
          `
        SELECT COUNT(*) as count 
        FROM superusers
      `
        )
        .get();

      return result.count;
    } catch (error) {
      console.error("❌ Erreur countSuperusers:", error);
      return 0;
    }
  }
}

module.exports = new SuperuserService();
