/**
 * Routes API pour les Giveaways
 */

const express = require("express");
const router = express.Router({ mergeParams: true });
const { requireAuth, requireGuildAdmin } = require("../middleware/auth");
const { validate } = require("../middleware/validator");
const GiveawayService = require("../services/GiveawayService");

// Tous les endpoints nécessitent une authentification et des droits admin sur le serveur
router.use(requireAuth);
router.use(requireGuildAdmin);

// ============================================
// VALIDATION SCHEMAS
// ============================================
const createGiveawaySchema = {
  channel_id: { type: "string", required: true },
  prize: { type: "string", required: true, minLength: 1, maxLength: 256 },
  description: { type: "string", required: false, maxLength: 1000 },
  duration: { type: "number", required: true, min: 1, max: 43200 }, // Max 30 jours en minutes
  duration_unit: {
    type: "string",
    required: true,
    enum: ["minutes", "hours", "days"],
  },
  winners_count: { type: "number", required: false, min: 1, max: 20 },
};

const updateGiveawaySchema = {
  prize: { type: "string", required: false, maxLength: 256 },
  description: { type: "string", required: false, maxLength: 1000 },
  ends_at: { type: "string", required: false }, // ISO date string
  end_time: { type: "string", required: false }, // Alias pour ends_at
  winners_count: { type: "number", required: false, min: 1, max: 20 },
};

// ============================================
// ROUTES
// ============================================

/**
 * GET /api/guilds/:guildId/giveaways
 * Lister tous les giveaways d'un serveur
 */
router.get("/", async (req, res, next) => {
  try {
    const { guildId } = req.params;
    const { status, page = 1, limit = 20 } = req.query;

    const options = {
      status,
      page: parseInt(page),
      limit: Math.min(parseInt(limit), 100),
    };

    const result = await GiveawayService.getGuildGiveaways(guildId, options);

    res.json({
      success: true,
      giveaways: result.giveaways,
      pagination: {
        page: options.page,
        limit: options.limit,
        total: result.total,
        totalPages: Math.ceil(result.total / options.limit),
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/guilds/:guildId/giveaways/:giveawayId
 * Obtenir les détails d'un giveaway
 */
router.get("/:giveawayId", async (req, res, next) => {
  try {
    const { guildId, giveawayId } = req.params;

    const giveaway = await GiveawayService.getGiveaway(guildId, giveawayId);

    if (!giveaway) {
      return res.status(404).json({
        success: false,
        error: "Giveaway non trouvé",
      });
    }

    res.json({
      success: true,
      giveaway,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/guilds/:guildId/giveaways
 * Créer un nouveau giveaway
 */
router.post("/", validate(createGiveawaySchema), async (req, res, next) => {
  try {
    const { guildId } = req.params;
    const userId = req.session.user.id;
    const {
      channel_id,
      prize,
      description,
      duration,
      duration_unit,
      winners_count,
    } = req.body;

    // Calculer la date de fin
    let durationMs;
    switch (duration_unit) {
      case "minutes":
        durationMs = duration * 60 * 1000;
        break;
      case "hours":
        durationMs = duration * 60 * 60 * 1000;
        break;
      case "days":
        durationMs = duration * 24 * 60 * 60 * 1000;
        break;
      default:
        durationMs = duration * 60 * 1000;
    }

    const endsAt = new Date(Date.now() + durationMs);

    const giveaway = await GiveawayService.createGiveaway({
      guild_id: guildId,
      channel_id,
      prize,
      description,
      ends_at: endsAt,
      winners_count: winners_count || 1,
      host_id: userId,
    });

    res.status(201).json({
      success: true,
      message: "Giveaway créé avec succès",
      giveaway,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PATCH /api/guilds/:guildId/giveaways/:giveawayId
 * Modifier un giveaway
 */
router.patch(
  "/:giveawayId",
  validate(updateGiveawaySchema),
  async (req, res, next) => {
    try {
      const { guildId, giveawayId } = req.params;
      const updates = req.body;

      const giveaway = await GiveawayService.updateGiveaway(
        guildId,
        giveawayId,
        updates
      );

      res.json({
        success: true,
        message: "Giveaway mis à jour",
        giveaway,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * PUT /api/guilds/:guildId/giveaways/:giveawayId
 * Modifier un giveaway (alias de PATCH)
 */
router.put(
  "/:giveawayId",
  validate(updateGiveawaySchema),
  async (req, res, next) => {
    try {
      const { guildId, giveawayId } = req.params;
      const updates = req.body;

      const giveaway = await GiveawayService.updateGiveaway(
        guildId,
        giveawayId,
        updates
      );

      res.json({
        success: true,
        message: "Giveaway mis à jour",
        giveaway,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * DELETE /api/guilds/:guildId/giveaways/:giveawayId
 * Supprimer un giveaway
 */
router.delete("/:giveawayId", async (req, res, next) => {
  try {
    const { guildId, giveawayId } = req.params;

    await GiveawayService.deleteGiveaway(guildId, giveawayId);

    res.json({
      success: true,
      message: "Giveaway supprimé",
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/guilds/:guildId/giveaways/:giveawayId/pause
 * Mettre en pause un giveaway
 */
router.post("/:giveawayId/pause", async (req, res, next) => {
  try {
    const { guildId, giveawayId } = req.params;

    const giveaway = await GiveawayService.pauseGiveaway(guildId, giveawayId);

    res.json({
      success: true,
      message: "Giveaway mis en pause",
      giveaway,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/guilds/:guildId/giveaways/:giveawayId/resume
 * Reprendre un giveaway en pause
 */
router.post("/:giveawayId/resume", async (req, res, next) => {
  try {
    const { guildId, giveawayId } = req.params;

    const giveaway = await GiveawayService.resumeGiveaway(guildId, giveawayId);

    res.json({
      success: true,
      message: "Giveaway repris",
      giveaway,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/guilds/:guildId/giveaways/:giveawayId/end
 * Terminer un giveaway manuellement
 */
router.post("/:giveawayId/end", async (req, res, next) => {
  try {
    const { guildId, giveawayId } = req.params;

    const result = await GiveawayService.endGiveaway(guildId, giveawayId);

    res.json({
      success: true,
      message: "Giveaway terminé",
      giveaway: result.giveaway,
      winners: result.winners,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/guilds/:guildId/giveaways/:giveawayId/reroll
 * Retirer un nouveau gagnant
 */
router.post("/:giveawayId/reroll", async (req, res, next) => {
  try {
    const { guildId, giveawayId } = req.params;
    const { count = 1 } = req.body;

    const result = await GiveawayService.rerollGiveaway(
      guildId,
      giveawayId,
      count
    );

    res.json({
      success: true,
      message: "Nouveau gagnant tiré",
      winners: result.winners,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/guilds/:guildId/giveaways/:giveawayId/participants
 * Obtenir la liste des participants
 */
router.get("/:giveawayId/participants", async (req, res, next) => {
  try {
    const { guildId, giveawayId } = req.params;
    const { page = 1, limit = 50 } = req.query;

    const result = GiveawayService.getParticipants(guildId, giveawayId, {
      page: parseInt(page),
      limit: Math.min(parseInt(limit), 100),
    });

    res.json({
      success: true,
      participants: result.participants,
      pagination: {
        page: parseInt(page),
        limit: Math.min(parseInt(limit), 100),
        total: result.total,
      },
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
