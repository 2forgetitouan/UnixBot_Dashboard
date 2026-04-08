/**
 * Routes API pour les Commandes
 */

const express = require("express");
const router = express.Router({ mergeParams: true });
const { requireAuth, requireGuildAdmin } = require("../middleware/auth");
const { validate } = require("../middleware/validator");
const { getDatabase } = require("../../database/init");

// Tous les endpoints nécessitent une authentification et des droits admin sur le serveur
router.use(requireAuth);
router.use(requireGuildAdmin);

// ============================================
// VALIDATION SCHEMAS
// ============================================
const updateCommandSchema = {
  enabled: { type: "boolean", required: false },
  allowed_roles: { type: "array", required: false },
  denied_roles: { type: "array", required: false },
  allowed_channels: { type: "array", required: false },
  cooldown: { type: "number", required: false, min: 0, max: 86400 },
};

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Récupérer toutes les commandes disponibles
 */
function getAvailableCommands() {
  // Liste des commandes du bot (à synchroniser avec les vrais fichiers de commandes)
  return [
    // Admin
    {
      name: "allowarchive",
      category: "admin",
      description: "Permettre l'archivage d'un salon",
      usage: "<channel>",
      default_enabled: true,
    },
    {
      name: "autounarchive",
      category: "admin",
      description: "Activer/désactiver l'auto-désarchivage des threads",
      usage: "[on/off]",
      default_enabled: true,
    },
    {
      name: "noarchive",
      category: "admin",
      description: "Empêcher l'archivage d'un salon",
      usage: "<channel>",
      default_enabled: true,
    },
    {
      name: "owner",
      category: "admin",
      description: "Ajouter un propriétaire au serveur",
      usage: "<user>",
      default_enabled: true,
    },
    {
      name: "unowner",
      category: "admin",
      description: "Retirer un propriétaire du serveur",
      usage: "<user>",
      default_enabled: true,
    },
    {
      name: "purge",
      category: "admin",
      description: "Supprimer des messages en masse",
      usage: "<amount>",
      default_enabled: true,
    },
    // Événements
    {
      name: "giveaway",
      category: "evenements",
      description: "Créer un giveaway",
      usage: "<duration> <winners> <prize>",
      default_enabled: true,
    },
    {
      name: "reroll",
      category: "evenements",
      description: "Retirer un gagnant de giveaway",
      usage: "<message_id>",
      default_enabled: true,
    },
    // Fun
    {
      name: "randomgif",
      category: "fun",
      description: "Envoyer un GIF aléatoire",
      usage: "[keyword]",
      default_enabled: true,
    },
    // Infos
    {
      name: "botinfo",
      category: "infos",
      description: "Afficher les informations du bot",
      usage: "",
      default_enabled: true,
    },
    {
      name: "help",
      category: "infos",
      description: "Afficher la liste des commandes",
      usage: "[command]",
      default_enabled: true,
    },
    {
      name: "ping",
      category: "infos",
      description: "Vérifier la latence du bot",
      usage: "",
      default_enabled: true,
    },
    {
      name: "uptime",
      category: "infos",
      description: "Afficher le temps de fonctionnement du bot",
      usage: "",
      default_enabled: true,
    },
    // Utilitaire
    {
      name: "bumpstats",
      category: "utilitaire",
      description: "Afficher les statistiques de bump",
      usage: "[user]",
      default_enabled: true,
    },
    {
      name: "selfbump",
      category: "utilitaire",
      description: "Configurer le rappel de bump automatique",
      usage: "[on/off]",
      default_enabled: true,
    },
    // Utils
    {
      name: "qr",
      category: "utils",
      description: "Générer un QR code",
      usage: "<text>",
      default_enabled: true,
    },
  ];
}

// ============================================
// ROUTES
// ============================================

/**
 * GET /api/guilds/:guildId/commands
 * Lister toutes les commandes avec leur état pour ce serveur
 */
