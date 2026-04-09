# Documentation technique du Dashboard UnixBot (Extension 2026)

## 1) Objectif

Le Dashboard est désormais structuré pour du long terme avec des features concrètes :
- authentification Discord OAuth2,
- gestion des serveurs,
- configuration bot (settings + modules),
- gestion rôles/utilisateurs et permissions dashboard.

---

## 2) Architecture

### Backend

- `src/server.js` : bootstrap + shutdown propre
- `src/app/createApp.js` : composition middleware, sécurité, routes
- `src/routes/api` : API métier
  - `auth.js` : login local, OAuth Discord, session user
  - `guilds.js` : overview, settings, modules, sync Discord, rôles, users, permissions
- `src/middleware` : auth, CSRF, validateurs, rate limit
- `src/repositories` : accès DB par domaine (guild, user, module, rbac)
- `src/services` : intégrations externes (Discord OAuth + sync bot)

### Frontend SSR

- `src/routes/web.js` : routing page publique/login/dashboard
- `src/web/views` : UI pages et partials
- `src/web/public/js/dashboard.js` : orchestration frontend (tabs, forms, appels API)
- `src/web/public/css/app.css` : design system dashboard

### Persistance SQLite

`src/database/schema.sql` inclut maintenant :
- `users`
- `guilds`
- `user_guild_access`
- `guild_settings`
- `bot_modules`
- `guild_modules`
- `guild_roles`
- `guild_users`
- `guild_user_roles`
- `role_dashboard_permissions`
- `audit_logs`
- `sessions`

---

## 3) Sécurité

- Helmet + CSP
- Session HTTPOnly / SameSite / Secure(prod)
- CSRF token sur routes mutantes API
- Rate limiting global + route login
- Contrôle d’accès par guild (`requireGuildAdmin`)
- Validation stricte payloads settings/modules/permissions
- Audit des mutations sensibles

---

## 4) Intégration Discord

### OAuth2 utilisateur

- `GET /api/auth/discord/login` → redirection OAuth Discord
- `GET /api/auth/discord/callback` → échange code, récupération user + guilds
- Synchronisation `users`, `guilds`, `user_guild_access`
- Autorisation dashboard basée sur permissions serveur (Administrator / Manage Guild)

### Sync rôles/utilisateurs (optionnel)

- `POST /api/guilds/:guildId/sync`
- Attend un payload `roles[]` et `users[]` (ex: depuis un worker bot interne)
- Synchronise les tables locales rôles/membres/liaisons de rôles

---

## 5) API principales

### Auth
- `GET /api/auth/me`
- `POST /api/auth/login` (fallback local)
- `GET /api/auth/discord/login`
- `GET /api/auth/discord/callback`
- `POST /api/auth/logout`

### Guild management
- `GET /api/guilds`
- `GET /api/guilds/:guildId/home`
- `GET /api/guilds/:guildId/overview`
- `GET /api/guilds/:guildId/activity`
- `GET/PUT /api/guilds/:guildId/settings`
- `GET /api/guilds/:guildId/modules`
- `PUT /api/guilds/:guildId/modules/:moduleKey`
- `POST /api/guilds/:guildId/sync`
- `GET /api/guilds/:guildId/roles`
- `GET /api/guilds/:guildId/users`
- `GET /api/guilds/:guildId/permissions`
- `PUT /api/guilds/:guildId/permissions/roles/:roleId`

---

## 6) Tests et validation

Scripts npm:
- `npm start`
- `npm test`

Tests actuels:
- validations payload middleware
- logique permissions Discord (bits admin/manage guild)
- repository homepage (`getGuildHomepageData`) + activité récente filtrée

---

## 7) Homepage Dashboard

La page principale `/dashboard` est maintenant orientée usage réel:
- vue d’ensemble utilisateur (profil/session/provider),
- sélecteur serveur persistant (nom + icône + permissions déjà filtrées côté API),
- panneau de statut bot (modules, sync, compteurs),
- résumé des configurations critiques,
- historique d’activité récente (audit logs),
- accès rapides vers settings/modules/rôles/utilisateurs.

Les états `loading`, `empty`, `error` sont gérés côté frontend pour chaque vue.

---

## 8) Démarrage

1. Copier `.env.example` vers `.env`
2. Renseigner au minimum les secrets session et admin local
3. Optionnel: configurer OAuth Discord et bot token
4. `npm install`
5. `npm start`
6. Ouvrir `http://localhost:3000`
