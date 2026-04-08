/**
 * Service de gestion des giveaways (concours) par guilde
 * Remplace le système de fichier giveaways.json
 */

const { getDatabase } = require("../database/init");

class GiveawayService {
  constructor() {
    this.db = getDatabase();
  }

  /**
   * Crée un nouveau giveaway
   * @param {object} giveawayData - Données du giveaway
   * @returns {object|null} Giveaway créé ou null
   */
  createGiveaway(giveawayData) {
    try {
      const {
        guildId,
        messageId,
        channelId,
        prize,
        winnersCount,
        endTime,
        creatorId,
        creatorUsername,
      } = giveawayData;

      this.db
        .prepare(
          `
        INSERT INTO giveaways (
          guild_id, message_id, channel_id, prize, winners_count, 
          end_time, creator_id, creator_username, status
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active')
      `
        )
        .run(
          guildId,
          messageId,
          channelId,
          prize,
          winnersCount,
          Math.floor(endTime / 1000),
          creatorId,
          creatorUsername
        );

      console.log(`✅ Giveaway créé: ${prize} dans ${guildId}`);
      return this.getGiveaway(guildId, messageId);
    } catch (error) {
      console.error("❌ Erreur createGiveaway:", error);
      return null;
    }
  }

  /**
   * Récupère un giveaway par son message ID
   * @param {string} guildId - ID de la guilde
   * @param {string} messageId - ID du message Discord
   * @returns {object|null}
   */
  getGiveaway(guildId, messageId) {
    try {
      const giveaway = this.db
        .prepare(
          `
        SELECT * FROM giveaways 
        WHERE guild_id = ? AND message_id = ?
      `
        )
        .get(guildId, messageId);

      if (giveaway) {
        // Parser les JSON
        giveaway.participants = JSON.parse(giveaway.participants || "[]");
        giveaway.winners = giveaway.winners
          ? JSON.parse(giveaway.winners)
          : null;
        // Convertir timestamp en ms
        giveaway.end_time = giveaway.end_time * 1000;
        giveaway.created_at = giveaway.created_at * 1000;
        if (giveaway.ended_at) giveaway.ended_at = giveaway.ended_at * 1000;
      }

      return giveaway;
    } catch (error) {
      console.error("❌ Erreur getGiveaway:", error);
      return null;
    }
  }

  /**
   * Récupère un giveaway par n'importe quel message ID (compatible ancien système)
   * @param {string} messageId - ID du message Discord
   * @returns {object|null}
   */
  getGiveawayByMessageId(messageId) {
    try {
      const giveaway = this.db
        .prepare(
          `
        SELECT * FROM giveaways WHERE message_id = ?
      `
        )
        .get(messageId);

      if (giveaway) {
        giveaway.participants = JSON.parse(giveaway.participants || "[]");
        giveaway.winners = giveaway.winners
          ? JSON.parse(giveaway.winners)
          : null;
        giveaway.end_time = giveaway.end_time * 1000;
        giveaway.created_at = giveaway.created_at * 1000;
        if (giveaway.ended_at) giveaway.ended_at = giveaway.ended_at * 1000;
      }

      return giveaway;
    } catch (error) {
      console.error("❌ Erreur getGiveawayByMessageId:", error);
      return null;
    }
  }

  /**
   * Met à jour un giveaway
   * @param {string} guildId - ID de la guilde
   * @param {string} messageId - ID du message
   * @param {object} updates - Champs à mettre à jour
   * @returns {boolean}
   */
  updateGiveaway(guildId, messageId, updates) {
    try {
      const fields = [];
      const values = [];

      // Construire dynamiquement la requête UPDATE
      if (updates.participants !== undefined) {
        fields.push("participants = ?");
        values.push(JSON.stringify(updates.participants));
      }
      if (updates.winners !== undefined) {
        fields.push("winners = ?");
        values.push(JSON.stringify(updates.winners));
      }
      if (updates.status !== undefined) {
        fields.push("status = ?");
        values.push(updates.status);
      }
      if (updates.prize !== undefined) {
        fields.push("prize = ?");
        values.push(updates.prize);
      }
      if (updates.winners_count !== undefined) {
        fields.push("winners_count = ?");
        values.push(updates.winners_count);
      }
      if (updates.end_time !== undefined) {
        fields.push("end_time = ?");
        // end_time peut être en secondes ou millisecondes, normaliser
        const timestamp =
          updates.end_time > 10000000000
            ? Math.floor(updates.end_time / 1000)
            : updates.end_time;
        values.push(timestamp);
      }

      if (fields.length === 0) return false;

      // Ajouter ended_at si le status passe à "ended" (utilise strftime SQL, pas de placeholder)
      if (updates.status === "ended") {
        fields.push("ended_at = strftime('%s', 'now')");
      }

      values.push(guildId, messageId);

      const query = `
        UPDATE giveaways 
        SET ${fields.join(", ")}
        WHERE guild_id = ? AND message_id = ?
      `;

      this.db.prepare(query).run(...values);
      return true;
    } catch (error) {
      console.error("❌ Erreur updateGiveaway:", error);
      return false;
    }
  }

