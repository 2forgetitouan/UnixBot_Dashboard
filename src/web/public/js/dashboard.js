const appView = document.getElementById('app-view');
const logoutBtn = document.getElementById('logout-btn');
const csrfToken = window.__CSRF_TOKEN || '';

async function getJson(url, options = {}) {
  const response = await fetch(url, options);
  const data = await response.json();
  if (!response.ok || !data.ok) {
    throw new Error(data.error || 'Request failed');
  }
  return data;
}

function renderGuilds(guilds) {
  appView.innerHTML = `
    <h2>Serveurs</h2>
    <table class="table">
      <thead><tr><th>ID</th><th>Nom</th><th>Mis à jour</th></tr></thead>
      <tbody>
        ${guilds.map((guild) => `<tr><td>${guild.id}</td><td>${guild.name}</td><td>${new Date(guild.updated_at * 1000).toLocaleString('fr-FR')}</td></tr>`).join('')}
      </tbody>
    </table>
  `;
}

async function loadGuilds() {
  appView.innerHTML = '<p class="muted">Chargement des serveurs...</p>';
  try {
    const data = await getJson('/api/guilds');
    renderGuilds(data.guilds);
  } catch (error) {
    appView.innerHTML = `<p class="error">${error.message}</p>`;
  }
}

async function loadSettings() {
  appView.innerHTML = '<p class="muted">Sélectionnez un serveur via l’API /api/guilds/:guildId/settings pour éditer les paramètres.</p>';
}

document.querySelectorAll('[data-view]').forEach((button) => {
  button.addEventListener('click', () => {
    if (button.dataset.view === 'guilds') loadGuilds();
    if (button.dataset.view === 'settings') loadSettings();
  });
});

logoutBtn?.addEventListener('click', async () => {
  await fetch('/api/auth/logout', {
    method: 'POST',
    headers: { 'x-csrf-token': csrfToken },
  });
  window.location.href = '/login';
});

loadGuilds();
