# Documentation technique complète du Dashboard UnixBot

## 1) Objectif de cet export

Ce dossier contient un export autonome de tous les éléments nécessaires au fonctionnement du Dashboard UnixBot.

But:
- exécuter le Dashboard sans dépendre du reste du dépôt original,
- comprendre son architecture complète,
- pouvoir le recréer entièrement depuis zéro.

L'export a été volontairement limité aux éléments utiles au runtime Dashboard (web, API, persistance, bridge bot, config, métadonnées de commandes).

---

## 2) Contenu exporté (périmètre exact)

### Arborescence principale

- src/web
  - Router web SSR, vues EJS, assets CSS/JS/favicons
- src/api
  - Application API, routes, middlewares, services Dashboard
- src/server.js
  - Point d'entrée serveur unifié (API + Web)
- src/shared
  - botBridge, utils, constants, logger
- src/database
  - init.js et schema.sql (accès/migrations SQLite)
- src/services
  - services métier persistants utilisés par les services API
- config/config.js
  - chargement variables d'environnement et configuration runtime
- commands/**/infos.json
  - source des métadonnées affichées dans la page des commandes
- package.json
  - dépendances minimales pour faire tourner l'export
- .env.example
  - variables nécessaires au démarrage

### Éléments volontairement non exportés

- bot Discord principal (src/bot)
- handlers des commandes Discord
- tests, scripts qualité, docs projet global
- fichiers non nécessaires au runtime Dashboard

Le Dashboard reste fonctionnel en mode remote via le bridge interne (BOT_INTERNAL_HOST/BOT_INTERNAL_PORT), même si le bot tourne dans un autre processus/projet.

---

## 3) Architecture logique

## 3.1 Vue d'ensemble

Le Dashboard est une application Node.js Express hybride:

- Front web SSR (EJS)
  - pages publiques + pages dashboard authentifiées
- API REST
  - endpoints consommés par le JS front pour opérations dynamiques
- SQLite
  - état applicatif, sessions, configs serveur, logs, giveaways, etc.
- Bridge bot
  - accès au bot Discord soit en direct, soit via HTTP interne

## 3.2 Modes de bridge

Le module src/shared/botBridge.js abstrait la communication bot.

Modes:
1. direct
- même processus que le bot
- appels mémoire directs au client Discord.js

2. remote
- process séparé
- appels HTTP à une API interne bot
- mode utilisé par défaut dans src/server.js lorsqu'il est lancé en standalone

Conséquence: le Dashboard ne dépend pas d'un import direct de src/bot; tout passe par le bridge.

---

## 4) Démarrage et cycle de vie

## 4.1 Séquence de démarrage (src/server.js)

1. Initialisation SQLite via src/database/init.js
2. Configuration middlewares globaux:
- helmet (CSP + headers),
- json/urlencoded,
- express-session + SQLiteSessionStore,
- SessionService (chiffrement tokens).
3. Exposition health probes:
- /health
- /ready
4. Injection du bridge dans app Express
5. Montage API sur /api via src/api/app.js
6. Montage Web sur / via src/web/app.js
7. Gestion 404 + error handler
8. listen sur UNIFIED_PORT (ou PORT/webPort fallback)

## 4.2 Arrêt

Arrêt propre:
- fermeture HTTP server,
- fermeture SQLite,
- gestion SIGTERM/SIGINT/unhandled.

---

## 5) Web SSR (src/web)

## 5.1 Router principal

Fichier: src/web/app.js

Le routeur gère:
- pages publiques: /, /features, /about, /docs, /contact
- pages légales: /legal/terms, /legal/privacy, /legal/cookies, /legal/mentions
- auth UX: /login, /login/callback, /login/guild, /auth-error
- catalogue commandes: /commands
- pages dashboard:
  - /dashboard
  - /dashboard/user
  - /dashboard/guild/:guildId
  - /dashboard/guild/:guildId/giveaways
  - /dashboard/guild/:guildId/messages
  - /dashboard/guild/:guildId/commands
  - /dashboard/guild/:guildId/autobump
  - /dashboard/guild/:guildId/settings
- mini bloc admin:
  - /admin, /admin/login, /admin/panel, /admin/logout