  /**
   * Ajoute un participant à un giveaway
   * @param {string} guildId - ID de la guilde
   * @param {string} messageId - ID du message
   * @param {string} userId - ID de l'utilisateur
   * @returns {boolean}
   */
  addParticipant(guildId, messageId, userId) {
    try {
      const giveaway = this.getGiveaway(guildId, messageId);
      if (!giveaway || giveaway.status !== "active") return false;

      const participants = giveaway.participants || [];
      if (!participants.includes(userId)) {
        participants.push(userId);
        return this.updateGiveaway(guildId, messageId, { participants });
      }
      return false;
    } catch (error) {
      console.error("❌ Erreur addParticipant:", error);
      return false;
    }
  }

  /**
   * Retire un participant d'un giveaway
   * @param {string} guildId - ID de la guilde
   * @param {string} messageId - ID du message
   * @param {string} userId - ID de l'utilisateur
   * @returns {boolean}
   */
  removeParticipant(guildId, messageId, userId) {
    try {
      const giveaway = this.getGiveaway(guildId, messageId);
      if (!giveaway) return false;

      const participants = giveaway.participants || [];
      const filtered = participants.filter((id) => id !== userId);

      if (filtered.length !== participants.length) {
        return this.updateGiveaway(guildId, messageId, {
          participants: filtered,
        });
      }
      return false;
    } catch (error) {
      console.error("❌ Erreur removeParticipant:", error);
      return false;
    }
  }

  /**
   * Termine un giveaway et définit les gagnants
   * @param {string} guildId - ID de la guilde
   * @param {string} messageId - ID du message
   * @param {Array} winners - IDs des gagnants
   * @returns {boolean}
   */
  endGiveaway(guildId, messageId, winners) {
    try {
      return this.updateGiveaway(guildId, messageId, {
        status: "ended",
        winners: winners,
      });
    } catch (error) {
      console.error("❌ Erreur endGiveaway:", error);
      return false;
    }
  }

  /**
   * Termine un giveaway par son ID (utilisé par le code legacy)
   * @param {number} giveawayId - ID du giveaway en DB
   * @param {Array} winners - IDs des gagnants
   * @returns {boolean}
   */
  endGiveawayById(giveawayId, winners = []) {
    try {
      const query = `
        UPDATE giveaways 
        SET status = 'ended', winners = ?, ended_at = strftime('%s', 'now')
        WHERE id = ?
      `;
      this.db.prepare(query).run(JSON.stringify(winners), giveawayId);
      return true;
    } catch (error) {
      console.error("❌ Erreur endGiveawayById:", error);
      return false;
    }
  }

  /**
   * Met à jour le status d'un giveaway par son ID
   * @param {number} giveawayId - ID du giveaway en DB
   * @param {string} status - Nouveau status ('active', 'ended', 'cancelled')
   * @returns {boolean}
   */
  updateGiveawayStatus(giveawayId, status) {
    try {
      const query = `
        UPDATE giveaways 
        SET status = ?${
          status === "ended" ? ", ended_at = strftime('%s', 'now')" : ""
        }
        WHERE id = ?
      `;
      this.db.prepare(query).run(status, giveawayId);
      return true;
    } catch (error) {
      console.error("❌ Erreur updateGiveawayStatus:", error);
      return false;
    }
  }

  /**
   * Récupère tous les giveaways actifs d'une guilde
   * @param {string} guildId - ID de la guilde
   * @returns {Array}
   */
  getActiveGiveaways(guildId) {
    try {
      const giveaways = this.db
        .prepare(
          `
        SELECT * FROM giveaways 
        WHERE guild_id = ? AND status = 'active'
        ORDER BY end_time ASC
      `
        )
        .all(guildId);

      return giveaways.map((g) => {
        g.participants = JSON.parse(g.participants || "[]");
        g.end_time = g.end_time * 1000;
        g.created_at = g.created_at * 1000;
        return g;
      });
    } catch (error) {
      console.error("❌ Erreur getActiveGiveaways:", error);
      return [];
    }
  }

