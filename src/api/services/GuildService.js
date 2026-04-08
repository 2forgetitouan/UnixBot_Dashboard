/**
 * Service de gestion des guildes (serveurs Discord)
 * @module api/services/GuildService
 */

const { getDatabase } = require("../../database/init");
const { DEFAULT_GUILD_SETTINGS } = require("../../shared/constants");
const { getGuildIconUrl } = require("../../shared/utils");

class GuildService {
  constructor() {
    this.db = getDatabase();
  }

  /**
   * S'assure qu'une guilde existe en DB
   * @param {string} guildId - ID de la guilde
   * @param {Object} guildData - Données de la guilde
   * @returns {Object} Guild data
   */
  ensureGuild(guildId, guildData = {}) {
    const existing = this.db
      .prepare("SELECT * FROM guilds WHERE guild_id = ?")
      .get(guildId);

    if (existing) {
      // Mettre à jour si données fournies
      if (guildData.name || guildData.icon || guildData.owner_id) {
        this.db
          .prepare(
            `
          UPDATE guilds 
          SET guild_name = COALESCE(?, guild_name),
              icon = COALESCE(?, icon),
              owner_id = COALESCE(?, owner_id),
              member_count = COALESCE(?, member_count),
              is_active = 1,
              left_at = NULL,
              updated_at = strftime('%s', 'now')
          WHERE guild_id = ?
        `
          )
          .run(
            guildData.name || null,
            guildData.icon || null,
            guildData.owner_id || null,
            guildData.member_count || null,
            guildId
          );
      }

      // Réactiver si inactive
      if (!existing.is_active) {
        this.db
          .prepare(
            `
          UPDATE guilds SET is_active = 1, left_at = NULL, updated_at = strftime('%s', 'now')
          WHERE guild_id = ?
        `
          )
          .run(guildId);
      }

      return this.getGuild(guildId);
    }

    // Créer la guilde
    this.db
      .prepare(
        `
      INSERT INTO guilds (guild_id, guild_name, icon, owner_id, member_count, is_active)
      VALUES (?, ?, ?, ?, ?, 1)
    `
      )
      .run(
        guildId,
        guildData.name || null,
        guildData.icon || null,
        guildData.owner_id || null,
        guildData.member_count || 0
      );

    // Créer les settings par défaut
    this.ensureGuildSettings(guildId);

    console.log(`✅ Guilde ajoutée: ${guildData.name || guildId}`);
    return this.getGuild(guildId);
  }

  /**
   * S'assure que les settings d'une guilde existent
   * @param {string} guildId - ID de la guilde
   */
  ensureGuildSettings(guildId) {
    const existing = this.db
      .prepare("SELECT 1 FROM guild_settings WHERE guild_id = ?")
      .get(guildId);

    if (!existing) {
      this.db
        .prepare(
          `
        INSERT INTO guild_settings (guild_id) VALUES (?)
      `
        )
        .run(guildId);
    }
  }

  /**
   * Récupère une guilde par son ID
   * @param {string} guildId - ID de la guilde
   * @returns {Object|null} Guild data
   */
  getGuild(guildId) {
    const guild = this.db
      .prepare("SELECT * FROM guilds WHERE guild_id = ?")
      .get(guildId);

    if (guild) {
      guild.iconUrl = getGuildIconUrl(guild);
    }

    return guild;
  }

  /**
   * Récupère une guilde avec ses settings
   * @param {string} guildId - ID de la guilde
   * @returns {Object|null} Guild avec settings
   */
  getGuildWithSettings(guildId) {
    const guild = this.getGuild(guildId);
    if (!guild) return null;

    const settings = this.getGuildSettings(guildId);
    return { ...guild, settings };
  }

  /**
   * Récupère les settings d'une guilde
   * @param {string} guildId - ID de la guilde
   * @returns {Object} Settings
   */
  getGuildSettings(guildId) {
    this.ensureGuildSettings(guildId);

    return this.db
      .prepare("SELECT * FROM guild_settings WHERE guild_id = ?")
      .get(guildId);
  }

