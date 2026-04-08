/**
 * Service de gestion des guildes (serveurs Discord)
 * Gère l'auto-insertion et les mises à jour des guildes en base de données
 */

const { getDatabase } = require("../database/init");

class GuildService {
  constructor() {
    this.db = getDatabase();
  }

  /**
   * S'assure qu'une guilde existe en DB, l'insère si nécessaire
   * @param {string} guildId - ID de la guilde Discord
   * @param {string} guildName - Nom de la guilde
   * @returns {object} Guild data
   */
  ensureGuild(guildId, guildName = null) {
    try {
      const existing = this.db
        .prepare("SELECT * FROM guilds WHERE guild_id = ?")
        .get(guildId);

      if (existing) {
        // Mettre à jour le nom si fourni et différent
        if (guildName && existing.guild_name !== guildName) {
          this.db
            .prepare("UPDATE guilds SET guild_name = ? WHERE guild_id = ?")
            .run(guildName, guildId);
        }

        // Réactiver si la guilde était marquée comme inactive
        if (!existing.is_active) {
          this.db
            .prepare(
              "UPDATE guilds SET is_active = 1, left_at = NULL WHERE guild_id = ?"
            )
            .run(guildId);
        }

        return existing;
      }

      // Insérer nouvelle guilde (prefix par défaut: '/')
      const stmt = this.db.prepare(`
        INSERT INTO guilds (guild_id, guild_name, prefix, is_active)
        VALUES (?, ?, '/', 1)
      `);

      stmt.run(guildId, guildName);

      console.log(`✅ Guilde ajoutée en DB: ${guildName || guildId}`);

      return this.getGuild(guildId);
    } catch (error) {
      console.error("❌ Erreur ensureGuild:", error);
      throw error;
    }
  }

  /**
   * Récupère une guilde par son ID
   * @param {string} guildId - ID de la guilde
   * @returns {object|null} Guild data ou null
   */
  getGuild(guildId) {
    try {
      return this.db
        .prepare("SELECT * FROM guilds WHERE guild_id = ?")
        .get(guildId);
    } catch (error) {
      console.error("❌ Erreur getGuild:", error);
      return null;
    }
  }

  /**
   * Récupère toutes les guildes actives
   * @returns {Array} Liste des guildes actives
   */
  getAllActiveGuilds() {
    try {
      return this.db
        .prepare("SELECT * FROM guilds WHERE is_active = 1 ORDER BY guild_name")
        .all();
    } catch (error) {
      console.error("❌ Erreur getAllActiveGuilds:", error);
      return [];
    }
  }

  /**
   * Marque une guilde comme quittée
   * @param {string} guildId - ID de la guilde
   */
  markGuildLeft(guildId) {
    try {
      this.db
        .prepare(
          `
        UPDATE guilds 
        SET is_active = 0, left_at = strftime('%s', 'now')
        WHERE guild_id = ?
      `
        )
        .run(guildId);

      console.log(`⚠️  Guilde marquée comme quittée: ${guildId}`);
    } catch (error) {
      console.error("❌ Erreur markGuildLeft:", error);
    }
  }

  /**
   * Met à jour le nom d'une guilde
   * @param {string} guildId - ID de la guilde
   * @param {string} guildName - Nouveau nom
   */
  updateGuildName(guildId, guildName) {
    try {
      this.db
        .prepare("UPDATE guilds SET guild_name = ? WHERE guild_id = ?")
        .run(guildName, guildId);
    } catch (error) {
      console.error("❌ Erreur updateGuildName:", error);
    }
  }

  /**
   * Compte le nombre de guildes actives
   * @returns {number} Nombre de guildes actives
   */
  countActiveGuilds() {
    try {
      const result = this.db
        .prepare("SELECT COUNT(*) as count FROM guilds WHERE is_active = 1")
        .get();
      return result.count;
    } catch (error) {
      console.error("❌ Erreur countActiveGuilds:", error);
      return 0;
    }
  }

  /**
   * Obtenir le préfixe d'une guilde (toujours '/')
   * @param {string} guildId - ID de la guilde
   * @returns {string} Préfixe de la guilde
   */
  getGuildPrefix(guildId) {
    try {
      const guild = this.db
        .prepare("SELECT prefix FROM guilds WHERE guild_id = ?")
        .get(guildId);
      return guild?.prefix || "/"; // Toujours / par défaut
    } catch (err) {
      console.error("Erreur récupération prefix:", err);
      return "/";
    }
  }

  /**
   * Obtenir les guildes où un utilisateur est owner
   * @param {string} userId - ID de l'utilisateur
   * @returns {Array} Liste des guildes
   */
  getGuildsForUser(userId) {
    try {
      return this.db
        .prepare(
          `
          SELECT DISTINCT g.* FROM guilds g
          INNER JOIN owners o ON g.guild_id = o.guild_id
          WHERE o.user_id = ? AND g.is_active = 1
          ORDER BY g.guild_name
        `
        )
        .all(userId);
    } catch (err) {
      console.error("Erreur récupération guildes user:", err);
      return [];
    }
  }
}

module.exports = new GuildService();
