/**
 * Store de sessions Express basé sur SQLite (better-sqlite3)
 * Remplace session-file-store pour une meilleure fiabilité
 * @module api/middleware/sqliteSessionStore
 */

const session = require("express-session");
const { getDatabase } = require("../../database/init");

const Store = session.Store;

class SQLiteSessionStore extends Store {
  /**
   * @param {Object} options
   * @param {number} [options.ttl=86400] - Durée de vie des sessions en secondes (défaut: 24h)
   * @param {number} [options.cleanupInterval=900000] - Intervalle de nettoyage en ms (défaut: 15min)
   */
  constructor(options = {}) {
    super(options);
    this.ttl = options.ttl || 86400;
    this.cleanupInterval = options.cleanupInterval || 900000;

    this._ensureTable();
    this._startCleanup();
  }

  /**
   * Créer la table sessions si elle n'existe pas
   */
  _ensureTable() {
    try {
      const db = getDatabase();
      db.exec(`
        CREATE TABLE IF NOT EXISTS express_sessions (
          sid TEXT PRIMARY KEY,
          sess TEXT NOT NULL,
          expired_at INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_sessions_expired ON express_sessions(expired_at);
      `);
    } catch (error) {
      console.error("[SESSION_STORE] Erreur création table:", error.message);
    }
  }

  /**
   * Démarrer le nettoyage automatique des sessions expirées
   */
  _startCleanup() {
    this._cleanupTimer = setInterval(() => {
      this._cleanup();
    }, this.cleanupInterval);

    // Ne pas bloquer le process
    if (this._cleanupTimer.unref) {
      this._cleanupTimer.unref();
    }
  }

  /**
   * Supprimer les sessions expirées
   */
  _cleanup() {
    try {
      const db = getDatabase();
      const now = Math.floor(Date.now() / 1000);
      const result = db.prepare("DELETE FROM express_sessions WHERE expired_at <= ?").run(now);
      if (result.changes > 0) {
        console.log(`[SESSION_STORE] ${result.changes} session(s) expirée(s) nettoyée(s)`);
      }
    } catch (error) {
      console.error("[SESSION_STORE] Erreur nettoyage:", error.message);
    }
  }

  /**
   * Récupérer une session
   * @param {string} sid
   * @param {Function} callback
   */
  get(sid, callback) {
    try {
      const db = getDatabase();
      const now = Math.floor(Date.now() / 1000);

      const row = db
        .prepare("SELECT sess FROM express_sessions WHERE sid = ? AND expired_at > ?")
        .get(sid, now);

      if (!row) return callback(null, null);

      const sess = JSON.parse(row.sess);
      callback(null, sess);
    } catch (error) {
      callback(error);
    }
  }

  /**
   * Enregistrer une session
   * @param {string} sid
   * @param {Object} sess
   * @param {Function} callback
   */
  set(sid, sess, callback) {
    try {
      const db = getDatabase();
      const maxAge = sess.cookie?.maxAge || this.ttl * 1000;
      const expiredAt = Math.floor((Date.now() + maxAge) / 1000);

      db.prepare(`
        INSERT INTO express_sessions (sid, sess, expired_at) 
        VALUES (?, ?, ?)
        ON CONFLICT(sid) DO UPDATE SET 
          sess = excluded.sess, 
          expired_at = excluded.expired_at
      `).run(sid, JSON.stringify(sess), expiredAt);

      callback(null);
    } catch (error) {
      callback(error);
    }
  }

  /**
   * Supprimer une session
   * @param {string} sid
   * @param {Function} callback
   */
  destroy(sid, callback) {
    try {
      const db = getDatabase();
      db.prepare("DELETE FROM express_sessions WHERE sid = ?").run(sid);
      callback(null);
    } catch (error) {
      callback(error);
    }
  }

  /**
   * Toucher une session (mettre à jour l'expiration)
   * @param {string} sid
   * @param {Object} sess
   * @param {Function} callback
   */
  touch(sid, sess, callback) {
    try {
      const db = getDatabase();
      const maxAge = sess.cookie?.maxAge || this.ttl * 1000;
      const expiredAt = Math.floor((Date.now() + maxAge) / 1000);

      db.prepare("UPDATE express_sessions SET expired_at = ? WHERE sid = ?")
        .run(expiredAt, sid);

      callback(null);
    } catch (error) {
      callback(error);
    }
  }

  /**
   * Obtenir le nombre de sessions actives
   * @param {Function} callback
   */
  length(callback) {
    try {
      const db = getDatabase();
      const now = Math.floor(Date.now() / 1000);
      const row = db
        .prepare("SELECT COUNT(*) as count FROM express_sessions WHERE expired_at > ?")
        .get(now);
      callback(null, row.count);
    } catch (error) {
      callback(error);
    }
  }

  /**
   * Supprimer toutes les sessions
   * @param {Function} callback
   */
  clear(callback) {
    try {
      const db = getDatabase();
      db.prepare("DELETE FROM express_sessions").run();
      callback(null);
    } catch (error) {
      callback(error);
    }
  }

  /**
   * Obtenir toutes les sessions actives
   * @param {Function} callback
   */
  all(callback) {
    try {
      const db = getDatabase();
      const now = Math.floor(Date.now() / 1000);
      const rows = db
        .prepare("SELECT sid, sess FROM express_sessions WHERE expired_at > ?")
        .all(now);

      const sessions = {};
      for (const row of rows) {
        sessions[row.sid] = JSON.parse(row.sess);
      }
      callback(null, sessions);
    } catch (error) {
      callback(error);
    }
  }
}

module.exports = SQLiteSessionStore;
