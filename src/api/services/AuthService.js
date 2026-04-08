/**
 * Service d'authentification OAuth2 Discord
 * Gère les tokens, sessions et vérification des permissions
 * @module api/services/AuthService
 */

const { getDatabase } = require("../../database/init");
const { DISCORD_API, LIMITS, API_ERRORS } = require("../../shared/constants");
const {
  formatUserTag,
  getAvatarUrl,
  canManageGuild,
  getClientIp,
} = require("../../shared/utils");
const crypto = require("crypto");

class AuthService {
  constructor() {
    this.db = getDatabase();
    this.userGuildsCache = new Map(); // Cache des guildes utilisateur
    this.cacheTimeout = 5 * 60 * 1000; // 5 minutes
  }

  /**
   * Échange un code d'autorisation contre des tokens
   * @param {string} code - Code OAuth2
   * @param {string} redirectUri - URI de redirection
   * @param {Object} config - Configuration OAuth
   * @returns {Promise<Object>} Tokens
   */
  async exchangeCode(code, redirectUri, config) {
    const response = await fetch(DISCORD_API.OAUTH_TOKEN, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: config.clientId,
        client_secret: config.clientSecret,
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error("Erreur échange code OAuth:", error);
      throw new Error("Échec de l'authentification Discord");
    }

    return response.json();
  }

