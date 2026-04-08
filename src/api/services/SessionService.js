/**
 * Service de gestion sécurisée des sessions
 * Chiffre les tokens sensibles pour éviter qu'ils restent en clair
 * @module api/services/SessionService
 */

const crypto = require("crypto");
const { getDatabase } = require("../../database/init");

class SessionService {
  constructor(encryptionKey) {
    this.encryptionKey = Buffer.from(encryptionKey, "hex");
    this.algorithm = "aes-256-gcm";
    this.db = getDatabase();
  }

  /**
   * Chiffrer un token sensible
   * @param {string} token - Token à chiffrer
   * @returns {string} Token chiffré (format: iv:tag:encryptedData)
   */
  encryptToken(token) {
    try {
      const iv = crypto.randomBytes(16);
      const cipher = crypto.createCipheriv(
        this.algorithm,
        this.encryptionKey,
        iv
      );

      let encrypted = cipher.update(token, "utf8", "hex");
      encrypted += cipher.final("hex");

      const authTag = cipher.getAuthTag();

      // Format: iv:tag:data
      return `${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted}`;
    } catch (error) {
      console.error("Erreur chiffrement token:", error);
      throw new Error("Impossible de chiffrer le token");
    }
  }

  /**
   * Déchiffrer un token
   * @param {string} encryptedToken - Token chiffré au format iv:tag:data
   * @returns {string} Token déchiffré
   */
  decryptToken(encryptedToken) {
    try {
      const parts = encryptedToken.split(":");
      if (parts.length !== 3) {
        throw new Error("Format de token invalide");
      }

      const [ivHex, tagHex, encrypted] = parts;
      const iv = Buffer.from(ivHex, "hex");
      const authTag = Buffer.from(tagHex, "hex");

      const decipher = crypto.createDecipheriv(
        this.algorithm,
        this.encryptionKey,
        iv
      );
      decipher.setAuthTag(authTag);

      let decrypted = decipher.update(encrypted, "hex", "utf8");
      decrypted += decipher.final("utf8");

      return decrypted;
    } catch (error) {
      console.error("Erreur déchiffrement token:", error);
      throw new Error("Impossible de déchiffrer le token");
    }
  }

  /**
   * Créer une session utilisateur sécurisée
   * Les tokens sensibles sont chiffrés, pas en clair dans la session
   * @param {Object} req - Express request
   * @param {Object} userData - Données utilisateur Discord
   * @param {Object} tokens - Tokens OAuth2 (accessToken, refreshToken)
   * @returns {void}
   */
  createSecureSession(req, userData, tokens) {
    // Stocker UNIQUEMENT les données non-sensibles dans la session
    req.session.user = {
      id: userData.id,
      username: userData.username,
      discriminator: userData.discriminator || "0",
      avatar: userData.avatar,
      email: userData.email,
      global_name: userData.global_name,
      avatarUrl: userData.avatarUrl,
      // TEMPORAIRE: stocker aussi le token en session pour éviter les problèmes de déchiffrement
      accessToken: tokens.access_token,
    };

    // Stocker les tokens chiffrés en BD
    // (pas dans la session qui pourrait être exposée)
    this.storeEncryptedTokens(
      userData.id,
      tokens.access_token,
      tokens.refresh_token,
      tokens.expires_in
    );

    // Marquer la session comme authentifiée
    req.session.authenticated = true;
    req.session.loginTime = new Date().toISOString();
  }

  /**
   * Stocker les tokens chiffrés en BD
   * @private
   */
  storeEncryptedTokens(userId, accessToken, refreshToken, expiresIn) {
    try {
      const encryptedAccessToken = this.encryptToken(accessToken);
      const encryptedRefreshToken = this.encryptToken(refreshToken);
      const expiresAt = Math.floor(Date.now() / 1000) + expiresIn;

      // Nettoyer les anciens tokens
      this.db
        .prepare("DELETE FROM user_sessions WHERE user_id = ? AND is_valid = 1")
        .run(userId);

      // Insérer les nouveaux tokens chiffrés
      this.db
        .prepare(
          `
        INSERT INTO user_sessions 
        (session_id, user_id, access_token, refresh_token, token_type, expires_at, scope, is_valid)
        VALUES (?, ?, ?, ?, ?, ?, ?, 1)
      `
        )
        .run(
          `session_${userId}_${Date.now()}`,
          userId,
          encryptedAccessToken,
          encryptedRefreshToken,
          "Bearer",
          expiresAt,
          "identify email guilds"
        );
    } catch (error) {
      console.error("Erreur stockage tokens:", error);
      throw error;
    }
  }

