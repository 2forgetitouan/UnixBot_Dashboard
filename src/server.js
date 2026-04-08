/**
 * UnixBot - Serveur Principal
 * Point d'entrée unifié pour l'API et le Dashboard Web
 */

const express = require("express");
const http = require("http");
const path = require("path");
const { initDatabase, closeDatabase } = require("./database/init");
const config = require("../config/config");
const bridge = require("./shared/botBridge");

// ============================================
// CONFIGURATION
// ============================================
const API_PORT = config.api?.port || 3001;
const WEB_PORT = config.web?.port || process.env.PORT || 3000;
const UNIFIED_PORT = process.env.UNIFIED_PORT || WEB_PORT;

// ============================================
// LOGGER
// ============================================
const logger = {
  info: (msg, ...args) =>
    console.log(`[${new Date().toISOString()}] [INFO] ${msg}`, ...args),
  error: (msg, ...args) =>
    console.error(`[${new Date().toISOString()}] [ERROR] ${msg}`, ...args),
  warn: (msg, ...args) =>
    console.warn(`[${new Date().toISOString()}] [WARN] ${msg}`, ...args),
  debug: (msg, ...args) => {
    if (process.env.DEBUG === "true") {
      console.log(`[${new Date().toISOString()}] [DEBUG] ${msg}`, ...args);
    }
  },
};

// ============================================
// SERVER CLASS
// ============================================
class UnixBotServer {
  constructor() {
    this.app = express();
    this.server = null;
    this.isShuttingDown = false;
  }

  /**
   * Initialiser la base de données
   */
  async initializeDatabase() {
    logger.info("Initialisation de la base de données...");
    try {
      await initDatabase();
      logger.info("Base de données initialisée avec succès");
    } catch (error) {
      logger.error(
        "Erreur lors de l'initialisation de la base de données:",
        error.message
      );
      throw error;
    }
  }

  /**
   * Configurer les middlewares globaux
   */
  configureMiddleware() {
    // Trust proxy (pour Heroku, Render, etc.)
    this.app.set("trust proxy", 1);

    // Security headers (helmet)
    const helmet = require("helmet");
    this.app.use(
      helmet({
        contentSecurityPolicy: {
          directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'", "https://unpkg.com"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
            fontSrc: ["'self'", "https://fonts.gstatic.com"],
            imgSrc: ["'self'", "data:", "https://cdn.discordapp.com", "https://i.giphy.com"],
            connectSrc: ["'self'"],
            frameSrc: ["'none'"],
            objectSrc: ["'none'"],
            baseUri: ["'self'"],
            formAction: ["'self'"],
          },
        },
        crossOriginEmbedderPolicy: false,
        crossOriginOpenerPolicy: { policy: "same-origin-allow-popups" },
        crossOriginResourcePolicy: { policy: "cross-origin" },
      })
    );
    logger.info("🛡️ Helmet CSP activé");

    // Parsing JSON/URL-encoded (nécessaire pour les formulaires web)
    this.app.use(express.json({ limit: "10mb" }));
    this.app.use(express.urlencoded({ extended: true, limit: "10mb" }));

    // Sessions (partagées entre API et Web)
    const session = require("express-session");
    const SQLiteSessionStore = require("./api/middleware/sqliteSessionStore");
    const config = require("../config/config");

    const sessionStore = new SQLiteSessionStore({
      ttl: 86400,           // 24 heures
      cleanupInterval: 900000, // Nettoyage toutes les 15 minutes
    });

    logger.info("📦 Session Store: SQLite");

    this.app.use(
      session({
        name: "unixbot.sid",
        secret: config.sessionSecret || "unixbot-secret-change-in-production",
        resave: false,
        saveUninitialized: false,
        store: sessionStore,
        cookie: {
          httpOnly: true,
          sameSite: "lax",
          secure: process.env.NODE_ENV === "production",
          maxAge: 86400000, // 24 heures
        },
      })
    );

