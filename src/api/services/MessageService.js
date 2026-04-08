/**
 * Service d'envoi de messages via le bot
 * @module api/services/MessageService
 */

const { getDatabase } = require("../../database/init");
const bridge = require("../../shared/botBridge");

class MessageService {
  constructor() {
    this.db = getDatabase();
  }

  /**
   * Envoie un message dans un salon
   * @param {Object} params - Paramètres
   * @returns {Promise<Object>} Message envoyé
   */
  async sendToChannel({ guildId, channelId, content, embed, sentBy }) {
    const available = await bridge.isAvailable();
    if (!available) {
      throw new Error("Bot non disponible");
    }

    // Envoyer via le bridge
    const result = await bridge.sendMessage(channelId, content, embed);

    // Logger en DB
    this._logMessage({
      guildId,
      channelId,
      messageType: "channel",
      content: content || JSON.stringify(embed),
      embedData: embed ? JSON.stringify(embed) : null,
      sentBy,
      messageId: result.id,
      status: "sent",
    });

    return {
      id: result.id,
      channelId: result.channelId,
      content: content,
      createdAt: Date.now(),
    };
  }

  /**
   * Envoie un DM à un utilisateur
   * @param {Object} params - Paramètres
   * @returns {Promise<Object>} Message envoyé
   */
  async sendDM({ guildId, targetUserId, content, embed, sentBy }) {
    const available = await bridge.isAvailable();
    if (!available) {
      throw new Error("Bot non disponible");
    }

    // Vérifier que l'utilisateur est membre du serveur
    const member = await bridge.getGuildMember(guildId, targetUserId);
    if (!member) {
      throw new Error("Cet utilisateur n'est pas membre du serveur");
    }

    // Préparer le message
    let sentResult;
    try {
      sentResult = await bridge.sendDM(targetUserId, content, embed);
    } catch (error) {
      // Logger l'échec
      this._logMessage({
        guildId,
        targetUserId,
        messageType: "dm",
        content: content || JSON.stringify(embed),
        embedData: embed ? JSON.stringify(embed) : null,
        sentBy,
        status: "failed",
        errorMessage: error.message,
      });
      throw new Error(`Impossible d'envoyer le message : ${error.message}`);
    }

    // Logger le succès
    this._logMessage({
      guildId,
      targetUserId,
      messageType: "dm",
      content: content || JSON.stringify(embed),
      embedData: embed ? JSON.stringify(embed) : null,
      sentBy,
      messageId: sentResult.id,
      status: "sent",
    });

    return {
      id: sentResult.id,
      content: content,
      createdAt: Date.now(),
    };
  }

  /**
   * Envoie un embed personnalisé
   * @param {Object} params - Paramètres
   * @returns {Promise<Object>} Message envoyé
   */
  async sendEmbed({ guildId, channelId, embedData, sentBy }) {
    const embed = this._buildEmbed(embedData);
    return this.sendToChannel({ guildId, channelId, embed, sentBy });
  }

  /**
   * Récupère l'historique des messages envoyés
   * @param {string} guildId - ID de la guilde
   * @param {Object} options - Options de filtrage
   * @returns {Array} Messages
   */
  async getMessageHistory(guildId, options = {}) {
    const { limit = 50, offset = 0, page = 1, type } = options;
    const actualOffset = offset || (page - 1) * limit;

    let query = "SELECT * FROM messages_log WHERE guild_id = ?";
    const params = [guildId];

    if (type) {
      query += " AND message_type = ?";
      params.push(type);
    }

    // Compter le total
    let countQuery =
      "SELECT COUNT(*) as total FROM messages_log WHERE guild_id = ?";
    const countParams = [guildId];
    if (type) {
      countQuery += " AND message_type = ?";
      countParams.push(type);
    }
    const { total } = this.db.prepare(countQuery).get(...countParams);

    // Récupérer les messages
    query += " ORDER BY sent_at DESC LIMIT ? OFFSET ?";
    params.push(limit, actualOffset);

    const messages = this.db.prepare(query).all(...params);

    // Formatter les messages pour l'affichage avec les vrais noms
    const formattedMessages = await Promise.all(
      messages.map(async (msg) => {
        let destination = "N/A";

        try {
          if (msg.message_type === "dm" && msg.target_user_id) {
            const user = await bridge.fetchUser(msg.target_user_id);
            destination = user ? `@${user.username}` : `User ${msg.target_user_id}`;
          } else if (msg.channel_id) {
            const name = await bridge.getChannelName(msg.channel_id);
            destination = name ? `#${name}` : `Channel ${msg.channel_id}`;
          }
        } catch {
          destination =
            msg.message_type === "dm"
              ? `User ${msg.target_user_id}`
              : `Channel ${msg.channel_id}`;
        }

        return {
          ...msg,
          type: msg.message_type,
          destination,
        };
      })
    );

    return {
      messages: formattedMessages,
      total,
    };
  }

  /**
   * Récupère un message par ID
   * @param {number} id - ID du log
   * @returns {Object|null} Message
   */
  getMessageById(id) {
    return this.db.prepare("SELECT * FROM messages_log WHERE id = ?").get(id);
  }

  /**
   * Construit un embed Discord
   * @private
   */
  _buildEmbed(data) {
    const embed = {};

    if (data.title) embed.title = data.title;
    if (data.description) embed.description = data.description;
    if (data.color) embed.color = parseInt(data.color.replace("#", ""), 16);
    if (data.url) embed.url = data.url;
    if (data.timestamp) embed.timestamp = new Date().toISOString();

    if (data.author) {
      embed.author = {
        name: data.author.name,
        icon_url: data.author.iconUrl,
        url: data.author.url,
      };
    }

    if (data.thumbnail) {
      embed.thumbnail = { url: data.thumbnail };
    }

    if (data.image) {
      embed.image = { url: data.image };
    }

    if (data.footer) {
      embed.footer = {
        text: data.footer.text,
        icon_url: data.footer.iconUrl,
      };
    }

    if (data.fields && Array.isArray(data.fields)) {
      embed.fields = data.fields.map((f) => ({
        name: f.name,
        value: f.value,
        inline: f.inline || false,
      }));
    }

    return embed;
  }

  /**
   * Log un message en DB
   * @private
   */
  _logMessage({
    guildId,
    channelId,
    targetUserId,
    messageType,
    content,
    embedData,
    sentBy,
    messageId,
    status,
    errorMessage,
  }) {
    this.db
      .prepare(
        `
      INSERT INTO messages_log 
      (guild_id, channel_id, target_user_id, message_type, content, embed_data, sent_by, message_id, status, error_message)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
      )
      .run(
        guildId,
        channelId || null,
        targetUserId || null,
        messageType,
        content,
        embedData || null,
        sentBy,
        messageId || null,
        status,
        errorMessage || null
      );
  }

  /**
   * Vider l'historique des messages pour un serveur
   * @param {string} guildId - ID du serveur
   */
  clearHistory(guildId) {
    const result = this.db
      .prepare("DELETE FROM messages_log WHERE guild_id = ?")
      .run(guildId);

    return { deleted: result.changes };
  }
}

// Singleton
module.exports = new MessageService();
