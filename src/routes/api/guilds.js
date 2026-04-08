const express = require('express');
const { getDb } = require('../../database/init');
const { requireAuth } = require('../../middleware/auth');
const { validateGuildSettings } = require('../../middleware/validators');

const router = express.Router();
router.use(requireAuth);

router.get('/', (req, res) => {
  const db = getDb();
  const rows = db.prepare('SELECT id, name, updated_at FROM guilds ORDER BY name ASC').all();
  res.json({ ok: true, guilds: rows });
});

router.get('/:guildId/settings', (req, res) => {
  const db = getDb();
  const { guildId } = req.params;

  const guild = db.prepare('SELECT id, name FROM guilds WHERE id = ?').get(guildId);
  if (!guild) {
    return res.status(404).json({ ok: false, error: 'Guild not found' });
  }

  const settings = db
    .prepare('SELECT prefix, language, welcome_enabled, welcome_message, log_channel_id, updated_at FROM guild_settings WHERE guild_id = ?')
    .get(guildId);

  return res.json({ ok: true, guild, settings });
});

router.put('/:guildId/settings', (req, res) => {
  const db = getDb();
  const { guildId } = req.params;

  const guild = db.prepare('SELECT id FROM guilds WHERE id = ?').get(guildId);
  if (!guild) {
    return res.status(404).json({ ok: false, error: 'Guild not found' });
  }

  const { errors, data } = validateGuildSettings(req.body || {});
  if (errors.length) {
    return res.status(400).json({ ok: false, error: 'Validation failed', details: errors });
  }

  if (Object.keys(data).length === 0) {
    return res.status(400).json({ ok: false, error: 'No valid fields to update' });
  }

  const allowedKeys = ['prefix', 'language', 'welcome_enabled', 'welcome_message', 'log_channel_id'];
  const keys = Object.keys(data).filter((key) => allowedKeys.includes(key));
  const sets = keys.map((key) => `${key} = @${key}`);
  const statement = db.prepare(
    `UPDATE guild_settings SET ${sets.join(', ')}, updated_at = strftime('%s','now') WHERE guild_id = @guild_id`
  );
  statement.run({ guild_id: guildId, ...data });

  db.prepare(
    'INSERT INTO audit_logs (actor, action, target_type, target_id, payload) VALUES (?, ?, ?, ?, ?)'
  ).run(req.session.user.username, 'update_guild_settings', 'guild', guildId, JSON.stringify(data));

  const settings = db
    .prepare('SELECT prefix, language, welcome_enabled, welcome_message, log_channel_id, updated_at FROM guild_settings WHERE guild_id = ?')
    .get(guildId);

  return res.json({ ok: true, settings });
});

module.exports = router;
