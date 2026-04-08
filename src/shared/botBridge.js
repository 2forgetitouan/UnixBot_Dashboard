/**
 * BotBridge — Adaptateur d'accès au bot Discord
 *
 * Fournit une interface identique quel que soit le mode d'exécution :
 *  - Mode "direct" (même processus) : appelle directement le singleton bot
 *  - Mode "remote" (processus séparé) : appelle l'API interne HTTP du bot
 *
 * Toutes les méthodes sont async et retournent des données sérialisables.
 * Le web/API ne doit JAMAIS importer src/bot directement — toujours via ce bridge.
 *
 * @module shared/botBridge
 */

const http = require("http");

// ── State ────────────────────────────────────────────
let mode = null; // "direct" | "remote"
let directBot = null; // référence au singleton bot (mode direct uniquement)
let remoteConfig = { host: "127.0.0.1", port: 3002, secret: null };

// ============================================
// INITIALISATION
// ============================================

/**
 * Initialiser le bridge en mode direct (même processus)
 * @param {Object} botInstance - Singleton UnixBot (src/bot/index.js)
 */
function initDirect(botInstance) {
  mode = "direct";
  directBot = botInstance;
}

/**
 * Initialiser le bridge en mode remote (processus séparé)
 * @param {Object} [options]
 * @param {string} [options.host="127.0.0.1"]
 * @param {number} [options.port=3002]
 * @param {string} [options.secret]
 */
function initRemote(options = {}) {
  mode = "remote";
  remoteConfig = {
    host: options.host || process.env.BOT_INTERNAL_HOST || "127.0.0.1",
    port: options.port || parseInt(process.env.BOT_INTERNAL_PORT, 10) || 3002,
    secret: options.secret || process.env.INTERNAL_API_SECRET || null,
  };
}

/**
 * Retourne le mode actuel
 * @returns {"direct"|"remote"|null}
 */
function getMode() {
  return mode;
}

// ============================================
// TRANSPORT HTTP (mode remote)
// ============================================

/**
 * Effectue une requête HTTP vers l'API interne du bot
 * @param {string} method - GET ou POST
 * @param {string} path - Chemin (ex: "/guilds")
 * @param {Object} [body] - Corps de la requête (POST)
 * @returns {Promise<any>}
 */
function httpRequest(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: remoteConfig.host,
      port: remoteConfig.port,
      path,
      method,
      headers: { "Content-Type": "application/json" },
      timeout: 10000,
    };

    if (remoteConfig.secret) {
      options.headers["x-internal-secret"] = remoteConfig.secret;
    }

    const req = http.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try {
          const parsed = JSON.parse(data);
          if (res.statusCode >= 400) {
            reject(new Error(parsed.error || `HTTP ${res.statusCode}`));
          } else {
            resolve(parsed);
          }
        } catch {
          reject(new Error(`Invalid JSON from bot API: ${data.slice(0, 200)}`));
        }
      });
    });

    req.on("error", (err) => reject(new Error(`Bot API unreachable: ${err.message}`)));
    req.on("timeout", () => {
      req.destroy();
      reject(new Error("Bot API timeout"));
    });

    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

// ============================================
// API PUBLIQUE
// ============================================

/**
 * Vérifie si le bot est disponible
 * @returns {Promise<boolean>}
 */
async function isAvailable() {
  try {
    if (mode === "direct") {
      const client = directBot?.getClient?.();
      return client?.isReady?.() || false;
    }
    const status = await httpRequest("GET", "/status");
    return status.ready === true;
  } catch {
    return false;
  }
}

/**
 * Obtenir le statut complet du bot
 * @returns {Promise<Object>} { ready, uptime, guilds, users, ping, user }
 */
async function getStatus() {
  if (mode === "direct") {
    const client = directBot.getClient();
    return {
      ready: client.isReady(),
      uptime: client.uptime,
      guilds: client.guilds.cache.size,
      users: client.guilds.cache.reduce((acc, g) => acc + g.memberCount, 0),
      ping: client.ws.ping,
      user: client.user
        ? { id: client.user.id, tag: client.user.tag, avatar: client.user.displayAvatarURL() }
        : null,
    };
  }
  return httpRequest("GET", "/status");
}

