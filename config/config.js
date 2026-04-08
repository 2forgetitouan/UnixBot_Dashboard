/**
 * Configuration centrale du bot
 * Charge les variables d'environnement depuis .env et fournit des valeurs par défaut
 */

require("dotenv").config();
const crypto = require("crypto");

// Validation des secrets requis
const TOKEN = process.env.TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;

if (!TOKEN) {
  console.error("❌ ERREUR: TOKEN non défini dans .env");
  console.error("💡 Copiez .env.example vers .env et remplissez le TOKEN");
  process.exit(1);
}

if (!CLIENT_ID) {
  console.error("❌ ERREUR: CLIENT_ID non défini dans .env");
  console.error("💡 Copiez .env.example vers .env et remplissez le CLIENT_ID");
  process.exit(1);
}

// Validation des secrets de session/chiffrement
// Si absents, on génère une clé stable et on avertit fortement
if (!process.env.SESSION_SECRET) {
  console.warn(
    "⚠️  SESSION_SECRET non défini dans .env - Les sessions seront invalidées à chaque redémarrage !"
  );
  console.warn(
    "💡 Ajoutez SESSION_SECRET dans votre .env (voir .env.example)"
  );
}

if (!process.env.ENCRYPTION_KEY) {
  console.warn(
    "⚠️  ENCRYPTION_KEY non défini dans .env - Les tokens chiffrés seront perdus au redémarrage !"
  );
  console.warn(
    "💡 Ajoutez ENCRYPTION_KEY dans votre .env (voir .env.example)"
  );
}

// Configuration du bot Discord
const config = {
  // Secrets (depuis .env uniquement)
  token: TOKEN,
  clientId: CLIENT_ID,
  clientSecret: process.env.CLIENT_SECRET || "",

  // Session (DOIT être défini pour persister entre les redémarrages)
  sessionSecret:
    process.env.SESSION_SECRET || crypto.randomBytes(32).toString("hex"),

  // Clé de chiffrement pour SessionService
  encryptionKey:
    process.env.ENCRYPTION_KEY || crypto.randomBytes(32).toString("hex"),

  // Configuration globale
  webPort: parseInt(process.env.WEB_PORT, 10) || 3000,
  baseUrl: process.env.BASE_URL || "http://localhost:3000",
  contactUserId: process.env.CONTACT_USER_ID || "",
  ownerBot: process.env.USER_OWNER || "",
  adminPassword: process.env.ADMIN_PASSWORD || "",

  // Clé API Tenor (pour /randomgif)
  tenorApiKey: process.env.TENOR_API_KEY || "",

  // OAuth2
  oauth: {
    clientId: CLIENT_ID,
    clientSecret: process.env.CLIENT_SECRET || "",
    redirectUri:
      process.env.REDIRECT_URI || "http://localhost:3000/auth/callback",
  },
};

// Avertissements pour configuration incomplète
if (!config.clientSecret) {
  console.warn(
    "⚠️  CLIENT_SECRET non défini - Le dashboard web OAuth ne fonctionnera pas"
  );
}

if (!config.contactUserId) {
  console.warn(
    "⚠️  CONTACT_USER_ID non défini - Pas de notifications d'erreur par DM"
  );
}

if (!config.ownerBot) {
  console.warn(
    "⚠️  USER_OWNER non défini - Aucun propriétaire configuré pour le bot"
  );
}

if (!config.tenorApiKey) {
  console.warn(
    "⚠️  TENOR_API_KEY non défini - La commande /randomgif ne fonctionnera pas"
  );
}

// Log de la configuration au démarrage (sans les secrets)
console.log("📋 Configuration chargée:");
console.log("   - Token:", TOKEN ? "✅ Défini" : "❌ Manquant");
console.log("   - Client ID:", CLIENT_ID);
console.log("   - Port web:", config.webPort);
console.log("   - OAuth configuré:", config.clientSecret ? "✅" : "❌");
console.log("   - Session Secret:", process.env.SESSION_SECRET ? "✅ Fixe" : "⚠️ Aléatoire");
console.log("   - Encryption Key:", process.env.ENCRYPTION_KEY ? "✅ Fixe" : "⚠️ Aléatoire");
console.log("   - Tenor API:", config.tenorApiKey ? "✅" : "❌");

module.exports = config;
