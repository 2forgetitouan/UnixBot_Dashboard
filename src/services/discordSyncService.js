class DiscordSyncService {
  static assertGuildId(guildId) {
    if (!/^\d{17,20}$/.test(String(guildId || ''))) {
      throw new Error('Invalid guild id');
    }
  }

  normalizeRoles(payload) {
    const roles = Array.isArray(payload) ? payload : [];
    return roles
      .map((role) => ({
        id: String(role?.id || ''),
        name: String(role?.name || 'Role'),
        position: Number(role?.position || 0),
        permissions: String(role?.permissions || '0'),
        managed: Boolean(role?.managed),
      }))
      .filter((role) => /^\d{1,20}$/.test(role.id));
  }

  normalizeMembers(payload) {
    const members = Array.isArray(payload) ? payload : [];
    return members
      .map((member) => ({
        id: String(member?.id || member?.user?.id || ''),
        username: String(member?.username || member?.user?.username || 'unknown'),
        displayName: member?.displayName || member?.nick || member?.user?.global_name || null,
        roles: (Array.isArray(member?.roles) ? member.roles : []).map((roleId) => String(roleId)),
        isAdmin: Boolean(member?.isAdmin),
      }))
      .filter((member) => /^\d{1,20}$/.test(member.id));
  }
}

module.exports = {
  DiscordSyncService,
};