  /**
   * Met à jour les settings d'une guilde
   * @param {string} guildId - ID de la guilde
   * @param {Object} settings - Settings à mettre à jour
   * @param {string} updatedBy - ID de l'utilisateur
   * @returns {Object} Settings mis à jour
   */
  updateGuildSettings(guildId, settings, updatedBy) {
    this.ensureGuildSettings(guildId);

    const allowedFields = [
      "welcome_channel_id",
      "log_channel_id",
      "mod_log_channel_id",
      "giveaway_channel_id",
      "bump_channel_id",
      "welcome_message",
      "goodbye_message",
      "welcome_enabled",
      "goodbye_enabled",
      "auto_unarchive_enabled",
      "bump_reminder_enabled",
      "auto_mod_enabled",
      "spam_protection_enabled",
    ];

    const updates = [];
    const values = [];

    for (const [key, value] of Object.entries(settings)) {
      if (allowedFields.includes(key)) {
        updates.push(`${key} = ?`);
        values.push(value);
      }
    }

    if (updates.length === 0) return this.getGuildSettings(guildId);

    updates.push("updated_at = strftime('%s', 'now')");
    updates.push("updated_by = ?");
    values.push(updatedBy);
    values.push(guildId);

    this.db
      .prepare(
        `
      UPDATE guild_settings SET ${updates.join(", ")} WHERE guild_id = ?
    `
      )
      .run(...values);

    return this.getGuildSettings(guildId);
  }

  /**
   * Récupère toutes les guildes actives
   * @returns {Array} Liste des guildes
   */
  getAllActiveGuilds() {
    return this.db
      .prepare("SELECT * FROM guilds WHERE is_active = 1 ORDER BY guild_name")
      .all()
      .map((guild) => ({
        ...guild,
        iconUrl: getGuildIconUrl(guild),
      }));
  }

  /**
   * Récupère les guildes d'un utilisateur (où il est owner)
   * @param {string} userId - ID utilisateur
   * @returns {Array} Liste des guildes
   */
  getUserGuilds(userId) {
    return this.db
      .prepare(
        `
      SELECT g.*, o.permission_level
      FROM guilds g
      JOIN owners o ON g.guild_id = o.guild_id
      WHERE o.user_id = ? AND g.is_active = 1
      ORDER BY g.guild_name
    `
      )
      .all(userId)
      .map((guild) => ({
        ...guild,
        iconUrl: getGuildIconUrl(guild),
      }));
  }

  /**
   * Marque une guilde comme quittée
   * @param {string} guildId - ID de la guilde
   */
  markGuildLeft(guildId) {
    this.db
      .prepare(
        `
      UPDATE guilds 
      SET is_active = 0, left_at = strftime('%s', 'now'), updated_at = strftime('%s', 'now')
      WHERE guild_id = ?
    `
      )
      .run(guildId);
  }

  /**
   * Récupère les statistiques d'une guilde
   * @param {string} guildId - ID de la guilde
   * @returns {Object} Statistiques
   */
  getGuildStats(guildId) {
    const giveawaysCount = this.db
      .prepare(
        `
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active,
        SUM(CASE WHEN status = 'ended' THEN 1 ELSE 0 END) as ended
      FROM giveaways WHERE guild_id = ?
    `
      )
      .get(guildId);

    const messagesCount = this.db
      .prepare(
        `
      SELECT COUNT(*) as total FROM messages_log WHERE guild_id = ?
    `
      )
      .get(guildId);

    const ownersCount = this.db
      .prepare(
        `
      SELECT COUNT(*) as total FROM owners WHERE guild_id = ?
    `
      )
      .get(guildId);

    // Récupérer le statut auto-bump
    const autobumpConfig = this.db
      .prepare(
        `
      SELECT is_active, total_bumps, last_bump_at, enabled_services
      FROM autobump_configs WHERE guild_id = ?
    `
      )
      .get(guildId);

    let autobumpStatus = {
      configured: false,
      isActive: false,
      totalBumps: 0,
      lastBumpAt: null,
      nextBumps: null,
    };

    if (autobumpConfig) {
      autobumpStatus = {
        configured: true,
        isActive: autobumpConfig.is_active === 1,
        totalBumps: autobumpConfig.total_bumps || 0,
        lastBumpAt: autobumpConfig.last_bump_at 
          ? new Date(autobumpConfig.last_bump_at * 1000) 
          : null,
      };
    }

    return {
      giveaways: giveawaysCount,
      messages: messagesCount.total,
      owners: ownersCount.total,
      autobump: autobumpStatus,
    };
  }

