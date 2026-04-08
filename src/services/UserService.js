/**
 * Service de gestion des utilisateurs Discord
 * Gère l'auto-insertion et les mises à jour des utilisateurs et leur liaison aux guildes
 */

const { getDatabase } = require("../database/init");

class UserService {
  constructor() {
    this.db = getDatabase();
  }

  /**
   * S'assure qu'un utilisateur existe en DB, l'insère si nécessaire
   * @param {string} userId - ID de l'utilisateur Discord
   * @param {string} username - Nom d'utilisateur
   * @param {string} discriminator - Discriminateur (peut être null)
   * @returns {object} User data
   */
  ensureUser(userId, username = null, discriminator = null) {
    try {
      const existing = this.db
        .prepare("SELECT * FROM users WHERE user_id = ?")
        .get(userId);

      if (existing) {
        // Mettre à jour last_seen et username si fourni
        this.db
          .prepare(
            `
          UPDATE users 
          SET username = COALESCE(?, username),
              discriminator = COALESCE(?, discriminator),
              last_seen = strftime('%s', 'now')
          WHERE user_id = ?
        `
          )
          .run(username, discriminator, userId);

        return existing;
      }

      // Insérer nouvel utilisateur
      this.db
        .prepare(
          `
        INSERT INTO users (user_id, username, discriminator)
        VALUES (?, ?, ?)
      `
        )
        .run(userId, username, discriminator);

      console.log(`✅ Utilisateur ajouté en DB: ${username || userId}`);

      return this.getUser(userId);
    } catch (error) {
      console.error("❌ Erreur ensureUser:", error);
      throw error;
    }
  }

  /**
   * Récupère un utilisateur par son ID
   * @param {string} userId - ID de l'utilisateur
   * @returns {object|null} User data ou null
   */
  getUser(userId) {
    try {
      return this.db
        .prepare("SELECT * FROM users WHERE user_id = ?")
        .get(userId);
    } catch (error) {
      console.error("❌ Erreur getUser:", error);
      return null;
    }
  }

  /**
   * Lie un utilisateur à une guilde (membre rejoint)
   * @param {string} guildId - ID de la guilde
   * @param {string} userId - ID de l'utilisateur
   */
  ensureGuildMember(guildId, userId) {
    try {
      const existing = this.db
        .prepare(
          `
        SELECT * FROM guild_users 
        WHERE guild_id = ? AND user_id = ?
      `
        )
        .get(guildId, userId);

      if (existing) {
        // Réactiver si le membre était marqué comme parti
        if (!existing.is_member) {
          this.db
            .prepare(
              `
            UPDATE guild_users 
            SET is_member = 1, left_at = NULL 
            WHERE guild_id = ? AND user_id = ?
          `
            )
            .run(guildId, userId);
        }
        return existing;
      }

      // Ajouter nouveau membre
      this.db
        .prepare(
          `
        INSERT INTO guild_users (guild_id, user_id, is_member)
        VALUES (?, ?, 1)
      `
        )
        .run(guildId, userId);

      console.log(`✅ Membre lié à la guilde: ${userId} -> ${guildId}`);
    } catch (error) {
      console.error("❌ Erreur ensureGuildMember:", error);
    }
  }

  /**
   * Marque un membre comme ayant quitté une guilde
   * @param {string} guildId - ID de la guilde
   * @param {string} userId - ID de l'utilisateur
   */
  markMemberLeft(guildId, userId) {
    try {
      this.db
        .prepare(
          `
        UPDATE guild_users 
        SET is_member = 0, left_at = strftime('%s', 'now')
        WHERE guild_id = ? AND user_id = ?
      `
        )
        .run(guildId, userId);
    } catch (error) {
      console.error("❌ Erreur markMemberLeft:", error);
    }
  }

  /**
   * Vérifie si un utilisateur est membre d'une guilde
   * @param {string} guildId - ID de la guilde
   * @param {string} userId - ID de l'utilisateur
   * @returns {boolean}
   */
  isGuildMember(guildId, userId) {
    try {
      const result = this.db
        .prepare(
          `
        SELECT is_member FROM guild_users 
        WHERE guild_id = ? AND user_id = ?
      `
        )
        .get(guildId, userId);

      return result ? Boolean(result.is_member) : false;
    } catch (error) {
      console.error("❌ Erreur isGuildMember:", error);
      return false;
    }
  }

  /**
   * Compte le nombre de membres actifs d'une guilde
   * @param {string} guildId - ID de la guilde
   * @returns {number}
   */
  countGuildMembers(guildId) {
    try {
      const result = this.db
        .prepare(
          `
        SELECT COUNT(*) as count FROM guild_users 
        WHERE guild_id = ? AND is_member = 1
      `
        )
        .get(guildId);
      return result.count;
    } catch (error) {
      console.error("❌ Erreur countGuildMembers:", error);
      return 0;
    }
  }
}

module.exports = new UserService();