  /**
   * Récupère tous les giveaways actifs (toutes guildes)
   * @returns {Array}
   */
  getAllActiveGiveaways() {
    try {
      const giveaways = this.db
        .prepare(
          `
        SELECT * FROM giveaways 
        WHERE status = 'active'
        ORDER BY end_time ASC
      `
        )
        .all();

      return giveaways.map((g) => {
        g.participants = JSON.parse(g.participants || "[]");
        g.end_time = g.end_time * 1000;
        g.created_at = g.created_at * 1000;
        return g;
      });
    } catch (error) {
      console.error("❌ Erreur getAllActiveGiveaways:", error);
      return [];
    }
  }

  /**
   * Récupère TOUS les giveaways (actifs et terminés) de toutes les guildes
   * @returns {Array}
   */
  getAllGiveaways() {
    try {
      const giveaways = this.db
        .prepare(
          `
        SELECT * FROM giveaways 
        ORDER BY created_at DESC
      `
        )
        .all();

      return giveaways.map((g) => {
        g.participants = JSON.parse(g.participants || "[]");
        g.winners = g.winners ? JSON.parse(g.winners) : null;
        g.end_time = g.end_time * 1000;
        g.created_at = g.created_at * 1000;
        if (g.ended_at) g.ended_at = g.ended_at * 1000;
        return g;
      });
    } catch (error) {
      console.error("❌ Erreur getAllGiveaways:", error);
      return [];
    }
  }

  /**
   * Récupère le dernier giveaway terminé d'une guilde
   * @param {string} guildId - ID de la guilde
   * @returns {object|null}
   */
  getLastGiveaway(guildId) {
    try {
      const giveaway = this.db
        .prepare(
          `
        SELECT * FROM giveaways 
        WHERE guild_id = ? AND status = 'ended'
        ORDER BY ended_at DESC
        LIMIT 1
      `
        )
        .get(guildId);

      if (giveaway) {
        giveaway.participants = JSON.parse(giveaway.participants || "[]");
        giveaway.winners = giveaway.winners
          ? JSON.parse(giveaway.winners)
          : null;
        giveaway.end_time = giveaway.end_time * 1000;
        giveaway.created_at = giveaway.created_at * 1000;
        if (giveaway.ended_at) giveaway.ended_at = giveaway.ended_at * 1000;
      }

      return giveaway;
    } catch (error) {
      console.error("❌ Erreur getLastGiveaway:", error);
      return null;
    }
  }

  /**
   * Alias pour getLastGiveaway (pour compatibilité)
   * @param {string} guildId - ID de la guilde
   * @returns {object|null}
   */
  getLastEndedGiveaway(guildId) {
    return this.getLastGiveaway(guildId);
  }

  /**
   * Relance les gagnants d'un giveaway (reroll)
   * @param {number} giveawayId - ID du giveaway en DB
   * @param {Array} newWinners - Nouveaux IDs des gagnants
   * @returns {boolean}
   */
  rerollWinners(giveawayId, newWinners) {
    try {
      const query = `
        UPDATE giveaways 
        SET winners = ?
        WHERE id = ?
      `;
      this.db.prepare(query).run(JSON.stringify(newWinners), giveawayId);
      console.log(`✅ Gagnants rerollés pour giveaway ID ${giveawayId}`);
      return true;
    } catch (error) {
      console.error("❌ Erreur rerollWinners:", error);
      return false;
    }
  }

  /**
   * Supprime un giveaway
   * @param {string} guildId - ID de la guilde
   * @param {string} messageId - ID du message
   * @returns {boolean}
   */
  deleteGiveaway(guildId, messageId) {
    try {
      this.db
        .prepare(
          `
        DELETE FROM giveaways 
        WHERE guild_id = ? AND message_id = ?
      `
        )
        .run(guildId, messageId);

      console.log(`✅ Giveaway supprimé: ${messageId} de ${guildId}`);
      return true;
    } catch (error) {
      console.error("❌ Erreur deleteGiveaway:", error);
      return false;
    }
  }

  /**
   * Compte les giveaways actifs d'une guilde
   * @param {string} guildId - ID de la guilde
   * @returns {number}
   */
  countActiveGiveaways(guildId) {
    try {
      const result = this.db
        .prepare(
          `
        SELECT COUNT(*) as count 
        FROM giveaways 
        WHERE guild_id = ? AND status = 'active'
      `
        )
        .get(guildId);

      return result.count;
    } catch (error) {
      console.error("❌ Erreur countActiveGiveaways:", error);
      return 0;
    }
  }
}

module.exports = new GiveawayService();