## 5.2 Rendu

- moteur EJS
- layouts:
  - layouts/public.ejs
  - layouts/dashboard.ejs
- partials:
  - header, footer, sidebar, cookie-banner

## 5.3 Assets front

Répertoires:
- src/web/public/css
- src/web/public/js
- src/web/public/favicons

Patterns:
- CSS commun + page-specific
- JS par page dashboard (giveaways.js, messages.js, commands.js, autobump.js, guild-settings.js)
- scripts utilitaires (public.js, unsaved-changes.js, etc.)

## 5.4 Contrôle d'accès web

- requireWebAuth pour forcer la session utilisateur
- middleware /dashboard vérifie bridge.isAvailable()
- checkGuildAccess(guildId, userId)
  - superuser OU owner serveur OU permission administrateur Discord

---

## 6) API REST (src/api)

## 6.1 Entrée API

Fichier: src/api/app.js

Composants:
- CORS avec origines autorisées (localhost + baseUrl)
- parsing JSON/form
- session dédiée API (cookie unixbot.api.sid)
- rate limiter global light
- routes versionnées doublées (/xxx et /v1/xxx)

Routes montées:
- /auth
- /guilds
- /guilds/:guildId/giveaways
- /guilds/:guildId/messages
- /guilds/:guildId/commands
- /autobump
- utilitaires: /health, /version, /me, /stats

## 6.2 Middlewares clés

1. auth.js
- requireAuth
- requireGuildAdmin (vérification permissions Discord via OAuth token)
- requireSuperuser
- helpers d'audit

2. sqliteSessionStore.js
- store express-session basé SQLite
- table express_sessions
- nettoyage automatique des sessions expirées

3. rateLimiter.js
- limiter mémoire (Map) avec fenêtre configurable
- variantes strict/standard/light

4. tokenManager.js
- extraction tokens déchiffrés depuis SessionService

5. validator.js
- validation payload JSON selon schémas route

## 6.3 Routes métier principales

1. auth.js
- OAuth2 Discord login/callback/logout
- anti-CSRF state
- popup callback via BroadcastChannel/localStorage fallback
- bot invite flow

2. guilds.js
- lecture serveurs, settings, stats, channels, roles, membres
- update settings avec champs autorisés

3. giveaways.js
- CRUD giveaways + pause/resume/end/reroll/participants

4. messages.js
- envoi message channel
- envoi DM
- annonce
- historique + suppression

5. commands.js
- listing commandes + overrides par guild
- patch configuration commande

6. autobump.js
- configuration auto-bump
- validation token
- start/stop/test
- historique

---

## 7) Services et logique métier

## 7.1 Session et sécurité tokens

SessionService:
- chiffrement AES-256-GCM des tokens OAuth
- stockage chiffré en table user_sessions
- refresh token automatique si expiration proche
- invalidation sessions

Principe de sécurité:
- session Express garde uniquement un profil utilisateur minimal
- tokens sensibles en base chiffrée

## 7.2 AuthService

- échange code OAuth -> tokens
- refresh access token
- fetch user/guilds Discord
- cache guilds administrables (TTL 5 min)
- gestion sessions logiques et rôles (superuser/owner)

## 7.3 Services métier Dashboard

- GuildService: guild + settings + stats agrégées
- GiveawayService: cycle de vie giveaways
- MessageService: envois/logs messages
- AutoBumpService + AutoBumpEngine: orchestration bumps automatiques

## 7.4 Dépendances vers src/services

Le dossier src/services contient les couches persistantes transverses (UserService, GuildService, etc.) appelées par les services API.

---

## 8) Modèle de données (SQLite)

Source schéma: src/database/schema.sql

Tables critiques Dashboard:
- users
- user_sessions
- express_sessions
- guilds
- guild_settings
- owners
- superusers
- giveaways (+ participants)
- messages_log
- commands (+ command_permissions)
- autobump_configs (+ history)
- global_config

Caractéristiques:
- initialisation automatique à la création DB
- pragmas performance: WAL, foreign_keys, cache_size, temp_store

---

## 9) Variables d'environnement indispensables

