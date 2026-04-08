/**
 * Middleware d'authentification et d'autorisation
 * @module api/middleware/auth
 */

const AuthService = require("../services/AuthService");
const GuildService = require("../services/GuildService");
const { API_ERRORS } = require("../../shared/constants");

/**
 * Middleware pour vérifier l'authentification via session
 */
function requireAuth(req, res, next) {
  if (!req.session?.user?.id) {
    return res.status(API_ERRORS.UNAUTHORIZED.status).json({
      success: false,
      error: API_ERRORS.UNAUTHORIZED,
    });
  }

  // Vérifier si l'utilisateur est banni (gestion du cas où la colonne n'existe pas)
  try {
    const user = AuthService.db
      .prepare("SELECT * FROM users WHERE user_id = ?")
      .get(req.session.user.id);

    // Vérifier si is_banned existe et est true
    if (user && user.is_banned) {
      req.session.destroy(() => {});
      return res.status(API_ERRORS.FORBIDDEN.status).json({
        success: false,
        error: {
          ...API_ERRORS.FORBIDDEN,
          message: `Compte banni: ${
            user.ban_reason || "Aucune raison spécifiée"
          }`,
        },
      });
    }
  } catch (error) {
    // Si la table ou colonne n'existe pas, on continue (pas de ban check)
    console.warn("Ban check skipped:", error.message);
  }

  next();
}

/**
 * Middleware pour vérifier que l'utilisateur est superuser
 */
function requireSuperuser(req, res, next) {
  const userId = req.session?.user?.id;

  if (!userId) {
    return res.status(API_ERRORS.UNAUTHORIZED.status).json({
      success: false,
      error: API_ERRORS.UNAUTHORIZED,
    });
  }

  if (!AuthService.isSuperuser(userId)) {
    return res.status(API_ERRORS.FORBIDDEN.status).json({
      success: false,
      error: API_ERRORS.FORBIDDEN,
    });
  }

  req.isSuperuser = true;
  next();
}

/**
 * Middleware pour vérifier l'accès à une guilde spécifique
 * Attend guildId dans req.params
 */
function requireGuildAccess(req, res, next) {
  const userId = req.session?.user?.id;
  const guildId = req.params.guildId;

  if (!userId) {
    return res.status(API_ERRORS.UNAUTHORIZED.status).json({
      success: false,
      error: API_ERRORS.UNAUTHORIZED,
    });
  }

  if (!guildId) {
    return res.status(API_ERRORS.VALIDATION_ERROR.status).json({
      success: false,
      error: { ...API_ERRORS.VALIDATION_ERROR, message: "guildId requis" },
    });
  }

  // Superuser a accès à tout
  if (AuthService.isSuperuser(userId)) {
    req.isSuperuser = true;
    req.guildId = guildId;
    return next();
  }

  // Vérifier si l'utilisateur est owner de cette guilde
  if (!AuthService.isGuildOwner(userId, guildId)) {
    return res.status(API_ERRORS.FORBIDDEN.status).json({
      success: false,
      error: API_ERRORS.INSUFFICIENT_PERMISSIONS,
    });
  }

  // Vérifier que la guilde existe
  const guild = GuildService.getGuild(guildId);
  if (!guild) {
    return res.status(API_ERRORS.GUILD_NOT_FOUND.status).json({
      success: false,
      error: API_ERRORS.GUILD_NOT_FOUND,
    });
  }

  req.guildId = guildId;
  req.guild = guild;
  next();
}

/**
 * Middleware pour vérifier que le bot est présent sur la guilde
 * À utiliser après requireGuildAccess
 */
