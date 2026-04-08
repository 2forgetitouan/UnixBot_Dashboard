/**
 * Application Web (Dashboard)
 * Serveur de fichiers statiques et rendu SSR
 * @module web/app
 */

const express = require("express");
const path = require("path");

const AuthService = require("../api/services/AuthService");
const GuildService = require("../api/services/GuildService");
const { getAvatarUrl, getGuildIconUrl } = require("../shared/utils");
const bridge = require("../shared/botBridge");

// ============================================
// CRÉATION DU ROUTER WEB
// ============================================
const router = express.Router();

// ============================================
// MIDDLEWARE - Build base URL for SEO/OG tags
// ============================================
router.use((req, res, next) => {
  res.locals.baseUrl = `${req.protocol}://${req.get('host')}`;
  next();
});

// ============================================
// HELPER - Vérification accès guild
// ============================================
/**
 * Vérifie que l'utilisateur a accès au dashboard d'une guild
 * @param {string} guildId
 * @param {string} userId
 * @returns {Promise<{guild: Object|null, hasAccess: boolean, isSuperuser: boolean}>}
 */
async function checkGuildAccess(guildId, userId) {
  const guild = await bridge.getGuild(guildId);
  if (!guild) return { guild: null, hasAccess: false, isSuperuser: false };

  const isSuperuser = AuthService.isSuperuser(userId);
  const isOwner = guild.ownerId === userId;
  const member = await bridge.getGuildMember(guildId, userId);
  const hasAdminPerms = member?.permissions?.administrator || false;

  return { guild, hasAccess: isSuperuser || isOwner || hasAdminPerms, isSuperuser };
}

// ============================================
// ROUTES PUBLIQUES
// ============================================

/**
 * Page d'accueil publique
 */
router.get("/", (req, res) => {
  res.render("landing", {
    layout: "layouts/public",
    title: "UnixBot - Bot Discord Multifonction",
    description:
      "UnixBot est un bot Discord open-source et modulaire : giveaways, modération, auto-bump, messages et dashboard web moderne.",
    canonical: "/",
    currentPage: "home",
    botInviteUrl: `/api/v1/auth/bot-invite`,
    user: req.session?.user || null,
    extraCss: ["/css/landing.css"],
    extraJs: ["/js/landing.js"],
  });
});

/**
 * Page Fonctionnalités
 */
router.get("/features", (req, res) => {
  res.render("features", {
    layout: "layouts/public",
    title: "Fonctionnalités - UnixBot",
    description:
      "Découvrez toutes les fonctionnalités d'UnixBot : giveaways, modération, auto-bump, messages, anti-archive et dashboard web.",
    canonical: "/features",
    currentPage: "features",
    user: req.session?.user || null,
    extraCss: ["/css/pages.css"],
  });
});

/**
 * Page À propos
 */
router.get("/about", (req, res) => {
  res.render("about", {
    layout: "layouts/public",
    title: "À propos - UnixBot",
    description:
      "En savoir plus sur UnixBot : un bot Discord open-source, gratuit et transparent. Découvrez notre histoire, nos valeurs et notre stack technique.",
    canonical: "/about",
    currentPage: "about",
    user: req.session?.user || null,
    extraCss: ["/css/pages.css"],
  });
});

/**
 * Page Documentation / FAQ
 */
router.get("/docs", (req, res) => {
  res.render("docs", {
    layout: "layouts/public",
    title: "Documentation & FAQ - UnixBot",
    description:
      "Guides de démarrage, tutoriels et foire aux questions pour bien utiliser UnixBot.",
    canonical: "/docs",
    currentPage: "docs",
    user: req.session?.user || null,
    extraCss: ["/css/pages.css"],
  });
});

/**
 * Page Contact
 */
router.get("/contact", (req, res) => {
  res.render("contact", {
    layout: "layouts/public",
    title: "Contact - UnixBot",
    description:
      "Contactez l'équipe UnixBot : serveur Discord, GitHub, email ou formulaire de contact.",
    canonical: "/contact",
    currentPage: "contact",
    user: req.session?.user || null,
    extraCss: ["/css/pages.css"],
  });
});