  /**
   * Récupérer les tokens déchiffrés pour une utilisation API
   * @param {string} userId - ID utilisateur
   * @returns {Object|null} {accessToken, refreshToken, expiresAt} ou null
   */
  getDecryptedTokens(userId) {
    try {
      const session = this.db
        .prepare(
          `
        SELECT access_token, refresh_token, expires_at
        FROM user_sessions
        WHERE user_id = ? AND is_valid = 1
        ORDER BY created_at DESC
        LIMIT 1
      `
        )
        .get(userId);

      if (!session) {
        return null;
      }

      // Déchiffrer les tokens
      const accessToken = this.decryptToken(session.access_token);
      const refreshToken = this.decryptToken(session.refresh_token);

      return {
        accessToken,
        refreshToken,
        expiresAt: session.expires_at,
      };
    } catch (error) {
      console.error("Erreur récupération tokens:", error);
      return null;
    }
  }

  /**
   * Vérifier si un token doit être rafraîchi
   * @param {string} userId - ID utilisateur
   * @returns {boolean}
   */
  shouldRefreshToken(userId) {
    try {
      const session = this.db
        .prepare(
          `
        SELECT expires_at FROM user_sessions
        WHERE user_id = ? AND is_valid = 1
        ORDER BY created_at DESC
        LIMIT 1
      `
        )
        .get(userId);

      if (!session) {
        return false;
      }

      const now = Math.floor(Date.now() / 1000);
      // Rafraîchir si expiration dans moins de 5 minutes
      return session.expires_at - now < 300;
    } catch (error) {
      return false;
    }
  }

  /**
   * Récupérer un access token valide (rafraîchit si expiré)
   * @param {string} userId - ID utilisateur
   * @returns {Promise<string|null>} Access token valide ou null
   */
  async getValidAccessToken(userId) {
    try {
      const session = this.db
        .prepare(
          `
        SELECT access_token, refresh_token, expires_at
        FROM user_sessions
        WHERE user_id = ? AND is_valid = 1
        ORDER BY created_at DESC
        LIMIT 1
      `
        )
        .get(userId);

      if (!session) {
        return null;
      }

      const now = Math.floor(Date.now() / 1000);

      // Si le token n'est pas encore expiré, le retourner
      if (session.expires_at > now + 300) {
        // +5min de marge
        return this.decryptToken(session.access_token);
      }

      // Token expiré, essayer de le rafraîchir
      console.log(`Token expiré pour ${userId}, rafraîchissement...`);
      const refreshToken = this.decryptToken(session.refresh_token);

      const config = require("../../../config/config");
      const response = await fetch("https://discord.com/api/oauth2/token", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          client_id: config.clientId,
          client_secret: config.clientSecret,
          grant_type: "refresh_token",
          refresh_token: refreshToken,
        }),
      });

      if (!response.ok) {
        console.error("Échec rafraîchissement token:", response.status);
        // Invalider la session
        this.invalidateSessions(userId);
        return null;
      }

      const tokens = await response.json();

      // Stocker les nouveaux tokens
      this.storeEncryptedTokens(
        userId,
        tokens.access_token,
        tokens.refresh_token,
        tokens.expires_in
      );

      console.log(`✅ Token rafraîchi pour ${userId}`);
      return tokens.access_token;
    } catch (error) {
      console.error("Erreur getValidAccessToken:", error);
      return null;
    }
  }

  /**
   * Invalider toutes les sessions d'un utilisateur
   * @param {string} userId - ID utilisateur
   * @returns {void}
   */
  invalidateSessions(userId) {
    try {
      this.db
        .prepare("UPDATE user_sessions SET is_valid = 0 WHERE user_id = ?")
        .run(userId);
    } catch (error) {
      console.error("Erreur invalidation sessions:", error);
    }
  }

  /**
   * Nettoyer les sessions expirées
   * À appeler régulièrement (ex: toutes les heures)
   * @returns {number} Nombre de sessions supprimées
   */
  cleanupExpiredSessions() {
    try {
      const now = Math.floor(Date.now() / 1000);
      const result = this.db
        .prepare(
          `
        DELETE FROM user_sessions
        WHERE expires_at < ? OR created_at < datetime('now', '-7 days')
      `
        )
        .run(now);

      return result.changes;
    } catch (error) {
      console.error("Erreur nettoyage sessions:", error);
      return 0;
    }
  }
}

module.exports = SessionService;