router.get("/", async (req, res, next) => {
  try {
    const { guildId } = req.params;
    const { category } = req.query;
    const db = getDatabase();

    // Récupérer toutes les commandes disponibles
    const availableCommands = getAvailableCommands();

    // Récupérer les configurations personnalisées pour ce serveur
    const customConfigs = db
      .prepare(
        `
      SELECT * FROM commands 
      WHERE guild_id = ?
    `
      )
      .all(guildId);

    const configMap = new Map(customConfigs.map((c) => [c.name, c]));

    // Fusionner les commandes avec leurs configs
    let commands = availableCommands.map((cmd) => {
      const config = configMap.get(cmd.name);
      return {
        ...cmd,
        enabled: config ? config.enabled === 1 : cmd.default_enabled,
        cooldown: config?.cooldown || 0,
        allowed_roles: config?.allowed_roles
          ? JSON.parse(config.allowed_roles)
          : [],
        denied_roles: config?.denied_roles
          ? JSON.parse(config.denied_roles)
          : [],
        allowed_channels: config?.allowed_channels
          ? JSON.parse(config.allowed_channels)
          : [],
      };
    });

    // Filtrer par catégorie si demandé
    if (category && category !== "all") {
      commands = commands.filter((cmd) => cmd.category === category);
    }

    // Récupérer les catégories uniques
    const categories = [...new Set(availableCommands.map((c) => c.category))];

    res.json({
      success: true,
      commands,
      categories,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/guilds/:guildId/commands/:commandName
 * Obtenir les détails d'une commande
 */
router.get("/:commandName", async (req, res, next) => {
  try {
    const { guildId, commandName } = req.params;
    const db = getDatabase();

    const availableCommands = getAvailableCommands();
    const cmdDef = availableCommands.find((c) => c.name === commandName);

    if (!cmdDef) {
      return res.status(404).json({
        success: false,
        error: "Commande non trouvée",
      });
    }

    // Récupérer la config personnalisée
    const config = db
      .prepare(
        `
      SELECT * FROM commands 
      WHERE guild_id = ? AND name = ?
    `
      )
      .get(guildId, commandName);

    // Récupérer les permissions personnalisées
    const permissions = db
      .prepare(
        `
      SELECT * FROM command_permissions 
      WHERE guild_id = ? AND command_name = ?
    `
      )
      .all(guildId, commandName);

    res.json({
      success: true,
      command: {
        ...cmdDef,
        enabled: config ? config.enabled === 1 : cmdDef.default_enabled,
        cooldown: config?.cooldown || 0,
        allowed_roles: config?.allowed_roles
          ? JSON.parse(config.allowed_roles)
          : [],
        denied_roles: config?.denied_roles
          ? JSON.parse(config.denied_roles)
          : [],
        allowed_channels: config?.allowed_channels
          ? JSON.parse(config.allowed_channels)
          : [],
        permissions,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PATCH /api/guilds/:guildId/commands/:commandName
 * Modifier la configuration d'une commande
 */
router.patch(
  "/:commandName",
  validate(updateCommandSchema),
  async (req, res, next) => {
    try {
      const { guildId, commandName } = req.params;
      const {
        enabled,
        allowed_roles,
        denied_roles,
        allowed_channels,
        cooldown,
      } = req.body;
      const db = getDatabase();

      // Vérifier que la commande existe
      const availableCommands = getAvailableCommands();
      const cmdDef = availableCommands.find((c) => c.name === commandName);

      if (!cmdDef) {
        return res.status(404).json({
          success: false,
          error: "Commande non trouvée",
        });
      }

      // Upsert la configuration
      const stmt = db.prepare(`
      INSERT INTO commands (guild_id, name, enabled, allowed_roles, denied_roles, allowed_channels, cooldown, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(guild_id, name) DO UPDATE SET
        enabled = COALESCE(excluded.enabled, commands.enabled),
        allowed_roles = COALESCE(excluded.allowed_roles, commands.allowed_roles),
        denied_roles = COALESCE(excluded.denied_roles, commands.denied_roles),
        allowed_channels = COALESCE(excluded.allowed_channels, commands.allowed_channels),
        cooldown = COALESCE(excluded.cooldown, commands.cooldown),
        updated_at = CURRENT_TIMESTAMP
    `);

      stmt.run(
        guildId,
        commandName,
        enabled !== undefined ? (enabled ? 1 : 0) : null,
        allowed_roles ? JSON.stringify(allowed_roles) : null,
        denied_roles ? JSON.stringify(denied_roles) : null,
        allowed_channels ? JSON.stringify(allowed_channels) : null,
        cooldown !== undefined ? cooldown : null
      );

      // Récupérer la config mise à jour
      const updatedConfig = db
        .prepare(
          `
      SELECT * FROM commands 
      WHERE guild_id = ? AND name = ?
    `
        )
        .get(guildId, commandName);

      res.json({
        success: true,
        message: "Configuration mise à jour",
        command: {
          ...cmdDef,
          enabled: updatedConfig
            ? updatedConfig.enabled === 1
            : cmdDef.default_enabled,
          cooldown: updatedConfig?.cooldown || 0,
          allowed_roles: updatedConfig?.allowed_roles
            ? JSON.parse(updatedConfig.allowed_roles)
            : [],
          denied_roles: updatedConfig?.denied_roles
            ? JSON.parse(updatedConfig.denied_roles)
            : [],
          allowed_channels: updatedConfig?.allowed_channels
            ? JSON.parse(updatedConfig.allowed_channels)
            : [],
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /api/guilds/:guildId/commands/:commandName/reset
 * Réinitialiser une commande à ses valeurs par défaut
 */
router.post("/:commandName/reset", async (req, res, next) => {
  try {
    const { guildId, commandName } = req.params;
    const db = getDatabase();

    // Supprimer la configuration personnalisée
    db.prepare(
      `
      DELETE FROM commands 
      WHERE guild_id = ? AND name = ?
    `
    ).run(guildId, commandName);

    // Supprimer les permissions personnalisées
    db.prepare(
      `
      DELETE FROM command_permissions 
      WHERE guild_id = ? AND command_name = ?
    `
    ).run(guildId, commandName);

    const availableCommands = getAvailableCommands();
    const cmdDef = availableCommands.find((c) => c.name === commandName);

    res.json({
      success: true,
      message: "Commande réinitialisée",
      command: cmdDef,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/guilds/:guildId/commands/bulk
 * Activer/désactiver plusieurs commandes en une fois
 */
router.post("/bulk", async (req, res, next) => {
  try {
    const { guildId } = req.params;
    const { commands, enabled } = req.body;
    const db = getDatabase();

    if (!Array.isArray(commands) || typeof enabled !== "boolean") {
      return res.status(400).json({
        success: false,
        error: "Format invalide",
      });
    }

    const availableCommands = getAvailableCommands();
    const validCommands = commands.filter((name) =>
      availableCommands.some((c) => c.name === name)
    );

    const stmt = db.prepare(`
      INSERT INTO commands (guild_id, name, enabled, updated_at)
      VALUES (?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(guild_id, name) DO UPDATE SET
        enabled = excluded.enabled,
        updated_at = CURRENT_TIMESTAMP
    `);

    const insertMany = db.transaction((cmds) => {
      for (const name of cmds) {
        stmt.run(guildId, name, enabled ? 1 : 0);
      }
    });

    insertMany(validCommands);

    res.json({
      success: true,
      message: `${validCommands.length} commandes ${
        enabled ? "activées" : "désactivées"
      }`,
      updated: validCommands,
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
