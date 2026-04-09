const appView = document.getElementById('app-view');
const contextLine = document.getElementById('context-line');
const alertBox = document.getElementById('app-alert');
const selectorContainer = document.getElementById('dashboard-server-selector');
const logoutBtn = document.getElementById('logout-btn');
const syncBtn = document.getElementById('sync-btn');

const csrfToken = window.__CSRF_TOKEN || '';
const state = {
  me: null,
  guilds: [],
  selectedGuildId: null,
  currentView: 'home',
};

function esc(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function notify(message, type = 'info') {
  alertBox.innerHTML = `<p class="alert alert-${esc(type)}">${esc(message)}</p>`;
  setTimeout(() => {
    alertBox.innerHTML = '';
  }, 4000);
}

function fmtDate(epochSeconds) {
  if (!epochSeconds) return '—';
  return new Date(Number(epochSeconds) * 1000).toLocaleString('fr-FR');
}

function guildIconUrl(guild) {
  if (!guild?.icon || !guild?.id) return '';
  return `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png?size=128`;
}

function selectedGuild() {
  return state.guilds.find((guild) => guild.id === state.selectedGuildId) || null;
}

function setLoading(message) {
  appView.innerHTML = `<p class="muted">${esc(message)}</p>`;
}

async function request(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      ...(options.headers || {}),
      'x-csrf-token': csrfToken,
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
    },
  });

  const data = await response.json();
  if (!response.ok || !data.ok) {
    throw new Error(data.error || `Erreur API (${response.status}) sur ${url}`);
  }
  return data;
}

function updateContextLine() {
  const guild = selectedGuild();
  if (!state.me?.user) {
    contextLine.textContent = 'Chargement du contexte utilisateur...';
    return;
  }

  const provider = state.me.user.provider || 'unknown';
  const guildLabel = guild ? guild.name : 'Aucun serveur sélectionné';
  contextLine.textContent = `Connecté en ${state.me.user.username} (${provider}) • Serveur: ${guildLabel}`;
}

function renderServerSelector() {
  if (!selectorContainer) return;

  if (!state.guilds.length) {
    selectorContainer.innerHTML = `
      <section class="card selector-card">
        <p class="muted">Aucun serveur autorisé disponible pour ce compte.</p>
      </section>
    `;
    return;
  }

  selectorContainer.innerHTML = `
    <section class="card selector-card">
      <div class="selector-head">
        <h2>Serveur actif</h2>
        <span class="muted">${state.guilds.length} serveur(s) accessible(s)</span>
      </div>
      <div class="selector-row">
        <select id="guild-select-input" class="guild-select-input" aria-label="Sélection du serveur Discord">
          ${state.guilds.map((guild) => `<option value="${esc(guild.id)}" ${guild.id === state.selectedGuildId ? 'selected' : ''}>${esc(guild.name)}</option>`).join('')}
        </select>
        <div class="selector-preview">
          ${guildIconUrl(selectedGuild()) ? `<img class="guild-icon" src="${esc(guildIconUrl(selectedGuild()))}" alt="Icône serveur" />` : '<div class="guild-icon guild-icon-placeholder">#</div>'}
          <div>
            <p class="selector-title">${esc(selectedGuild()?.name || '')}</p>
            <p class="muted">${esc(selectedGuild()?.id || '')}</p>
          </div>
        </div>
      </div>
    </section>
  `;

  document.getElementById('guild-select-input')?.addEventListener('change', async (event) => {
    state.selectedGuildId = String(event.target.value);
    updateContextLine();
    renderServerSelector();
    await loadView(state.currentView);
  });
}

function renderQuickLinks() {
  return `
    <div class="quick-links">
      <button class="btn btn-secondary" data-quick-view="settings">Paramètres bot</button>
      <button class="btn btn-secondary" data-quick-view="modules">Modules</button>
      <button class="btn btn-secondary" data-quick-view="roles">Rôles & permissions</button>
      <button class="btn btn-secondary" data-quick-view="users">Utilisateurs</button>
    </div>
  `;
}

