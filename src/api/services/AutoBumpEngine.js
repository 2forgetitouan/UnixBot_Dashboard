/**
 * Moteur d'exécution de l'Auto-Bump
 * Gère les connexions selfbot et l'envoi des commandes de bump
 * @module api/services/AutoBumpEngine
 */

// Chargement différé du module selfbot pour éviter les erreurs si non installé
let SelfbotClient = null;
function getSelfbotClient() {
  if (!SelfbotClient) {
    try {
      SelfbotClient = require("discord.js-selfbot-v13").Client;
    } catch (error) {
      console.error(
        "❌ discord.js-selfbot-v13 n'est pas installé. Installez-le avec: npm install discord.js-selfbot-v13"
      );
      throw new Error("Module selfbot non disponible");
    }
  }
  return SelfbotClient;
}

const EventEmitter = require("events");

class AutoBumpEngine extends EventEmitter {
  /**
   * @param {Object} config - Configuration de l'auto-bump
   * @param {Object} services - Services de bump disponibles
   */
  constructor(config, services) {
    super();

    this.config = config;
    this.services = { ...services }; // Copie des services par défaut
    this.guildId = config.guild_id;
    this.channelId = config.channel_id;
    this.token = config.token;
    
    // Parser les services activés
    let enabledServicesList = [];
    let parsedConfig = null;
    
    if (typeof config.enabled_services === 'string') {
      try {
        parsedConfig = JSON.parse(config.enabled_services);
      } catch (error) {
        console.warn(`[AutoBump] Erreur parsing enabled_services pour ${config.guild_id}:`, error);
      }
    } else if (typeof config.enabled_services === 'object') {
      parsedConfig = config.enabled_services;
    }
    
    if (parsedConfig) {
      if (Array.isArray(parsedConfig)) {
        enabledServicesList = parsedConfig;
      } else if (parsedConfig.default) {
        // Nouveau format: {default: {disboard: {enabled: true, ...}, ...}, custom: [...]}
        enabledServicesList = Object.keys(parsedConfig.default).filter(
          key => parsedConfig.default[key]?.enabled
        );
        
        // Ajouter les services personnalisés à this.services ET à la liste des services activés
        if (Array.isArray(parsedConfig.custom)) {
          parsedConfig.custom.forEach((customService, i) => {
            if (customService.enabled) {
              const customKey = `custom_${i}`;
              enabledServicesList.push(customKey);
              
              // Ajouter le service personnalisé à this.services
              this.services[customKey] = {
                id: customService.botId,
                name: customService.name,
                command: customService.command,
                minDelay: customService.minDelay || 7200000,
                maxDelay: customService.maxDelay || 10800000,
              };
            }
          });
        }
      }
    }
    
    this.enabledServices = enabledServicesList;
    this.minDelay = config.min_delay || 7200000; // 2h
    this.maxDelay = config.max_delay || 10800000; // 3h

    this.selfbot = null;
    this.channel = null;
    this.isRunning = false;
    this.isManualTest = false; // Flag pour les tests manuels
    this.timers = {};
    this.nextBumpTimes = {};
    this.failureCounts = {};

    // Constantes
    this.MAX_FAILURES = 5;
    this.RETRY_BASE_DELAY = 60000; // 1 minute
  }