/**
 * Pages légales
 */
router.get("/legal/terms", (req, res) => {
  res.render("legal/terms", {
    layout: "layouts/public",
    title: "Conditions Générales d'Utilisation - UnixBot",
    description:
      "Conditions générales d'utilisation du bot Discord UnixBot et de son dashboard.",
    canonical: "/legal/terms",
    currentPage: "legal",
    user: req.session?.user || null,
    extraCss: ["/css/pages.css"],
  });
});

router.get("/legal/privacy", (req, res) => {
  res.render("legal/privacy", {
    layout: "layouts/public",
    title: "Politique de Confidentialité - UnixBot",
    description:
      "Politique de confidentialité et traitement des données personnelles conforme au RGPD.",
    canonical: "/legal/privacy",
    currentPage: "legal",
    user: req.session?.user || null,
    extraCss: ["/css/pages.css"],
  });
});

router.get("/legal/cookies", (req, res) => {
  res.render("legal/cookies", {
    layout: "layouts/public",
    title: "Politique de Cookies - UnixBot",
    description:
      "Informations sur les cookies et le stockage local utilisés par le site UnixBot.",
    canonical: "/legal/cookies",
    currentPage: "legal",
    user: req.session?.user || null,
    extraCss: ["/css/pages.css"],
  });
});

router.get("/legal/mentions", (req, res) => {
  res.render("legal/mentions", {
    layout: "layouts/public",
    title: "Mentions Légales - UnixBot",
    description:
      "Mentions légales du site UnixBot : éditeur, hébergeur, propriété intellectuelle.",
    canonical: "/legal/mentions",
    currentPage: "legal",
    user: req.session?.user || null,
    extraCss: ["/css/pages.css"],
  });
});

/**
 * Page de connexion
 */
router.get("/login", (req, res) => {
  if (req.session?.user?.id) {
    return res.redirect("/dashboard/user");
  }

  res.render("login", {
    layout: "layouts/public",
    title: "Connexion - UnixBot",
    description: "Connectez-vous avec Discord pour accéder au dashboard UnixBot.",
    canonical: "/login",
    currentPage: "login",
    user: null,
    extraCss: ["/css/login.css"],
  });
});

/**
 * Page des commandes
 */