/**
 * Obtenir le client Discord (mode direct uniquement)
 * En mode remote, retourne null — utiliser les méthodes du bridge à la place.
 * @returns {import('discord.js').Client|null}
 */
function getClient() {
  if (mode === "direct") {
    return directBot?.getClient?.() || null;
  }
  return null;
}

/**
 * Lister les guilds du bot
 * @returns {Promise<Array<{id, name, icon, memberCount, ownerId}>>}
 */
async function getGuilds() {
  if (mode === "direct") {
    return directBot.getClient().guilds.cache.map((g) => ({
      id: g.id,
      name: g.name,
      icon: g.icon,
      iconUrl: g.iconURL({ size: 128 }) || null,
      memberCount: g.memberCount,
      ownerId: g.ownerId,
    }));
  }
  return httpRequest("GET", "/guilds");
}

/**
 * Obtenir les IDs des guilds où le bot est présent
 * @returns {Promise<Set<string>>}
 */
async function getGuildIds() {
  if (mode === "direct") {
    return new Set(directBot.getClient().guilds.cache.map((g) => g.id));
  }
  const guilds = await httpRequest("GET", "/guilds");
  return new Set(guilds.map((g) => g.id));
}

/**
 * Obtenir les infos d'une guild
 * @param {string} guildId
 * @returns {Promise<Object|null>}
 */
async function getGuild(guildId) {
  if (mode === "direct") {
    const guild = directBot.getClient().guilds.cache.get(guildId);
    if (!guild) return null;
    return {
      id: guild.id,
      name: guild.name,
      icon: guild.icon,
      iconUrl: guild.iconURL({ size: 128 }) || null,
      memberCount: guild.memberCount,
      ownerId: guild.ownerId,
    };
  }
  try {
    return await httpRequest("GET", `/guilds/${guildId}`);
  } catch {
    return null;
  }
}

/**
 * Obtenir les channels d'une guild
 * @param {string} guildId
 * @param {number} [type] - Type Discord (optionnel)
 * @returns {Promise<Array>}
 */
async function getGuildChannels(guildId, type = null) {
  if (mode === "direct") {
    return directBot.getGuildChannels(guildId, type);
  }
  const query = type !== null ? `?type=${type}` : "";
  return httpRequest("GET", `/guilds/${guildId}/channels${query}`);
}

/**
 * Obtenir les rôles d'une guild
 * @param {string} guildId
 * @returns {Promise<Array>}
 */
async function getGuildRoles(guildId) {
  if (mode === "direct") {
    return directBot.getGuildRoles(guildId);
  }
  return httpRequest("GET", `/guilds/${guildId}/roles`);
}

/**
 * Rechercher des membres dans une guild
 * @param {string} guildId
 * @param {string} query - Recherche
 * @returns {Promise<Array>}
 */
async function searchGuildMembers(guildId, query) {
  if (mode === "direct") {
    const guild = directBot.getClient().guilds.cache.get(guildId);
    if (!guild) return [];
    const fetched = await guild.members.fetch({ query, limit: 10 });
    return fetched.map((m) => ({
      id: m.id,
      username: m.user.username,
      displayName: m.displayName,
      avatar: m.user.displayAvatarURL({ size: 64 }),
      roles: m.roles.cache.filter((r) => r.id !== guild.id).map((r) => r.id),
    }));
  }
  return httpRequest("GET", `/guilds/${guildId}/members/search?q=${encodeURIComponent(query)}`);
}

/**
 * Obtenir un membre spécifique d'une guild (avec permissions)
 * @param {string} guildId
 * @param {string} userId
 * @returns {Promise<Object|null>} { id, username, displayName, avatar, permissions: { administrator, manageGuild }, roles }
 */
async function getGuildMember(guildId, userId) {
  if (mode === "direct") {
    const guild = directBot.getClient().guilds.cache.get(guildId);
    if (!guild) return null;
    const member = await guild.members.fetch(userId).catch(() => null);
    if (!member) return null;
    return {
      id: member.id,
      username: member.user.username,
      displayName: member.displayName,
      avatar: member.user.displayAvatarURL({ size: 64 }),
      permissions: {
        administrator: member.permissions.has("Administrator"),
        manageGuild: member.permissions.has("ManageGuild"),
      },
      roles: member.roles.cache.filter((r) => r.id !== guild.id).map((r) => r.id),
    };
  }
  try {
    return await httpRequest("GET", `/guilds/${guildId}/members/${userId}`);
  } catch {
    return null;
  }
}

