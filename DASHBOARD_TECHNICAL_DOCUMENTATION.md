# Documentation technique du Dashboard UnixBot (Refonte 2026)

## 1) Objectif de la refonte

Le Dashboard a été reconstruit depuis une base neuve pour fournir une architecture lisible, modulaire et maintenable.

Principes appliqués :
- séparation claire backend / frontend / persistance,
- sécurité par défaut (headers, sessions HTTPOnly, validation, rate limit),
- structure extensible pour les futures fonctionnalités.

---

## 2) Architecture actuelle

### Backend (Express)

- `src/server.js` : bootstrap applicatif et arrêt propre
- `src/app/createApp.js` : composition centrale de l’application
- `src/routes/api` : routes REST
  - `auth.js` : login/logout/session
  - `guilds.js` : lecture et mise à jour des paramètres serveur
- `src/middleware` : auth, validation, rate limiting
- `src/session/sqliteStore.js` : store de session `express-session` sur SQLite
- `src/lib` : utilitaires transverses (logger, sécurité)

### Frontend (SSR EJS)

- `src/routes/web.js` : routes web publiques et dashboard
- `src/web/views` : templates EJS (home/login/dashboard/errors)
- `src/web/public/css/app.css` : design system léger et cohérent
- `src/web/public/js` : scripts login et dashboard

### Persistance (SQLite)

- `src/database/schema.sql` : schéma minimal et propre
- `src/database/init.js` : initialisation idempotente + seed de démarrage

Tables principales :
- `sessions` : sessions web persistées
- `guilds` : serveurs gérés
- `guild_settings` : paramètres de serveur
- `audit_logs` : traçabilité des actions critiques

---

## 3) Sécurité implémentée

- `helmet` avec CSP stricte (`default-src 'self'`),
- cookies de session `httpOnly`, `sameSite=lax`, `secure` en production,
- limitation de débit globale API + limitation renforcée sur login,
- comparaison de secrets en timing-safe,
- validation stricte des entrées (`prefix`, `language`, IDs Discord),
- journalisation d’audit sur les modifications de paramètres.

---

## 4) Contrats HTTP principaux

### Santé
- `GET /health`

### Auth
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/auth/me`

### Dashboard Guilds
- `GET /api/guilds`
- `GET /api/guilds/:guildId/settings`
- `PUT /api/guilds/:guildId/settings`

---

## 5) Démarrage

1. Copier `.env.example` vers `.env`
2. Configurer les secrets (`SESSION_SECRET`, `DASHBOARD_ADMIN_PASSWORD`)
3. Installer les dépendances :
   - `npm install`
4. Lancer :
   - `npm start`

URL locale : `http://localhost:3000`

---

## 6) Évolutions recommandées

- brancher une authentification OAuth Discord,
- enrichir la couche RBAC multi-rôles,
- ajouter tests automatisés (unitaires + intégration API),
- versionner les migrations SQLite.