Minimum pour fonctionner:
- TOKEN
- CLIENT_ID
- CLIENT_SECRET
- SESSION_SECRET
- ENCRYPTION_KEY (32 bytes hex -> 64 chars)
- BASE_URL
- REDIRECT_URI

Pour mode remote bot:
- BOT_INTERNAL_HOST
- BOT_INTERNAL_PORT
- INTERNAL_API_SECRET (si activé côté bot)

Ports:
- UNIFIED_PORT ou PORT (serveur web/api)

---

## 10) Dépendances NPM nécessaires

Dépendances runtime minimales (déjà dans package.json exporté):
- express
- ejs
- express-ejs-layouts
- express-session
- helmet
- cors
- better-sqlite3
- dotenv
- discord.js
- discord.js-selfbot-v13

Pourquoi discord.js reste requis:
- GiveawayService utilise des builders/structures Discord.

---

## 11) Contrats HTTP critiques

## 11.1 Auth

- GET /api/auth/login
- GET /api/auth/callback
- GET /api/auth/logout
- GET /api/auth/bot-invite

## 11.2 Dashboard data

- GET /api/guilds
- GET/PUT /api/guilds/:guildId/settings
- GET /api/guilds/:guildId

## 11.3 Features dynamiques

- Giveaways: /api/guilds/:guildId/giveaways/*
- Messages: /api/guilds/:guildId/messages/*
- Commands: /api/guilds/:guildId/commands/*
- Autobump: /api/autobump/*

Tous les endpoints sensibles requièrent session valide + droits admin guild.

---

## 12) Recréation from scratch (procédure expert)

## Étape A - Socle

1. Créer une app Node Express.
2. Ajouter EJS + layouts.
3. Mettre en place server.js avec montage /api et /.
4. Ajouter helmet + sessions + SQLite store.

## Étape B - Persistance

1. Définir schema SQL avec tables ci-dessus.
2. Créer initDatabase() idempotent.
3. Ajouter SessionService (AES-GCM tokens).

## Étape C - Auth Discord OAuth2

1. route login -> state CSRF -> redirect Discord
2. callback -> échange code -> profile -> session sécurisée
3. logout -> invalidation session

## Étape D - Bridge bot

1. implémenter abstraction direct/remote
2. fournir méthodes guilds/channels/roles/member/status/send
3. brancher checks disponibilité bot dans middleware dashboard

## Étape E - API métier

1. guilds settings/stats
2. giveaways
3. messages
4. commands overrides
5. autobump

## Étape F - Front SSR

1. pages publiques + auth
2. pages dashboard par feature
3. assets CSS/JS par page
4. branchement appels API via fetch côté client

## Étape G - Hardening

1. CSP stricte
2. rate limiting
3. validation input
4. contrôle RBAC Discord (admin/manage guild)
5. audit logs

---

## 13) Limites connues et points d'attention

- Le mode remote exige une API interne bot compatible avec botBridge.
- Certaines routes supposent que le token OAuth est encore valable; SessionService tente un refresh.
- Les backups CSS (.bak) existent dans les assets web et ne sont pas nécessaires au runtime strict.
- L'auto-bump repose sur discord.js-selfbot-v13, impliquant des contraintes opérationnelles et de conformité Discord à évaluer.

---

## 14) Démarrage rapide de l'export

1. Copier .env.example vers .env et renseigner les valeurs.
2. Installer dépendances:
   npm install
3. Lancer:
   npm start
4. Ouvrir:
   http://localhost:3000

Health checks:
- /health
- /ready

---

## 15) Validation fonctionnelle recommandée

Checklist:
- page publique home rendue
- login OAuth complet
- dashboard user accessible
- ouverture d'une guild dashboard
- lecture/modification settings
- appels API giveways/messages/commands/autobump
- déconnexion + invalidation session
- fallback bot offline sur pages dashboard

---

## 16) Résumé reconstruction

Avec ce dossier, un expert peut:
- relancer le Dashboard isolément,
- lire tous les composants runtime,
- reproduire l'architecture, les flux, la sécurité, les contrats API et le schéma DB,
- reconstruire un Dashboard équivalent sans accès au dépôt parent.
