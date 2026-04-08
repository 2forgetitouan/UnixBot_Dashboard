/**
 * Middleware de gestion des tokens déchiffrés
 * Récupère les tokens depuis la BD chiffrée quand nécessaire
 * @module api/middleware/tokenManager
 */

/**
 * Récupérer un token déchiffré pour l'utilisateur actuel
 * Utile pour les requêtes API Discord depuis l'API
 */
function withDecryptedToken(req, res, next) {
  try {
    if (!req.session?.user?.id) {
      return res.status(401).json({
        success: false,
        error: "Non authentifié",
      });
    }

    const sessionService = req.app.get("sessionService");
    const tokens = sessionService.getDecryptedTokens(req.session.user.id);

    if (!tokens) {
      return res.status(401).json({
        success: false,
        error: "Tokens expirés ou invalides",
      });
    }

    // Vérifier si refresh nécessaire
    if (sessionService.shouldRefreshToken(req.session.user.id)) {
      console.log("⚠️  Token expires soon, should refresh");
      req.sessionTokenExpiringSoon = true;
    }

    // Attacher les tokens au request pour utilisation dans les routes
    req.decryptedTokens = tokens;
    req.accessToken = tokens.accessToken;
    req.refreshToken = tokens.refreshToken;

    next();
  } catch (error) {
    console.error("Erreur déchiffrement token:", error);
    res.status(500).json({
      success: false,
      error: "Erreur lors du déchiffrement du token",
    });
  }
}

/**
 * Récupérer les tokens sans forcer l'authentification
 * Utile pour les routes qui peuvent fonctionner sans auth
 */
function withOptionalDecryptedToken(req, res, next) {
  try {
    if (req.session?.user?.id) {
      const sessionService = req.app.get("sessionService");
      const tokens = sessionService.getDecryptedTokens(req.session.user.id);

      if (tokens) {
        req.decryptedTokens = tokens;
        req.accessToken = tokens.accessToken;
        req.refreshToken = tokens.refreshToken;
      }
    }

    next();
  } catch (error) {
    console.error("Erreur déchiffrement token optionnel:", error);
    next(); // Continuer même en erreur
  }
}

module.exports = {
  withDecryptedToken,
  withOptionalDecryptedToken,
};