function requireBotPresence(botClient) {
  return async (req, res, next) => {
    const guildId = req.guildId || req.params.guildId;

    if (!guildId) {
      return res.status(API_ERRORS.VALIDATION_ERROR.status).json({
        success: false,
        error: { ...API_ERRORS.VALIDATION_ERROR, message: "guildId requis" },
      });
    }

    // Vérifier que le bot est dans la guilde
    try {
      const guild = botClient.guilds.cache.get(guildId);
      if (!guild) {
        // Essayer de fetch
        try {
          await botClient.guilds.fetch(guildId);
        } catch {
          return res.status(API_ERRORS.BOT_NOT_IN_GUILD.status).json({
            success: false,
            error: API_ERRORS.BOT_NOT_IN_GUILD,
          });
        }
      }
      req.botGuild = guild;
      next();
    } catch (error) {
      return res.status(API_ERRORS.BOT_NOT_IN_GUILD.status).json({
        success: false,
        error: API_ERRORS.BOT_NOT_IN_GUILD,
      });
    }
  };
}

/**
 * Middleware optionnel pour récupérer l'utilisateur sans bloquer
 */
function optionalAuth(req, res, next) {
  // L'utilisateur peut être présent ou non
  req.isAuthenticated = !!req.session?.user?.id;
  next();
}

/**
 * Middleware pour vérifier que l'utilisateur est admin d'une guilde
 * Vérifie via les permissions Discord (récupérées lors du login OAuth)
 */
async function requireGuildAdmin(req, res, next) {
  const userId = req.session?.user?.id;
  const accessToken = req.session?.user?.accessToken;
  const guildId = req.params.guildId;

  if (!userId || !accessToken) {
    return res.status(API_ERRORS.UNAUTHORIZED.status).json({
      success: false,
      error: API_ERRORS.UNAUTHORIZED,
    });
  }

  if (!guildId) {
    return res.status(API_ERRORS.VALIDATION_ERROR.status).json({
      success: false,
      error: { ...API_ERRORS.VALIDATION_ERROR, message: "guildId requis" },
    });
  }

  try {
    // Récupérer les guildes de l'utilisateur depuis Discord
    const response = await fetch("https://discord.com/api/users/@me/guilds", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      return res.status(API_ERRORS.UNAUTHORIZED.status).json({
        success: false,
        error: { ...API_ERRORS.UNAUTHORIZED, message: "Token expiré" },
      });
    }

    const guilds = await response.json();
    const guild = guilds.find((g) => g.id === guildId);

    if (!guild) {
      return res.status(API_ERRORS.FORBIDDEN.status).json({
        success: false,
        error: {
          ...API_ERRORS.FORBIDDEN,
          message: "Vous n'êtes pas membre de ce serveur",
        },
      });
    }

    // Vérifier les permissions admin
    const permissions = BigInt(guild.permissions);
    const ADMINISTRATOR = BigInt(0x8);
    const MANAGE_GUILD = BigInt(0x20);

    const isAdmin =
      (permissions & ADMINISTRATOR) === ADMINISTRATOR ||
      (permissions & MANAGE_GUILD) === MANAGE_GUILD;

    if (!isAdmin) {
      return res.status(API_ERRORS.FORBIDDEN.status).json({
        success: false,
        error: API_ERRORS.INSUFFICIENT_PERMISSIONS,
      });
    }

    req.guildId = guildId;
    req.userGuild = guild;
    next();
  } catch (error) {
    console.error("Error in requireGuildAdmin:", error);
    return res.status(500).json({
      success: false,
      error: { message: "Erreur de vérification des permissions" },
    });
  }
}

/**
 * Factory pour créer un middleware de log d'audit
 */
function auditLog(action, targetType) {
  return (req, res, next) => {
    // Sauvegarder la fonction send originale
    const originalSend = res.send;

    res.send = function (body) {
      // Log uniquement en cas de succès
      try {
        const parsed = typeof body === "string" ? JSON.parse(body) : body;
        if (parsed.success) {
          AuthService.logAudit({
            guildId: req.guildId || req.params.guildId,
            userId: req.session?.user?.id,
            action,
            targetType,
            targetId: req.params.id || req.body?.id,
            oldValue: req.originalData,
            newValue: req.body,
            req,
          });
        }
      } catch {
        // Ignore les erreurs de parsing
      }

      return originalSend.call(this, body);
    };

    next();
  };
}

module.exports = {
  requireAuth,
  requireSuperuser,
  requireGuildAccess,
  requireGuildAdmin,
  requireBotPresence,
  optionalAuth,
  auditLog,
};
