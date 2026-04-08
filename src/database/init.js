/**
 * Module d'initialisation de la base de données SQLite v2
 * Gère la connexion, les migrations et le pool de connexions
 * @module database/init
 */

const Database = require("better-sqlite3");
const path = require("path");
const fs = require("fs");

const DB_PATH = path.join(__dirname, "../../database/bot.db");
const SCHEMA_PATH = path.join(__dirname, "schema.sql");

let db = null;

/**
 * Initialise la connexion à la base de données
 * @returns {Database} Instance de la base de données
 */
function initDatabase() {
  if (db) {
    return db;
  }

  try {
    // Créer le dossier database s'il n'existe pas
    const dbDir = path.dirname(DB_PATH);
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }

    // Ouvrir la connexion
    db = new Database(DB_PATH, {
      verbose: process.env.DEBUG === "true" ? console.log : null,
    });

    // Configuration pour de meilleures performances
    db.pragma("journal_mode = WAL");
    db.pragma("foreign_keys = ON");
    db.pragma("synchronous = NORMAL");
    db.pragma("cache_size = -64000"); // 64MB cache
    db.pragma("temp_store = MEMORY");

    console.log("✅ Base de données SQLite initialisée:", DB_PATH);

    // Exécuter les migrations
    runMigrations();

    return db;
  } catch (error) {
    console.error(
      "❌ Erreur lors de l'initialisation de la base de données:",
      error
    );
    throw error;
  }
}

/**
 * Exécute les migrations du schéma
 */
function runMigrations() {
  try {
    if (!fs.existsSync(SCHEMA_PATH)) {
      console.warn(
        "⚠️  Fichier schema-v2.sql introuvable, aucune migration appliquée"
      );
      return;
    }

    const schema = fs.readFileSync(SCHEMA_PATH, "utf8");

    // Exécuter le schéma complet
    db.exec(schema);

    console.log("✅ Migrations v2 appliquées avec succès");
  } catch (error) {
    console.error("❌ Erreur lors de l'application des migrations:", error);
    throw error;
  }
}

/**
 * Récupère l'instance de la base de données
 * @returns {Database} Instance de la base de données
 */
function getDatabase() {
  if (!db) {
    return initDatabase();
  }
  return db;
}

/**
 * Ferme proprement la connexion à la base de données
 */
function closeDatabase() {
  if (db) {
    try {
      db.close();
      db = null;
      console.log("✅ Connexion à la base de données fermée");
    } catch (error) {
      console.error("❌ Erreur lors de la fermeture de la DB:", error);
    }
  }
}

/**
 * Exécute une requête dans une transaction
 * @param {Function} fn - Fonction contenant les requêtes
 * @returns {any} Résultat de la fonction
 */
function transaction(fn) {
  const database = getDatabase();
  return database.transaction(fn)();
}

/**
 * Effectue un backup de la base de données
 * @param {string} backupPath - Chemin du fichier de backup
 * @returns {Promise<void>}
 */
async function backupDatabase(backupPath) {
  const database = getDatabase();
  await database.backup(backupPath);
  console.log(`✅ Backup créé: ${backupPath}`);
}

module.exports = {
  initDatabase,
  getDatabase,
  closeDatabase,
  transaction,
  backupDatabase,
};
