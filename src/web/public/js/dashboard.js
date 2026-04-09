const appView = document.getElementById('app-view');
const contextLine = document.getElementById('context-line');
const alertBox = document.getElementById('app-alert');
const logoutBtn = document.getElementById('logout-btn');
const syncBtn = document.getElementById('sync-btn');

const csrfToken = window.__CSRF_TOKEN || '';
const state = {
  me: null,
  guilds: [],
  selectedGuildId: null,
};

function notify(message, type = 'info') {
  alertBox.innerHTML = `<p class="alert alert-${type}">${message}</p>`;
  setTimeout(() => {
    alertBox.innerHTML = '';
  }, 3500);
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

function roleCheckbox(roleId, flag) {
  return document.querySelector(`[data-role="${roleId}"][data-flag="${flag}"]`);
}

function requireGuildSelection() {
  if (!state.selectedGuildId) {
    appView.innerHTML = '<p class="muted">Sélectionnez un serveur dans la section Serveurs.</p>';
    return false;
  }
  return true;
}

function renderGuilds(guilds) {
  appView.innerHTML = `
    <h2>Serveurs administrables</h2>
    <div class="guild-grid">
      ${guilds.map((guild) => `
        <article class="card guild-card ${state.selectedGuildId === guild.id ? 'selected' : ''}">
          <h3>${guild.name}</h3>
          <p class="muted">ID: ${guild.id}</p>
          <button class="btn btn-secondary" data-select-guild="${guild.id}">Sélectionner</button>
        </article>
      `).join('')}
    </div>
  `;

  document.querySelectorAll('[data-select-guild]').forEach((button) => {
    button.addEventListener('click', () => {
      state.selectedGuildId = button.dataset.selectGuild;
      const selected = guilds.find((guild) => guild.id === state.selectedGuildId);
      contextLine.textContent = `Connecté en ${state.me.user.username} • Serveur actif: ${selected?.name || state.selectedGuildId}`;
      renderGuilds(guilds);
    });
  });
}

async function loadGuilds() {
  appView.innerHTML = '<p class="muted">Chargement des serveurs...</p>';
  const data = await request('/api/guilds');
  state.guilds = data.guilds;

  if (!state.selectedGuildId && state.guilds.length > 0) {
    state.selectedGuildId = state.guilds[0].id;
  }

  renderGuilds(state.guilds);
}

async function loadOverview() {
  if (!requireGuildSelection()) return;
  appView.innerHTML = '<p class="muted">Chargement de la vue serveur...</p>';

  const data = await request(`/api/guilds/${state.selectedGuildId}/overview`);
  appView.innerHTML = `
    <h2>Vue serveur</h2>
    <div class="metrics-grid">
      <article class="card"><h3>Modules actifs</h3><p>${data.metrics.modulesEnabled} / ${data.metrics.modulesTotal}</p></article>
      <article class="card"><h3>Rôles</h3><p>${data.metrics.rolesTotal}</p></article>
      <article class="card"><h3>Utilisateurs</h3><p>${data.metrics.usersTotal}</p></article>
    </div>
    <div class="card">
      <h3>${data.guild.name}</h3>
      <p class="muted">ID: ${data.guild.id}</p>
      <p>Préfixe: <code>${data.settings?.prefix || '/'}</code> • Langue: <code>${data.settings?.language || 'fr'}</code></p>
    </div>
  `;
}

async function loadModules() {
  if (!requireGuildSelection()) return;
  appView.innerHTML = '<p class="muted">Chargement des modules...</p>';

  const data = await request(`/api/guilds/${state.selectedGuildId}/modules`);
  appView.innerHTML = `
    <h2>Modules du bot</h2>
    <div class="module-grid">
      ${data.modules.map((module) => `
        <article class="card module-card">
          <h3>${module.name}</h3>
          <p class="muted">${module.description}</p>
          <label class="switch-row">
            <input type="checkbox" data-module-toggle="${module.key}" ${module.enabled ? 'checked' : ''} />
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
  appView.innerHTML = '<p class="muted">Chargement des utilisateurs...</p>';

  const data = await request(`/api/guilds/${state.selectedGuildId}/users`);
  appView.innerHTML = `
    <h2>Utilisateurs</h2>
    <table class="table">
      <thead><tr><th>ID</th><th>Nom</th><th>Display</th><th>Admin</th><th>Rôles</th></tr></thead>
      <tbody>
      ${data.users.map((user) => `
        <tr>
          <td>${user.id}</td>
          <td>${user.username}</td>
          <td>${user.displayName || '-'}</td>
          <td>${user.isAdmin ? 'Oui' : 'Non'}</td>
          <td>${user.roles.join(', ') || '-'}</td>
        </tr>
      `).join('')}
      </tbody>
    </table>
  `;
}

async function loadRoles() {
  if (!requireGuildSelection()) return;
  appView.innerHTML = '<p class="muted">Chargement des rôles et permissions...</p>';

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
            <td>${role.name}</td>
            <td><input type="checkbox" data-role="${role.id}" data-flag="canManageSettings" ${p.canManageSettings ? 'checked' : ''} /></td>
            <td><input type="checkbox" data-role="${role.id}" data-flag="canManageModules" ${p.canManageModules ? 'checked' : ''} /></td>
            <td><input type="checkbox" data-role="${role.id}" data-flag="canManageUsers" ${p.canManageUsers ? 'checked' : ''} /></td>
            <td><button class="btn btn-secondary" data-save-role="${role.id}">Enregistrer</button></td>
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
  appView.innerHTML = '<p class="muted">Chargement des paramètres...</p>';

  const data = await request(`/api/guilds/${state.selectedGuildId}/settings`);

  appView.innerHTML = `
    <h2>Paramètres du bot</h2>
    <form id="settings-form" class="form-grid card">
      <label><span>Préfixe</span><input name="prefix" maxlength="5" value="${data.settings.prefix || '/'}" /></label>
      <label>
        <span>Langue</span>
        <select name="language">
          <option value="fr" ${data.settings.language === 'fr' ? 'selected' : ''}>Français</option>
          <option value="en" ${data.settings.language === 'en' ? 'selected' : ''}>English</option>
        </select>
      </label>
      <label>
        <span>Message de bienvenue</span>
        <textarea name="welcome_message" maxlength="300">${data.settings.welcome_message || ''}</textarea>
      </label>
      <label><span>Salon log (ID)</span><input name="log_channel_id" value="${data.settings.log_channel_id || ''}" /></label>
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
  } catch (error) {
    notify(error.message, 'error');
  }
}

document.querySelectorAll('[data-view]').forEach((button) => {
  button.addEventListener('click', async () => {
    const view = button.dataset.view;
    try {
      if (view === 'guilds') await loadGuilds();
      if (view === 'overview') await loadOverview();
      if (view === 'modules') await loadModules();
      if (view === 'roles') await loadRoles();
      if (view === 'users') await loadUsers();
      if (view === 'settings') await loadSettings();
    } catch (error) {
      notify(error.message, 'error');
      appView.innerHTML = `<p class="error">${error.message}</p>`;
    }
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
    contextLine.textContent = `Connecté en ${state.me.user.username} (${state.me.user.provider})`;
    await loadGuilds();
  } catch (error) {
    console.error('Dashboard bootstrap failed:', error);
    notify('Session invalide ou expirée (déconnexion distante possible). Reconnectez-vous.', 'error');
    window.location.href = '/login';
  }
}

bootstrap();
