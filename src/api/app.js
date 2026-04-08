/**
 * Application API Express
 * Point d'entrée central de l'API REST
 * @module api/app
 */

const express = require("express");
const session = require("express-session");
const path = require("path");
const cors = require("cors");

const config = require("../../config/config");
const { LIMITS } = require("../shared/constants");
const { lightRateLimiter } = require("./middleware/rateLimiter");

// Import routes
const authRoutes = require("./routes/auth");
const guildRoutes = require("./routes/guilds");
const giveawayRoutes = require("./routes/giveaways");
const messageRoutes = require("./routes/messages");
const commandRoutes = require("./routes/commands");
const autobumpRoutes = require("./routes/autobump");

// ============================================
// CRÉATION DE L'APPLICATION
// ============================================
const app = express();

// Trust proxy (pour déploiement)
app.set("trust proxy", 1);

// ============================================
// MIDDLEWARES DE BASE
// ============================================

// CORS
app.use(
  cors({
    origin: [
      "http://localhost:3000",
      "http://localhost:3001",
      config.baseUrl,
    ].filter(Boolean),
    credentials: true,
  })
);

// Parsing JSON/URL-encoded
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// Sessions
const SQLiteSessionStore = require("./middleware/sqliteSessionStore");
app.use(
  session({
    name: "unixbot.api.sid",
    secret: config.sessionSecret || "unixbot-secret-change-in-production",
    resave: false,
    saveUninitialized: false,
    store: new SQLiteSessionStore({
      ttl: LIMITS.SESSION_MAX_AGE_MS / 1000,
      cleanupInterval: 900000,
    }),
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: LIMITS.SESSION_MAX_AGE_MS,
    },
  })
);

// Rate limiting global
app.use(lightRateLimiter);

// Injecter l'utilisateur dans les locals pour le debug
app.use((req, res, next) => {
  res.locals.user = req.session.user || null;
  next();
});

// ============================================
// ROUTES API
// ============================================

// Auth routes
app.use("/auth", authRoutes);
app.use("/v1/auth", authRoutes);

// Guild routes
app.use("/guilds", guildRoutes);
app.use("/v1/guilds", guildRoutes);

// Giveaway routes (sous guilds)
app.use("/guilds/:guildId/giveaways", giveawayRoutes);
app.use("/v1/guilds/:guildId/giveaways", giveawayRoutes);

// Message routes (sous guilds)
app.use("/guilds/:guildId/messages", messageRoutes);
app.use("/v1/guilds/:guildId/messages", messageRoutes);

// Command routes (sous guilds)
app.use("/guilds/:guildId/commands", commandRoutes);
app.use("/v1/guilds/:guildId/commands", commandRoutes);

// Autobump routes
app.use("/autobump", autobumpRoutes);
app.use("/v1/autobump", autobumpRoutes);

// ============================================
// ROUTES UTILITAIRES
// ============================================

// Health check
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    timestamp: Date.now(),
    uptime: process.uptime(),
  });
});

// Version API
app.get("/version", (req, res) => {
  res.json({
    version: "2.0.0",
    name: "UnixBot API",
  });
});

// User info (pour debug)
app.get("/me", (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({
      success: false,
      error: "Non authentifié",
    });
  }

  res.json({
    success: true,
    user: req.session.user,
  });
});

// ============================================
// API STATS EN TEMPS RÉEL
// ============================================

app.get("/stats", async (req, res) => {
  res.set('Cache-Control', 'no-store');
  const userService = require("../services/UserService");
  const db = userService.db;

  const dbUsers = db
    .prepare("SELECT COUNT(DISTINCT user_id) as count FROM users")
    .get();

  try {
    const bridge = require("../shared/botBridge");
    const status = await bridge.getStatus();
    const liveGuilds = status.guilds || 0;

    // Persister le dernier compte live dans global_config (survit aux redémarrages)
    db.prepare(
      "INSERT OR REPLACE INTO global_config (key, value, updated_at) VALUES ('cached_guild_count', ?, strftime('%s','now'))"
    ).run(String(liveGuilds));

    res.json({
      success: true,
      stats: {
        guilds: liveGuilds,
        users: dbUsers.count,
        uptime: status.uptime || 0,
        botOnline: status.ready === true,
      },
    });
  } catch (error) {
    if (process.env.DEBUG === 'true') {
      console.warn("API stats: bot indisponible (" + error.message + ")");
    }

    // Lire le dernier compte enregistré par le bot (persistant)
    const cached = db
      .prepare("SELECT value FROM global_config WHERE key = 'cached_guild_count'")
      .get();
    const fallbackGuilds = cached ? parseInt(cached.value, 10) : 0;

    res.json({
      success: true,
      stats: {
        guilds: fallbackGuilds,
        users: dbUsers.count,
        uptime: 0,
        botOnline: false,
      },
    });
  }
});

// ============================================
// ERROR HANDLING
// ============================================

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: {
      code: "NOT_FOUND",
      message: "Route API introuvable",
    },
  });
});

// Error handler global
app.use((err, req, res, next) => {
  console.error("Erreur API:", err);

  const isDev = process.env.NODE_ENV !== "production";
  const status = err.status || err.statusCode || 500;

  res.status(status).json({
    success: false,
    error: {
      code: err.code || "INTERNAL_ERROR",
      message: isDev ? err.message : "Erreur interne du serveur",
      ...(isDev && { stack: err.stack }),
    },
  });
});

module.exports = app;
