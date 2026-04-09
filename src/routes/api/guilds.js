const express = require('express');
const rateLimit = require('express-rate-limit');
const { requireAuth, requireGuildAdmin } = require('../../middleware/auth');
const {
  validateGuildSettings,
  validateModuleState,
  validateRolePermissionPayload,
} = require('../../middleware/validators');
const { GuildRepository } = require('../../repositories/guildRepository');
const { ModuleRepository } = require('../../repositories/moduleRepository');
const { RbacRepository } = require('../../repositories/rbacRepository');
const { DiscordSyncService } = require('../../services/discordSyncService');
const config = require('../../../config/config');

const router = express.Router();
const guildRepository = new GuildRepository();
const moduleRepository = new ModuleRepository();
const rbacRepository = new RbacRepository();
const syncService = new DiscordSyncService();

router.use(
  rateLimit({
    windowMs: config.security.rateLimitWindowMs,
    max: Math.max(10, Math.floor(config.security.rateLimitMax / 2)),
    standardHeaders: true,
    legacyHeaders: false,
    message: { ok: false, error: 'Too many requests' },
  })
);
router.use(requireAuth);

function audit(req, action, targetType, targetId, payload) {
  const db = require('../../database/init').getDb();
  db.prepare(
    'INSERT INTO audit_logs (actor, action, target_type, target_id, payload) VALUES (?, ?, ?, ?, ?)'
  ).run(req.session.user.username, action, targetType, targetId, JSON.stringify(payload || {}));
}

router.get('/', (req, res) => {
  const isLocalAdmin = req.session.user.role === 'local_admin';
  const guilds = guildRepository.listGuildsForUser(req.session.user.id, isLocalAdmin);
  res.json({ ok: true, guilds });
});

router.get('/:guildId/overview', requireGuildAdmin, (req, res) => {
  const { guildId } = req.params;
  const overview = guildRepository.getGuildOverview(guildId);
  if (!overview?.guild) {
    return res.status(404).json({ ok: false, error: 'Guild not found' });
  }
  return res.json({ ok: true, ...overview });
});

router.get('/:guildId/settings', requireGuildAdmin, (req, res) => {
  const { guildId } = req.params;
  const guild = guildRepository.getGuildById(guildId);
  if (!guild) {
    return res.status(404).json({ ok: false, error: 'Guild not found' });
  }

  const settings = guildRepository.getGuildSettings(guildId);
  return res.json({ ok: true, guild, settings });
});

router.put('/:guildId/settings', requireGuildAdmin, (req, res) => {
  const { guildId } = req.params;
  if (!guildRepository.getGuildById(guildId)) {
    return res.status(404).json({ ok: false, error: 'Guild not found' });
  }

  const { errors, data } = validateGuildSettings(req.body || {});
  if (errors.length) {
    return res.status(400).json({ ok: false, error: 'Validation failed', details: errors });
  }

  if (Object.keys(data).length === 0) {
    return res.status(400).json({ ok: false, error: 'No valid fields to update' });
  }

  const settings = guildRepository.updateGuildSettings(guildId, data);
  audit(req, 'update_guild_settings', 'guild', guildId, data);
  return res.json({ ok: true, settings });
});

router.get('/:guildId/modules', requireGuildAdmin, (req, res) => {
  const { guildId } = req.params;
  if (!guildRepository.getGuildById(guildId)) {
    return res.status(404).json({ ok: false, error: 'Guild not found' });
  }

  const modules = moduleRepository.listGuildModules(guildId);
  return res.json({ ok: true, modules });
});

router.put('/:guildId/modules/:moduleKey', requireGuildAdmin, (req, res) => {
  const { guildId, moduleKey } = req.params;
  const { errors, data } = validateModuleState(req.body || {});
  if (errors.length) {
    return res.status(400).json({ ok: false, error: 'Validation failed', details: errors });
  }

  const modules = moduleRepository.listGuildModules(guildId);
  const found = modules.find((entry) => entry.key === moduleKey);
  if (!found) {
    return res.status(404).json({ ok: false, error: 'Module not found' });
  }

  const moduleState = moduleRepository.updateGuildModule(
    guildId,
    moduleKey,
    data.enabled,
    req.session.user.username
  );

  audit(req, 'update_module_state', 'module', `${guildId}:${moduleKey}`, data);
  return res.json({ ok: true, module: { ...moduleState, enabled: moduleState.enabled === 1 } });
});

router.post('/:guildId/sync', requireGuildAdmin, async (req, res) => {
  const { guildId } = req.params;

  if (!syncService.isConfigured()) {
    return res.status(503).json({ ok: false, error: 'Discord bot sync is not configured' });
  }

  try {
    const [roles, membersPayload] = await Promise.all([
      syncService.fetchGuildRoles(guildId),
      syncService.fetchGuildMembers(guildId),
    ]);

    const members = syncService.normalizeMembers(membersPayload);
    const roleById = new Map(roles.map((role) => [String(role.id), String(role.permissions || '0')]));

    const ADMINISTRATOR = 0x8n;
    members.forEach((member) => {
      member.isAdmin = member.roles.some((roleId) => {
        try {
          const perms = BigInt(roleById.get(String(roleId)) || '0');
          return (perms & ADMINISTRATOR) !== 0n;
        } catch {
          return false;
        }
      });
    });

    guildRepository.syncGuildRoles(guildId, roles);
    guildRepository.syncGuildUsers(guildId, members);
    rbacRepository.ensureDefaultRolePermissions(guildId);

    audit(req, 'sync_discord_guild_data', 'guild', guildId, {
      roles: roles.length,
      users: members.length,
    });

    return res.json({ ok: true, synced: { roles: roles.length, users: members.length } });
  } catch (error) {
    return res.status(502).json({ ok: false, error: error.message });
  }
});

router.get('/:guildId/roles', requireGuildAdmin, (req, res) => {
  const { guildId } = req.params;
  const roles = guildRepository.listGuildRoles(guildId);
  rbacRepository.ensureDefaultRolePermissions(guildId);
  return res.json({ ok: true, roles });
});

router.get('/:guildId/users', requireGuildAdmin, (req, res) => {
  const { guildId } = req.params;
  const users = guildRepository.listGuildUsers(guildId);
  return res.json({ ok: true, users });
});

router.get('/:guildId/permissions', requireGuildAdmin, (req, res) => {
  const { guildId } = req.params;
  rbacRepository.ensureDefaultRolePermissions(guildId);
  const permissions = rbacRepository.listRolePermissions(guildId);
  return res.json({ ok: true, permissions });
});

router.put('/:guildId/permissions/roles/:roleId', requireGuildAdmin, (req, res) => {
  const { guildId, roleId } = req.params;
  const { errors, data } = validateRolePermissionPayload(req.body || {});

  if (errors.length) {
    return res.status(400).json({ ok: false, error: 'Validation failed', details: errors });
  }

  const roleExists = guildRepository.listGuildRoles(guildId).some((role) => role.id === roleId);
  if (!roleExists) {
    return res.status(404).json({ ok: false, error: 'Role not found' });
  }

  rbacRepository.upsertRolePermission(guildId, roleId, data);
  audit(req, 'update_role_dashboard_permissions', 'role', `${guildId}:${roleId}`, data);

  const permissions = rbacRepository.listRolePermissions(guildId);
  return res.json({ ok: true, permissions });
});

module.exports = router;