    // Attacher SessionService à l'app pour utilisation dans les routes
    const SessionService = require("./api/services/SessionService");
    this.app.set("sessionService", new SessionService(config.encryptionKey));
    logger.info("🔒 SessionService avec chiffrement initialisé");

    // Health check (avant tout autre middleware)
    this.app.get("/health", async (req, res) => {
      let botStats = null;
      try {
        const available = await bridge.isAvailable();
        if (available) {
          botStats = await bridge.getStatus();
        }
      } catch { /* bot indisponible */ }

      res.json({
        status: "healthy",
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        bot: botStats,
      });
    });

    // Ready check
    this.app.get("/ready", (req, res) => {
      if (this.isShuttingDown) {
        res.status(503).json({ status: "shutting_down" });
      } else {
        res.json({ status: "ready" });
      }
    });
  }

  /**
   * Monter l'API
   */
  mountAPI() {
    logger.info("Montage de l'API...");

    try {
      const apiApp = require("./api/app");
      this.app.use("/api", apiApp);
      logger.info("API montée sur /api");
    } catch (error) {
      logger.error("Erreur lors du montage de l'API:", error.message);
      throw error;
    }
  }

  /**
   * Monter le Dashboard Web
   */
  mountWeb() {
    logger.info("Montage du Dashboard Web...");

    try {
      // Configurer EJS comme moteur de template
      this.app.set("view engine", "ejs");
      this.app.set("views", path.join(__dirname, "web/views"));

      // Support des layouts EJS
      const expressLayouts = require("express-ejs-layouts");
      this.app.use(expressLayouts);
      this.app.set("layout", false); // Pas de layout par défaut (opt-in par route)

      // Fichiers statiques
      this.app.use(
        "/css",
        express.static(path.join(__dirname, "web/public/css"))
      );
      this.app.use(
        "/js",
        express.static(path.join(__dirname, "web/public/js"), {
          setHeaders(res) {
            res.set('Cache-Control', 'no-cache');
          }
        })
      );
      this.app.use(
        "/img",
        express.static(path.join(__dirname, "web/public/img"))
      );
      this.app.use(
        "/favicons",
        express.static(path.join(__dirname, "web/public/favicons"))
      );

      // Monter le router web
      const webRouter = require("./web/app");
      this.app.use("/", webRouter);
      logger.info("Dashboard Web monté sur /");
    } catch (error) {
      logger.error("Erreur lors du montage du Dashboard Web:", error.message);
      throw error;
    }
  }

  /**
   * Configurer la gestion des erreurs
   */
  configureErrorHandling() {
    // 404 handler
    this.app.use((req, res, next) => {
      if (req.path.startsWith("/api")) {
        res.status(404).json({
          success: false,
          error: "Endpoint non trouvé",
        });
      } else {
        res.status(404).render("404", {
          layout: "layouts/public",
          title: "Page non trouvée - UnixBot",
          description: "Cette page n'existe pas.",
          canonical: req.path,
          currentPage: "",
          user: req.session?.user || null,
          extraCss: ["/css/error.css"],
        });
      }
    });

    // Error handler
    this.app.use((err, req, res, next) => {
      logger.error("Erreur non gérée:", err);

      const isDev = process.env.NODE_ENV !== "production";

      if (req.path.startsWith("/api")) {
        res.status(err.status || 500).json({
          success: false,
          error: isDev ? err.message : "Erreur interne du serveur",
          ...(isDev && { stack: err.stack }),
        });
      } else {
        res.status(err.status || 500).render("error", {
          layout: "layouts/public",
          title: "Erreur - UnixBot",
          description: "Une erreur est survenue.",
          canonical: req.path,
          currentPage: "",
          message: isDev ? err.message : "Une erreur est survenue.",
          error: isDev ? err : { status: err.status || 500 },
          user: req.session?.user || null,
          extraCss: ["/css/error.css"],
        });
      }
    });
  }

  /**
   * Démarrer le serveur
   */
  async start() {
    try {
      // Initialiser la base de données
      await this.initializeDatabase();

      // Configurer les middlewares
      this.configureMiddleware();

      // Rendre le bridge accessible à toutes les routes
      this.app.set("bridge", bridge);
      // Compat : botClient via bridge (mode direct retourne le vrai client)
      const botClient = bridge.getClient();
      if (botClient) this.app.set("botClient", botClient);
      logger.info("Bridge bot configuré dans l'app Express");

      // Monter l'API
      this.mountAPI();

      // Monter le Dashboard Web
      this.mountWeb();

      // Configurer la gestion des erreurs
      this.configureErrorHandling();

      // Créer et démarrer le serveur HTTP
      this.server = http.createServer(this.app);

      return new Promise((resolve, reject) => {
        this.server.listen(UNIFIED_PORT, () => {
          logger.info(`🚀 Serveur UnixBot démarré sur le port ${UNIFIED_PORT}`);
          logger.info(
            `📡 API disponible sur http://localhost:${UNIFIED_PORT}/api`
          );
          logger.info(
            `🌐 Dashboard disponible sur http://localhost:${UNIFIED_PORT}`
          );
          logger.info(
            `💚 Health check: http://localhost:${UNIFIED_PORT}/health`
          );
          resolve(this.server);
        });

        this.server.on("error", (error) => {
          if (error.code === "EADDRINUSE") {
            logger.error(`Le port ${UNIFIED_PORT} est déjà utilisé`);
          } else {
            logger.error("Erreur du serveur:", error.message);
          }
          reject(error);
        });
      });
    } catch (error) {
      logger.error("Erreur lors du démarrage du serveur:", error.message);
      throw error;
    }
  }

  /**
   * Arrêter le serveur proprement
   */
  async stop() {
    if (this.isShuttingDown) {
      logger.warn("Arrêt déjà en cours...");
      return;
    }

    this.isShuttingDown = true;
    logger.info("Arrêt du serveur en cours...");

    // Fermer le serveur HTTP
    if (this.server) {
      await new Promise((resolve) => {
        this.server.close((err) => {
          if (err) {
            logger.error(
              "Erreur lors de la fermeture du serveur:",
              err.message
            );
          } else {
            logger.info("Serveur HTTP fermé");
          }
          resolve();
        });
      });
    }

    // Fermer la base de données
    try {
      await closeDatabase();
      logger.info("Base de données fermée");
    } catch (error) {
      logger.error(
        "Erreur lors de la fermeture de la base de données:",
        error.message
      );
    }

    logger.info("Serveur arrêté proprement");
  }
}

