const test = require('node:test');
const assert = require('node:assert/strict');
const { DiscordOAuthService } = require('../src/services/discordOAuthService');

test('hasGuildAdminPermissions detects administrator bit', () => {
  const service = new DiscordOAuthService();
  assert.equal(service.hasGuildAdminPermissions('8'), true);
});

test('hasGuildAdminPermissions detects manage guild bit', () => {
  const service = new DiscordOAuthService();
  assert.equal(service.hasGuildAdminPermissions('32'), true);
});

test('hasGuildAdminPermissions rejects unrelated permissions', () => {
  const service = new DiscordOAuthService();
  assert.equal(service.hasGuildAdminPermissions('1024'), false);
});