function bindQuickLinks() {
  document.querySelectorAll('[data-quick-view]').forEach((button) => {
    button.addEventListener('click', async () => {
      await loadView(button.dataset.quickView);
    });
  });
}

function renderGuildCards() {
  if (!state.guilds.length) {
    appView.innerHTML = '<p class="muted">Aucun serveur disponible.</p>';
    return;
  }

  appView.innerHTML = `
    <h2>Serveurs administrables</h2>
    <div class="guild-grid">
      ${state.guilds.map((guild) => `
        <article class="card guild-card ${state.selectedGuildId === guild.id ? 'selected' : ''}">
          <div class="guild-card-head">
            ${guildIconUrl(guild) ? `<img class="guild-icon" src="${esc(guildIconUrl(guild))}" alt="Icône ${esc(guild.name)}" />` : '<div class="guild-icon guild-icon-placeholder">#</div>'}
            <div>
              <h3>${esc(guild.name)}</h3>
              <p class="muted">${esc(guild.id)}</p>
            </div>
          </div>
          <button class="btn btn-secondary" data-select-guild="${esc(guild.id)}">Sélectionner</button>
        </article>
      `).join('')}
    </div>
  `;

  document.querySelectorAll('[data-select-guild]').forEach((button) => {
    button.addEventListener('click', async () => {
      state.selectedGuildId = button.dataset.selectGuild;
      updateContextLine();
      renderServerSelector();
      await loadView('home');
    });
  });
}

async function loadGuilds() {
  const data = await request('/api/guilds');
  state.guilds = data.guilds || [];

  if (!state.selectedGuildId && state.guilds.length > 0) {
    state.selectedGuildId = state.guilds[0].id;
  }

  if (state.selectedGuildId && !state.guilds.some((guild) => guild.id === state.selectedGuildId)) {
    state.selectedGuildId = state.guilds.length ? state.guilds[0].id : null;
  }

  updateContextLine();
  renderServerSelector();
}

function requireGuildSelection() {
  if (!state.selectedGuildId) {
    appView.innerHTML = '<p class="muted">Sélectionnez un serveur autorisé pour afficher son dashboard.</p>';
    return false;
  }
  return true;
}

function botStatusLabel(status) {
  if (status === 'online') return 'En ligne';
  if (status === 'degraded') return 'Partiel';
  return 'Inconnu';
}

