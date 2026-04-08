/**
 * Routes API pour l'Auto-Bump
 * @module api/routes/autobump
 */

const express = require("express");
const router = express.Router();

const { requireAuth, requireGuildAdmin } = require("../middleware/auth");
const AutoBumpService = require("../services/AutoBumpService");

// ============================================
// MIDDLEWARE
// ============================================
router.use(requireAuth);

// ============================================
// ROUTES
// ============================================

/**
 * GET /api/autobump/services
 * Liste des services de bump disponibles
 */
router.get("/services", (req, res) => {
  const services = AutoBumpService.getAvailableServices();
  res.json({ success: true, services });
});

/**
 * POST /api/autobump/verify-token
 * Vérifie un token utilisateur Discord
 */
router.post("/verify-token", async (req, res, next) => {
  try {
    const { token } = req.body;
    const userId = req.session.user.id;

    if (!token) {
      return res.status(400).json({
        success: false,
        error: "Token requis",
      });
    }

    const result = await AutoBumpService.verifyToken(token);

    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: result.error,
        isBot: result.isBot || false,
      });
    }

    res.json({
      success: true,
      user: result.user,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/autobump/verify-bot/:botId
 * Vérifie si un ID correspond à un bot Discord
 */
router.get("/verify-bot/:botId", async (req, res, next) => {
  try {
    const { botId } = req.params;

    if (!botId || !/^\d{17,20}$/.test(botId)) {
      return res.status(400).json({
        success: false,
        error: "ID de bot invalide",
      });
    }

    // Utiliser l'API Discord pour récupérer les infos du user
    const discordResponse = await fetch(`https://discord.com/api/v10/users/${botId}`, {
      headers: {
        Authorization: `Bot ${process.env.TOKEN}`,
      },
    });

    if (!discordResponse.ok) {
      const errorData = await discordResponse.text();
      console.error(`[AutoBump] Erreur Discord API pour bot ${botId}:`, discordResponse.status, errorData);
      
      if (discordResponse.status === 404) {
        return res.status(404).json({
          success: false,
          error: "Cet ID Discord n'existe pas ou l'utilisateur n'est pas accessible",
        });
      } else if (discordResponse.status === 403) {
        return res.status(400).json({
          success: false,
          error: "Impossible d'accéder aux informations de cet utilisateur",
        });
      }
      
      return res.status(400).json({
        success: false,
        error: "Impossible de vérifier cet ID",
      });
    }

    const user = await discordResponse.json();
    
    // Vérifier si c'est un bot
    if (!user.bot) {
      return res.status(400).json({
        success: false,
        error: "Cet ID n'appartient pas à un bot",
        isBot: false,
      });
    }

    const avatarUrl = user.avatar
      ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.${user.avatar.startsWith("a_") ? "gif" : "png"}?size=64`
      : `https://cdn.discordapp.com/embed/avatars/${(BigInt(user.id) >> 22n) % 6n}.png`;

    res.json({
      success: true,
      isBot: true,
      user: {
        id: user.id,
        username: user.username,
        discriminator: user.discriminator,
        avatar: user.avatar,
        avatarUrl,
        isBot: user.bot,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/autobump/:guildId
 * Récupère la configuration et le statut de l'auto-bump pour un serveur
 */
router.get("/:guildId", requireGuildAdmin, async (req, res, next) => {
  try {
    const { guildId } = req.params;

    const status = AutoBumpService.getStatus(guildId);
    const services = AutoBumpService.getAvailableServices();

    res.json({
      success: true,
      ...status,
      availableServices: services,
    });
  } catch (error) {
    console.error(`[AutoBump] Erreur GET /:guildId pour ${req.params.guildId}:`, error.message);
    next(error);
  }
});

/**
 * GET /api/autobump/:guildId/history
 * Récupère l'historique des bumps
 */
router.get("/:guildId/history", requireGuildAdmin, async (req, res, next) => {
  try {
    const { guildId } = req.params;
    const { limit = 50 } = req.query;

    const history = AutoBumpService.getHistory(guildId, parseInt(limit));

    res.json({
      success: true,
      history,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/autobump/:guildId
 * Crée ou met à jour la configuration de l'auto-bump
 */
router.post("/:guildId", requireGuildAdmin, async (req, res, next) => {
  try {
    const { guildId } = req.params;
    const userId = req.session.user.id;
    const { token, channelId, services, customServices } = req.body;

    // Validation
    if (!channelId) {
      return res.status(400).json({
        success: false,
        error: "Salon requis",
      });
    }

    const result = await AutoBumpService.saveConfig({
      guildId,
      userId,
      channelId,
      token: token || null, // Token optionnel si mise à jour
      services,
      customServices,
    });

    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: result.error,
        isBot: result.isBot || false,
      });
    }

    res.json({
      success: true,
      message: result.message,
      user: result.user,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/autobump/:guildId
 * Supprime la configuration de l'auto-bump
 */
router.delete("/:guildId", requireGuildAdmin, async (req, res, next) => {
  try {
    const { guildId } = req.params;
    const userId = req.session.user.id;

    const result = AutoBumpService.deleteConfig(guildId, userId);

    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: result.error,
      });
    }

    res.json({
      success: true,
      message: result.message,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/autobump/:guildId/start
 * Démarre l'auto-bump
 */
router.post("/:guildId/start", requireGuildAdmin, async (req, res, next) => {
  try {
    const { guildId } = req.params;

    const result = await AutoBumpService.startAutoBump(guildId);

    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: result.error,
      });
    }

    res.json({
      success: true,
      message: result.message,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/autobump/:guildId/stop
 * Arrête l'auto-bump
 */
router.post("/:guildId/stop", requireGuildAdmin, async (req, res, next) => {
  try {
    const { guildId } = req.params;

    const result = AutoBumpService.stopAutoBump(guildId);

    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: result.error,
      });
    }

    res.json({
      success: true,
      message: result.message,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/autobump/:guildId/test
 * Exécute manuellement un bump de test
 */
router.post("/:guildId/test", requireGuildAdmin, async (req, res, next) => {
  try {
    const { guildId } = req.params;
    const { service } = req.body;

    const result = await AutoBumpService.executeManualBump(guildId, service);

    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: result.error,
      });
    }

    res.json({
      success: true,
      message: result.message,
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