/**
 * Obtenir les informations d'un utilisateur Discord
 * @param {string} userId
 * @returns {Promise<Object|null>} { id, username, displayAvatarURL, tag }
 */
async function fetchUser(userId) {
  if (mode === "direct") {
    try {
      const user = await directBot.getClient().users.fetch(userId);
      return { id: user.id, username: user.username, displayAvatarURL: user.displayAvatarURL({ size: 64 }), tag: user.tag };
    } catch {
      return null;
    }
  }
  try {
    return await httpRequest("GET", `/users/${userId}`);
  } catch {
    return null;
  }
}

/**
 * Résoudre le nom d'un channel
 * @param {string} channelId
 * @returns {Promise<string|null>}
 */
async function getChannelName(channelId) {
  if (mode === "direct") {
    try {
      const channel = await directBot.getClient().channels.fetch(channelId);
      return channel ? channel.name : null;
    } catch {
      return null;
    }
  }
  // En mode remote, pas d'endpoint dédié — retourner null
  return null;
}

/**
 * Envoyer un message dans un channel
 * @param {string} channelId
 * @param {string} [content]
 * @param {Object} [embed]
 * @returns {Promise<{id: string, channelId: string}>}
 */
async function sendMessage(channelId, content = null, embed = null) {
  if (mode === "direct") {
    const sent = await directBot.sendMessage(channelId, content, embed);
    return { id: sent.id, channelId: sent.channelId };
  }
  return httpRequest("POST", "/messages/channel", { channelId, content, embed });
}

/**
 * Envoyer un DM
 * @param {string} userId
 * @param {string} [content]
 * @param {Object} [embed]
 * @returns {Promise<{id: string}>}
 */
async function sendDM(userId, content = null, embed = null) {
  if (mode === "direct") {
    const sent = await directBot.sendDM(userId, content, embed);
    return { id: sent.id };
  }
  return httpRequest("POST", "/messages/dm", { userId, content, embed });
}

/**
 * Envoyer un message de giveaway (embed + boutons)
 * @param {string} guildId
 * @param {string} channelId
 * @param {Object} embed
 * @param {Array} [components]
 * @returns {Promise<{messageId: string, channelId: string}>}
 */
async function sendGiveawayMessage(guildId, channelId, embed, components = null) {
  if (mode === "direct") {
    const channel = await directBot.getClient().channels.fetch(channelId);
    const msgOptions = {};
    if (embed) msgOptions.embeds = [embed];
    if (components) msgOptions.components = components;
    const sent = await channel.send(msgOptions);
    return { messageId: sent.id, channelId: sent.channelId };
  }
  return httpRequest("POST", `/guilds/${guildId}/giveaway-message`, { channelId, embed, components });
}

/**
 * Éditer un message
 * @param {string} guildId
 * @param {string} channelId
 * @param {string} messageId
 * @param {Object} options - { content, embed, components }
 * @returns {Promise<{success: boolean}>}
 */
async function editMessage(guildId, channelId, messageId, options = {}) {
  if (mode === "direct") {
    const channel = await directBot.getClient().channels.fetch(channelId);
    const msg = await channel.messages.fetch(messageId);
    const editOptions = {};
    if (options.content !== undefined) editOptions.content = options.content;
    if (options.embed) editOptions.embeds = [options.embed];
    if (options.components) editOptions.components = options.components;
    await msg.edit(editOptions);
    return { success: true };
  }
  return httpRequest("POST", `/guilds/${guildId}/edit-message`, {
    channelId,
    messageId,
    ...options,
  });
}

// ============================================
// EXPORTS
// ============================================
module.exports = {
  initDirect,
  initRemote,
  getMode,
  isAvailable,
  getStatus,
  getClient,
  getGuilds,
  getGuildIds,
  getGuild,
  getGuildChannels,
  getGuildRoles,
  searchGuildMembers,
  getGuildMember,
  fetchUser,
  getChannelName,
  sendMessage,
  sendDM,
  sendGiveawayMessage,
  editMessage,
};