async function loadHome() {
  if (!requireGuildSelection()) return;
  setLoading('Chargement de la page principale...');

  const data = await request(`/api/guilds/${state.selectedGuildId}/home`);

  const enabledModules = data.modules.filter((module) => module.enabled).length;
  const disabledModules = Math.max(0, data.modules.length - enabledModules);
  const topModules = data.modules.slice(0, 6);

  appView.innerHTML = `
    <section class="home-grid">
      <article class="card home-profile-card">
        <h2>Vue d’ensemble</h2>
        <div class="profile-row">
          ${state.me.user.avatarUrl ? `<img class="avatar" src="${esc(state.me.user.avatarUrl)}" alt="Avatar utilisateur" />` : '<div class="avatar avatar-placeholder">U</div>'}
          <div>
            <p><strong>${esc(state.me.user.username)}</strong></p>
            <p class="muted">Provider: ${esc(state.me.user.provider || 'local')}</p>
            <p class="muted">Serveur sélectionné: ${esc(data.guild.name)}</p>
          </div>
        </div>
        ${renderQuickLinks()}
      </article>

      <article class="card">
        <h2>État du bot</h2>
        <p class="status-pill status-${esc(data.bot.status || 'unknown')}">${esc(botStatusLabel(data.bot.status))}</p>
        <p class="muted">Dernière synchronisation: ${esc(fmtDate(data.bot.lastSyncedAt))}</p>
        <div class="metrics-grid compact">
          <div><p class="metric-label">Modules actifs</p><p class="metric-value">${enabledModules}/${data.metrics.modulesTotal}</p></div>
          <div><p class="metric-label">Utilisateurs sync</p><p class="metric-value">${data.bot.syncedUsers}</p></div>
          <div><p class="metric-label">Rôles sync</p><p class="metric-value">${data.bot.syncedRoles}</p></div>
        </div>
      </article>

      <article class="card">
        <h2>Configuration clé</h2>
        <ul class="summary-list">
          <li><span>Préfixe</span><strong>${esc(data.settings?.prefix || '/')}</strong></li>
          <li><span>Langue</span><strong>${esc((data.settings?.language || 'fr').toUpperCase())}</strong></li>
          <li><span>Welcome</span><strong>${data.settings?.welcome_enabled ? 'Activé' : 'Désactivé'}</strong></li>
          <li><span>Channel logs</span><strong>${esc(data.settings?.log_channel_id || 'Non défini')}</strong></li>
        </ul>
      </article>

      <article class="card home-modules">
        <h2>Modules</h2>
        <p class="muted">${enabledModules} actif(s) • ${disabledModules} inactif(s)</p>
        <div class="module-chip-row">
          ${topModules.map((module) => `<span class="module-chip ${module.enabled ? 'module-chip-on' : 'module-chip-off'}">${esc(module.name)}</span>`).join('')}
        </div>
      </article>

      <article class="card home-activity">
        <h2>Activité récente</h2>
        ${data.activity.length ? `
          <ul class="activity-list">
            ${data.activity.map((entry) => `
              <li>
                <p><strong>${esc(entry.actor)}</strong> · ${esc(entry.action)}</p>
                <p class="muted">${esc(entry.targetType)} · ${esc(entry.targetId)} · ${esc(fmtDate(entry.createdAt))}</p>
              </li>
            `).join('')}
          </ul>
        ` : '<p class="muted">Aucune activité récente pour ce serveur.</p>'}
      </article>
    </section>
  `;

  bindQuickLinks();
}

async function loadOverview() {
  if (!requireGuildSelection()) return;
  setLoading('Chargement de la vue serveur...');

  const data = await request(`/api/guilds/${state.selectedGuildId}/overview`);
  appView.innerHTML = `
    <h2>Vue serveur</h2>
    <div class="metrics-grid">
      <article class="card"><h3>Modules actifs</h3><p>${data.metrics.modulesEnabled} / ${data.metrics.modulesTotal}</p></article>
      <article class="card"><h3>Rôles</h3><p>${data.metrics.rolesTotal}</p></article>
      <article class="card"><h3>Utilisateurs</h3><p>${data.metrics.usersTotal}</p></article>
    </div>
    <div class="card">
      <h3>${esc(data.guild.name)}</h3>
      <p class="muted">ID: ${esc(data.guild.id)}</p>
      <p>Préfixe: <code>${esc(data.settings?.prefix || '/')}</code> • Langue: <code>${esc(data.settings?.language || 'fr')}</code></p>
    </div>
  `;
}

async function loadModules() {
  if (!requireGuildSelection()) return;
  setLoading('Chargement des modules...');

  const data = await request(`/api/guilds/${state.selectedGuildId}/modules`);
  appView.innerHTML = `
    <h2>Modules du bot</h2>
    <div class="module-grid">
      ${data.modules.map((module) => `
        <article class="card module-card">
          <h3>${esc(module.name)}</h3>
          <p class="muted">${esc(module.description)}</p>
          <label class="switch-row">
            <input type="checkbox" data-module-toggle="${esc(module.key)}" ${module.enabled ? 'checked' : ''} />
            <span>${module.enabled ? 'Actif' : 'Inactif'}</span>
          </label>
        </article>
      `).join('')}
    </div>
  `;

  document.querySelectorAll('[data-module-toggle]').forEach((checkbox) => {
    checkbox.addEventListener('change', async () => {
      const moduleKey = checkbox.dataset.moduleToggle;
      try {
        await request(`/api/guilds/${state.selectedGuildId}/modules/${moduleKey}`, {
          method: 'PUT',
          body: JSON.stringify({ enabled: checkbox.checked }),
        });
        notify(`Module ${moduleKey} mis à jour`, 'success');
      } catch (error) {
        checkbox.checked = !checkbox.checked;
        notify(error.message, 'error');
      }
    });
  });
}

