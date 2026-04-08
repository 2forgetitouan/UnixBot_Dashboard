/**
 * UnixBot Dashboard - Commands Management
 * Gestion des commandes depuis le dashboard
 */

// ============================================
// COMMANDS MANAGER
// ============================================
const CommandsManager = {
  commands: [],
  currentCategory: "all",
  currentCommand: null,
  guildId: null,

  async init() {
    this.guildId = document.body.dataset.guildId;
    if (!this.guildId) {
      console.error("CommandsManager: missing data-guild-id on body");
      return;
    }

    this.bindEvents();
    await this.loadCommands();
  },

  bindEvents() {
    // Search input
    const searchInput = document.getElementById("commandSearch");
    if (searchInput) {
      searchInput.addEventListener("input", DashboardUtils.debounce(() => this.renderCommands(), 300));
    }

    // Category filter (delegated)
    document.getElementById("categoryFilter")?.addEventListener("click", (e) => {
      const btn = e.target.closest(".category-btn");
      if (!btn) return;
      this.currentCategory = btn.dataset.category;
      document.querySelectorAll(".category-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      this.updateBulkActions();
      this.renderCommands();
    });

    // Edit form submission
    document.getElementById("editCommandForm")?.addEventListener("submit", (e) => this.handleSave(e));

    // Reset command button → open confirm modal
    document.getElementById("resetCommandBtn")?.addEventListener("click", () => {
      if (!this.currentCommand) return;
      document.getElementById("resetCommandName").textContent = `/${this.currentCommand.name}`;
      Modal.open("confirmResetModal");
    });

    // Confirm reset
    document.getElementById("confirmResetBtn")?.addEventListener("click", () => this.handleReset());

    // Retry on error
    document.getElementById("retryBtn")?.addEventListener("click", () => this.loadCommands());

    // Bulk enable / disable
    document.getElementById("bulkEnableBtn")?.addEventListener("click", () => this.handleBulkToggle(true));
    document.getElementById("bulkDisableBtn")?.addEventListener("click", () => this.handleBulkToggle(false));
  },

  // ── Data Loading ────────────────────────────────
  async loadCommands() {
    const loadingState = document.getElementById("loadingState");
    const commandsList = document.getElementById("commandsList");
    const emptyState = document.getElementById("emptyState");
    const errorState = document.getElementById("errorState");
    const statsBar = document.getElementById("commandsStats");

    loadingState?.classList.remove("hidden");
    commandsList?.classList.add("hidden");
    emptyState?.classList.add("hidden");
    errorState?.classList.add("hidden");
    statsBar?.classList.add("hidden");

    try {
      const response = await DashboardUtils.fetch(`/api/guilds/${this.guildId}/commands`);
      this.commands = response.commands || [];

      loadingState?.classList.add("hidden");
      statsBar?.classList.remove("hidden");

      this.buildCategoryFilter();
      this.updateStats();
      this.updateBulkActions();
      this.renderCommands();
    } catch (error) {
      console.error("Error loading commands:", error);
      loadingState?.classList.add("hidden");
      const errorMsg = document.getElementById("errorMessage");
      if (errorMsg) errorMsg.textContent = error.message || "Impossible de charger les commandes";
      errorState?.classList.remove("hidden");
    }
  },

  // ── Stats ───────────────────────────────────────
  updateStats() {
    const total = this.commands.length;
    const enabled = this.commands.filter((c) => c.enabled !== false).length;
    const disabled = total - enabled;

    document.getElementById("totalCount").textContent = total;
    document.getElementById("enabledCount").textContent = enabled;
    document.getElementById("disabledCount").textContent = disabled;
  },

  // ── Category Filter ─────────────────────────────
  buildCategoryFilter() {
    const container = document.getElementById("categoryFilter");
    if (!container) return;

    const categories = [...new Set(this.commands.map((c) => c.category))].sort();

    const categoryLabels = {
      admin: "Administration",
      evenements: "Événements",
      fun: "Fun",
      infos: "Informations",
      utilitaire: "Utilitaire",
      utils: "Utils",
    };

    const categoryIcons = {
      admin: "shield",
      evenements: "calendar",
      fun: "sparkles",
      infos: "info",
      utilitaire: "wrench",
      utils: "tool",
    };

    container.innerHTML = `
      <button class="category-btn ${this.currentCategory === "all" ? "active" : ""}" data-category="all">
        <i data-lucide="grid-3x3"></i>
        <span>Toutes</span>
        <span class="category-count">${this.commands.length}</span>
      </button>
      ${categories.map((cat) => {
        const count = this.commands.filter((c) => c.category === cat).length;
        const icon = categoryIcons[cat] || "folder";
        return `
          <button class="category-btn ${this.currentCategory === cat ? "active" : ""}" data-category="${DashboardUtils.escapeHtml(cat)}">
            <i data-lucide="${DashboardUtils.escapeHtml(icon)}"></i>
            <span>${DashboardUtils.escapeHtml(categoryLabels[cat] || cat.charAt(0).toUpperCase() + cat.slice(1))}</span>
            <span class="category-count">${count}</span>
          </button>
        `;
      }).join("")}
    `;

    DashboardUtils.refreshIcons(container);
  },

  // ── Bulk Actions ────────────────────────────────
  updateBulkActions() {
    const bulkActions = document.getElementById("bulkActions");
    if (!bulkActions) return;

    // Show bulk actions only when a specific category is selected
    if (this.currentCategory !== "all" && this.commands.length > 0) {
      bulkActions.classList.remove("hidden");
    } else {
      bulkActions.classList.add("hidden");
    }
  },

  async handleBulkToggle(enabled) {
    const filtered = this.currentCategory !== "all"
      ? this.commands.filter((c) => c.category === this.currentCategory)
      : this.commands;

    const names = filtered.map((c) => c.name);
    if (names.length === 0) return;

    const btn = enabled
      ? document.getElementById("bulkEnableBtn")
      : document.getElementById("bulkDisableBtn");
    const originalHtml = btn.innerHTML;

    try {
      btn.disabled = true;
      btn.innerHTML = '<div class="spinner spinner-sm"></div>';

      await DashboardUtils.fetch(`/api/guilds/${this.guildId}/commands/bulk`, {
        method: "POST",
        body: JSON.stringify({ commands: names, enabled }),
      });

      // Update local state
      filtered.forEach((c) => { c.enabled = enabled; });

      Toast.success(
        `${names.length} commande${names.length > 1 ? "s" : ""} ${enabled ? "activées" : "désactivées"}`
      );

      this.updateStats();
      this.renderCommands();
    } catch (error) {
      Toast.error(error.message || "Erreur lors de la modification groupée");
    } finally {
      btn.disabled = false;
      btn.innerHTML = originalHtml;
      DashboardUtils.refreshIcons(btn);
    }
  },

  // ── Render Commands Grid ────────────────────────
  renderCommands() {
    const commandsList = document.getElementById("commandsList");
    const emptyState = document.getElementById("emptyState");
    const searchResultsInfo = document.getElementById("searchResultsInfo");
    const searchQuery = document.getElementById("commandSearch")?.value.toLowerCase() || "";

    if (!commandsList) return;

    // Filter commands
    let filtered = this.commands;

    if (this.currentCategory !== "all") {
      filtered = filtered.filter((cmd) => cmd.category === this.currentCategory);
    }

    if (searchQuery) {
      filtered = filtered.filter((cmd) =>
        cmd.name.toLowerCase().includes(searchQuery) ||
        cmd.description.toLowerCase().includes(searchQuery) ||
        cmd.category.toLowerCase().includes(searchQuery)
      );
    }

    // Search results info
    if (searchQuery && searchResultsInfo) {
      searchResultsInfo.classList.remove("hidden");
      document.getElementById("searchResultsCount").textContent = filtered.length;
    } else {
      searchResultsInfo?.classList.add("hidden");
    }

    // Empty state
    if (filtered.length === 0) {
      commandsList.classList.add("hidden");
      emptyState?.classList.remove("hidden");
      return;
    }

    emptyState?.classList.add("hidden");
    commandsList.classList.remove("hidden");

    // Category labels & icons for badges
    const categoryLabels = {
      admin: "Admin",
      evenements: "Event",
      fun: "Fun",
      infos: "Info",
      utilitaire: "Util",
      utils: "Utils",
    };

    const categoryColors = {
      admin: "badge-danger",
      evenements: "badge-warning",
      fun: "badge-success",
      infos: "badge-primary",
      utilitaire: "badge-secondary",
      utils: "badge-secondary",
    };

    commandsList.innerHTML = filtered.map((cmd, index) => `
      <div class="command-card" data-command="${DashboardUtils.escapeHtml(cmd.name)}" data-category="${DashboardUtils.escapeHtml(cmd.category)}" style="animation-delay: ${index * 30}ms">
        <div class="command-card-header">
          <div class="command-info">
            <span class="command-name">/${DashboardUtils.escapeHtml(cmd.name)}</span>
            <span class="badge ${categoryColors[cmd.category] || "badge-secondary"} badge-sm">
              ${categoryLabels[cmd.category] || cmd.category}
            </span>
          </div>
          <div class="command-toggle">
            <label class="toggle-label mini">
              <input type="checkbox" class="command-enabled-toggle"
                ${cmd.enabled !== false ? "checked" : ""}
                data-command="${DashboardUtils.escapeHtml(cmd.name)}">
              <span class="toggle-slider"></span>
            </label>
          </div>
        </div>
        <p class="command-description">${DashboardUtils.escapeHtml(cmd.description)}</p>
        <div class="command-card-footer">
          <div class="command-meta">
            ${cmd.usage ? `<span class="command-usage">/${DashboardUtils.escapeHtml(cmd.name)} ${DashboardUtils.escapeHtml(cmd.usage)}</span>` : ""}
            ${cmd.cooldown > 0 ? `<span class="command-cooldown"><i data-lucide="clock"></i> ${cmd.cooldown}s</span>` : ""}
            ${cmd.allowed_roles?.length > 0 ? `<span class="command-roles-count"><i data-lucide="shield"></i> ${cmd.allowed_roles.length} rôle${cmd.allowed_roles.length > 1 ? "s" : ""}</span>` : ""}
          </div>
          <button class="btn btn-sm btn-secondary edit-command-btn" data-command="${DashboardUtils.escapeHtml(cmd.name)}">
            <i data-lucide="settings"></i>
            <span>Configurer</span>
          </button>
        </div>
      </div>
    `).join("");

    DashboardUtils.refreshIcons(commandsList);
    this.bindCommandEvents();
  },

  bindCommandEvents() {
    // Toggle switches
    document.querySelectorAll(".command-enabled-toggle").forEach((toggle) => {
      toggle.addEventListener("change", (e) => {
        this.toggleCommand(e.target.dataset.command, e.target.checked);
      });
    });

    // Edit buttons
    document.querySelectorAll(".edit-command-btn").forEach((btn) => {
      btn.addEventListener("click", () => this.openEditModal(btn.dataset.command));
    });
  },

  // ── Toggle Single Command ──────────────────────
  async toggleCommand(name, enabled) {
    try {
      await DashboardUtils.fetch(`/api/guilds/${this.guildId}/commands/${name}`, {
        method: "PATCH",
        body: JSON.stringify({ enabled }),
      });

      const cmd = this.commands.find((c) => c.name === name);
      if (cmd) cmd.enabled = enabled;

      this.updateStats();
      Toast.success(`/${name} ${enabled ? "activée" : "désactivée"}`);
    } catch (error) {
      Toast.error(error.message || "Erreur lors de la modification");
      // Revert toggle
      const toggle = document.querySelector(`.command-enabled-toggle[data-command="${name}"]`);
      if (toggle) toggle.checked = !enabled;
    }
  },

  // ── Edit Modal ──────────────────────────────────
  openEditModal(name) {
    const command = this.commands.find((c) => c.name === name);
    if (!command) return;

    this.currentCommand = command;

    // Populate modal fields
    document.getElementById("modalCommandName").textContent = `/${command.name}`;
    document.getElementById("modalCommandCategory").textContent =
      { admin: "Admin", evenements: "Event", fun: "Fun", infos: "Info", utilitaire: "Util", utils: "Utils" }[command.category] || command.category;
    document.getElementById("modalCommandDesc").textContent = command.description;
    document.getElementById("commandEnabled").checked = command.enabled !== false;
    document.getElementById("cooldownSeconds").value = command.cooldown || 0;

    // Reset role checkboxes
    document.querySelectorAll('input[name="allowed_roles"]').forEach((cb) => {
      cb.checked = command.allowed_roles?.includes(cb.value) || false;
    });
    document.querySelectorAll('input[name="denied_roles"]').forEach((cb) => {
      cb.checked = command.denied_roles?.includes(cb.value) || false;
    });

    Modal.open("editModal");
  },

  // ── Save Command Config ─────────────────────────
  async handleSave(e) {
    e.preventDefault();
    if (!this.currentCommand) return;

    const form = e.target;
    const submitBtn = form.querySelector('button[type="submit"]');
    const originalHtml = submitBtn.innerHTML;

    try {
      submitBtn.disabled = true;
      submitBtn.innerHTML = '<div class="spinner spinner-sm"></div> <span>Sauvegarde...</span>';

      const data = {
        enabled: document.getElementById("commandEnabled").checked,
        cooldown: parseInt(document.getElementById("cooldownSeconds").value) || 0,
        allowed_roles: Array.from(
          document.querySelectorAll('input[name="allowed_roles"]:checked')
        ).map((cb) => cb.value),
        denied_roles: Array.from(
          document.querySelectorAll('input[name="denied_roles"]:checked')
        ).map((cb) => cb.value),
      };

      await DashboardUtils.fetch(
        `/api/guilds/${this.guildId}/commands/${this.currentCommand.name}`,
        { method: "PATCH", body: JSON.stringify(data) }
      );

      // Update local state
      Object.assign(this.currentCommand, data);

      Toast.success("Configuration sauvegardée");
      Modal.close("editModal");
      this.updateStats();
      this.renderCommands();
    } catch (error) {
      Toast.error(error.message || "Erreur lors de la sauvegarde");
    } finally {
      submitBtn.disabled = false;
      submitBtn.innerHTML = originalHtml;
      DashboardUtils.refreshIcons(submitBtn);
    }
  },

  // ── Reset Command ───────────────────────────────
  async handleReset() {
    if (!this.currentCommand) return;

    const btn = document.getElementById("confirmResetBtn");
    const originalHtml = btn.innerHTML;

    try {
      btn.disabled = true;
      btn.innerHTML = '<div class="spinner spinner-sm"></div>';

      const response = await DashboardUtils.fetch(
        `/api/guilds/${this.guildId}/commands/${this.currentCommand.name}/reset`,
        { method: "POST" }
      );

      // Update local state with default values
      if (response.command) {
        const idx = this.commands.findIndex((c) => c.name === this.currentCommand.name);
        if (idx !== -1) {
          this.commands[idx] = {
            ...response.command,
            enabled: response.command.default_enabled !== false,
            cooldown: 0,
            allowed_roles: [],
            denied_roles: [],
            allowed_channels: [],
          };
        }
      }

      Toast.success(`/${this.currentCommand.name} réinitialisée`);
      Modal.close("confirmResetModal");
      Modal.close("editModal");
      this.updateStats();
      this.renderCommands();
    } catch (error) {
      Toast.error(error.message || "Erreur lors de la réinitialisation");
    } finally {
      btn.disabled = false;
      btn.innerHTML = originalHtml;
      DashboardUtils.refreshIcons(btn);
    }
  },
};

// Initialize on DOM ready
document.addEventListener("DOMContentLoaded", () => {
  CommandsManager.init();
});
