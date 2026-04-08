/**
 * Middleware de rate limiting
 * @module api/middleware/rateLimiter
 */

const { LIMITS, API_ERRORS } = require("../../shared/constants");

// Store en mémoire pour le rate limiting
// En production, utiliser Redis pour la scalabilité
const requestStore = new Map();

/**
 * Nettoie les entrées expirées périodiquement
 */
setInterval(() => {
  const now = Date.now();
  for (const [key, data] of requestStore.entries()) {
    if (now - data.windowStart > LIMITS.API_RATE_LIMIT_WINDOW_MS) {
      requestStore.delete(key);
    }
  }
}, 60000); // Nettoyer toutes les minutes

/**
 * Middleware de rate limiting basé sur IP ou userId
 * @param {Object} options - Options de configuration
 * @returns {Function} Middleware Express
 */
function rateLimiter(options = {}) {
  const {
    windowMs = LIMITS.API_RATE_LIMIT_WINDOW_MS,
    maxRequests = LIMITS.API_RATE_LIMIT_MAX_REQUESTS,
    keyGenerator = defaultKeyGenerator,
    skipSuccessfulRequests = false,
    skipFailedRequests = false,
    onLimitReached = null,
  } = options;

  return (req, res, next) => {
    const key = keyGenerator(req);
    const now = Date.now();

    let requestData = requestStore.get(key);

    // Créer une nouvelle entrée si nécessaire
    if (!requestData || now - requestData.windowStart > windowMs) {
      requestData = {
        count: 0,
        windowStart: now,
      };
      requestStore.set(key, requestData);
    }

    // Incrémenter le compteur
    requestData.count++;

    // Ajouter les headers de rate limit
    res.setHeader("X-RateLimit-Limit", maxRequests);
    res.setHeader(
      "X-RateLimit-Remaining",
      Math.max(0, maxRequests - requestData.count)
    );
    res.setHeader(
      "X-RateLimit-Reset",
      Math.ceil((requestData.windowStart + windowMs) / 1000)
    );

    // Vérifier si la limite est atteinte
    if (requestData.count > maxRequests) {
      const retryAfter = Math.ceil(
        (requestData.windowStart + windowMs - now) / 1000
      );
      res.setHeader("Retry-After", retryAfter);

      if (onLimitReached) {
        onLimitReached(req, res);
      }

      return res.status(API_ERRORS.RATE_LIMITED.status).json({
        success: false,
        error: {
          ...API_ERRORS.RATE_LIMITED,
          retryAfter,
        },
      });
    }

    // Optionnel: ne pas compter certaines requêtes
    if (skipSuccessfulRequests || skipFailedRequests) {
      const originalSend = res.send;
      res.send = function (body) {
        try {
          const status = res.statusCode;
          if (
            (skipSuccessfulRequests && status < 400) ||
            (skipFailedRequests && status >= 400)
          ) {
            requestData.count--;
          }
        } catch {
          // Ignore
        }
        return originalSend.call(this, body);
      };
    }

    next();
  };
}

/**
 * Générateur de clé par défaut (userId ou IP)
 */
function defaultKeyGenerator(req) {
  // Préférer l'userId si authentifié
  if (req.session?.user?.id) {
    return `user:${req.session.user.id}`;
  }

  // Sinon utiliser l'IP
  const ip =
    req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
    req.headers["cf-connecting-ip"] ||
    req.headers["x-real-ip"] ||
    req.ip ||
    req.connection.remoteAddress;

  return `ip:${ip}`;
}

/**
 * Rate limiter strict pour les routes sensibles (auth, etc.)
 */
const strictRateLimiter = rateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  maxRequests: 10, // 10 requêtes max
  onLimitReached: (req) => {
    console.warn(`Rate limit strict atteint pour: ${defaultKeyGenerator(req)}`);
  },
});

/**
 * Rate limiter standard pour l'API
 */
const standardRateLimiter = rateLimiter({
  windowMs: LIMITS.API_RATE_LIMIT_WINDOW_MS,
  maxRequests: LIMITS.API_RATE_LIMIT_MAX_REQUESTS,
});

/**
 * Rate limiter léger pour les routes de lecture
 */
const lightRateLimiter = rateLimiter({
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 200, // 200 requêtes/minute
});

module.exports = {
  rateLimiter,
  strictRateLimiter,
  standardRateLimiter,
  lightRateLimiter,
  defaultKeyGenerator,
};
