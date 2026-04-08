/**
 * Service de gestion des giveaways
 * @module api/services/GiveawayService
 */

const { getDatabase } = require("../../database/init");
const { GIVEAWAY_STATUS, LIMITS } = require("../../shared/constants");
const bridge = require("../../shared/botBridge");
const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require("discord.js");

class GiveawayService {
  constructor() {
    this.db = getDatabase();
  }

  /**
   * Récupérer le client Discord (mode direct uniquement, null en remote)
   */
  getDiscordClient() {
    return bridge.getClient();
  }

  /**
   * Crée un nouveau giveaway (format API)
   * @param {Object} data - Données du giveaway
   * @returns {Object} Giveaway créé
   */
  async createGiveaway(data) {
    const {
      guild_id: guildId,
      channel_id: channelId,
      prize,
      description,
      ends_at: endsAt,
      winners_count: winnersCount = 1,
      host_id: creatorId,
    } = data;

    // Validation
    if (!guildId || !channelId || !prize) {
      throw new Error("Données manquantes (guildId, channelId, prize)");
    }

    if (winnersCount > LIMITS.MAX_WINNERS_PER_GIVEAWAY) {
      throw new Error(
        `Maximum ${LIMITS.MAX_WINNERS_PER_GIVEAWAY} gagnants autorisés`
      );
    }

    const endTime = endsAt instanceof Date ? endsAt : new Date(endsAt);
    const duration = endTime - Date.now();

    if (duration < LIMITS.MIN_GIVEAWAY_DURATION_MS) {
      throw new Error("La durée minimale est de 1 minute");
    }
    if (duration > LIMITS.MAX_GIVEAWAY_DURATION_MS) {
      throw new Error("La durée maximale est de 30 jours");
    }

    // Vérifier le quota de giveaways
    const activeCount = this.db
      .prepare(
        `
      SELECT COUNT(*) as count FROM giveaways 
      WHERE guild_id = ? AND status = 'active'
    `
      )
      .get(guildId);

    if (activeCount.count >= LIMITS.MAX_GIVEAWAYS_PER_GUILD) {
      throw new Error(
        `Maximum ${LIMITS.MAX_GIVEAWAYS_PER_GUILD} giveaways actifs par serveur`
      );
    }

    // Récupérer le client Discord (mode direct) ou utiliser le bridge
    const client = this.getDiscordClient();
    if (!client) {
      // Mode remote — vérifier disponibilité via bridge
      const available = await bridge.isAvailable();
      if (!available) throw new Error("Bot Discord non disponible");
    }

    // Récupérer l'utilisateur organisateur
    let organizerName = "Inconnu";
    try {
      if (client) {
        const organizer = await client.users.fetch(creatorId);
        organizerName = organizer.username;
      } else {
        const user = await bridge.fetchUser(creatorId);
        if (user) organizerName = user.username;
      }
    } catch (e) {
      console.warn("Impossible de récupérer l'organisateur");
    }

    // Construire la description de l'embed
    let embedDescription = `\n**🎁 Lot à gagner**\n> ${prize}\n`;
    if (description) {
      embedDescription += `\n*${description}*\n`;
    }

    // Créer l'embed du giveaway (style Draftbot)
    const embed = new EmbedBuilder()
      .setTitle("🎊 GIVEAWAY EN COURS 🎊")
      .setDescription(embedDescription)
      .setColor("#5865F2")
      .addFields(
        {
          name: "👑 Nombre de gagnants",
          value: `\`\`\`${winnersCount} gagnant(s)\`\`\``,
          inline: true,
        },
        {
          name: "⏱️ Temps restant",
          value: `\`\`\`${this._formatTimeLeft(endTime.getTime())}\`\`\``,
          inline: true,
        },
        {
          name: "👥 Participants",
          value: `\`\`\`0 participant(s)\`\`\``,
          inline: true,
        },
        {
          name: "📅 Fin du giveaway",
          value: `<t:${Math.floor(endTime.getTime() / 1000)}:F>`,
          inline: false,
        }
      )
      .setFooter({ text: `Organisé par ${organizerName}` })
      .setTimestamp(endTime)
      .setThumbnail(
        "https://cdn.discordapp.com/emojis/1067086714991456326.gif"
      );

    // Créer le bouton de participation
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`giveaway_join_temp`)
        .setLabel("🎉 Participer")
        .setStyle(ButtonStyle.Success)
    );

    // Envoyer le message Discord via le bridge ou directement
    let messageId;
    if (client) {
      const channel = await client.channels.fetch(channelId).catch(() => null);
      if (!channel) throw new Error("Salon Discord introuvable");
      const message = await channel.send({ embeds: [embed], components: [row] });
      messageId = message.id;

      // Mettre à jour le bouton avec le bon customId
      const updatedRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`giveaway_join_${message.id}`)
          .setLabel("🎉 Participer")
          .setStyle(ButtonStyle.Success)
      );
      await message.edit({ components: [updatedRow] });
    } else {
      // Mode remote : envoyer via bridge
      const result = await bridge.sendGiveawayMessage(guildId, channelId, embed.toJSON(), [row.toJSON()]);
      messageId = result.messageId;

      // Mettre à jour le bouton
      const updatedRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`giveaway_join_${messageId}`)
          .setLabel("🎉 Participer")
          .setStyle(ButtonStyle.Success)
      );
      await bridge.editMessage(guildId, channelId, messageId, { components: [updatedRow.toJSON()] });
    }

    // Sauvegarder en base de données avec le vrai messageId
    const query = `
      INSERT INTO giveaways (
        guild_id, message_id, channel_id, prize, description,
        winners_count, end_time, creator_id, status
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active')
    `;

    this.db
      .prepare(query)
      .run(
        guildId,
        messageId,
        channelId,
        prize,
        description || null,
        winnersCount,
        Math.floor(endTime.getTime() / 1000),
        creatorId
      );

    console.log(
      `✅ Giveaway créé: ${prize} dans ${guildId} (Message: ${message.id})`
    );
    return this.getByMessageId(message.id);
  }

  create(data) {
    const {
      guildId,
      messageId,
      channelId,
      prize,
      description,
      imageUrl,
      winnersCount,
      endTime,
      creatorId,
      creatorUsername,
      requiredRoles,
      blacklistedRoles,
      minAccountAgeDays,
    } = data;

    // Validation
    if (winnersCount > LIMITS.MAX_WINNERS_PER_GIVEAWAY) {
      throw new Error(
        `Maximum ${LIMITS.MAX_WINNERS_PER_GIVEAWAY} gagnants autorisés`
      );
    }

    const duration = endTime - Date.now();
    if (duration < LIMITS.MIN_GIVEAWAY_DURATION_MS) {
      throw new Error("La durée minimale est de 1 minute");
    }
    if (duration > LIMITS.MAX_GIVEAWAY_DURATION_MS) {
      throw new Error("La durée maximale est de 30 jours");
    }

    // Vérifier le quota de giveaways
    const activeCount = this.db
      .prepare(
        `
      SELECT COUNT(*) as count FROM giveaways 
      WHERE guild_id = ? AND status = 'active'
    `
      )
      .get(guildId);

    if (activeCount.count >= LIMITS.MAX_GIVEAWAYS_PER_GUILD) {
      throw new Error(
        `Maximum ${LIMITS.MAX_GIVEAWAYS_PER_GUILD} giveaways actifs par serveur`
      );
    }

    this.db
      .prepare(
        `
      INSERT INTO giveaways (
        guild_id, message_id, channel_id, prize, description, image_url,
        winners_count, end_time, creator_id, creator_username,
        required_roles, blacklisted_roles, min_account_age_days, status
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')
    `
      )
      .run(
        guildId,
        messageId,
        channelId,
        prize,
        description || null,
        imageUrl || null,
        winnersCount,
        Math.floor(endTime / 1000),
        creatorId,
        creatorUsername,
        JSON.stringify(requiredRoles || []),
        JSON.stringify(blacklistedRoles || []),
        minAccountAgeDays || 0
      );

    console.log(`✅ Giveaway créé: ${prize} dans ${guildId}`);
    return this.getByMessageId(messageId);
  }

  /**
   * Récupère un giveaway par message ID
   * @param {string} messageId - ID du message
   * @returns {Object|null} Giveaway
   */
  /**
   * Récupère un giveaway par ID (format API)
   * @param {string} guildId - ID du serveur
   * @param {string} giveawayId - ID du giveaway
   * @returns {Object|null} Giveaway
   */
  getGiveaway(guildId, giveawayId) {
    try {
      const giveaway = this.db
        .prepare("SELECT * FROM giveaways WHERE id = ? AND guild_id = ?")
        .get(giveawayId, guildId);

      if (!giveaway) return null;
      return this._parseGiveaway(giveaway);
    } catch (error) {
      console.error("Erreur getGiveaway:", error);
      return null;
    }
  }

  /**
   * Met à jour un giveaway (format API)
   * @param {string} guildId - ID du serveur
   * @param {string} giveawayId - ID du giveaway
   * @param {Object} updates - Champs à mettre à jour
   * @returns {Object} Giveaway mis à jour
   */
  async updateGiveaway(guildId, giveawayId, updates) {
    const giveaway = this.getGiveaway(guildId, giveawayId);
    if (!giveaway) throw new Error("Giveaway introuvable");

    // Normaliser les champs
    const normalizedUpdates = { ...updates };

    // Supporter end_time comme alias de ends_at
    if (normalizedUpdates.end_time) {
      normalizedUpdates.end_time = new Date(
        normalizedUpdates.end_time
      ).getTime();
    } else if (normalizedUpdates.ends_at) {
      normalizedUpdates.end_time = new Date(
        normalizedUpdates.ends_at
      ).getTime();
      delete normalizedUpdates.ends_at;
    }

    // Utiliser la méthode existante 'update'
    const updated = this.update(giveaway.message_id, normalizedUpdates);

    // Mettre à jour le message Discord si le giveaway est actif
    if (giveaway.status === "active") {
      try {
        await this.updateGiveawayEmbed(giveaway.message_id);
      } catch (error) {
        console.warn(
          "Erreur lors de la mise à jour du message Discord:",
          error.message
        );
      }
    }

    return updated;
  }

  /**
   * Met à jour l'embed Discord d'un giveaway
   * @param {string} messageId - ID du message
   */
  async updateGiveawayEmbed(messageId) {
    const giveaway = this.getByMessageId(messageId);
    if (!giveaway) return;

    const client = this.getDiscordClient();

    try {
      // Parser les participants
      let participantsCount = 0;
      try {
        const participants =
          typeof giveaway.participants === "string"
            ? JSON.parse(giveaway.participants || "[]")
            : giveaway.participants || [];
        participantsCount = participants.length;
      } catch (e) {
        participantsCount = 0;
      }

      const endTime = new Date(giveaway.ends_at);

      // Récupérer l'organisateur
      let organizerName = "Inconnu";
      try {
        if (client) {
          const organizer = await client.users.fetch(giveaway.creator_id);
          organizerName = organizer.username;
        } else {
          const user = await bridge.fetchUser(giveaway.creator_id);
          if (user) organizerName = user.username;
        }
      } catch (e) {}

      // Construire la description
      let description = `\n**🎁 Lot à gagner**\n> ${giveaway.prize}\n`;
      if (giveaway.description) {
        description += `\n*${giveaway.description}*\n`;
      }

      // Créer le nouvel embed
      const { EmbedBuilder } = require("discord.js");
      const embed = new EmbedBuilder()
        .setTitle("🎊 GIVEAWAY EN COURS 🎊")
        .setDescription(description)
        .setColor("#5865F2")
        .addFields(
          {
            name: "👑 Nombre de gagnants",
            value: `\`\`\`${giveaway.winners_count} gagnant(s)\`\`\``,
            inline: true,
          },
          {
            name: "⏱️ Temps restant",
            value: `\`\`\`${this._formatTimeLeft(endTime.getTime())}\`\`\``,
            inline: true,
          },
          {
            name: "👥 Participants",
            value: `\`\`\`${participantsCount} participant(s)\`\`\``,
            inline: true,
          },
          {
            name: "📅 Fin du giveaway",
            value: `<t:${Math.floor(endTime.getTime() / 1000)}:F>`,
            inline: false,
          }
        )
        .setFooter({ text: `Organisé par ${organizerName}` })
        .setTimestamp(endTime)
        .setThumbnail(
          "https://cdn.discordapp.com/emojis/1067086714991456326.gif"
        );

      // Éditer le message via client direct ou bridge
      if (client) {
        const channel = await client.channels.fetch(giveaway.channel_id).catch(() => null);
        if (!channel) return;
        const message = await channel.messages.fetch(messageId).catch(() => null);
        if (!message) return;
        await message.edit({ embeds: [embed] });
      } else {
        await bridge.editMessage(giveaway.guild_id, giveaway.channel_id, messageId, {
          embed: embed.toJSON(),
        });
      }
    } catch (error) {
      console.warn("Erreur updateGiveawayEmbed:", error.message);
    }
  }

  /**
   * Supprime un giveaway (format API)
   * @param {string} guildId - ID du serveur
   * @param {string} giveawayId - ID du giveaway
   * @returns {boolean} Succès
   */
  async deleteGiveaway(guildId, giveawayId) {
    const giveaway = this.getGiveaway(guildId, giveawayId);
    if (!giveaway) throw new Error("Giveaway introuvable");

    // Supprimer le message Discord seulement si le giveaway n'est pas terminé
    // Pour les giveaways terminés, on garde le message mais on supprime l'entrée DB
    if (giveaway.status === "active" || giveaway.status === "paused") {
      try {
        const client = this.getDiscordClient();
        if (giveaway.channel_id && giveaway.message_id) {
          if (client) {
            const channel = await client.channels
              .fetch(giveaway.channel_id)
              .catch(() => null);
            if (channel) {
              const message = await channel.messages
                .fetch(giveaway.message_id)
                .catch(() => null);
              if (message) {
                await message.delete().catch((err) => {
                  console.warn(
                    `Impossible de supprimer le message Discord: ${err.message}`
                  );
                });
              }
            }
          } else {
            // Mode remote : éditer le message pour indiquer la suppression
            await bridge.editMessage(guildId, giveaway.channel_id, giveaway.message_id, {
              content: "🗑️ Giveaway annulé.",
              components: [],
            }).catch(() => {});
          }
        }
      } catch (error) {
        console.warn(
          "Erreur lors de la suppression du message Discord:",
          error.message
        );
      }
    }

    // Supprimer de la base de données
    this.db
      .prepare("DELETE FROM giveaways WHERE id = ? AND guild_id = ?")
      .run(giveawayId, guildId);

    console.log(`✅ Giveaway supprimé: ${giveawayId} depuis ${guildId}`);
    return true;
  }

  /**
   * Termine un giveaway (format API)
   * @param {string} guildId - ID du serveur
   * @param {string} giveawayId - ID du giveaway
   * @returns {Object} Giveaway terminé
   */
  endGiveaway(guildId, giveawayId) {
    const giveaway = this.getGiveaway(guildId, giveawayId);
    if (!giveaway) throw new Error("Giveaway introuvable");

    return this.end(giveaway.message_id);
  }

  /**
   * Met en pause un giveaway (format API)
   * @param {string} guildId - ID du serveur
   * @param {string} giveawayId - ID du giveaway
   * @returns {Object} Giveaway en pause
   */
  pauseGiveaway(guildId, giveawayId) {
    const giveaway = this.getGiveaway(guildId, giveawayId);
    if (!giveaway) throw new Error("Giveaway introuvable");

    return this.pause(giveaway.message_id);
  }

  /**
   * Reprend un giveaway (format API)
   * @param {string} guildId - ID du serveur
   * @param {string} giveawayId - ID du giveaway
   * @returns {Object} Giveaway repris
   */
  resumeGiveaway(guildId, giveawayId) {
    const giveaway = this.getGiveaway(guildId, giveawayId);
    if (!giveaway) throw new Error("Giveaway introuvable");

    return this.resume(giveaway.message_id);
  }

  /**
   * Reroll un giveaway (format API)
   * @param {string} guildId - ID du serveur
   * @param {string} giveawayId - ID du giveaway
   * @param {number} count - Nombre de nouveaux gagnants
   * @returns {Object} Giveaway avec nouveaux gagnants
   */
  rerollGiveaway(guildId, giveawayId, count = 1) {
    const giveaway = this.getGiveaway(guildId, giveawayId);
    if (!giveaway) throw new Error("Giveaway introuvable");

    return this.reroll(giveaway.message_id, count);
  }

  /**
   * Récupère les participants d'un giveaway (format API)
   * @param {string} guildId - ID du serveur
   * @param {string} giveawayId - ID du giveaway
   * @param {Object} options - Options de pagination
   * @returns {Object} { participants, total, page, limit }
   */
  getParticipants(guildId, giveawayId, options = {}) {
    const { page = 1, limit = 50 } = options;
    const offset = (page - 1) * limit;

    const giveaway = this.getGiveaway(guildId, giveawayId);
    if (!giveaway) throw new Error("Giveaway introuvable");

    // Les participants sont déjà parsés et normalisés par _parseGiveaway
    const allParticipants = Array.isArray(giveaway.participants)
      ? giveaway.participants
      : [];

    const total = allParticipants.length;
    const participants = allParticipants.slice(offset, offset + limit);

    return {
      participants,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }
  getByMessageId(messageId) {
    const giveaway = this.db
      .prepare(
        `
      SELECT * FROM giveaways WHERE message_id = ?
    `
      )
      .get(messageId);

    return giveaway ? this._parseGiveaway(giveaway) : null;
  }

  /**
   * Récupère un giveaway par ID
   * @param {number} id - ID du giveaway
   * @returns {Object|null} Giveaway
   */
  getById(id) {
    const giveaway = this.db
      .prepare(
        `
      SELECT * FROM giveaways WHERE id = ?
    `
      )
      .get(id);

    return giveaway ? this._parseGiveaway(giveaway) : null;
  }

  /**
   * Récupère tous les giveaways d'une guilde
   * @param {string} guildId - ID de la guilde
   * @param {Object} options - Options de filtrage
   * @returns {Array} Giveaways
   */
  getByGuild(guildId, options = {}) {
    const { status, limit = 50, offset = 0 } = options;

    let query = "SELECT * FROM giveaways WHERE guild_id = ?";
    const params = [guildId];

    if (status) {
      query += " AND status = ?";
      params.push(status);
    }

    query += " ORDER BY created_at DESC LIMIT ? OFFSET ?";
    params.push(limit, offset);

    return this.db
      .prepare(query)
      .all(...params)
      .map((g) => this._parseGiveaway(g));
  }

  /**
   * Récupère les giveaways d'un serveur avec pagination
   * @param {string} guildId - ID du serveur
   * @param {Object} options - Options (status, page, limit)
   * @returns {Object} { giveaways, total }
   */
  getGuildGiveaways(guildId, options = {}) {
    const { status, page = 1, limit = 20 } = options;
    const offset = (page - 1) * limit;

    // Compter le total
    let countQuery =
      "SELECT COUNT(*) as count FROM giveaways WHERE guild_id = ?";
    const countParams = [guildId];

    if (status) {
      countQuery += " AND status = ?";
      countParams.push(status);
    }

    const { count: total } = this.db.prepare(countQuery).get(...countParams);

    // Récupérer les giveaways
    let query = "SELECT * FROM giveaways WHERE guild_id = ?";
    const params = [guildId];

    if (status) {
      query += " AND status = ?";
      params.push(status);
    }

    query += " ORDER BY created_at DESC LIMIT ? OFFSET ?";
    params.push(limit, offset);

    const giveaways = this.db
      .prepare(query)
      .all(...params)
      .map((g) => this._parseGiveaway(g));

    return { giveaways, total };
  }

  /**
   * Récupère les giveaways actifs qui doivent se terminer
   * @returns {Array} Giveaways à terminer
   */
  getExpiredGiveaways() {
    const now = Math.floor(Date.now() / 1000);

    return this.db
      .prepare(
        `
      SELECT * FROM giveaways 
      WHERE status = 'active' AND end_time <= ?
    `
      )
      .all(now)
      .map((g) => this._parseGiveaway(g));
  }

  /**
   * Ajoute un participant
   * @param {string} messageId - ID du message
   * @param {string} participantId - ID du participant
   * @returns {boolean} Succès
   */
  addParticipant(messageId, participantId) {
    const giveaway = this.db
      .prepare(
        `
      SELECT participants FROM giveaways WHERE message_id = ? AND status = 'active'
    `
      )
      .get(messageId);

    if (!giveaway) return false;

    const participants = JSON.parse(giveaway.participants || "[]");
    if (participants.includes(participantId)) return false;

    participants.push(participantId);

    this.db
      .prepare(
        `
      UPDATE giveaways SET participants = ? WHERE message_id = ?
    `
      )
      .run(JSON.stringify(participants), messageId);

    return true;
  }

  /**
   * Retire un participant
   * @param {string} messageId - ID du message
   * @param {string} participantId - ID du participant
   * @returns {boolean} Succès
   */
  removeParticipant(messageId, participantId) {
    const giveaway = this.db
      .prepare(
        `
      SELECT participants FROM giveaways WHERE message_id = ?
    `
      )
      .get(messageId);

    if (!giveaway) return false;

    let participants = JSON.parse(giveaway.participants || "[]");
    const index = participants.indexOf(participantId);
    if (index === -1) return false;

    participants.splice(index, 1);

    this.db
      .prepare(
        `
      UPDATE giveaways SET participants = ? WHERE message_id = ?
    `
      )
      .run(JSON.stringify(participants), messageId);

    return true;
  }

  /**
   * Termine un giveaway et sélectionne les gagnants
   * @param {string} messageId - ID du message
   * @returns {Object} Giveaway avec gagnants
   */
  end(messageId) {
    const giveaway = this.getByMessageId(messageId);
    if (!giveaway) throw new Error("Giveaway introuvable");
    if (giveaway.status !== GIVEAWAY_STATUS.ACTIVE) {
      throw new Error("Ce giveaway n'est pas actif");
    }

    // Sélectionner les gagnants
    const winners = this._selectWinners(
      giveaway.participants,
      giveaway.winners_count
    );

    this.db
      .prepare(
        `
      UPDATE giveaways SET 
        status = 'ended',
        winners = ?,
        ended_at = strftime('%s', 'now')
      WHERE message_id = ?
    `
      )
      .run(JSON.stringify(winners), messageId);

    return this.getByMessageId(messageId);
  }

  /**
   * Reroll un giveaway (resélectionne les gagnants)
   * @param {string} messageId - ID du message
   * @param {number} count - Nombre de nouveaux gagnants
   * @returns {Object} Giveaway avec nouveaux gagnants
   */
  reroll(messageId, count = 1) {
    const giveaway = this.getByMessageId(messageId);
    if (!giveaway) throw new Error("Giveaway introuvable");
    if (giveaway.status !== GIVEAWAY_STATUS.ENDED) {
      throw new Error("Ce giveaway n'est pas terminé");
    }

    // Exclure les anciens gagnants
    const eligibleParticipants = giveaway.participants.filter(
      (p) => !giveaway.winners.includes(p)
    );

    const newWinners = this._selectWinners(eligibleParticipants, count);

    // Ajouter aux gagnants existants
    const allWinners = [...giveaway.winners, ...newWinners];

    this.db
      .prepare(
        `
      UPDATE giveaways SET winners = ? WHERE message_id = ?
    `
      )
      .run(JSON.stringify(allWinners), messageId);

    return this.getByMessageId(messageId);
  }

  /**
   * Annule un giveaway
   * @param {string} messageId - ID du message
   * @returns {Object} Giveaway annulé
   */
  cancel(messageId) {
    const giveaway = this.getByMessageId(messageId);
    if (!giveaway) throw new Error("Giveaway introuvable");

    this.db
      .prepare(
        `
      UPDATE giveaways SET status = 'cancelled', ended_at = strftime('%s', 'now')
      WHERE message_id = ?
    `
      )
      .run(messageId);

    return this.getByMessageId(messageId);
  }

  /**
   * Met en pause un giveaway
   * @param {string} messageId - ID du message
   * @returns {Object} Giveaway mis en pause
   */
  pause(messageId) {
    const giveaway = this.getByMessageId(messageId);
    if (!giveaway) throw new Error("Giveaway introuvable");
    if (giveaway.status !== GIVEAWAY_STATUS.ACTIVE) {
      throw new Error("Ce giveaway n'est pas actif");
    }

    this.db
      .prepare(
        `
      UPDATE giveaways SET status = 'paused', paused_at = strftime('%s', 'now')
      WHERE message_id = ?
    `
      )
      .run(messageId);

    return this.getByMessageId(messageId);
  }

  /**
   * Reprend un giveaway en pause
   * @param {string} messageId - ID du message
   * @param {number} additionalTime - Temps supplémentaire en ms
   * @returns {Object} Giveaway repris
   */
  resume(messageId, additionalTime = 0) {
    const giveaway = this.getByMessageId(messageId);
    if (!giveaway) throw new Error("Giveaway introuvable");
    if (giveaway.status !== GIVEAWAY_STATUS.PAUSED) {
      throw new Error("Ce giveaway n'est pas en pause");
    }

    // Calculer le nouveau temps de fin
    const pauseDuration = Date.now() - (giveaway.paused_at || Date.now());
    const newEndTime = giveaway.end_time + pauseDuration + additionalTime;

    this.db
      .prepare(
        `
      UPDATE giveaways SET 
        status = 'active',
        end_time = ?,
        paused_at = NULL
      WHERE message_id = ?
    `
      )
      .run(Math.floor(newEndTime / 1000), messageId);

    return this.getByMessageId(messageId);
  }

  /**
   * Met à jour un giveaway
   * @param {string} messageId - ID du message
   * @param {Object} updates - Champs à mettre à jour
   * @returns {Object} Giveaway mis à jour
   */
  update(messageId, updates) {
    const allowedFields = [
      "prize",
      "description",
      "image_url",
      "winners_count",
      "end_time",
      "required_roles",
      "blacklisted_roles",
      "min_account_age_days",
    ];

    const updateParts = [];
    const values = [];

    for (const [key, value] of Object.entries(updates)) {
      if (allowedFields.includes(key)) {
        updateParts.push(`${key} = ?`);
        if (key === "required_roles" || key === "blacklisted_roles") {
          values.push(JSON.stringify(value));
        } else if (key === "end_time") {
          values.push(Math.floor(value / 1000));
        } else {
          values.push(value);
        }
      }
    }

    if (updateParts.length === 0) return this.getByMessageId(messageId);

    values.push(messageId);

    this.db
      .prepare(
        `
      UPDATE giveaways SET ${updateParts.join(", ")} WHERE message_id = ?
    `
      )
      .run(...values);

    return this.getByMessageId(messageId);
  }

  /**
   * Supprime un giveaway
   * @param {string} messageId - ID du message
   * @returns {boolean} Succès
   */
  delete(messageId) {
    const result = this.db
      .prepare(
        `
      DELETE FROM giveaways WHERE message_id = ?
    `
      )
      .run(messageId);

    return result.changes > 0;
  }

  /**
   * Parse un giveaway depuis la DB
   * @private
   */
  _parseGiveaway(giveaway) {
    if (!giveaway) return null;

    // Parser les participants de manière sécurisée
    let participants = [];
    try {
      participants = JSON.parse(giveaway.participants || "[]");
    } catch (e) {
      participants = [];
    }

    // Parser les gagnants de manière sécurisée
    let winners = null;
    try {
      winners = giveaway.winners ? JSON.parse(giveaway.winners) : null;
    } catch (e) {
      winners = null;
    }

    // Déterminer le statut réel (un giveaway actif peut être expiré)
    const now = Date.now();
    const endTime = giveaway.end_time * 1000;
    let actualStatus = giveaway.status;

    // Si le giveaway est marqué comme actif mais est expiré, le considérer comme terminé
    if (actualStatus === "active" && endTime <= now) {
      actualStatus = "ended";
    }

    return {
      id: giveaway.id,
      guild_id: giveaway.guild_id,
      message_id: giveaway.message_id,
      channel_id: giveaway.channel_id,
      prize: giveaway.prize,
      description: giveaway.description || null,
      winners_count: giveaway.winners_count,
      status: actualStatus,
      creator_id: giveaway.creator_id,
      creator_username: giveaway.creator_username,
      participants,
      participants_count: participants.length,
      winners,
      // Convertir timestamps en ms ou en date ISO
      end_time: giveaway.end_time * 1000,
      ends_at: new Date(giveaway.end_time * 1000).toISOString(),
      created_at: giveaway.created_at ? giveaway.created_at * 1000 : Date.now(),
      ended_at: giveaway.ended_at ? giveaway.ended_at * 1000 : null,
    };
  }

  /**
   * Formate le temps restant
   * @private
   */
  _formatTimeLeft(endTime) {
    const now = Date.now();
    const diff = endTime - now;

    if (diff <= 0) return "Terminé";

    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

    if (days > 0) {
      return `${days}j ${hours}h ${minutes}min`;
    } else if (hours > 0) {
      return `${hours}h ${minutes}min`;
    } else {
      return `${minutes}min`;
    }
  }

  /**
   * Sélectionne des gagnants aléatoires
   * @private
   */
  _selectWinners(participants, count) {
    if (!participants || participants.length === 0) return [];

    const shuffled = [...participants].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, Math.min(count, shuffled.length));
  }
}

// Singleton
module.exports = new GiveawayService();
