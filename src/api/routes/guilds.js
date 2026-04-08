/**
 * Routes de gestion des serveurs (guilds)
 * @module api/routes/guilds
 */

const express = require("express");
const router = express.Router();

const { requireAuth, requireGuildAdmin } = require("../middleware/auth");
const { validate } = require("../middleware/validator");
const { getDatabase } = require("../../database/init");

// ============================================
// MIDDLEWARE
// ============================================
router.use(requireAuth);

// ============================================
// HELPERS
// ============================================

/**
 * Récupérer les serveurs de l'utilisateur depuis Discord
 */
async function fetchUserGuilds(accessToken) {
  const response = await fetch("https://discord.com/api/users/@me/guilds", {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    throw new Error("Failed to fetch guilds");
  }

  return response.json();
}

/**
 * Vérifier si l'utilisateur est admin d'un serveur
 */
function isGuildAdmin(permissions) {
  const perms = BigInt(permissions);
  const ADMINISTRATOR = BigInt(0x8);
  const MANAGE_GUILD = BigInt(0x20);
  return (
    (perms & ADMINISTRATOR) === ADMINISTRATOR ||
    (perms & MANAGE_GUILD) === MANAGE_GUILD
  );
}

// ============================================
// ROUTES
// ============================================

/**
 * GET /api/guilds
 * Lister les serveurs de l'utilisateur où il peut gérer le bot
 */
router.get("/", async (req, res, next) => {
  try {
    const accessToken = req.session.user.accessToken;
    const db = getDatabase();

    // Récupérer les serveurs depuis Discord
    const allGuilds = await fetchUserGuilds(accessToken);

    // Filtrer les serveurs où l'utilisateur est admin
    const adminGuilds = allGuilds.filter((g) => isGuildAdmin(g.permissions));

    // Récupérer les serveurs où le bot est présent
    const botGuilds = db
      .prepare("SELECT id FROM guilds WHERE bot_present = 1")
      .all();
    const botGuildIds = new Set(botGuilds.map((g) => g.id));

    // Enrichir les données
    const guilds = adminGuilds.map((guild) => ({
      id: guild.id,
      name: guild.name,
      icon: guild.icon,
      iconUrl: guild.icon
        ? `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png?size=128`
        : null,
      owner: guild.owner,
      botPresent: botGuildIds.has(guild.id),
    }));

    // Trier: bot présent d'abord, puis par nom
    guilds.sort((a, b) => {
      if (a.botPresent !== b.botPresent) {
        return b.botPresent ? 1 : -1;
      }
      return a.name.localeCompare(b.name);
    });

    res.json({
      success: true,
      guilds,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/guilds/:guildId
 * Obtenir les détails d'un serveur
 */
router.get("/:guildId", requireGuildAdmin, async (req, res, next) => {
  try {
    const { guildId } = req.params;
    const db = getDatabase();

    // Récupérer le serveur depuis la DB
    const guild = db
      .prepare(
        `
      SELECT * FROM guilds WHERE id = ?
    `
      )
      .get(guildId);

    if (!guild) {
      return res.status(404).json({
        success: false,
        error: "Serveur non trouvé",
      });
    }

    // Récupérer les settings
    const settings =
      db
        .prepare(
          `
      SELECT * FROM guild_settings WHERE guild_id = ?
    `
        )
        .get(guildId) || {};

    // Récupérer les stats
    const giveawaysCount =
      db
        .prepare(
          `
      SELECT COUNT(*) as count FROM giveaways WHERE guild_id = ?
    `
        )
        .get(guildId)?.count || 0;

    const activeGiveaways =
      db
        .prepare(
          `
      SELECT COUNT(*) as count FROM giveaways WHERE guild_id = ? AND status = 'active'
    `
        )
        .get(guildId)?.count || 0;

    res.json({
      success: true,
      guild: {
        id: guild.id,
        name: guild.name,
        icon: guild.icon,
        ownerId: guild.owner_id,
        memberCount: guild.member_count,
        botPresent: guild.bot_present === 1,
        joinedAt: guild.joined_at,
        settings,
      },
      stats: {
        giveaways: {
          total: giveawaysCount,
          active: activeGiveaways,
        },
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/guilds/:guildId/settings
 * Obtenir les paramètres d'un serveur
 */
router.get("/:guildId/settings", requireGuildAdmin, async (req, res, next) => {
  try {
    const { guildId } = req.params;
    const db = getDatabase();

    const settings = db
      .prepare(
        `
      SELECT * FROM guild_settings WHERE guild_id = ?
    `
      )
      .get(guildId);

    // Valeurs par défaut
    const defaultSettings = {
      prefix: "!",
      language: "fr",
      timezone: "Europe/Paris",
      welcome_enabled: false,
      welcome_channel_id: null,
      welcome_message: "Bienvenue {user} sur {server} !",
      goodbye_enabled: false,
      logs_enabled: false,
      logs_channel_id: null,
      automod_enabled: false,
      giveaway_color: "#5865F2",
      giveaway_emoji: "🎉",
      giveaway_dm_winners: true,
    };

    res.json({
      success: true,
      settings: { ...defaultSettings, ...settings },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /api/guilds/:guildId/settings
 * Mettre à jour les paramètres d'un serveur
 */
router.put("/:guildId/settings", requireGuildAdmin, async (req, res, next) => {
  try {
    const { guildId } = req.params;
    const settings = req.body;
    const db = getDatabase();

    // Construire la requête dynamiquement
    const allowedFields = [
      "prefix",
      "language",
      "timezone",
      "welcome_enabled",
      "welcome_channel_id",
      "welcome_message",
      "goodbye_enabled",
      "goodbye_channel_id",
      "goodbye_message",
      "logs_enabled",
      "logs_channel_id",
      "log_messages",
      "log_members",
      "log_moderation",
      "automod_enabled",
      "antilink_enabled",
      "antispam_enabled",
      "mute_role_id",
      "giveaway_color",
      "giveaway_emoji",
      "giveaway_dm_winners",
      "selfbump_enabled",
      "autounarchive_enabled",
      "ping_tracking",
    ];

    // Filtrer les champs autorisés
    const filteredSettings = {};
    for (const [key, value] of Object.entries(settings)) {
      if (allowedFields.includes(key)) {
        filteredSettings[key] = value;
      }
    }

    if (Object.keys(filteredSettings).length === 0) {
      return res.status(400).json({
        success: false,
        error: "Aucun paramètre valide fourni",
      });
    }

    // Construire la requête UPSERT
    const fields = Object.keys(filteredSettings);
    const placeholders = fields.map(() => "?").join(", ");
    const updates = fields.map((f) => `${f} = excluded.${f}`).join(", ");

    const sql = `
      INSERT INTO guild_settings (guild_id, ${fields.join(", ")}, updated_at)
      VALUES (?, ${placeholders}, CURRENT_TIMESTAMP)
      ON CONFLICT(guild_id) DO UPDATE SET
        ${updates},
        updated_at = CURRENT_TIMESTAMP
    `;

    db.prepare(sql).run(guildId, ...Object.values(filteredSettings));

    // Récupérer les settings mis à jour
    const updatedSettings = db
      .prepare(
        `
      SELECT * FROM guild_settings WHERE guild_id = ?
    `
      )
      .get(guildId);

    res.json({
      success: true,
      message: "Paramètres sauvegardés",
      settings: updatedSettings,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/guilds/:guildId/channels
 * Obtenir les salons d'un serveur
 */
router.get("/:guildId/channels", requireGuildAdmin, async (req, res, next) => {
  try {
    const { guildId } = req.params;

    // TODO: Récupérer depuis le bot client
    // Pour l'instant, retourner un tableau vide
    res.json({
      success: true,
      channels: [],
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/guilds/:guildId/roles
 * Obtenir les rôles d'un serveur
 */
router.get("/:guildId/roles", requireGuildAdmin, async (req, res, next) => {
  try {
    const { guildId } = req.params;

    // TODO: Récupérer depuis le bot client
    res.json({
      success: true,
      roles: [],
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/guilds/:guildId/members
 * Obtenir les membres d'un serveur (pagination)
 */
router.get("/:guildId/members", requireGuildAdmin, async (req, res, next) => {
  try {
    const { guildId } = req.params;
    const { page = 1, limit = 50, search } = req.query;
    const db = getDatabase();

    let sql = `
      SELECT * FROM guild_users 
      WHERE guild_id = ? AND is_member = 1
    `;
    const params = [guildId];

    if (search) {
      sql += ` AND user_id IN (
        SELECT user_id FROM users 
        WHERE username LIKE ?
      )`;
      params.push(`%${search}%`);
    }

    sql += ` ORDER BY joined_at DESC LIMIT ? OFFSET ?`;
    params.push(parseInt(limit), (parseInt(page) - 1) * parseInt(limit));

    const members = db.prepare(sql).all(...params);

    // Count total
    let countSql = `SELECT COUNT(*) as count FROM guild_users WHERE guild_id = ? AND is_member = 1`;
    const countParams = [guildId];
    if (search) {
      countSql += ` AND user_id IN (
        SELECT user_id FROM users 
        WHERE username LIKE ?
      )`;
      countParams.push(`%${search}%`);
    }
    const total = db.prepare(countSql).get(...countParams)?.count || 0;

    res.json({
      success: true,
      members,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/guilds/:guildId/logs
 * Obtenir les logs d'un serveur
 */
router.get("/:guildId/logs", requireGuildAdmin, async (req, res, next) => {
  try {
    const { guildId } = req.params;
    const { page = 1, limit = 50, type } = req.query;
    const db = getDatabase();

    let sql = `
      SELECT * FROM logs 
      WHERE guild_id = ?
    `;
    const params = [guildId];

    if (type) {
      sql += ` AND type = ?`;
      params.push(type);
    }

    sql += ` ORDER BY created_at DESC LIMIT ? OFFSET ?`;
    params.push(parseInt(limit), (parseInt(page) - 1) * parseInt(limit));

    const logs = db.prepare(sql).all(...params);

    res.json({
      success: true,
      logs,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/guilds/:guildId/members/search
 * Rechercher des membres via Discord API
 */
router.get(
  "/:guildId/members/search",
  requireGuildAdmin,
  async (req, res, next) => {
    try {
      const { guildId } = req.params;
      const { q: query } = req.query;

      if (!query || query.length < 1) {
        return res.json({ success: true, members: [] });
      }

      // Rechercher les membres via le bridge
      const bridge = require("../../shared/botBridge");
      const members = await bridge.searchGuildMembers(guildId, query);

      if (!members || members.length === 0) {
        return res.json({ success: true, members: [] });
      }

      // Formater pour compatibilité (le bridge retourne déjà le bon format)
      const formatted = members.map((m) => ({
        id: m.id,
        username: m.username,
        displayName: m.displayName,
        avatarUrl: m.avatar,
        discriminator: "0",
      }));

      res.json({
        success: true,
        members: formatted,
      });
    } catch (error) {
      next(error);
    }
  }
);

module.exports = router;
