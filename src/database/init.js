const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const config = require('../../config/config');

const dbPath = path.resolve(process.cwd(), config.database.path);
const schemaPath = path.resolve(__dirname, 'schema.sql');

let db;

function getDb() {
  if (!db) {
    db = new Database(dbPath);
    db.pragma('foreign_keys = ON');
  }
  return db;
}

function runSchema() {
  const schemaSql = fs.readFileSync(schemaPath, 'utf8');
  getDb().exec(schemaSql);
}

function bootstrapData() {
  const connection = getDb();
  const count = connection.prepare('SELECT COUNT(*) as count FROM guilds').get();
  if (count.count > 0) return;

  const seedGuilds = [
    { id: '100000000000000001', name: 'UnixBot Community' },
    { id: '100000000000000002', name: 'UnixBot Support' },
  ];

  const insertGuild = connection.prepare(
    'INSERT INTO guilds (id, name, updated_at) VALUES (?, ?, strftime(\'%s\', \'now\'))'
  );
  const insertSettings = connection.prepare(
    'INSERT OR IGNORE INTO guild_settings (guild_id) VALUES (?)'
  );

  const tx = connection.transaction((guilds) => {
    guilds.forEach((guild) => {
      insertGuild.run(guild.id, guild.name);
      insertSettings.run(guild.id);
    });
  });

  tx(seedGuilds);
}

function initDatabase() {
  runSchema();
  bootstrapData();
  return getDb();
}

function closeDatabase() {
  if (db) {
    db.close();
    db = null;
  }
}

module.exports = {
  initDatabase,
  closeDatabase,
  getDb,
};