  /**
   * Rafraîchit un token expiré
   * @param {string} refreshToken - Token de refresh
   * @param {Object} config - Configuration OAuth
   * @returns {Promise<Object>} Nouveaux tokens
   */
  async refreshAccessToken(refreshToken, config) {
    const response = await fetch(DISCORD_API.OAUTH_TOKEN, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: config.clientId,
        client_secret: config.clientSecret,
        grant_type: "refresh_token",
        refresh_token: refreshToken,
      }),
    });

    if (!response.ok) {
      throw new Error("Échec du refresh token");
    }

    return response.json();
  }

  /**
   * Récupère les informations de l'utilisateur depuis Discord
   * @param {string} accessToken - Token d'accès
   * @returns {Promise<Object>} Données utilisateur
   */
  async fetchUserInfo(accessToken) {
    const response = await fetch(`${DISCORD_API.BASE}/users/@me`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!response.ok) {
      throw new Error("Impossible de récupérer le profil Discord");
    }

    return response.json();
  }

  /**
   * Récupère les guildes de l'utilisateur depuis Discord
   * @param {string} accessToken - Token d'accès
   * @returns {Promise<Array>} Liste des guildes
   */
  async fetchUserGuilds(accessToken) {
    const response = await fetch(`${DISCORD_API.BASE}/users/@me/guilds`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[AuthService] Discord API error (${response.status}):`, errorText);
      throw new Error(`Impossible de récupérer les serveurs (${response.status})`);
    }

    return response.json();
  }

  /**
   * Récupère les guildes où l'utilisateur est admin
   * @param {string} accessToken - Token d'accès
   * @param {string} userId - ID utilisateur (pour le cache)
   * @returns {Promise<Array>} Guildes avec droits admin
   */
  async getUserAdminGuilds(accessToken, userId) {
    // Vérifier le cache
    const cached = this.userGuildsCache.get(userId);
    if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
      return cached.guilds;
    }

    const allGuilds = await this.fetchUserGuilds(accessToken);

    // Filtrer les guildes où l'utilisateur peut gérer
    const adminGuilds = allGuilds.filter((guild) =>
      canManageGuild(guild.permissions)
    );

    // Mettre en cache
    this.userGuildsCache.set(userId, {
      guilds: adminGuilds,
      timestamp: Date.now(),
    });

    return adminGuilds;
  }

  /**
   * Crée ou met à jour un utilisateur en base
   * @param {Object} discordUser - Données utilisateur Discord
   * @returns {Object} Utilisateur en base
   */
  upsertUser(discordUser) {
    const existing = this.db
      .prepare("SELECT * FROM users WHERE user_id = ?")
      .get(discordUser.id);

    if (existing) {
      this.db
        .prepare(
          `
        UPDATE users 
        SET username = ?, discriminator = ?, avatar = ?, email = ?, last_seen = strftime('%s', 'now')
        WHERE user_id = ?
      `
        )
        .run(
          discordUser.username,
          discordUser.discriminator || "0",
          discordUser.avatar,
          discordUser.email || null,
          discordUser.id
        );
    } else {
      this.db
        .prepare(
          `
        INSERT INTO users (user_id, username, discriminator, avatar, email)
        VALUES (?, ?, ?, ?, ?)
      `
        )
        .run(
          discordUser.id,
          discordUser.username,
          discordUser.discriminator || "0",
          discordUser.avatar,
          discordUser.email || null
        );
    }

    return this.db
      .prepare("SELECT * FROM users WHERE user_id = ?")
      .get(discordUser.id);
  }

  /**
   * Crée une session utilisateur
   * @param {Object} params - Paramètres de session
   * @returns {Object} Session créée
   */
  createSession({
    userId,
    accessToken,
    refreshToken,
    tokenType,
    expiresIn,
    scope,
    req,
  }) {
    const sessionId = crypto.randomBytes(32).toString("hex");
    const expiresAt = Math.floor(Date.now() / 1000) + expiresIn;

    this.db
      .prepare(
        `
      INSERT INTO user_sessions 
      (session_id, user_id, access_token, refresh_token, token_type, expires_at, scope, ip_address, user_agent)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
      )
      .run(
        sessionId,
        userId,
        accessToken,
        refreshToken,
        tokenType || "Bearer",
        expiresAt,
        scope,
        req ? getClientIp(req) : null,
        req ? req.headers["user-agent"] : null
      );

    return {
      sessionId,
      userId,
      expiresAt,
    };
  }

  /**
   * Récupère et valide une session
   * @param {string} sessionId - ID de session
   * @returns {Object|null} Session ou null
   */
  getSession(sessionId) {
    const session = this.db
      .prepare(
        `
      SELECT s.*, u.username, u.discriminator, u.avatar, u.is_banned
      FROM user_sessions s
      JOIN users u ON s.user_id = u.user_id
      WHERE s.session_id = ? AND s.is_valid = 1
    `
      )
      .get(sessionId);

    if (!session) return null;

    // Vérifier si le token est expiré
    const now = Math.floor(Date.now() / 1000);
    if (session.expires_at <= now) {
      // Token expiré, mais on peut peut-être le rafraîchir
      return { ...session, needsRefresh: true };
    }

    // Mettre à jour last_used_at
    this.db
      .prepare(
        `
      UPDATE user_sessions SET last_used_at = strftime('%s', 'now') WHERE session_id = ?
    `
      )
      .run(sessionId);

    return session;
  }

  /**
   * Invalide une session
   * @param {string} sessionId - ID de session
   */
  invalidateSession(sessionId) {
    this.db
      .prepare(
        `
      UPDATE user_sessions SET is_valid = 0 WHERE session_id = ?
    `
      )
      .run(sessionId);

    // Nettoyer le cache
    const session = this.db
      .prepare("SELECT user_id FROM user_sessions WHERE session_id = ?")
      .get(sessionId);
    if (session) {
      this.userGuildsCache.delete(session.user_id);
    }
  }

  /**
   * Invalide toutes les sessions d'un utilisateur
   * @param {string} userId - ID utilisateur
   */
  invalidateAllUserSessions(userId) {
    this.db
      .prepare(
        `
      UPDATE user_sessions SET is_valid = 0 WHERE user_id = ?
    `
      )
      .run(userId);

    this.userGuildsCache.delete(userId);
  }

  /**
   * Vérifie si un utilisateur est superuser
   * @param {string} userId - ID utilisateur
   * @returns {boolean}
   */
  isSuperuser(userId) {
    const result = this.db
      .prepare("SELECT 1 FROM superusers WHERE user_id = ?")
      .get(userId);
    return !!result;
  }

  /**
   * Vérifie si un utilisateur est owner d'une guilde
   * @param {string} userId - ID utilisateur
   * @param {string} guildId - ID guilde
   * @returns {boolean}
   */
  isGuildOwner(userId, guildId) {
    const result = this.db
      .prepare("SELECT 1 FROM owners WHERE user_id = ? AND guild_id = ?")
      .get(userId, guildId);
    return !!result;
  }

  /**
   * Vérifie si un utilisateur a accès à une guilde
   * @param {string} userId - ID utilisateur
   * @param {string} guildId - ID guilde
   * @returns {boolean}
   */
  hasGuildAccess(userId, guildId) {
    // Superuser a accès à tout
    if (this.isSuperuser(userId)) return true;

    // Vérifier si owner de la guilde
    return this.isGuildOwner(userId, guildId);
  }

  /**
   * Nettoie les sessions expirées
   */
  cleanupExpiredSessions() {
    const oneWeekAgo = Math.floor(Date.now() / 1000) - 7 * 24 * 60 * 60;

    const result = this.db
      .prepare(
        `
      DELETE FROM user_sessions 
      WHERE is_valid = 0 OR (expires_at < ? AND refresh_token IS NULL)
    `
      )
      .run(oneWeekAgo);

    if (result.changes > 0) {
      console.log(`🧹 ${result.changes} sessions expirées nettoyées`);
    }
  }

  /**
   * Log d'audit pour une action
   * @param {Object} params - Paramètres du log
   */
  logAudit({
    guildId,
    userId,
    action,
    targetType,
    targetId,
    oldValue,
    newValue,
    req,
  }) {
    this.db
      .prepare(
        `
      INSERT INTO audit_log 
      (guild_id, user_id, action, target_type, target_id, old_value, new_value, ip_address, user_agent)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
      )
      .run(
        guildId,
        userId,
        action,
        targetType,
        targetId,
        oldValue ? JSON.stringify(oldValue) : null,
        newValue ? JSON.stringify(newValue) : null,
        req ? getClientIp(req) : null,
        req ? req.headers["user-agent"] : null
      );
  }
}

// Singleton
module.exports = new AuthService();
