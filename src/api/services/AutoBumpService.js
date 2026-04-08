/**
 * Service de gestion de l'Auto-Bump
 * Gère les configurations, le chiffrement des tokens et l'exécution des bumps
 * @module api/services/AutoBumpService
 */

const { getDatabase } = require("../../database/init");
const crypto = require("crypto");

// ============================================
// CONFIGURATION DES SERVICES DE BUMP PAR DÉFAUT
// ============================================
const DEFAULT_BUMP_SERVICES = {
  disboard: {
    id: "302050872383242240",
    name: "Disboard",
    command: "bump",
    minDelay: 7200000, // 2h minimum
    maxDelay: 10800000, // 3h maximum
    defaultEnabled: true,
    isDefault: true,
  },
  dinvite: {
    id: "678211574183362571",
    name: "Discord Invite",
    command: "bump",
    minDelay: 14400000, // 4h minimum
    maxDelay: 18000000, // 5h maximum
    defaultEnabled: true,
    isDefault: true,
  },
};

// Limites de sécurité
const LIMITS = {
  MIN_DELAY: 1800000, // 30min minimum absolu (pour services personnalisés)
  MAX_DELAY: 86400000, // 24h maximum
  MAX_FAILURES: 5, // Arrêt après 5 échecs consécutifs
  TOKEN_MAX_LENGTH: 100, // Longueur max d'un token Discord
  MAX_CUSTOM_SERVICES: 10, // Nombre max de services personnalisés
};

// Clé de chiffrement (DOIT être définie en production pour persister les tokens)
const ENCRYPTION_KEY =
  process.env.AUTOBUMP_ENCRYPTION_KEY ||
  process.env.ENCRYPTION_KEY ||
  crypto.randomBytes(32).toString("hex");

if (!process.env.AUTOBUMP_ENCRYPTION_KEY && !process.env.ENCRYPTION_KEY) {
  console.warn(
    "⚠️  AUTOBUMP_ENCRYPTION_KEY non défini - Les tokens auto-bump chiffrés seront perdus au redémarrage"
  );
}

class AutoBumpService {
  constructor() {
    this.db = getDatabase();
    // Stockage en mémoire des instances actives
    this.activeInstances = new Map();
  }

  // ============================================
  // CHIFFREMENT DES TOKENS
  // ============================================

  /**
   * Chiffre un token avec AES-256-GCM
   * @param {string} token - Token en clair
   * @returns {Object} Token chiffré avec IV et auth tag
   */
  encryptToken(token) {
    const iv = crypto.randomBytes(16);
    const key = Buffer.from(ENCRYPTION_KEY.slice(0, 64), "hex");
    const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);

    let encrypted = cipher.update(token, "utf8", "hex");
    encrypted += cipher.final("hex");

