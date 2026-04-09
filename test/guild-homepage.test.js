const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const tempDbPath = path.resolve('/tmp', `unixbot_dashboard_test_${Date.now()}_${Math.random().toString(16).slice(2)}.db`);
process.env.DB_PATH = tempDbPath;

const { initDatabase, closeDatabase, getDb } = require('../src/database/init');
const { GuildRepository } = require('../src/repositories/guildRepository');

test.before(() => {
  initDatabase();
});

test.after(() => {
  closeDatabase();
  if (fs.existsSync(tempDbPath)) fs.unlinkSync(tempDbPath);
});

test('listRecentActivity returns guild-scoped entries only', () => {
  const db = getDb();
  const repository = new GuildRepository(db);

  db.prepare(
    'INSERT INTO audit_logs (actor, action, target_type, target_id, payload) VALUES (?, ?, ?, ?, ?)'
  ).run('tester', 'update_settings', 'guild', '100000000000000001', '{}');

  db.prepare(
    'INSERT INTO audit_logs (actor, action, target_type, target_id, payload) VALUES (?, ?, ?, ?, ?)'
  ).run('tester', 'update_module', 'module', '100000000000000001:utility', '{}');

  db.prepare(
    'INSERT INTO audit_logs (actor, action, target_type, target_id, payload) VALUES (?, ?, ?, ?, ?)'
  ).run('tester', 'other_guild', 'guild', '999999999999999999', '{}');

  const activity = repository.listRecentActivity('100000000000000001', 10);
  assert.equal(activity.length >= 2, true);
  assert.equal(activity.some((entry) => entry.targetId === '999999999999999999'), false);
});

test('getGuildHomepageData returns complete payload for existing guild', () => {
  const repository = new GuildRepository(getDb());
  const payload = repository.getGuildHomepageData('100000000000000001');

  assert.ok(payload);
  assert.equal(payload.guild.id, '100000000000000001');
  assert.equal(Array.isArray(payload.modules), true);
  assert.equal(Array.isArray(payload.activity), true);
  assert.equal(typeof payload.bot.status, 'string');
});
