const test = require('node:test');
const assert = require('node:assert/strict');

const {
  validateGuildSettings,
  validateModuleState,
  validateRolePermissionPayload,
} = require('../src/middleware/validators');

test('validateGuildSettings accepts valid payload', () => {
  const payload = {
    prefix: '!',
    language: 'fr',
    welcome_enabled: true,
    welcome_message: 'Bienvenue',
    log_channel_id: '123456789012345678',
  };

  const result = validateGuildSettings(payload);
  assert.equal(result.errors.length, 0);
  assert.equal(result.data.prefix, '!');
  assert.equal(result.data.language, 'fr');
  assert.equal(result.data.welcome_enabled, 1);
});

test('validateGuildSettings rejects bad snowflake', () => {
  const result = validateGuildSettings({ log_channel_id: 'abc' });
  assert.equal(result.errors.length, 1);
});

test('validateModuleState requires boolean enabled', () => {
  const bad = validateModuleState({ enabled: 'yes' });
  assert.ok(bad.errors.length > 0);

  const good = validateModuleState({ enabled: false });
  assert.equal(good.errors.length, 0);
  assert.equal(good.data.enabled, false);
});

test('validateRolePermissionPayload requires booleans', () => {
  const bad = validateRolePermissionPayload({ canManageSettings: true });
  assert.ok(bad.errors.length >= 1);

  const good = validateRolePermissionPayload({
    canManageSettings: true,
    canManageModules: false,
    canManageUsers: true,
  });

  assert.equal(good.errors.length, 0);
  assert.equal(good.data.canManageUsers, true);
});
