/**
 * Routes d'authentification OAuth2 Discord
 * @module api/routes/auth
 */

const express = require("express");
const crypto = require("crypto");
const router = express.Router();

const config = require("../../../config/config");
const { strictRateLimiter } = require("../middleware/rateLimiter");

// ============================================
// HELPERS
// ============================================

/**
 * Sécurise les URLs de redirection OAuth.
 * N'autorise que les chemins relatifs internes.
 */
function sanitizeRedirect(url) {
  if (!url || typeof url !== "string") return "/dashboard/user";
  if (!url.startsWith("/") || url.startsWith("//")) return "/dashboard/user";
  if (/[\n\r]/i.test(url)) return "/dashboard/user";
  return url;
}

/**
 * Génère la page HTML de callback pour une popup OAuth.
 * Utilise BroadcastChannel (robuste même quand window.opener est null après
 * redirection cross-origin via Discord) avec fallback localStorage.
 */
function popupCallbackHtml(payload) {
  const json = JSON.stringify(payload);
  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <title>UnixBot — Connexion</title>
  <style>
    body{font-family:system-ui,sans-serif;display:flex;align-items:center;
         justify-content:center;height:100vh;margin:0;background:#0f0f13;color:#888;font-size:14px}
  </style>
</head>
<body>
  <p>Connexion réussie, fermeture en cours…</p>
  <script>
    (function(){
      var payload = ${json};
      // Primary: BroadcastChannel — works even when window.opener is null
      // (Discord's COOP header breaks the opener chain, but not BroadcastChannel)
      try {
        var ch = new BroadcastChannel('unixbot_oauth');
        ch.postMessage(payload);
        setTimeout(function(){ ch.close(); }, 500);
      } catch(_) {
        // Fallback: localStorage storage event for same-origin same-device
        try {
          localStorage.setItem('unixbot_oauth_result',
            JSON.stringify(Object.assign({}, payload, { _ts: Date.now() }))
          );
        } catch(__) {}
      }
      // Fermer la popup après envoi du message
      setTimeout(function(){ window.close(); }, 300);
    })();
  <\/script>
</body>
</html>`;
}

// ============================================
// ROUTES
// ============================================

/**
 * GET /api/auth/login
 * Rediriger vers Discord OAuth2
 */
router.get("/login", (req, res) => {
  // Si déjà connecté, rediriger vers le dashboard
  if (req.session?.user?.id) {
    return res.redirect("/dashboard");
  }

  // Générer un state anti-CSRF
  const state = crypto.randomBytes(16).toString("hex");
  req.session.oauthState = state;
  req.session.redirectTo = sanitizeRedirect(req.query.redirect) || "/dashboard/user";

  // Construire l'URL d'autorisation
  const authorizeUrl = new URL("https://discord.com/oauth2/authorize");
  authorizeUrl.searchParams.set("client_id", config.clientId);
  authorizeUrl.searchParams.set("response_type", "code");
  authorizeUrl.searchParams.set(
    "redirect_uri",
    `${config.baseUrl}/api/auth/callback`
  );
  authorizeUrl.searchParams.set("scope", "identify email guilds");
  authorizeUrl.searchParams.set("state", state);
  authorizeUrl.searchParams.set("prompt", "none");

  res.redirect(authorizeUrl.toString());
});

/**
 * GET /api/auth/bot-invite
 * Lien d'invitation du bot
 */
router.get("/bot-invite", (req, res) => {
  const guildId = req.query.guildId;

  const invite = new URL("https://discord.com/oauth2/authorize");
  invite.searchParams.set("client_id", config.clientId);
  invite.searchParams.set("permissions", "397250391551");
  invite.searchParams.set("scope", "bot applications.commands");
  invite.searchParams.set("response_type", "code");
  invite.searchParams.set("redirect_uri", `${config.baseUrl}/api/auth/guild`);

  if (guildId) {
    invite.searchParams.set("guild_id", guildId);
    invite.searchParams.set("disable_guild_select", "true");
  }

  res.redirect(invite.toString());
});

/**
 * GET /api/auth/callback
 * Callback OAuth2 Discord (pour login utilisateur)
 */
router.get("/callback", strictRateLimiter, async (req, res) => {
  try {
    const { code, state, error: oauthError } = req.query;

    // Erreur OAuth (ex: access_denied)
    if (oauthError) {
      console.error("OAuth error:", oauthError);
      return res.send(popupCallbackHtml({ type: "oauth_error", reason: "cancelled" }));
    }

    // Vérifier le state anti-CSRF
    if (!code || !state || state !== req.session.oauthState) {
      console.error("Invalid OAuth state");
      return res.send(popupCallbackHtml({ type: "oauth_error", reason: "invalid_state" }));
    }

    delete req.session.oauthState;

    // Échanger le code contre des tokens
    const tokenResponse = await fetch("https://discord.com/api/oauth2/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        client_id: config.clientId,
        client_secret: config.clientSecret,
        grant_type: "authorization_code",
        code: code,
        redirect_uri: `${config.baseUrl}/api/auth/callback`,
      }),
    });

    if (!tokenResponse.ok) {
      const errorData = await tokenResponse.json();
      console.error("Token exchange failed:", errorData);
      return res.send(popupCallbackHtml({ type: "oauth_error", reason: "token_exchange" }));
    }

    const tokens = await tokenResponse.json();

    // Récupérer les infos utilisateur
    const userResponse = await fetch("https://discord.com/api/users/@me", {
      headers: {
        Authorization: `Bearer ${tokens.access_token}`,
      },
    });

    if (!userResponse.ok) {
      console.error("Failed to fetch user info");
      return res.send(popupCallbackHtml({ type: "oauth_error", reason: "user_fetch" }));
    }

    const discordUser = await userResponse.json();

    // Enregistrer l'utilisateur dans la base de données
    try {
      const userService = require("../../services/UserService");
      userService.ensureUser(
        discordUser.id,
        discordUser.username,
        discordUser.discriminator || "0"
      );
    } catch (dbError) {
      console.error("Erreur enregistrement utilisateur:", dbError);
      // Continue même si l'enregistrement échoue
    }

    // Récupérer SessionService (avec chiffrement)
    const sessionService = req.app.get("sessionService");

    // Créer une session sécurisée
    // Les tokens sont chiffrés et stockés en BD, pas en clair en session
    sessionService.createSecureSession(req, discordUser, tokens);

    console.log(
      `✅ User logged in: ${discordUser.username} (${discordUser.id})`
    );
    console.log(`🔒 Tokens chiffrés et stockés en BD pour ${discordUser.id}`);

    const redirectTo = sanitizeRedirect(req.session.redirectTo) || "/dashboard/user";
    delete req.session.redirectTo;

    // Sauvegarder la session puis notifier la fenêtre parente via BroadcastChannel
    req.session.save((err) => {
      if (err) console.error("Erreur sauvegarde session:", err);
      res.send(popupCallbackHtml({ type: "oauth_success", redirect: redirectTo }));
    });
  } catch (error) {
    console.error("OAuth callback error:", error);
    res.send(popupCallbackHtml({ type: "oauth_error", reason: "server_error" }));
  }
});

/**
 * GET /api/auth/guild
 * Callback après ajout du bot à un serveur
 */
router.get("/guild", strictRateLimiter, async (req, res) => {
  try {
    const { code, guild_id, error: oauthError } = req.query;

    // Erreur OAuth
    if (oauthError) {
      console.error("Bot invite error:", oauthError);
      return res.redirect("/?bot_error=cancelled");
    }

    // Si pas de code, c'est probablement juste une visite directe
    if (!code) {
      return res.redirect("/");
    }

    // Le bot est déjà ajouté au serveur à ce stade
    console.log(`Bot added to guild: ${guild_id}`);

    // Notifier la fenêtre parente via BroadcastChannel
    res.send(popupCallbackHtml({ type: "oauth_success", redirect: "/dashboard/user" }));
  } catch (error) {
    console.error("Guild callback error:", error);
    res.send(popupCallbackHtml({ type: "oauth_error", reason: "server_error" }));
  }
});

/**
 * GET /api/auth/logout
 * Déconnecter l'utilisateur
 */
router.get("/logout", (req, res) => {
  const userId = req.session?.user?.id;

  req.session.destroy((err) => {
    if (err) {
      console.error("Session destroy error:", err);
    }

    if (userId) {
      console.log(`User logged out: ${userId}`);
    }

    res.clearCookie("unixbot.api.sid");
    res.redirect("/");
  });
});

/**
 * POST /api/auth/logout
 * Déconnecter l'utilisateur (API)
 */
router.post("/logout", (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({
        success: false,
        error: "Erreur lors de la déconnexion",
      });
    }

    res.clearCookie("unixbot.api.sid");
    res.json({
      success: true,
      message: "Déconnexion réussie",
    });
  });
});

/**
 * GET /api/auth/me
 * Obtenir les infos de l'utilisateur connecté
 */
router.get("/me", async (req, res) => {
  if (!req.session?.user?.id) {
    return res.status(401).json({
      success: false,
      error: "Non authentifié",
    });
  }

  const user = req.session.user;

  res.json({
    success: true,
    user: {
      id: user.id,
      username: user.username,
      global_name: user.global_name,
      avatar: user.avatar,
      avatarUrl: user.avatarUrl,
    },
  });
});

/**
 * GET /api/auth/guilds
 * Obtenir les serveurs de l'utilisateur
 */
router.get("/guilds", async (req, res) => {
  if (!req.session?.user?.accessToken) {
    return res.status(401).json({
      success: false,
      error: "Non authentifié",
    });
  }

  try {
    const guildsResponse = await fetch(
      "https://discord.com/api/users/@me/guilds",
      {
        headers: {
          Authorization: `Bearer ${req.session.user.accessToken}`,
        },
      }
    );

    if (!guildsResponse.ok) {
      throw new Error("Failed to fetch guilds");
    }

    const guilds = await guildsResponse.json();

    // Filtrer pour garder seulement les serveurs où l'utilisateur est admin
    const adminGuilds = guilds.filter((guild) => {
      const permissions = BigInt(guild.permissions);
      const ADMINISTRATOR = BigInt(0x8);
      const MANAGE_GUILD = BigInt(0x20);
      return (
        (permissions & ADMINISTRATOR) === ADMINISTRATOR ||
        (permissions & MANAGE_GUILD) === MANAGE_GUILD
      );
    });

    res.json({
      success: true,
      guilds: adminGuilds.map((g) => ({
        id: g.id,
        name: g.name,
        icon: g.icon,
        iconUrl: g.icon
          ? `https://cdn.discordapp.com/icons/${g.id}/${g.icon}.png?size=128`
          : null,
        owner: g.owner,
        permissions: g.permissions,
      })),
    });
  } catch (error) {
    console.error("Error fetching guilds:", error);
    res.status(500).json({
      success: false,
      error: "Erreur lors de la récupération des serveurs",
    });
  }
});

/**
 * GET /api/auth/status
 * Vérifier le statut d'authentification
 */
router.get("/status", (req, res) => {
  res.json({
    success: true,
    authenticated: !!req.session?.user?.id,
    user: req.session?.user
      ? {
          id: req.session.user.id,
          username: req.session.user.username,
        }
      : null,
  });
});

module.exports = router;
