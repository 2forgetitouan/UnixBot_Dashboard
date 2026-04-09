function validateGuildSettings(body) {
  const errors = [];
  const data = {};

  if (body.prefix !== undefined) {
    const prefix = String(body.prefix).trim();
    if (!prefix || prefix.length > 5) {
      errors.push('prefix must be between 1 and 5 characters');
    } else {
      data.prefix = prefix;
    }
  }

  if (body.language !== undefined) {
    const language = String(body.language).trim().toLowerCase();
    if (!['fr', 'en'].includes(language)) {
      errors.push('language must be fr or en');
    } else {
      data.language = language;
    }
  }

  if (body.welcome_enabled !== undefined) {
    data.welcome_enabled = body.welcome_enabled ? 1 : 0;
  }

  if (body.welcome_message !== undefined) {
    const message = String(body.welcome_message);
    if (!message || message.length > 300) {
      errors.push('welcome_message must be between 1 and 300 characters');
    } else {
      data.welcome_message = message;
    }
  }

  if (body.log_channel_id !== undefined) {
    const value = String(body.log_channel_id).trim();
    if (value && !/^\d{17,20}$/.test(value)) {
      errors.push('log_channel_id must be a Discord snowflake');
    } else {
      data.log_channel_id = value || null;
    }
  }

  return { errors, data };
}

function validateModuleState(body) {
  if (typeof body?.enabled !== 'boolean') {
    return { errors: ['enabled must be a boolean'], data: null };
  }
  return {
    errors: [],
    data: {
      enabled: body.enabled,
    },
  };
}

function validateRolePermissionPayload(body) {
  const flags = ['canManageSettings', 'canManageModules', 'canManageUsers'];
  const data = {};
  const errors = [];

  flags.forEach((flag) => {
    if (typeof body?.[flag] !== 'boolean') {
      errors.push(`${flag} must be a boolean`);
    } else {
      data[flag] = body[flag];
    }
  });

  return { errors, data };
}

module.exports = {
  validateGuildSettings,
  validateModuleState,
  validateRolePermissionPayload,
};
