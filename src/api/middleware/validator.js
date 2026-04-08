/**
 * Middleware de validation des requêtes
 * @module api/middleware/validator
 */

const { API_ERRORS } = require("../../shared/constants");

/**
 * Crée un middleware de validation
 * @param {Object} schema - Schéma de validation
 * @returns {Function} Middleware Express
 */
function validate(schema) {
  return (req, res, next) => {
    const errors = [];

    // Valider le body
    if (schema.body) {
      const bodyErrors = validateObject(req.body, schema.body, "body");
      errors.push(...bodyErrors);
    }

    // Valider les params
    if (schema.params) {
      const paramErrors = validateObject(req.params, schema.params, "params");
      errors.push(...paramErrors);
    }

    // Valider la query
    if (schema.query) {
      const queryErrors = validateObject(req.query, schema.query, "query");
      errors.push(...queryErrors);
    }

    if (errors.length > 0) {
      return res.status(API_ERRORS.VALIDATION_ERROR.status).json({
        success: false,
        error: {
          ...API_ERRORS.VALIDATION_ERROR,
          details: errors,
        },
      });
    }

    next();
  };
}

/**
 * Valide un objet selon un schéma
 * @param {Object} data - Données à valider
 * @param {Object} schema - Schéma de validation
 * @param {string} source - Source (body, params, query)
 * @returns {Array} Erreurs
 */
function validateObject(data, schema, source) {
  const errors = [];

  for (const [field, rules] of Object.entries(schema)) {
    const value = data?.[field];

    // Required
    if (
      rules.required &&
      (value === undefined || value === null || value === "")
    ) {
      errors.push({
        field: `${source}.${field}`,
        message: rules.message || `Le champ ${field} est requis`,
      });
      continue;
    }

    // Skip si pas de valeur et pas required
    if (value === undefined || value === null) continue;

    // Type validation
    if (rules.type) {
      const typeValid = validateType(value, rules.type);
      if (!typeValid) {
        errors.push({
          field: `${source}.${field}`,
          message: `Le champ ${field} doit être de type ${rules.type}`,
        });
        continue;
      }
    }

    // String validations
    if (rules.type === "string" && typeof value === "string") {
      if (rules.minLength && value.length < rules.minLength) {
        errors.push({
          field: `${source}.${field}`,
          message: `Le champ ${field} doit avoir au moins ${rules.minLength} caractères`,
        });
      }
      if (rules.maxLength && value.length > rules.maxLength) {
        errors.push({
          field: `${source}.${field}`,
          message: `Le champ ${field} ne peut pas dépasser ${rules.maxLength} caractères`,
        });
      }
      if (rules.pattern && !rules.pattern.test(value)) {
        errors.push({
          field: `${source}.${field}`,
          message:
            rules.patternMessage || `Le champ ${field} a un format invalide`,
        });
      }
      if (rules.enum && !rules.enum.includes(value)) {
        errors.push({
          field: `${source}.${field}`,
          message: `Le champ ${field} doit être parmi: ${rules.enum.join(
            ", "
          )}`,
        });
      }
    }

    // Number validations
    if (rules.type === "number" || rules.type === "integer") {
      const numValue = Number(value);
      if (rules.min !== undefined && numValue < rules.min) {
        errors.push({
          field: `${source}.${field}`,
          message: `Le champ ${field} doit être >= ${rules.min}`,
        });
      }
      if (rules.max !== undefined && numValue > rules.max) {
        errors.push({
          field: `${source}.${field}`,
          message: `Le champ ${field} doit être <= ${rules.max}`,
        });
      }
    }

    // Array validations
    if (rules.type === "array" && Array.isArray(value)) {
      if (rules.minItems && value.length < rules.minItems) {
        errors.push({
          field: `${source}.${field}`,
          message: `Le champ ${field} doit avoir au moins ${rules.minItems} éléments`,
        });
      }
      if (rules.maxItems && value.length > rules.maxItems) {
        errors.push({
          field: `${source}.${field}`,
          message: `Le champ ${field} ne peut pas dépasser ${rules.maxItems} éléments`,
        });
      }
      if (rules.items) {
        value.forEach((item, index) => {
          const itemErrors = validateObject(
            { item },
            { item: rules.items },
            `${source}.${field}[${index}]`
          );
          errors.push(...itemErrors);
        });
      }
    }

    // Custom validator
    if (rules.custom && typeof rules.custom === "function") {
      const customError = rules.custom(value, data);
      if (customError) {
        errors.push({
          field: `${source}.${field}`,
          message: customError,
        });
      }
    }
  }

  return errors;
}

/**
 * Vérifie le type d'une valeur
 * @param {any} value - Valeur à vérifier
 * @param {string} expectedType - Type attendu
 * @returns {boolean}
 */
function validateType(value, expectedType) {
  switch (expectedType) {
    case "string":
      return typeof value === "string";
    case "number":
      return typeof value === "number" && !isNaN(value);
    case "integer":
      return (
        Number.isInteger(value) ||
        (typeof value === "string" && /^\d+$/.test(value))
      );
    case "boolean":
      return (
        typeof value === "boolean" || value === "true" || value === "false"
      );
    case "array":
      return Array.isArray(value);
    case "object":
      return (
        typeof value === "object" && value !== null && !Array.isArray(value)
      );
    case "snowflake":
      // Discord ID: 17-20 caractères numériques
      return typeof value === "string" && /^\d{17,20}$/.test(value);
    case "url":
      try {
        new URL(value);
        return true;
      } catch {
        return false;
      }
    case "email":
      return (
        typeof value === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
      );
    default:
      return true;
  }
}

// Schémas de validation communs
const schemas = {
  guildId: {
    guildId: {
      required: true,
      type: "snowflake",
      message: "ID de serveur invalide",
    },
  },

  createGiveaway: {
    body: {
      channelId: { required: true, type: "snowflake" },
      prize: { required: true, type: "string", minLength: 1, maxLength: 256 },
      description: { type: "string", maxLength: 2048 },
      winnersCount: { required: true, type: "integer", min: 1, max: 20 },
      duration: { required: true, type: "integer", min: 60000 }, // Min 1 minute en ms
      requiredRoles: { type: "array", items: { type: "snowflake" } },
      imageUrl: { type: "url" },
    },
  },

  updateGiveaway: {
    body: {
      prize: { type: "string", minLength: 1, maxLength: 256 },
      description: { type: "string", maxLength: 2048 },
      winnersCount: { type: "integer", min: 1, max: 20 },
      endTime: { type: "integer" },
    },
  },

  sendMessage: {
    body: {
      channelId: { type: "snowflake" },
      targetUserId: { type: "snowflake" },
      content: { type: "string", maxLength: 2000 },
      embed: { type: "object" },
    },
  },

  updateSettings: {
    body: {
      welcome_enabled: { type: "boolean" },
      welcome_channel_id: { type: "snowflake" },
      welcome_message: { type: "string", maxLength: 2000 },
      log_channel_id: { type: "snowflake" },
      mod_log_channel_id: { type: "snowflake" },
      giveaway_channel_id: { type: "snowflake" },
      auto_unarchive_enabled: { type: "boolean" },
    },
  },

  updateCommandPermission: {
    body: {
      commandName: { required: true, type: "string" },
      is_enabled: { type: "boolean" },
      allowed_roles: { type: "array", items: { type: "snowflake" } },
      denied_roles: { type: "array", items: { type: "snowflake" } },
      cooldown_seconds: { type: "integer", min: 0, max: 3600 },
    },
  },
};

module.exports = {
  validate,
  validateObject,
  validateType,
  schemas,
};