  /**
   * Récupère les permissions de commande pour une guilde
   * @param {string} guildId - ID de la guilde
   * @returns {Array} Permissions
   */
  getCommandPermissions(guildId) {
    return this.db
      .prepare(
        `
      SELECT * FROM command_permissions WHERE guild_id = ?
    `
      )
      .all(guildId)
      .map((perm) => ({
        ...perm,
        allowed_roles: JSON.parse(perm.allowed_roles || "[]"),
        denied_roles: JSON.parse(perm.denied_roles || "[]"),
        allowed_channels: JSON.parse(perm.allowed_channels || "[]"),
        denied_channels: JSON.parse(perm.denied_channels || "[]"),
      }));
  }

  /**
   * Met à jour les permissions d'une commande
   * @param {string} guildId - ID de la guilde
   * @param {string} commandName - Nom de la commande
   * @param {Object} permissions - Permissions
   * @param {string} updatedBy - ID utilisateur
   * @returns {Object} Permissions mises à jour
   */
  updateCommandPermission(guildId, commandName, permissions, updatedBy) {
    const existing = this.db
      .prepare(
        `
      SELECT * FROM command_permissions WHERE guild_id = ? AND command_name = ?
    `
      )
      .get(guildId, commandName);

    if (existing) {
      this.db
        .prepare(
          `
        UPDATE command_permissions SET
          is_enabled = COALESCE(?, is_enabled),
          allowed_roles = COALESCE(?, allowed_roles),
          denied_roles = COALESCE(?, denied_roles),
          allowed_channels = COALESCE(?, allowed_channels),
          denied_channels = COALESCE(?, denied_channels),
          cooldown_seconds = COALESCE(?, cooldown_seconds),
          updated_at = strftime('%s', 'now'),
          updated_by = ?
        WHERE guild_id = ? AND command_name = ?
      `
        )
        .run(
          permissions.is_enabled ?? null,
          permissions.allowed_roles
            ? JSON.stringify(permissions.allowed_roles)
            : null,
          permissions.denied_roles
            ? JSON.stringify(permissions.denied_roles)
            : null,
          permissions.allowed_channels
            ? JSON.stringify(permissions.allowed_channels)
            : null,
          permissions.denied_channels
            ? JSON.stringify(permissions.denied_channels)
            : null,
          permissions.cooldown_seconds ?? null,
          updatedBy,
          guildId,
          commandName
        );
    } else {
      this.db
        .prepare(
          `
        INSERT INTO command_permissions 
        (guild_id, command_name, is_enabled, allowed_roles, denied_roles, allowed_channels, denied_channels, cooldown_seconds, updated_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `
        )
        .run(
          guildId,
          commandName,
          permissions.is_enabled ?? 1,
          JSON.stringify(permissions.allowed_roles || []),
          JSON.stringify(permissions.denied_roles || []),
          JSON.stringify(permissions.allowed_channels || []),
          JSON.stringify(permissions.denied_channels || []),
          permissions.cooldown_seconds || 0,
          updatedBy
        );
    }

    return this.db
      .prepare(
        `
      SELECT * FROM command_permissions WHERE guild_id = ? AND command_name = ?
    `
      )
      .get(guildId, commandName);
  }
}

// Singleton
module.exports = new GuildService();