  /**
   * Démarre le moteur d'auto-bump
   */
  async start() {
    if (this.isRunning) {
      throw new Error("L'auto-bump est déjà en cours d'exécution");
    }

    console.log(`[AutoBump] Démarrage pour le serveur ${this.guildId}...`);

    const SelfbotClientClass = getSelfbotClient();

    this.selfbot = new SelfbotClientClass({
      checkUpdate: false,
      ws: {
        properties: {
          browser: "Discord Client",
        },
      },
    });

    // Initialiser les états pour chaque service
    this.enabledServices.forEach((serviceId) => {
      this.failureCounts[serviceId] = 0;
      this.nextBumpTimes[serviceId] = null;
    });

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error("Timeout de connexion au selfbot"));
      }, 30000);

      this.selfbot.on("ready", async () => {
        clearTimeout(timeout);
        console.log(`[AutoBump] Selfbot connecté: ${this.selfbot.user.tag}`);

        try {
          // Récupérer le salon
          this.channel = await this.selfbot.channels.fetch(this.channelId);

          if (!this.channel) {
            throw new Error(`Salon ${this.channelId} introuvable`);
          }

          console.log(
            `[AutoBump] Salon trouvé: ${this.channel.name || this.channelId}`
          );

          this.isRunning = true;

          // Démarrer les bumps pour chaque service avec un décalage
          this.enabledServices.forEach((serviceId, index) => {
            const service = this.services[serviceId];
            if (!service) return;

            // Délai initial aléatoire + décalage entre services
            const initialDelay =
              this.getRandomDelay(5000, 15000) + index * 10000;

            console.log(
              `[AutoBump] Premier bump ${service.name} dans ${Math.round(
                initialDelay / 1000
              )}s`
            );

            this.timers[serviceId] = setTimeout(() => {
              this.executeBump(serviceId);
            }, initialDelay);
          });

          resolve();
        } catch (error) {
          this.cleanup();
          reject(error);
        }
      });

      this.selfbot.on("error", (error) => {
        console.error(`[AutoBump] Erreur selfbot:`, error.message);
        this.emit("error", error);
      });

      this.selfbot.on("disconnect", () => {
        console.log(`[AutoBump] Selfbot déconnecté`);
        this.emit("disconnect");
      });

      // Connexion
      this.selfbot.login(this.token).catch((error) => {
        clearTimeout(timeout);
        this.cleanup();
        reject(new Error(`Échec de connexion: ${error.message}`));
      });
    });
  }

  /**
   * Arrête le moteur d'auto-bump
   */
  stop() {
    console.log(`[AutoBump] Arrêt pour le serveur ${this.guildId}`);
    this.cleanup();
  }

  /**
   * Nettoie toutes les ressources
   */
  cleanup() {
    this.isRunning = false;

    // Arrêter tous les timers
    Object.values(this.timers).forEach((timer) => {
      if (timer) clearTimeout(timer);
    });
    this.timers = {};

    // Déconnecter le selfbot
    if (this.selfbot) {
      try {
        this.selfbot.destroy();
      } catch (error) {
        // Ignorer les erreurs de destruction
      }
      this.selfbot = null;
    }

    this.channel = null;
  }

  /**
   * Exécute un bump pour un service donné
   * @param {string} serviceId - ID du service
   */
  async executeBump(serviceId) {
    const service = this.services[serviceId];
    if (!service || !this.isRunning) return { success: false, error: "Service ou moteur non disponible" };

    console.log(
      `[AutoBump] Exécution du bump ${service.name} pour ${this.guildId}`
    );

    try {
      // Délai humain avant l'envoi
      await this.humanDelay(2000, 5000);

      if (!this.channel || !this.isRunning) return { success: false, error: "Canal ou moteur non disponible" };

      // Envoyer la commande slash
      await this.channel.sendSlash(service.id, service.command);

      // Succès
      this.failureCounts[serviceId] = 0;
      console.log(`[AutoBump] ✓ Bump ${service.name} réussi`);

      // Logger le succès
      this.logBump(serviceId, true);

      // Programmer le prochain bump (sauf si c'est un test manuel)
      if (!this.isManualTest) {
        this.scheduleNextBump(serviceId);
      }
      
      return { success: true, message: `Bump ${service.name} exécuté avec succès` };
    } catch (error) {
      this.failureCounts[serviceId]++;
      console.error(
        `[AutoBump] ✗ Erreur bump ${service.name} (${this.failureCounts[serviceId]}/${this.MAX_FAILURES}):`,
        error.message
      );

      // Logger l'échec
      this.logBump(serviceId, false, error.message);

      if (this.failureCounts[serviceId] >= this.MAX_FAILURES) {
        console.error(
          `[AutoBump] Trop d'échecs pour ${service.name}, arrêt du service`
        );
        this.emit("serviceFailed", serviceId, error.message);
        return { success: false, error: `Trop d'échecs pour ${service.name}` };
      }

      // Retry avec un délai exponentiel (sauf si test manuel)
      if (!this.isManualTest) {
        const retryDelay = this.RETRY_BASE_DELAY * this.failureCounts[serviceId];
        console.log(
          `[AutoBump] Nouvelle tentative ${service.name} dans ${Math.round(
            retryDelay / 60000
          )}min`
        );

        this.timers[serviceId] = setTimeout(() => {
          this.executeBump(serviceId);
        }, retryDelay);
      }
      
      return { success: false, error: error.message || "Erreur lors du bump" };
    }
  }

  /**
   * Programme le prochain bump pour un service
   * @param {string} serviceId - ID du service
   */
  scheduleNextBump(serviceId) {
    const service = this.services[serviceId];
    if (!service || !this.isRunning) return;

    // Utiliser les délais du service ou ceux configurés
    const minDelay = Math.max(service.minDelay, this.minDelay);
    const maxDelay = Math.min(service.maxDelay, this.maxDelay);

    const delay = this.getRandomDelay(minDelay, maxDelay);

    // Ajouter une variance basée sur l'heure (plus long la nuit)
    const hour = new Date().getHours();
    const nightVariance = hour >= 2 && hour <= 7 ? 1.15 : 1.0;
    const finalDelay = Math.round(delay * nightVariance);

    this.nextBumpTimes[serviceId] = new Date(Date.now() + finalDelay);

    const hours = Math.floor(finalDelay / 3600000);
    const minutes = Math.floor((finalDelay % 3600000) / 60000);

    console.log(
      `[AutoBump] Prochain bump ${service.name} prévu à ${this.nextBumpTimes[
        serviceId
      ].toLocaleString()} (dans ${hours}h${minutes}min)`
    );

    this.timers[serviceId] = setTimeout(() => {
      this.executeBump(serviceId);
    }, finalDelay);
  }

  /**
   * Génère un délai aléatoire entre min et max
   * @param {number} min - Délai minimum en ms
   * @param {number} max - Délai maximum en ms
   * @returns {number} Délai aléatoire
   */
  getRandomDelay(min, max) {
    return Math.floor(Math.random() * (max - min) + min);
  }

  /**
   * Simule un délai humain
   * @param {number} min - Délai minimum en ms
   * @param {number} max - Délai maximum en ms
   */
  async humanDelay(min = 1000, max = 3000) {
    const delay = this.getRandomDelay(min, max);
    return new Promise((resolve) => setTimeout(resolve, delay));
  }

  /**
   * Retourne les prochains bumps programmés
   * @returns {Object} Map des prochains bumps par service
   */
  getNextBumps() {
    return { ...this.nextBumpTimes };
  }

  /**
   * Retourne les statistiques
   * @returns {Object} Statistiques
   */
  getStats() {
    return {
      isRunning: this.isRunning,
      enabledServices: this.enabledServices,
      failureCounts: { ...this.failureCounts },
      nextBumps: this.getNextBumps(),
    };
  }

  /**
   * Enregistre un bump dans l'historique (via le service)
   * @param {string} serviceId - ID du service
   * @param {boolean} success - Succès ou échec
   * @param {string} errorMessage - Message d'erreur éventuel
   */
  logBump(serviceId, success, errorMessage = null) {
    try {
      const AutoBumpService = require("./AutoBumpService");
      AutoBumpService.logBump(this.guildId, serviceId, success, errorMessage);
    } catch (error) {
      console.error("[AutoBump] Erreur lors du logging:", error);
    }
  }
}

module.exports = AutoBumpEngine;