async function loadUsers() {
  if (!requireGuildSelection()) return;
  setLoading('Chargement des utilisateurs...');

  const data = await request(`/api/guilds/${state.selectedGuildId}/users`);
  appView.innerHTML = `
    <h2>Utilisateurs</h2>
    <table class="table">
      <thead><tr><th>ID</th><th>Nom</th><th>Display</th><th>Admin</th><th>Rôles</th></tr></thead>
      <tbody>
      ${data.users.map((user) => `
        <tr>
          <td>${esc(user.id)}</td>
          <td>${esc(user.username)}</td>
          <td>${esc(user.displayName || '-')}</td>
          <td>${user.isAdmin ? 'Oui' : 'Non'}</td>
          <td>${esc(user.roles.join(', ') || '-')}</td>
        </tr>
      `).join('')}
      </tbody>
    </table>
  `;
}

function roleCheckbox(roleId, flag) {
  return document.querySelector(`[data-role="${roleId}"][data-flag="${flag}"]`);
}

async function loadRoles() {
  if (!requireGuildSelection()) return;
  setLoading('Chargement des rôles et permissions...');

  const [rolesData, permsData] = await Promise.all([
    request(`/api/guilds/${state.selectedGuildId}/roles`),
    request(`/api/guilds/${state.selectedGuildId}/permissions`),
  ]);

  const permsByRole = new Map(permsData.permissions.map((entry) => [entry.roleId, entry]));

  appView.innerHTML = `
    <h2>Rôles & permissions dashboard</h2>
    <table class="table">
      <thead>
        <tr>
          <th>Rôle</th>
          <th>Settings</th>
          <th>Modules</th>
          <th>Users</th>
          <th>Action</th>
        </tr>
      </thead>
      <tbody>
      ${rolesData.roles.map((role) => {
        const p = permsByRole.get(role.id) || {};
        return `
          <tr>
            <td>${esc(role.name)}</td>
            <td><input type="checkbox" data-role="${esc(role.id)}" data-flag="canManageSettings" ${p.canManageSettings ? 'checked' : ''} /></td>
            <td><input type="checkbox" data-role="${esc(role.id)}" data-flag="canManageModules" ${p.canManageModules ? 'checked' : ''} /></td>
            <td><input type="checkbox" data-role="${esc(role.id)}" data-flag="canManageUsers" ${p.canManageUsers ? 'checked' : ''} /></td>
            <td><button class="btn btn-secondary" data-save-role="${esc(role.id)}">Enregistrer</button></td>
          </tr>
        `;
      }).join('')}
      </tbody>
    </table>
  `;

  document.querySelectorAll('[data-save-role]').forEach((button) => {
    button.addEventListener('click', async () => {
      const roleId = button.dataset.saveRole;
      const payload = {
        canManageSettings: Boolean(roleCheckbox(roleId, 'canManageSettings')?.checked),
        canManageModules: Boolean(roleCheckbox(roleId, 'canManageModules')?.checked),
        canManageUsers: Boolean(roleCheckbox(roleId, 'canManageUsers')?.checked),
      };

      try {
        await request(`/api/guilds/${state.selectedGuildId}/permissions/roles/${roleId}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
        notify(`Permissions du rôle ${roleId} enregistrées`, 'success');
      } catch (error) {
        notify(error.message, 'error');
      }
    });
  });
}

async function loadSettings() {
  if (!requireGuildSelection()) return;
  setLoading('Chargement des paramètres...');

  const data = await request(`/api/guilds/${state.selectedGuildId}/settings`);

  appView.innerHTML = `
    <h2>Paramètres du bot</h2>
    <form id="settings-form" class="form-grid card">
      <label><span>Préfixe</span><input name="prefix" maxlength="5" value="${esc(data.settings.prefix || '/')}" /></label>
      <label>
        <span>Langue</span>
        <select name="language">
          <option value="fr" ${data.settings.language === 'fr' ? 'selected' : ''}>Français</option>
          <option value="en" ${data.settings.language === 'en' ? 'selected' : ''}>English</option>
        </select>
      </label>
      <label>
        <span>Message de bienvenue</span>
        <textarea name="welcome_message" maxlength="300">${esc(data.settings.welcome_message || '')}</textarea>
      </label>
      <label><span>Salon log (ID)</span><input name="log_channel_id" value="${esc(data.settings.log_channel_id || '')}" /></label>
      <label class="switch-row">
        <input type="checkbox" name="welcome_enabled" ${data.settings.welcome_enabled ? 'checked' : ''} />
        <span>Activer les messages de bienvenue</span>
      </label>
      <button class="btn btn-primary" type="submit">Enregistrer</button>
    </form>
  `;

  document.getElementById('settings-form')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const formData = new FormData(event.target);

    const payload = {
      prefix: String(formData.get('prefix') || ''),
      language: String(formData.get('language') || ''),
      welcome_message: String(formData.get('welcome_message') || ''),
      log_channel_id: String(formData.get('log_channel_id') || ''),
      welcome_enabled: formData.get('welcome_enabled') === 'on',
    };

    try {
      await request(`/api/guilds/${state.selectedGuildId}/settings`, {
        method: 'PUT',
        body: JSON.stringify(payload),
      });
      notify('Paramètres enregistrés', 'success');
      await loadView('home');
    } catch (error) {
      notify(error.message, 'error');
    }
  });
}

async function syncGuild() {
  if (!requireGuildSelection()) return;

  try {
    const [rolesData, usersData] = await Promise.all([
      request(`/api/guilds/${state.selectedGuildId}/roles`),
      request(`/api/guilds/${state.selectedGuildId}/users`),
    ]);

    const data = await request(`/api/guilds/${state.selectedGuildId}/sync`, {
      method: 'POST',
      body: JSON.stringify({
        roles: rolesData.roles,
        users: usersData.users,
      }),
    });
    notify(`Sync Discord terminée (${data.synced.roles} rôles / ${data.synced.users} utilisateurs)`, 'success');
    await loadView('home');
  } catch (error) {
    notify(error.message, 'error');
  }
}

async function loadView(view) {
  state.currentView = view;

  try {
    if (view === 'home') await loadHome();
    if (view === 'guilds') renderGuildCards();
    if (view === 'overview') await loadOverview();
    if (view === 'modules') await loadModules();
    if (view === 'roles') await loadRoles();
    if (view === 'users') await loadUsers();
    if (view === 'settings') await loadSettings();
  } catch (error) {
    notify(error.message, 'error');
    appView.innerHTML = `<p class="error">${esc(error.message)}</p>`;
  }
}

document.querySelectorAll('[data-view]').forEach((button) => {
  button.addEventListener('click', async () => {
    await loadView(button.dataset.view);
  });
});

syncBtn?.addEventListener('click', syncGuild);

logoutBtn?.addEventListener('click', async () => {
  await fetch('/api/auth/logout', {
    method: 'POST',
    headers: { 'x-csrf-token': csrfToken },
  });
  window.location.href = '/login';
});

async function bootstrap() {
  try {
    state.me = await request('/api/auth/me');
    await loadGuilds();
    updateContextLine();
    await loadView('home');
  } catch (error) {
    console.error('Dashboard bootstrap failed:', error);
    notify('Session invalide ou expirée (déconnexion distante possible). Reconnectez-vous.', 'error');
    window.location.href = '/login';
  }
}

bootstrap();
