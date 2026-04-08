const session = require('express-session');

class SQLiteStore extends session.Store {
  constructor({ db, ttlMs }) {
    super();
    this.db = db;
    this.ttlMs = ttlMs;
    this.cleanupStmt = this.db.prepare('DELETE FROM sessions WHERE expires <= ?');
    this.getStmt = this.db.prepare('SELECT data FROM sessions WHERE sid = ? AND expires > ?');
    this.setStmt = this.db.prepare(
      'INSERT INTO sessions (sid, expires, data) VALUES (?, ?, ?) ON CONFLICT(sid) DO UPDATE SET expires = excluded.expires, data = excluded.data'
    );
    this.deleteStmt = this.db.prepare('DELETE FROM sessions WHERE sid = ?');
  }

  get(sid, callback) {
    try {
      this.cleanupStmt.run(Date.now());
      const row = this.getStmt.get(sid, Date.now());
      callback(null, row ? JSON.parse(row.data) : null);
    } catch (error) {
      callback(error);
    }
  }

  set(sid, sessionData, callback) {
    try {
      const expires = sessionData.cookie?.expires
        ? new Date(sessionData.cookie.expires).getTime()
        : Date.now() + this.ttlMs;
      this.setStmt.run(sid, expires, JSON.stringify(sessionData));
      callback?.(null);
    } catch (error) {
      callback?.(error);
    }
  }

  destroy(sid, callback) {
    try {
      this.deleteStmt.run(sid);
      callback?.(null);
    } catch (error) {
      callback?.(error);
    }
  }

  touch(sid, sessionData, callback) {
    this.set(sid, sessionData, callback);
  }
}

module.exports = SQLiteStore;