// ============================================
// GESTION DES SIGNAUX
// ============================================
const server = new UnixBotServer();

async function gracefulShutdown(signal) {
  logger.info(`Signal ${signal} reçu`);

  try {
    await server.stop();
    process.exit(0);
  } catch (error) {
    logger.error("Erreur lors de l'arrêt:", error.message);
    process.exit(1);
  }
}

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));

// Gestion des erreurs non catchées
process.on("uncaughtException", (error) => {
  logger.error("Exception non gérée:", error);
  gracefulShutdown("UNCAUGHT_EXCEPTION");
});

process.on("unhandledRejection", (reason, promise) => {
  logger.error("Promesse rejetée non gérée:", reason);
});

// ============================================
// DÉMARRAGE
// ============================================
if (require.main === module) {
  // Mode standalone : initialiser le bridge en mode remote
  // Le bot tourne dans un autre processus et expose son API interne
  bridge.initRemote({
    host: process.env.BOT_INTERNAL_HOST || "127.0.0.1",
    port: parseInt(process.env.BOT_INTERNAL_PORT, 10) || 3002,
    secret: process.env.INTERNAL_API_SECRET || null,
  });
  logger.info("Bridge initialisé (mode remote → bot API interne)");

  server.start().catch((error) => {
    logger.error("Échec du démarrage du serveur:", error.message);
    process.exit(1);
  });
}

module.exports = server;