    return {
      encrypted,
      iv: iv.toString("hex"),
      authTag: cipher.getAuthTag().toString("hex"),
    };
  }

  /**
   * Déchiffre un token
   * @param {string} encrypted - Token chiffré
   * @param {string} ivHex - IV en hexadécimal
   * @param {string} authTagHex - Auth tag en hexadécimal
   * @returns {string} Token en clair
   */
  decryptToken(encrypted, ivHex, authTagHex) {
    const key = Buffer.from(ENCRYPTION_KEY.slice(0, 64), "hex");
    const iv = Buffer.from(ivHex, "hex");
    const authTag = Buffer.from(authTagHex, "hex");

    const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encrypted, "hex", "utf8");
    decrypted += decipher.final("utf8");

    return decrypted;
  }

  // ============================================
  // VALIDATION DU TOKEN
  // ============================================

  /**
   * Détecte le type de token (bot ou utilisateur)
   * @param {string} token - Token à analyser
   * @returns {Object} Type et informations
   */
  detectTokenType(token) {
    if (!token || typeof token !== "string") {
      return { valid: false, type: null, error: "Token invalide" };
    }

    // Nettoyer le token
    const cleanToken = token.trim();

    if (cleanToken.length > LIMITS.TOKEN_MAX_LENGTH) {
      return { valid: false, type: null, error: "Token trop long" };
    }

    // Les tokens de bot commencent généralement par des patterns spécifiques
    // et ont un format différent des tokens utilisateur
    try {
      // Décoder la première partie du token (user ID encodé en base64)
      const parts = cleanToken.split(".");
      if (parts.length !== 3) {
        return { valid: false, type: null, error: "Format de token invalide" };
      }

      const decodedId = Buffer.from(parts[0], "base64").toString("utf8");

      // Vérifier si c'est un ID Discord valide (snowflake)
      if (!/^\d{17,20}$/.test(decodedId)) {
        return { valid: false, type: null, error: "Token corrompu" };
      }

      // Les tokens de bot sont généralement plus longs et ont des caractères différents
      // Les tokens utilisateur ont environ 59-72 caractères
      // Les tokens de bot ont généralement 59-72 caractères aussi mais avec un préfixe différent

      return {
        valid: true,
        type: "user",
        userId: decodedId,
        needsVerification: true,
      };
    } catch (error) {
      return { valid: false, type: null, error: "Token invalide" };
    }
  }

  /**
   * Vérifie un token auprès de l'API Discord
   * @param {string} token - Token à vérifier
   * @returns {Promise<Object>} Résultat de la vérification
   */
  async verifyToken(token) {
    try {
      // Vérifier le format du token
      const detection = this.detectTokenType(token);
      if (!detection.valid) {
        return { success: false, error: detection.error };
      }

      // Appeler l'API Discord pour vérifier le token
      const response = await fetch("https://discord.com/api/v10/users/@me", {
        headers: {
          Authorization: token,
        },
      });

      if (!response.ok) {
        if (response.status === 401) {
          return { success: false, error: "Token invalide ou expiré" };
        }
        return { success: false, error: `Erreur Discord: ${response.status}` };
      }

      const userData = await response.json();

      // Vérifier si c'est un compte bot
      if (userData.bot) {
        return {
          success: false,
          error:
            "⚠️ ATTENTION : Ceci est un token de BOT ! Utilisez uniquement un token de compte utilisateur.",
          isBot: true,
        };
      }

      return {
        success: true,
        user: {
          id: userData.id,
          username: userData.username,
          globalName: userData.global_name,
          avatar: userData.avatar,
          avatarUrl: userData.avatar
            ? `https://cdn.discordapp.com/avatars/${userData.id}/${
                userData.avatar
              }.${userData.avatar.startsWith("a_") ? "gif" : "png"}?size=128`
            : `https://cdn.discordapp.com/embed/avatars/${
                (BigInt(userData.id) >> 22n) % 6n
              }.png`,
        },
      };
    } catch (error) {
      console.error("Erreur vérification token:", error);
      return {
        success: false,
        error: "Erreur lors de la vérification du token",
      };
    }
  }

  // ============================================
  // GESTION DE LA CONFIGURATION
  // ============================================

  /**
   * Récupère la configuration auto-bump d'un serveur
   * @param {string} guildId - ID du serveur
   * @returns {Object|null} Configuration ou null
   */
  getConfig(guildId) {
    const config = this.db
      .prepare("SELECT * FROM autobump_configs WHERE guild_id = ?")
      .get(guildId);

    if (!config) return null;

    // Parser les services activés
    try {
      config.enabled_services = JSON.parse(config.enabled_services);
    } catch {
      config.enabled_services = ["disboard", "dinvite"];
    }

    // Ne jamais retourner le token en clair
    delete config.encrypted_token;
    delete config.token_iv;
    delete config.token_auth_tag;

    return config;
  }

  /**
   * Récupère la configuration avec le token déchiffré (usage interne uniquement)
   * @param {string} guildId - ID du serveur
   * @returns {Object|null} Configuration complète
   */
  getConfigWithToken(guildId) {
    const config = this.db
      .prepare("SELECT * FROM autobump_configs WHERE guild_id = ?")
      .get(guildId);

    if (!config) return null;

    // Déchiffrer le token
    try {
      config.token = this.decryptToken(
        config.encrypted_token,
        config.token_iv,
        config.token_auth_tag
      );
    } catch (error) {
      console.error(`Erreur déchiffrement token pour ${guildId}:`, error);
      return null;
    }

    // Parser les services
    try {
      config.enabled_services = JSON.parse(config.enabled_services);
    } catch {
      config.enabled_services = ["disboard", "dinvite"];
    }

    return config;
  }

  /**
   * Vérifie si l'utilisateur peut configurer l'auto-bump pour ce serveur
   * @param {string} guildId - ID du serveur
   * @param {string} userId - ID de l'utilisateur
   * @param {string} tokenUserId - ID du compte lié au token
   * @returns {boolean}
   */
  canUserConfigure(guildId, userId, tokenUserId) {
    // Le token doit appartenir à l'utilisateur connecté
    return userId === tokenUserId;
  }

  /**
   * Crée ou met à jour la configuration auto-bump
   * @param {Object} data - Données de configuration
   * @returns {Object} Résultat de l'opération
   */
  async saveConfig(data) {
    const {
      guildId,
      userId,
      channelId,
      token,
      services, // Nouveau format: { serviceKey: { enabled, minDelay, maxDelay } }
      customServices, // Services personnalisés
    } = data;

    // Vérifier le token si fourni
    let verification = null;
    if (token) {
      verification = await this.verifyToken(token);
      if (!verification.success) {
        return {
          success: false,
          error: verification.error,
          isBot: verification.isBot,
        };
      }
    }

    // Vérifier s'il existe déjà une config
    const existing = this.db
      .prepare("SELECT id, user_id, encrypted_token, token_iv, token_auth_tag FROM autobump_configs WHERE guild_id = ?")
      .get(guildId);

    if (existing && existing.user_id !== userId) {
      return {
        success: false,
        error:
          "Une configuration existe déjà pour ce serveur par un autre utilisateur",
      };
    }

    // Si pas de nouveau token mais config existante, on garde l'ancien
    let encryptedData = null;
    let tokenUserData = null;
    
    if (token) {
      encryptedData = this.encryptToken(token);
      tokenUserData = verification.user;
    } else if (existing) {
      // Garder les données existantes
      encryptedData = {
        encrypted: existing.encrypted_token,
        iv: existing.token_iv,
        authTag: existing.token_auth_tag,
      };
    } else {
      return { success: false, error: "Token requis pour une nouvelle configuration" };
    }

    // Valider et formater les services
    const formattedServices = {};
    
    // Services par défaut
    for (const [key, defaultService] of Object.entries(DEFAULT_BUMP_SERVICES)) {
      const serviceConfig = services?.[key] || {};
      formattedServices[key] = {
        enabled: serviceConfig.enabled !== undefined ? serviceConfig.enabled : defaultService.defaultEnabled,
        minDelay: Math.max(
          defaultService.minDelay, // Respecter le minimum du service
          Math.min(LIMITS.MAX_DELAY, parseInt(serviceConfig.minDelay) || defaultService.minDelay)
        ),
        maxDelay: Math.max(
          defaultService.minDelay + 1800000, // Au moins 30min de plus que le min
          Math.min(LIMITS.MAX_DELAY, parseInt(serviceConfig.maxDelay) || defaultService.maxDelay)
        ),
        isDefault: true,
      };
    }

    // Services personnalisés
    const validCustomServices = [];
    if (customServices && Array.isArray(customServices)) {
      for (const cs of customServices.slice(0, LIMITS.MAX_CUSTOM_SERVICES)) {
        if (cs.name && cs.botId && cs.command) {
          validCustomServices.push({
            name: cs.name.slice(0, 50),
            botId: cs.botId.slice(0, 20),
            command: cs.command.slice(0, 50),
            enabled: cs.enabled !== false,
            minDelay: Math.max(LIMITS.MIN_DELAY, Math.min(LIMITS.MAX_DELAY, parseInt(cs.minDelay) || 7200000)),
            maxDelay: Math.max(LIMITS.MIN_DELAY + 1800000, Math.min(LIMITS.MAX_DELAY, parseInt(cs.maxDelay) || 10800000)),
            isDefault: false,
          });
        }
      }
    }

    const allServicesData = {
      default: formattedServices,
      custom: validCustomServices,
    };

    try {
      if (existing) {
        // Mise à jour
        if (token && tokenUserData) {
          // Mise à jour avec nouveau token
          this.db
            .prepare(
              `
              UPDATE autobump_configs SET
                channel_id = ?,
                encrypted_token = ?,
                token_iv = ?,
                token_auth_tag = ?,
                token_user_id = ?,
                token_username = ?,
                token_avatar = ?,
                enabled_services = ?,
                updated_at = strftime('%s', 'now')
              WHERE guild_id = ?
            `
            )
            .run(
              channelId,
              encryptedData.encrypted,
              encryptedData.iv,
              encryptedData.authTag,
              tokenUserData.id,
              tokenUserData.username,
              tokenUserData.avatar,
              JSON.stringify(allServicesData),
              guildId
            );
        } else {
          // Mise à jour sans changer le token
          this.db
            .prepare(
              `
              UPDATE autobump_configs SET
                channel_id = ?,
                enabled_services = ?,
                updated_at = strftime('%s', 'now')
              WHERE guild_id = ?
            `
            )
            .run(
              channelId,
              JSON.stringify(allServicesData),
              guildId
            );
        }
      } else {
        // Création
        this.db
          .prepare(
            `
            INSERT INTO autobump_configs (
              guild_id, user_id, channel_id,
              encrypted_token, token_iv, token_auth_tag,
              token_user_id, token_username, token_avatar,
              min_delay, max_delay, enabled_services
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `
          )
          .run(
            guildId,
            userId,
            channelId,
            encryptedData.encrypted,
            encryptedData.iv,
            encryptedData.authTag,
            tokenUserData.id,
            tokenUserData.username,
            tokenUserData.avatar,
            7200000, // min_delay par défaut (legacy)
            10800000, // max_delay par défaut (legacy)
            JSON.stringify(allServicesData)
          );
      }

      return {
        success: true,
        message: "Configuration sauvegardée",
        user: tokenUserData || (existing ? { id: existing.token_user_id } : null),
      };
    } catch (error) {
      console.error("Erreur sauvegarde config auto-bump:", error);
      return { success: false, error: "Erreur lors de la sauvegarde" };
    }
  }

  /**
   * Supprime la configuration d'un serveur
   * @param {string} guildId - ID du serveur
   * @param {string} userId - ID de l'utilisateur (vérification)
   * @returns {Object} Résultat
   */
  deleteConfig(guildId, userId) {
    const config = this.getConfig(guildId);

    if (!config) {
      return { success: false, error: "Aucune configuration trouvée" };
    }

    if (config.user_id !== userId) {
      return {
        success: false,
        error: "Vous n'êtes pas autorisé à supprimer cette configuration",
      };
    }

    // Arrêter l'instance si active
    this.stopAutoBump(guildId);

    this.db
      .prepare("DELETE FROM autobump_configs WHERE guild_id = ?")
      .run(guildId);

    return { success: true, message: "Configuration supprimée" };
  }

  // ============================================
  // GESTION DE L'EXÉCUTION
  // ============================================

  /**
   * Démarre l'auto-bump pour un serveur
   * @param {string} guildId - ID du serveur
   * @returns {Object} Résultat
   */
  async startAutoBump(guildId) {
    // Vérifier si déjà actif
    if (this.activeInstances.has(guildId)) {
      return { success: false, error: "L'auto-bump est déjà actif" };
    }

    const config = this.getConfigWithToken(guildId);
    if (!config) {
      return { success: false, error: "Aucune configuration trouvée" };
    }

    // Vérifier que le token est toujours valide
    const verification = await this.verifyToken(config.token);
    if (!verification.success) {
      // Désactiver en base
      this.db
        .prepare(
          "UPDATE autobump_configs SET is_active = 0, last_error = ? WHERE guild_id = ?"
        )
        .run(verification.error, guildId);
      return { success: false, error: `Token invalide: ${verification.error}` };
    }

    // Importer et démarrer le moteur
    try {
      const AutoBumpEngine = require("./AutoBumpEngine");
      const engine = new AutoBumpEngine(config, DEFAULT_BUMP_SERVICES);

      await engine.start();
      this.activeInstances.set(guildId, engine);

      // Mettre à jour le statut en base
      this.db
        .prepare(
          "UPDATE autobump_configs SET is_active = 1, last_error = NULL, consecutive_failures = 0 WHERE guild_id = ?"
        )
        .run(guildId);

      return { success: true, message: "Auto-bump démarré" };
    } catch (error) {
      console.error(`Erreur démarrage auto-bump ${guildId}:`, error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Arrête l'auto-bump pour un serveur
   * @param {string} guildId - ID du serveur
   * @returns {Object} Résultat
   */
  stopAutoBump(guildId) {
    const instance = this.activeInstances.get(guildId);

    if (instance) {
      instance.stop();
      this.activeInstances.delete(guildId);
    }

    // Mettre à jour le statut en base
    this.db
      .prepare("UPDATE autobump_configs SET is_active = 0 WHERE guild_id = ?")
      .run(guildId);

    return { success: true, message: "Auto-bump arrêté" };
  }

  /**
   * Récupère le statut de l'auto-bump
   * @param {string} guildId - ID du serveur
   * @returns {Object} Statut
   */
  getStatus(guildId) {
    const config = this.getConfig(guildId);
    if (!config) {
      // Pas de config, retourner la structure par défaut
      const servicesConfig = { default: {}, custom: [] };
      for (const [key, defaultService] of Object.entries(DEFAULT_BUMP_SERVICES)) {
        servicesConfig.default[key] = {
          enabled: defaultService.defaultEnabled,
          minDelay: defaultService.minDelay,
          maxDelay: defaultService.maxDelay,
        };
      }
      return { 
        configured: false,
        services: servicesConfig,
      };
    }

    const instance = this.activeInstances.get(guildId);

    // Parser les services configurés
    let servicesConfig = { default: {}, custom: [] };
    try {
      let parsed;
      if (typeof config.enabled_services === 'string') {
        parsed = JSON.parse(config.enabled_services);
      } else if (typeof config.enabled_services === 'object') {
        parsed = config.enabled_services;
      }
      
      if (parsed && typeof parsed === 'object' && parsed.default) {
        servicesConfig = parsed;
        // S'assurer que custom est un array
        if (!Array.isArray(servicesConfig.custom)) {
          servicesConfig.custom = [];
        }
      } else if (Array.isArray(parsed)) {
        // Ancien format (migration)
        for (const key of parsed) {
          if (DEFAULT_BUMP_SERVICES[key]) {
            servicesConfig.default[key] = {
              enabled: true,
              minDelay: DEFAULT_BUMP_SERVICES[key].minDelay,
              maxDelay: DEFAULT_BUMP_SERVICES[key].maxDelay,
            };
          }
        }
      }
    } catch (error) {
      console.warn(`[AutoBump] Erreur parsing enabled_services pour ${guildId}:`, error);
      // Valeurs par défaut
    }

    // S'assurer que tous les services par défaut sont présents
    for (const [key, defaultService] of Object.entries(DEFAULT_BUMP_SERVICES)) {
      if (!servicesConfig.default[key]) {
        servicesConfig.default[key] = {
          enabled: defaultService.defaultEnabled,
          minDelay: defaultService.minDelay,
          maxDelay: defaultService.maxDelay,
        };
      }
    }

    return {
      configured: true,
      isActive: !!instance,
      isActiveInDb: config.is_active === 1,
      channelId: config.channel_id,
      services: servicesConfig,
      totalBumps: config.total_bumps,
      lastBumpAt: config.last_bump_at
        ? new Date(config.last_bump_at * 1000)
        : null,
      lastError: config.last_error,
      consecutiveFailures: config.consecutive_failures,
      tokenUser: {
        id: config.token_user_id,
        username: config.token_username,
        avatar: config.token_avatar,
        avatarUrl: config.token_avatar
          ? `https://cdn.discordapp.com/avatars/${config.token_user_id}/${
              config.token_avatar
            }.${config.token_avatar.startsWith("a_") ? "gif" : "png"}?size=64`
          : `https://cdn.discordapp.com/embed/avatars/${
              (BigInt(config.token_user_id) >> 22n) % 6n
            }.png`,
      },
      nextBumps: instance ? instance.getNextBumps() : null,
    };
  }

  /**
   * Récupère l'historique des bumps
   * @param {string} guildId - ID du serveur
   * @param {number} limit - Nombre de résultats
   * @returns {Array} Historique
   */
  getHistory(guildId, limit = 50) {
    return this.db
      .prepare(
        `
        SELECT * FROM autobump_history 
        WHERE guild_id = ? 
        ORDER BY bumped_at DESC 
        LIMIT ?
      `
      )
      .all(guildId, limit);
  }

  /**
   * Enregistre un bump dans l'historique
   * @param {string} guildId - ID du serveur
   * @param {string} service - Service utilisé
   * @param {boolean} success - Succès ou échec
   * @param {string} errorMessage - Message d'erreur éventuel
   */
  logBump(guildId, service, success, errorMessage = null) {
    this.db
      .prepare(
        `
        INSERT INTO autobump_history (guild_id, service, status, error_message)
        VALUES (?, ?, ?, ?)
      `
      )
      .run(guildId, service, success ? "success" : "failed", errorMessage);

    if (success) {
      this.db
        .prepare(
          `
          UPDATE autobump_configs 
          SET total_bumps = total_bumps + 1, 
              last_bump_at = strftime('%s', 'now'),
              consecutive_failures = 0,
              last_error = NULL
          WHERE guild_id = ?
        `
        )
        .run(guildId);
    } else {
      this.db
        .prepare(
          `
          UPDATE autobump_configs 
          SET consecutive_failures = consecutive_failures + 1,
              last_error = ?
          WHERE guild_id = ?
        `
        )
        .run(errorMessage, guildId);
    }
  }

  /**
   * Restaure les auto-bumps actifs au démarrage
   */
  async restoreActiveAutoBumps() {
    const activeConfigs = this.db
      .prepare("SELECT guild_id FROM autobump_configs WHERE is_active = 1")
      .all();

    console.log(
      `🔄 Restauration de ${activeConfigs.length} auto-bumps actifs...`
    );

    for (const config of activeConfigs) {
      try {
        const result = await this.startAutoBump(config.guild_id);
        if (result.success) {
          console.log(`✅ Auto-bump restauré pour ${config.guild_id}`);
        } else {
          console.warn(
            `⚠️ Échec restauration auto-bump ${config.guild_id}: ${result.error}`
          );
        }
      } catch (error) {
        console.error(
          `❌ Erreur restauration auto-bump ${config.guild_id}:`,
          error
        );
      }
    }
  }

  /**
   * Exécute manuellement un bump de test
   * @param {string} guildId - ID du serveur
   * @param {string} serviceKey - Clé du service à tester
   * @returns {Promise<Object>} Résultat
   */
  async executeManualBump(guildId, serviceKey) {
    const config = this.getConfigWithToken(guildId);
    if (!config) {
      return { success: false, error: "Aucune configuration trouvée" };
    }

    // Vérifier que le token est valide
    const verification = await this.verifyToken(config.token);
    if (!verification.success) {
      return { success: false, error: `Token invalide: ${verification.error}` };
    }

    try {
      // Importer le moteur pour exécuter le bump
      const AutoBumpEngine = require("./AutoBumpEngine");
      
      // Déterminer le service à utiliser
      let serviceToUse = null;
      
      if (!serviceKey) {
        return { success: false, error: "Aucun service spécifié" };
      }
      
      if (DEFAULT_BUMP_SERVICES[serviceKey]) {
        // Service par défaut
        serviceToUse = {
          key: serviceKey,
          ...DEFAULT_BUMP_SERVICES[serviceKey],
        };
      } else if (serviceKey && serviceKey.startsWith('custom_')) {
        // Service personnalisé
        const servicesConfig = typeof config.enabled_services === 'string' 
          ? JSON.parse(config.enabled_services)
          : config.enabled_services;
        const customIndex = parseInt(serviceKey.replace('custom_', ''));
        if (servicesConfig.custom && servicesConfig.custom[customIndex]) {
          const customService = servicesConfig.custom[customIndex];
          serviceToUse = {
            key: serviceKey,
            id: customService.botId,
            name: customService.name,
            command: customService.command,
            minDelay: customService.minDelay,
            maxDelay: customService.maxDelay,
          };
        }
      } else {
        // Prendre le premier service activé
        const servicesConfig = typeof config.enabled_services === 'string'
          ? JSON.parse(config.enabled_services)
          : config.enabled_services;
        for (const [key, svc] of Object.entries(servicesConfig.default || {})) {
          if (svc.enabled) {
            serviceToUse = {
              key,
              ...DEFAULT_BUMP_SERVICES[key],
            };
            break;
          }
        }
      }

      if (!serviceToUse) {
        return { success: false, error: "Aucun service activé trouvé" };
      }

      // Pour les services personnalisés, construire une config avec le service inclus
      const servicesForEngine = { ...DEFAULT_BUMP_SERVICES };
      if (serviceToUse.key.startsWith('custom_')) {
        servicesForEngine[serviceToUse.key] = {
          id: serviceToUse.id,
          name: serviceToUse.name,
          command: serviceToUse.command,
          minDelay: serviceToUse.minDelay,
          maxDelay: serviceToUse.maxDelay,
        };
      }

      // Créer une instance temporaire du moteur
      const engine = new AutoBumpEngine(config, servicesForEngine);
      engine.isManualTest = true; // Marquer comme test manuel
      
      try {
        // Démarrer le moteur pour se connecter au Discord
        await engine.start();
        
        // Attendre que tout soit prêt
        await new Promise(r => setTimeout(r, 1000));
        
        // Exécuter le bump
        const result = await engine.executeBump(serviceToUse.key);

        // Enregistrer dans l'historique
        if (result) {
          this.logBump(guildId, serviceToUse.key, result.success, result.error);
        }

        // Arrêter le moteur
        engine.stop();

        if (result && result.success) {
          return {
            success: true,
            message: `Bump de test exécuté avec succès sur ${serviceToUse.name}`,
          };
        } else {
          return {
            success: false,
            error: (result && result.error) || "Échec du bump de test",
          };
        }
      } catch (engineError) {
        engine.stop();
        console.error(`Erreur moteur test bump ${guildId}:`, engineError);
        return { success: false, error: engineError.message || "Erreur du moteur" };
      }
    } catch (error) {
      console.error(`Erreur test bump ${guildId}:`, error);
      return { success: false, error: error.message || "Erreur lors du test" };
    }
  }

  /**
   * Retourne la liste des services disponibles
   * @returns {Object} Services avec leurs configurations par défaut
   */
  getAvailableServices() {
    return Object.entries(DEFAULT_BUMP_SERVICES).map(([key, service]) => ({
      id: key,
      name: service.name,
      botId: service.id,
      command: service.command,
      minDelay: service.minDelay,
      maxDelay: service.maxDelay,
      defaultEnabled: service.defaultEnabled,
      isDefault: true,
    }));
  }

  /**
   * Retourne les limites de configuration
   * @returns {Object} Limites
   */
  getLimits() {
    return {
      minDelay: LIMITS.MIN_DELAY,
      maxDelay: LIMITS.MAX_DELAY,
      maxCustomServices: LIMITS.MAX_CUSTOM_SERVICES,
    };
  }
}

// Singleton
const autoBumpService = new AutoBumpService();
module.exports = autoBumpService;
