/**
 * Service de gestion des owners (administrateurs bot par guilde)
 * Remplace le système de fichier owners.json
 */

const { getDatabase } = require("../database/init");
const UserService = require("./UserService");

class OwnerService {
  constructor() {
    this.db = getDatabase();
  }

  /**
   * Vérifie si un utilisateur est owner dans une guilde
   * @param {string} guildId - ID de la guilde
   * @param {string} userId - ID de l'utilisateur
   * @returns {boolean}
   */
  isOwner(guildId, userId) {
    try {
      const result = this.db
        .prepare(
          `
        SELECT COUNT(*) as count 
        FROM owners 
        WHERE guild_id = ? AND user_id = ?
      `
        )
        .get(guildId, userId);

      return result.count > 0;
    } catch (error) {
      console.error("❌ Erreur isOwner:", error);
      return false;
    }
  }

  /**
   * Ajoute un owner à une guilde
   * @param {string} guildId - ID de la guilde
   * @param {string} userId - ID de l'utilisateur à promouvoir
   * @param {string} username - Nom d'utilisateur (optionnel)
   * @param {string} addedBy - ID de celui qui ajoute (optionnel)
   * @returns {boolean} Succès de l'opération
   */
  addOwner(guildId, userId, username = null, addedBy = null) {
    try {
      // S'assurer que l'utilisateur existe en DB
      UserService.ensureUser(userId, username);

      // Vérifier s'il n'est pas déjà owner
      if (this.isOwner(guildId, userId)) {
        console.log(`⚠️  ${username || userId} est déjà owner dans ${guildId}`);
        return false;
      }

      // Ajouter comme owner
      this.db
        .prepare(
          `
        INSERT INTO owners (guild_id, user_id, username, added_by)
        VALUES (?, ?, ?, ?)
      `
        )
        .run(guildId, userId, username, addedBy);

      console.log(`✅ Owner ajouté: ${username || userId} dans ${guildId}`);
      return true;
    } catch (error) {
      console.error("❌ Erreur addOwner:", error);
      return false;
    }
  }

  /**
   * Retire le statut d'owner à un utilisateur dans une guilde
   * @param {string} guildId - ID de la guilde
   * @param {string} userId - ID de l'utilisateur
   * @returns {boolean} Succès de l'opération
   */
  removeOwner(guildId, userId) {
    try {
      const result = this.db
        .prepare(
          `
        DELETE FROM owners 
        WHERE guild_id = ? AND user_id = ?
      `
        )
        .run(guildId, userId);

      if (result.changes > 0) {
        console.log(`✅ Owner retiré: ${userId} de ${guildId}`);
        return true;
      }

      console.log(`⚠️  ${userId} n'était pas owner dans ${guildId}`);
      return false;
    } catch (error) {
      console.error("❌ Erreur removeOwner:", error);
      return false;
    }
  }

  /**
   * Récupère la liste des owners d'une guilde
   * @param {string} guildId - ID de la guilde
   * @returns {Array} Liste des owners (user_id, username)
   */
  getOwners(guildId) {
    try {
      return this.db
        .prepare(
          `
        SELECT user_id, username, added_at, added_by
        FROM owners 
        WHERE guild_id = ?
        ORDER BY added_at ASC
      `
        )
        .all(guildId);
    } catch (error) {
      console.error("❌ Erreur getOwners:", error);
      return [];
    }
  }

  /**
   * Récupère la liste simple des usernames owners d'une guilde
   * Compatible avec l'ancien système pour éviter de casser le code existant
   * @param {string} guildId - ID de la guilde
   * @returns {Array<string>} Liste des usernames
   */
  getOwnerUsernames(guildId) {
    try {
      const owners = this.getOwners(guildId);
      return owners.map((o) => o.username).filter(Boolean);
    } catch (error) {
      console.error("❌ Erreur getOwnerUsernames:", error);
      return [];
    }
  }

  /**
   * Compte le nombre d'owners dans une guilde
   * @param {string} guildId - ID de la guilde
   * @returns {number}
   */
  countOwners(guildId) {
    try {
      const result = this.db
        .prepare(
          `
        SELECT COUNT(*) as count 
        FROM owners 
        WHERE guild_id = ?
      `
        )
        .get(guildId);

      return result.count;
    } catch (error) {
      console.error("❌ Erreur countOwners:", error);
      return 0;
    }
  }

  /**
   * Récupère toutes les guildes où un utilisateur est owner
   * @param {string} userId - ID de l'utilisateur
   * @returns {Array} Liste des guild_id
   */
  getGuildsWhereOwner(userId) {
    try {
      const guilds = this.db
        .prepare(
          `
        SELECT guild_id 
        FROM owners 
        WHERE user_id = ?
      `
        )
        .all(userId);

      return guilds.map((g) => g.guild_id);
    } catch (error) {
      console.error("❌ Erreur getGuildsWhereOwner:", error);
      return [];
    }
  }
}

module.exports = new OwnerService();