router.get("/commands", async (req, res) => {
  try {
    const fs = require("fs").promises;
    const path = require("path");

    const commandsPath = path.join(__dirname, "../../commands");
    const commandsByCategory = {};

    // Lire les catégories
    const categories = await fs.readdir(commandsPath);

    for (const category of categories) {
      const categoryPath = path.join(commandsPath, category);
      const stat = await fs.stat(categoryPath);

      if (!stat.isDirectory()) continue;

      commandsByCategory[category] = [];

      // Lire les commandes dans la catégorie
      const commands = await fs.readdir(categoryPath);

      for (const commandFolder of commands) {
        const commandPath = path.join(categoryPath, commandFolder);
        const commandStat = await fs.stat(commandPath);

        if (!commandStat.isDirectory()) continue;

        // Lire le fichier infos.json
        const infosPath = path.join(commandPath, "infos.json");
        try {
          const infosContent = await fs.readFile(infosPath, "utf-8");
          const commandInfo = JSON.parse(infosContent);

          // Formater les détails ici pour éviter les problèmes EJS
          // Escape HTML first (defence in depth), then apply formatting
          if (commandInfo.details) {
            const escaped = commandInfo.details
              .replace(/&/g, '&amp;')
              .replace(/</g, '&lt;')
              .replace(/>/g, '&gt;')
              .replace(/"/g, '&quot;');
            commandInfo.detailsHtml = escaped
              .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
              .replace(
                /`([^`]+)`/g,
                "<code>$1</code>"
              )
              .replace(/\n/g, "<br>");
          }

          commandsByCategory[category].push(commandInfo);
        } catch (err) {
          console.error(
            `Erreur lecture infos.json pour ${commandFolder}:`,
            err
          );
        }
      }
    }

    res.render("commands", {
      layout: "layouts/public",
      title: "Commandes - UnixBot",
      description:
        "Liste complète des commandes slash d'UnixBot : administration, événements, fun, infos et utilitaires.",
      canonical: "/commands",
      currentPage: "commands",
      commandsByCategory,
      user: req.session?.user || null,
      extraCss: ["/css/commands.css"],
      extraJs: ["/js/commands-filter.js"],
    });
  } catch (error) {
    console.error("Erreur chargement commandes:", error);
    res.status(500).render("error", {
      layout: "layouts/public",
      title: "Erreur - UnixBot",
      description: "Une erreur est survenue.",
      canonical: "/commands",
      currentPage: "commands",
      message: "Impossible de charger les commandes.",
      user: req.session?.user || null,
      error: error,
      extraCss: ["/css/error.css"],
    });
  }
});

/**
 * Callback OAuth - rediriger vers l'API
 */
router.get("/login/callback", (req, res) => {
  // Transférer tous les query params
  const queryString = new URLSearchParams(req.query).toString();
  res.redirect(`/api/auth/callback?${queryString}`);
});

/**
 * Callback ajout bot - rediriger vers l'API
 */
router.get("/login/guild", (req, res) => {
  // Transférer tous les query params
  const queryString = new URLSearchParams(req.query).toString();
  res.redirect(`/api/auth/guild?${queryString}`);
});

/**
 * Page d'erreur auth
 */
router.get("/auth-error", (req, res) => {
  const reasons = {
    invalid_state: "La session a expiré. Veuillez réessayer.",
    oauth_failed: "Échec de l'authentification Discord.",
    banned: "Votre compte est banni.",
  };

  res.render("auth-error", {
    layout: "layouts/public",
    title: "Erreur de connexion - UnixBot",
    description: "Une erreur est survenue lors de la connexion.",
    canonical: "/auth-error",
    currentPage: "login",
    reason: reasons[req.query.reason] || "Une erreur est survenue.",
    user: null,
    extraCss: ["/css/error.css"],
  });
});

const requireWebAuth = async (req, res, next) => {
  // Si déjà connecté en session, continuer
  if (req.session?.user?.id) {
    return next();
  }

  // Vérifier si on a un token valide en base de données
  if (req.session?.user?.id) {
    const sessionService = req.app.get("sessionService");
    const accessToken = await sessionService.getValidAccessToken(
      req.session.user.id
    );
    if (accessToken) {
      return next();
    }
  }

  // Pas d'authentification, rediriger vers page de login
  return res.redirect("/");
};

// ============================================
// MIDDLEWARE - Bot en ligne
// ============================================
/**
 * Vérifie que le bot Discord est connecté avant d'accéder au dashboard.
 * S'exécute uniquement pour les utilisateurs déjà authentifiés (les autres
 * sont renvoyés vers /login par requireWebAuth sur chaque route).
 */
router.use("/dashboard", async (req, res, next) => {
  if (!req.session?.user?.id) return next(); // L'auth est gérée par requireWebAuth
  const online = await bridge.isAvailable();
  if (!online) {
    return res.status(503).render("bot-offline", {
      layout: "layouts/public",
      title: "Bot hors ligne - UnixBot",
      currentPage: "",
      user: req.session.user,
      extraCss: ["/css/error.css"],
    });
  }
  next();
});

// ============================================
// ROUTES DASHBOARD UTILISATEUR
// ============================================

/**
 * Dashboard principal - redirection
 */
router.get("/dashboard", (req, res) => {
  if (!req.session?.user?.id) {
    return res.redirect("/login");
  }
  res.redirect("/dashboard/user");
});

/**
 * Dashboard utilisateur
 * /dashboard/user
 */
router.get("/dashboard/user", requireWebAuth, async (req, res) => {
  try {
    const userId = req.session.user.id;
    const isSuperuser = AuthService.isSuperuser(userId);
    const sessionService = req.app.get("sessionService");

    // Récupérer les guildes de l'utilisateur
    let userGuilds = [];

    try {
      // Essayer d'abord le token en session (plus simple)
      let accessToken = req.session.user?.accessToken;
      
      // Si pas en session, récupérer depuis la base de données
      if (!accessToken) {
        accessToken = await sessionService.getValidAccessToken(userId);
      }

      if (!accessToken) {
        console.warn("Aucun token valide, redirection vers login");
        return res.redirect("/");
      }

      userGuilds = await AuthService.getUserAdminGuilds(accessToken, userId);
    } catch (error) {
      console.error("Erreur récupération guildes:", error);
      // Token expiré, rediriger vers refresh
      return res.redirect("/");
    }

    // Récupérer les guildes du bot (avec memberCount)
    const botGuilds = await bridge.getGuilds();
    const botGuildMap = new Map(botGuilds.map((g) => [g.id, g]));

    // Enrichir les guildes
    const guilds = userGuilds.map((guild) => {
      const botGuild = botGuildMap.get(guild.id);
      return {
        id: guild.id,
        name: guild.name,
        icon: guild.icon,
        iconUrl: guild.icon
          ? `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png?size=128`
          : null,
        botPresent: !!botGuild,
        owner: guild.owner,
        memberCount: botGuild?.memberCount || null,
      };
    });

    res.render("dashboard/user", {
      layout: "layouts/dashboard",
      title: "Mon Dashboard - UnixBot",
      currentPage: "user",
      pageTitle: "Mes serveurs",
      user: {
        ...req.session.user,
        avatarUrl: getAvatarUrl(req.session.user),
        avatarDecoration:
          req.session.user.avatar_decoration_data?.asset || null,
        isSuperuser,
      },
      guilds,
      stats: {
        totalGuilds: guilds.length,
        guildsWithBot: guilds.filter((g) => g.botPresent).length,
      },
    });
  } catch (error) {
    console.error("Erreur dashboard user:", error);
    res.status(500).render("error", {
      title: "Erreur",
      message: "Une erreur est survenue.",
      user: req.session.user,
    });
  }
});

// ============================================
// ROUTES DASHBOARD SERVEUR
// ============================================

// Validation du format guildId (snowflake Discord)
router.param("guildId", (req, res, next, id) => {
  if (!/^\d{17,20}$/.test(id)) {
    return res.status(400).render("error", {
      layout: "layouts/public",
      title: "Paramètre invalide",
      message: "Identifiant de serveur invalide.",
      status: 400,
      user: req.session?.user || null,
      extraCss: ["/css/error.css"],
    });
  }
  next();
});

/**
 * Dashboard d'un serveur
 * /dashboard/guild/:guildId
 */
router.get("/dashboard/guild/:guildId", requireWebAuth, async (req, res) => {
  try {
    const { guildId } = req.params;
    const userId = req.session.user.id;

    // Vérifier si le bot est présent et l'accès
    const { guild: botGuild, hasAccess, isSuperuser } = await checkGuildAccess(guildId, userId);
    if (!botGuild) {
      return res.status(404).render("error", {
        layout: "layouts/public",
        title: "Bot non présent",
        message: "Le bot n'est pas encore ajouté à ce serveur.",
        status: 404,
        user: req.session?.user || null,
        extraCss: ["/css/error.css"],
      });
    }

    if (!hasAccess) {
      return res.status(403).render("error", {
        title: "Accès refusé",
        message:
          "Vous devez être propriétaire ou administrateur du serveur pour y accéder.",
        user: req.session.user,
      });
    }

    // Récupérer les données
    const guild = GuildService.getGuildWithSettings(guildId);
    const stats = GuildService.getGuildStats(guildId);

    // Récupérer les salons et rôles via le bridge
    const allChannels = await bridge.getGuildChannels(guildId);
    const channels = allChannels
      .filter((c) => [0, 5, 10, 11, 12].includes(c.type)) // text-based types
      .map((c) => ({ id: c.id, name: c.name, type: c.type }))
      .sort((a, b) => a.name.localeCompare(b.name));

    const roles = (await bridge.getGuildRoles(guildId))
      .filter((r) => !r.managed)
      .map((r) => ({
        id: r.id,
        name: r.name,
        color: r.color,
        position: r.position,
      }))
      .sort((a, b) => b.position - a.position);

    res.render("dashboard/guild", {
      layout: "layouts/dashboard",
      title: `${botGuild.name} - UnixBot`,
      currentPage: "overview",
      pageTitle: botGuild.name,
      pageSubtitle: `${botGuild.memberCount} membres`,
      user: {
        ...req.session.user,
        avatarUrl: getAvatarUrl(req.session.user),
        isSuperuser,
      },
      guild: {
        id: guildId,
        ...guild,
        name: botGuild.name,
        icon: botGuild.icon,
        iconUrl: botGuild.iconUrl,
        memberCount: botGuild.memberCount,
        settings: guild?.settings || {},
      },
      channels,
      roles,
      stats,
    });
  } catch (error) {
    console.error("Erreur dashboard guild:", error);
    res.status(500).render("error", {
      title: "Erreur",
      message: "Une erreur est survenue.",
      user: req.session.user,
    });
  }
});

/**
 * Page giveaways d'un serveur
 */
router.get(
  "/dashboard/guild/:guildId/giveaways",
  requireWebAuth,
  async (req, res) => {
    const { guildId } = req.params;
    const userId = req.session.user.id;

    const { guild: botGuild, hasAccess } = await checkGuildAccess(guildId, userId);
    if (!botGuild) return res.redirect(`/dashboard/guild/${guildId}`);
    if (!hasAccess) {
      return res.status(403).render("error", {
        title: "Accès refusé",
        message: "Vous devez être propriétaire ou administrateur du serveur.",
        user: req.session.user,
      });
    }

    const allChannels = await bridge.getGuildChannels(guildId);
    const textChannels = allChannels
      .filter((c) => [0, 5, 10, 11, 12].includes(c.type))
      .map((c) => ({ id: c.id, name: c.name }));

    res.render("dashboard/giveaways", {
      layout: "layouts/dashboard",
      title: `Giveaways - ${botGuild.name}`,
      currentPage: "giveaways",
      pageTitle: "Giveaways",
      pageSubtitle: botGuild.name,
      headerRight: '<button class="btn btn-primary" id="createGiveawayBtn"><i data-lucide="plus"></i><span>Nouveau giveaway</span></button>',
      user: {
        ...req.session.user,
        avatarUrl: getAvatarUrl(req.session.user),
      },
      guild: {
        id: guildId,
        name: botGuild.name,
        iconUrl: botGuild.iconUrl,
      },
      channels: textChannels,
      extraJs: ["/js/giveaways.js"],
    });
  }
);

/**
 * Page messages d'un serveur
 */
router.get(
  "/dashboard/guild/:guildId/messages",
  requireWebAuth,
  async (req, res) => {
    const { guildId } = req.params;
    const userId = req.session.user.id;

    const { guild: botGuild, hasAccess } = await checkGuildAccess(guildId, userId);
    if (!botGuild) return res.redirect(`/dashboard/guild/${guildId}`);
    if (!hasAccess) {
      return res.status(403).render("error", {
        title: "Accès refusé",
        message: "Vous devez être propriétaire ou administrateur du serveur.",
        user: req.session.user,
      });
    }

    const allChannels = await bridge.getGuildChannels(guildId);
    const textChannels = allChannels
      .filter((c) => [0, 5, 10, 11, 12].includes(c.type))
      .map((c) => ({ id: c.id, name: c.name }));

    res.render("dashboard/messages", {
      layout: "layouts/dashboard",
      title: `Messages - ${botGuild.name}`,
      currentPage: "messages",
      pageTitle: "Messages",
      pageSubtitle: botGuild.name,
      user: {
        ...req.session.user,
        avatarUrl: getAvatarUrl(req.session.user),
      },
      guild: {
        id: guildId,
        name: botGuild.name,
        iconUrl: botGuild.iconUrl,
      },
      channels: textChannels,
      extraJs: ["/js/messages.js"],
    });
  }
);

/**
 * Page commandes d'un serveur
 */
router.get(
  "/dashboard/guild/:guildId/commands",
  requireWebAuth,
  async (req, res) => {
    const { guildId } = req.params;
    const userId = req.session.user.id;

    const { guild: botGuild, hasAccess } = await checkGuildAccess(guildId, userId);
    if (!botGuild) return res.redirect(`/dashboard/guild/${guildId}`);
    if (!hasAccess) {
      return res.status(403).render("error", {
        title: "Accès refusé",
        message: "Vous devez être propriétaire ou administrateur du serveur.",
        user: req.session.user,
      });
    }

    const roles = (await bridge.getGuildRoles(guildId))
      .filter((r) => !r.managed)
      .map((r) => ({ id: r.id, name: r.name, color: r.color }));

    res.render("dashboard/commands", {
      layout: "layouts/dashboard",
      title: `Commandes - ${botGuild.name}`,
      currentPage: "commands",
      pageTitle: "Commandes",
      pageSubtitle: botGuild.name,
      headerRight: '<div class="search-box"><i data-lucide="search"></i><input type="text" id="commandSearch" placeholder="Rechercher une commande..."></div>',
      user: {
        ...req.session.user,
        avatarUrl: getAvatarUrl(req.session.user),
      },
      guild: {
        id: guildId,
        name: botGuild.name,
        iconUrl: botGuild.iconUrl,
      },
      roles,
      extraJs: ["/js/commands.js"],
    });
  }
);

/**
 * Page auto-bump d'un serveur
 */
router.get(
  "/dashboard/guild/:guildId/autobump",
  requireWebAuth,
  async (req, res) => {
    const { guildId } = req.params;
    const userId = req.session.user.id;

    const { guild: botGuild, hasAccess } = await checkGuildAccess(guildId, userId);
    if (!botGuild) return res.redirect(`/dashboard/guild/${guildId}`);
    if (!hasAccess) {
      return res.status(403).render("error", {
        title: "Accès refusé",
        message: "Vous devez être propriétaire ou administrateur du serveur.",
        user: req.session.user,
      });
    }

    const allChannels = await bridge.getGuildChannels(guildId);
    const textChannels = allChannels
      .filter((c) => [0, 5, 10, 11, 12].includes(c.type))
      .map((c) => ({ id: c.id, name: c.name }));

    res.render("dashboard/autobump", {
      layout: "layouts/dashboard",
      title: `Auto-Bump - ${botGuild.name}`,
      currentPage: "autobump",
      pageTitle: "Auto-Bump",
      pageSubtitle: botGuild.name,
      user: {
        ...req.session.user,
        avatarUrl: getAvatarUrl(req.session.user),
      },
      guild: {
        id: guildId,
        name: botGuild.name,
        iconUrl: botGuild.iconUrl,
      },
      channels: textChannels,
      extraCss: ["/css/autobump.css"],
      extraJs: ["/js/unsaved-changes.js", "/js/autobump.js"],
      pageData: { guildId, channels: textChannels },
    });
  }
);

/**
 * Page paramètres d'un serveur
 */
router.get(
  "/dashboard/guild/:guildId/settings",
  requireWebAuth,
  async (req, res) => {
    const { guildId } = req.params;
    const userId = req.session.user.id;

    const { guild: botGuild, hasAccess } = await checkGuildAccess(guildId, userId);
    if (!botGuild) return res.redirect(`/dashboard/guild/${guildId}`);
    if (!hasAccess) {
      return res.status(403).render("error", {
        title: "Accès refusé",
        message: "Vous devez être propriétaire ou administrateur du serveur.",
        user: req.session.user,
      });
    }

    const guildData = GuildService.getGuildWithSettings(guildId);
    const settings = guildData?.settings || {};

    const allChannels = await bridge.getGuildChannels(guildId);
    const channels = allChannels
      .filter((c) => [0, 5, 10, 11, 12].includes(c.type))
      .map((c) => ({ id: c.id, name: c.name, type: c.type }))
      .sort((a, b) => a.name.localeCompare(b.name));

    const roles = (await bridge.getGuildRoles(guildId))
      .filter((r) => !r.managed)
      .map((r) => ({ id: r.id, name: r.name, color: r.color }));

    res.render("dashboard/settings", {
      layout: "layouts/dashboard",
      title: `Paramètres - ${botGuild.name}`,
      currentPage: "settings",
      pageTitle: "Paramètres",
      pageSubtitle: botGuild.name,
      user: {
        ...req.session.user,
        avatarUrl: getAvatarUrl(req.session.user),
      },
      guild: {
        id: guildId,
        name: botGuild.name,
        iconUrl: botGuild.iconUrl,
      },
      settings,
      channels,
      roles,
      extraJs: ["/js/unsaved-changes.js", "/js/guild-settings.js"],
    });
  }
);

// ============================================
// ROUTES ADMIN
// ============================================

/**
 * Page de connexion admin
 */
router.get("/admin", (req, res) => {
  if (req.session?.adminAuth) {
    return res.redirect("/admin/panel");
  }

  res.send(`
    <!DOCTYPE html>
    <html lang="fr">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Admin - UnixBot</title>
    </head>
    <body style="margin:0;padding:0;font-family:system-ui;display:flex;align-items:center;justify-content:center;min-height:100vh;background:#1a1a1a;color:#fff;">
      <div style="background:#2a2a2a;padding:2rem;border-radius:8px;max-width:400px;width:100%;">
        <h1 style="margin-top:0;">Admin Login</h1>
        <form method="POST" action="/admin/login">
          <div style="margin-bottom:1rem;">
            <label style="display:block;margin-bottom:0.5rem;">Mot de passe</label>
            <input type="password" name="password" required style="width:100%;padding:0.5rem;border:1px solid #444;background:#1a1a1a;color:#fff;border-radius:4px;box-sizing:border-box;">
          </div>
          ${
            req.query.error
              ? '<p style="color:#ff4444;margin:0 0 1rem 0;">Mot de passe incorrect</p>'
              : ""
          }
          <button type="submit" style="width:100%;padding:0.75rem;background:#7c3aed;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:1rem;">Connexion</button>
        </form>
        <p style="margin-top:1rem;text-align:center;"><a href="/" style="color:#7c3aed;text-decoration:none;">Retour à l'accueil</a></p>
      </div>
    </body>
    </html>
  `);
});

/**
 * Traitement du login admin
 */
router.post("/admin/login", (req, res) => {
  const config = require("../../config/config");

  if (!req.body) {
    return res.status(400).send("Aucune donnée reçue");
  }

  const { password } = req.body;

  if (!config.adminPassword) {
    return res.status(500).send("Admin password not configured");
  }

  if (password === config.adminPassword) {
    req.session.adminAuth = true;
    return res.redirect("/admin/panel");
  }

  res.redirect("/admin?error=1");
});

/**
 * Panel admin
 */
router.get("/admin/panel", (req, res) => {
  if (!req.session?.adminAuth) {
    return res.redirect("/admin");
  }

  res.send(`
    <!DOCTYPE html>
    <html lang="fr">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Admin Panel - UnixBot</title>
    </head>
    <body style="margin:0;padding:2rem;font-family:system-ui;background:#1a1a1a;color:#fff;">
      <h1>Admin Panel</h1>
      <p>En cours de développement...</p>
      <p><a href="/admin/logout" style="color:#7c3aed;">Déconnexion</a></p>
    </body>
    </html>
  `);
});

/**
 * Déconnexion admin
 */
router.get("/admin/logout", (req, res) => {
  req.session.adminAuth = false;
  res.redirect("/admin");
});

module.exports = router;
