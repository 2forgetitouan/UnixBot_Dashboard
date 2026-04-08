/**
 * Routes API pour les Messages
 */

const express = require("express");
const router = express.Router({ mergeParams: true });
const { requireAuth, requireGuildAdmin } = require("../middleware/auth");
const { validate } = require("../middleware/validator");
const MessageService = require("../services/MessageService");

// Tous les endpoints nécessitent une authentification et des droits admin sur le serveur
router.use(requireAuth);
router.use(requireGuildAdmin);

// ============================================
// VALIDATION SCHEMAS
// ============================================
const sendMessageSchema = {
  channel_id: { type: "string", required: true },
  content: { type: "string", required: false, maxLength: 2000 },
  embed: {
    type: "object",
    required: false,
    properties: {
      title: { type: "string", maxLength: 256 },
      description: { type: "string", maxLength: 4096 },
      color: { type: "string" },
      url: { type: "string" },
      footer: { type: "string", maxLength: 2048 },
      image: { type: "string" },
      thumbnail: { type: "string" },
    },
  },
};

const sendDMSchema = {
  user_id: { type: "string", required: true },
  content: { type: "string", required: false, maxLength: 2000 },
  embed: {
    type: "object",
    required: false,
  },
};

// ============================================
// ROUTES
// ============================================

/**
 * GET /api/guilds/:guildId/messages
 * Obtenir l'historique des messages envoyés depuis le dashboard
 */
router.get("/", async (req, res, next) => {
  try {
    const { guildId } = req.params;
    const { page = 1, limit = 20 } = req.query;

    const result = await MessageService.getMessageHistory(guildId, {
      page: parseInt(page),
      limit: Math.min(parseInt(limit), 100),
    });

    res.json({
      success: true,
      messages: result.messages,
      pagination: {
        page: parseInt(page),
        limit: Math.min(parseInt(limit), 100),
        total: result.total,
        totalPages: Math.ceil(result.total / Math.min(parseInt(limit), 100)),
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/guilds/:guildId/messages
 * Envoyer un message dans un salon
 */
router.post("/", validate(sendMessageSchema), async (req, res, next) => {
  try {
    const { guildId } = req.params;
    const userId = req.session.user.id;
    const { channel_id, content, embed } = req.body;

    // Vérifier qu'il y a du contenu
    if (!content && !embed) {
      return res.status(400).json({
        success: false,
        error: "Le message doit contenir du texte ou un embed",
      });
    }

    const result = await MessageService.sendToChannel({
      guildId: guildId,
      channelId: channel_id,
      content,
      embed,
      sentBy: userId,
    });

    res.status(201).json({
      success: true,
      message: "Message envoyé avec succès",
      data: result,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/guilds/:guildId/messages/dm
 * Envoyer un message privé à un membre
 */
router.post("/dm", validate(sendDMSchema), async (req, res, next) => {
  try {
    const { guildId } = req.params;
    const userId = req.session.user.id;
    const { user_id, content, embed } = req.body;

    // Vérifier qu'il y a du contenu
    if (!content && !embed) {
      return res.status(400).json({
        success: false,
        error: "Le message doit contenir du texte ou un embed",
      });
    }

    const result = await MessageService.sendDM({
      guildId: guildId,
      targetUserId: user_id,
      content,
      embed,
      sentBy: userId,
    });

    res.status(201).json({
      success: true,
      message: "Message privé envoyé",
      data: result,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/guilds/:guildId/messages/announcement
 * Envoyer une annonce à tous les membres (via un salon d'annonces)
 */
router.post(
  "/announcement",
  validate(sendMessageSchema),
  async (req, res, next) => {
    try {
      const { guildId } = req.params;
      const userId = req.session.user.id;
      const { channel_id, content, embed } = req.body;

      // Vérifier qu'il y a du contenu
      if (!content && !embed) {
        return res.status(400).json({
          success: false,
          error: "L'annonce doit contenir du texte ou un embed",
        });
      }

      const result = await MessageService.sendAnnouncement({
        guild_id: guildId,
        channel_id,
        content,
        embed,
        sent_by: userId,
      });

      res.status(201).json({
        success: true,
        message: "Annonce envoyée",
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/guilds/:guildId/channels
 * Obtenir la liste des salons du serveur
 */
router.get("/channels", async (req, res, next) => {
  try {
    const { guildId } = req.params;
    const { type } = req.query;

    const channels = await MessageService.getGuildChannels(guildId, { type });

    res.json({
      success: true,
      channels,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/guilds/:guildId/messages/:messageId
 * Supprimer un message envoyé depuis le dashboard
 */
router.delete("/:messageId", async (req, res, next) => {
  try {
    const { guildId, messageId } = req.params;

    await MessageService.deleteMessage(guildId, messageId);

    res.json({
      success: true,
      message: "Message supprimé",
    });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/guilds/:guildId/messages
 * Vider l'historique des messages pour ce serveur
 */
router.delete("/", async (req, res, next) => {
  try {
    const { guildId } = req.params;

    await MessageService.clearHistory(guildId);

    res.json({
      success: true,
      message: "Historique vidé avec succès",
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
