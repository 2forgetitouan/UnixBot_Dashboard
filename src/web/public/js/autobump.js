/**
 * UnixBot Dashboard - Auto-Bump Management v3
 * Gestion de l'interface auto-bump avec switches, services et modals
 */

// ============================================
// AUTO-BUMP MANAGER
// ============================================
const AutoBump = {
  guildId: null,
  config: null,
  availableServices: [],
  customServices: [],
  originalCustomServices: [],
  isTokenVerified: false,
  verifiedTokenUserId: null,
  isConfigured: false,
  isSaving: false,
  pendingDeleteServiceIndex: null,

  // ── Helpers ──────────────────────────────────
  show(el) { el?.classList.remove("hidden"); },
  hide(el) { el?.classList.add("hidden"); },
  toggle(el, visible) { el?.classList.toggle("hidden", !visible); },
  $(id) { return document.getElementById(id); },

  // ── Init ─────────────────────────────────────
  async init() {
    const dataEl = this.$("pageData");
    const data = dataEl ? JSON.parse(dataEl.textContent) : {};
    this.guildId = data.guildId;
    if (!this.guildId) {
      console.error("Guild ID not found");
      return;
    }

    this.bindEvents();
    await this.waitForServer();
    await this.loadStatus();
    await this.loadHistory();

    // Reveal content, hide skeleton
    this.hide(this.$("autobumpSkeleton"));
    this.show(this.$("autobumpContent"));

    // Init unsaved changes tracker
    const form = this.$("autobumpForm");
    if (form && window.UnsavedChanges) {
      setTimeout(() => UnsavedChanges.init(form), 300);
    }
  },

  async waitForServer(maxRetries = 5) {
    for (let i = 0; i < maxRetries; i++) {
      try {
        const response = await fetch("/health", {
          credentials: "include",
          signal: AbortSignal.timeout(3000),
        });
        if (response.ok) return;
      } catch {
        if (i < maxRetries - 1) {
          await new Promise((r) => setTimeout(r, 1000));
        }
      }
    }
  },

  // ── Events ───────────────────────────────────
  bindEvents() {
    // Form submission
    this.$("autobumpForm")?.addEventListener("submit", (e) => {
      e.preventDefault();
      this.saveConfig();
    });

    // Master switch
    this.$("masterSwitch")?.addEventListener("change", (e) => {
      this.toggleAutoBump(e.target.checked);
    });

    // Token visibility toggle
    this.$("toggleTokenVisibility")?.addEventListener("click", () => {
      const input = this.$("userToken");
      const icon = document.querySelector("#toggleTokenVisibility i");
      if (input.type === "password") {
        input.type = "text";
        icon.setAttribute("data-lucide", "eye-off");
      } else {
        input.type = "password";
        icon.setAttribute("data-lucide", "eye");
      }
      DashboardUtils.refreshIcons(document.getElementById("toggleTokenVisibility"));
    });

    // Verify token button
    this.$("btnVerifyToken")?.addEventListener("click", () => this.verifyToken());

    // Token input - reset verification on change
    this.$("userToken")?.addEventListener("input", () => {
      this.isTokenVerified = false;
      this.verifiedTokenUserId = null;
      this.hideTokenVerification();
    });

    // Token help link
    this.$("tokenHelpLink")?.addEventListener("click", (e) => {
      e.preventDefault();
      Modal.open("tokenHelpModal");
    });

    // Add custom service
    this.$("btnAddCustomService")?.addEventListener("click", () => {
      if (this.customServices.length >= 10) {
        Toast.error("Limite de 10 services personnalisés atteinte");
        return;
      }
      this.openCustomServiceModal();
    });

    // Confirm add custom service
    this.$("btnConfirmAddService")?.addEventListener("click", () => this.addCustomService());

    // Delete config button → open confirm modal
    this.$("btnDelete")?.addEventListener("click", () => {
      Modal.open("confirmDeleteModal");
    });

    // Confirm delete config
    this.$("btnConfirmDelete")?.addEventListener("click", () => {
      Modal.close("confirmDeleteModal");
      this.deleteConfig();
    });

    // Confirm delete service
    this.$("btnConfirmDeleteService")?.addEventListener("click", () => {
      Modal.close("confirmDeleteServiceModal");
      if (this.pendingDeleteServiceIndex !== null) {
        this.removeCustomService(this.pendingDeleteServiceIndex);
        this.pendingDeleteServiceIndex = null;
      }
    });
  },

  // ── Data Loading ─────────────────────────────
  async loadStatus() {
    try {
      const response = await DashboardUtils.fetch(`/api/autobump/${this.guildId}`);

      this.config = response;
      this.availableServices = response.availableServices || [];
      this.isConfigured = response.configured || false;

      if (response.services?.custom) {
        this.customServices = response.services.custom;
        this.originalCustomServices = JSON.parse(JSON.stringify(response.services.custom));
      } else {
        this.customServices = [];
        this.originalCustomServices = [];
      }

      this.renderServices();
      this.updateUI();

      // Hide auth section if already configured
      if (this.isConfigured) {
        this.hide(this.$("authCard"));
      }
    } catch {
      Toast.error("Impossible de charger le statut");
    }
  },

  async loadHistory() {
    try {
      const response = await DashboardUtils.fetch(`/api/autobump/${this.guildId}/history?limit=20`);
      this.renderHistory(response.history || []);
    } catch (error) {
      console.error("Error loading history:", error);
    }
  },

  // ── Services Rendering ───────────────────────
  renderServices() {
    const container = this.$("servicesList");
    if (!container) return;

    const servicesConfig = this.config?.services?.default || {};
    let totalServices = 0;
    let enabledServices = 0;

    // Render default services
    let html = this.availableServices
      .map((service) => {
        const config = servicesConfig[service.id] || {
          enabled: service.defaultEnabled,
          minDelay: service.minDelay,
          maxDelay: service.maxDelay,
        };
        totalServices++;
        if (config.enabled) enabledServices++;
        return this.renderServiceItem(service, config, false);
      })
      .join("");

    // Render custom services
    if (this.customServices.length > 0) {
      html += '<div class="services-divider"><span>Services personnalisés</span></div>';
      html += this.customServices
        .map((service, index) => {
          totalServices++;
          if (service.enabled !== false) enabledServices++;
          return this.renderServiceItem(
            {
              id: `custom_${index}`,
              name: service.name,
              botId: service.botId,
              command: service.command,
              minDelay: service.minDelay,
              maxDelay: service.maxDelay,
            },
            {
              enabled: service.enabled !== false,
              minDelay: service.minDelay,
              maxDelay: service.maxDelay,
            },
            true,
            index
          );
        })
        .join("");
    }

    container.innerHTML = html;

    // Update services count badge
    const countBadge = this.$("servicesCount");
    if (countBadge) {
      countBadge.textContent = `${enabledServices}/${totalServices} actifs`;
      this.show(countBadge);
    }

    // Toggle empty state
    const emptyState = this.$("servicesEmpty");
    this.toggle(emptyState, totalServices === 0);
    this.toggle(container, totalServices > 0);

    this.bindServiceEvents();
    DashboardUtils.refreshIcons(container);
  },

  renderServiceItem(service, config, isCustom, customIndex = null) {
    const minHours = (config.minDelay / 3600000).toFixed(1).replace(".0", "");
    const maxHours = (config.maxDelay / 3600000).toFixed(1).replace(".0", "");
    const serviceId = isCustom ? `custom_${customIndex}` : service.id;
    const minDurationText = this.formatDuration(config.minDelay);
    const maxDurationText = this.formatDuration(config.maxDelay);
    const escapedName = DashboardUtils.escapeHtml(service.name);

    return `
      <div class="service-item ${config.enabled ? "active" : ""}" data-service="${serviceId}" data-custom="${isCustom}">
        <div class="service-header">
          <div class="service-info">
            <span class="service-name">${escapedName}</span>
            ${isCustom ? '<span class="badge badge-secondary badge-sm">Personnalisé</span>' : ""}
          </div>
          <label class="switch">
            <input type="checkbox"
              name="service_enabled_${serviceId}"
              ${config.enabled ? "checked" : ""}
              data-service="${serviceId}">
            <span class="switch-slider"></span>
          </label>
        </div>
        <div class="service-config ${config.enabled ? "" : "disabled"}">
          <div class="service-delays">
            <div class="delay-input">
              <label>Min</label>
              <div class="input-with-unit-small">
                <input type="number"
                  name="service_min_${serviceId}"
                  value="${minHours}"
                  min="0.5" max="10" step="0.5"
                  class="form-input-small"
                  data-service-id="${serviceId}"
                  data-delay-type="min"
                  lang="en">
                <span class="duration-text" data-for="service_min_${serviceId}">${minDurationText}</span>
              </div>
            </div>
            <div class="delay-separator">—</div>
            <div class="delay-input">
              <label>Max</label>
              <div class="input-with-unit-small">
                <input type="number"
                  name="service_max_${serviceId}"
                  value="${maxHours}"
                  min="1" max="11" step="0.5"
                  class="form-input-small"
                  data-service-id="${serviceId}"
                  data-delay-type="max"
                  lang="en">
                <span class="duration-text" data-for="service_max_${serviceId}">${maxDurationText}</span>
              </div>
            </div>
          </div>
          <div class="service-actions">
            ${
              config.enabled
                ? `<button type="button" class="btn-icon-small btn-test-service" data-service-id="${serviceId}" title="Tester ce service">
                <i data-lucide="play"></i>
              </button>`
                : ""
            }
            ${
              isCustom
                ? `<button type="button" class="btn-icon-small btn-edit-service" data-index="${customIndex}" title="Modifier">
                <i data-lucide="pencil"></i>
              </button>
              <button type="button" class="btn-icon-small btn-delete-service" data-index="${customIndex}" title="Supprimer">
                <i data-lucide="trash-2"></i>
              </button>`
                : ""
            }
          </div>
        </div>
      </div>
    `;
  },

  bindServiceEvents() {
    // Service toggle switches
    document.querySelectorAll('.service-item input[type="checkbox"]').forEach((checkbox) => {
      checkbox.addEventListener("change", (e) => {
        const serviceItem = e.target.closest(".service-item");
        const configSection = serviceItem.querySelector(".service-config");

        if (e.target.checked) {
          serviceItem.classList.add("active");
          configSection?.classList.remove("disabled");
        } else {
          serviceItem.classList.remove("active");
          configSection?.classList.add("disabled");
        }
      });
    });

    // Update duration text on input change
    document.querySelectorAll('.service-delays input[type="number"]').forEach((input) => {
      input.addEventListener("input", (e) => {
        const hours = parseFloat(e.target.value) || 0;
        const ms = hours * 3600000;
        const textSpan = document.querySelector(`span[data-for="${e.target.name}"]`);
        if (textSpan) textSpan.textContent = this.formatDuration(ms);
      });
    });

    // Delete custom service → open confirm modal
    document.querySelectorAll(".btn-delete-service").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        const index = parseInt(e.currentTarget.dataset.index);
        const service = this.customServices[index];
        if (service) {
          this.pendingDeleteServiceIndex = index;
          const nameEl = this.$("deleteServiceName");
          if (nameEl) nameEl.textContent = service.name;
          Modal.open("confirmDeleteServiceModal");
        }
      });
    });

    // Edit custom service
    document.querySelectorAll(".btn-edit-service").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        const index = parseInt(e.currentTarget.dataset.index);
        this.openCustomServiceModal(index);
      });
    });

    // Test service
    document.querySelectorAll(".btn-test-service").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        const serviceId = e.currentTarget.dataset.serviceId;
        this.testBumpService(serviceId, e.currentTarget);
      });
    });
  },

  // ── UI Updates ───────────────────────────────
  updateUI() {
    const statusIndicator = this.$("statusIndicator");
    const statusDot = statusIndicator?.querySelector(".status-dot");
    const statusText = statusIndicator?.querySelector(".status-text");
    const statusDescription = this.$("statusDescription");
    const masterSwitchContainer = this.$("masterSwitchContainer");
    const masterSwitch = this.$("masterSwitch");
    const tokenUserInfo = this.$("tokenUserInfo");
    const bumpStats = this.$("bumpStats");
    const dangerZone = this.$("dangerZone");
    const channelSelect = this.$("bumpChannel");
    const tokenRequired = this.$("tokenRequired");
    const nextBumpContainer = this.$("nextBumpContainer");

    if (!this.config?.configured) {
      // Not configured
      statusDot?.classList.remove("active", "error");
      statusDot?.classList.add("inactive");
      if (statusText) statusText.textContent = "Non configuré";
      if (statusDescription) statusDescription.textContent = "Configurez votre token et vos services pour commencer.";
      this.hide(masterSwitchContainer);
      this.hide(tokenUserInfo);
      this.hide(bumpStats);
      this.hide(dangerZone);
      this.toggle(tokenRequired, true);
    } else {
      // Configured
      this.show(dangerZone);
      this.show(masterSwitchContainer);
      this.hide(tokenRequired);

      // Token user info
      if (tokenUserInfo && this.config.tokenUser) {
        this.show(tokenUserInfo);
        this.$("tokenUserAvatar").src = this.config.tokenUser.avatarUrl;
        this.$("tokenUserName").textContent = this.config.tokenUser.username;
        this.$("tokenUserId").textContent = `ID: ${this.config.tokenUser.id}`;
      }

      // Stats
      if (bumpStats) {
        this.show(bumpStats);
        this.$("totalBumps").textContent = this.config.totalBumps || 0;

        if (this.config.lastBumpAt) {
          const lastBump = new Date(this.config.lastBumpAt);
          this.$("lastBump").textContent = lastBump.toLocaleString("fr-FR", {
            day: "2-digit",
            month: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
          });
        }

        // Next bump
        if (this.config.nextBumps && Object.keys(this.config.nextBumps).length > 0) {
          const nextTimes = Object.values(this.config.nextBumps);
          const nextBump = new Date(Math.min(...nextTimes.map((t) => new Date(t))));
          this.$("nextBump").textContent = nextBump.toLocaleString("fr-FR", {
            hour: "2-digit",
            minute: "2-digit",
          });
          this.show(nextBumpContainer);
        } else {
          this.hide(nextBumpContainer);
        }
      }

      // Pre-fill form
      if (channelSelect) channelSelect.value = this.config.channelId || "";

      // Status and master switch
      if (this.config.isActive) {
        statusDot?.classList.remove("inactive", "error");
        statusDot?.classList.add("active");
        if (statusText) statusText.textContent = "Actif";
        if (statusDescription) statusDescription.textContent = "L'auto-bump est en cours d'exécution.";
        if (masterSwitch) masterSwitch.checked = true;
      } else {
        statusDot?.classList.remove("active");
        statusDot?.classList.add("inactive");

        if (this.config.lastError && this.config.consecutiveFailures >= 5) {
          statusDot?.classList.add("error");
          if (statusText) statusText.textContent = "Erreur";
          if (statusDescription) statusDescription.textContent = this.config.lastError;
        } else {
          if (statusText) statusText.textContent = "Inactif";
          if (statusDescription) statusDescription.textContent = "L'auto-bump est configuré mais arrêté.";
        }

        if (masterSwitch) masterSwitch.checked = false;
      }
    }

    DashboardUtils.refreshIcons(document.querySelector(".page-content"));
  },

  // ── Actions ──────────────────────────────────
  async toggleAutoBump(enabled) {
    const masterSwitch = this.$("masterSwitch");

    try {
      masterSwitch.disabled = true;

      if (enabled) {
        await DashboardUtils.fetch(`/api/autobump/${this.guildId}/start`, { method: "POST" });
        Toast.success("Auto-bump démarré");
      } else {
        await DashboardUtils.fetch(`/api/autobump/${this.guildId}/stop`, { method: "POST" });
        Toast.success("Auto-bump arrêté");
      }

      await this.loadStatus();
    } catch (error) {
      Toast.error(error.message || "Erreur lors du changement d'état");
      masterSwitch.checked = !enabled;
    } finally {
      masterSwitch.disabled = false;
    }
  },

  // ── Token Verification ───────────────────────
  async verifyToken() {
    const tokenInput = this.$("userToken");
    const token = tokenInput?.value?.trim();

    if (!token) {
      Toast.error("Veuillez entrer un token");
      return;
    }

    this.showTokenVerification("loading");

    try {
      const response = await DashboardUtils.fetch("/api/autobump/verify-token", {
        method: "POST",
        body: JSON.stringify({ token }),
      });

      if (response.success) {
        this.isTokenVerified = true;
        this.verifiedTokenUserId = response.user.id;
        this.showTokenVerification("success", response.user);
        Toast.success("Token vérifié avec succès");
      }
    } catch (error) {
      this.isTokenVerified = false;
      this.verifiedTokenUserId = null;

      if (error.message?.includes("bot") || error.message?.includes("BOT")) {
        this.show(this.$("botTokenAlert"));
      }

      this.showTokenVerification("error", error.message);
    }
  },

  showTokenVerification(state, data) {
    const container = this.$("tokenVerification");
    const loading = this.$("verificationLoading");
    const success = this.$("verificationSuccess");
    const errorEl = this.$("verificationError");

    this.show(container);
    this.hide(loading);
    this.hide(success);
    this.hide(errorEl);

    switch (state) {
      case "loading":
        this.show(loading);
        break;
      case "success":
        this.show(success);
        this.$("verifiedAvatar").src = data.avatarUrl;
        this.$("verifiedName").textContent = data.globalName || data.username;
        this.$("verifiedId").textContent = `@${data.username}`;
        break;
      case "error":
        this.show(errorEl);
        this.$("verificationErrorText").textContent = data || "Erreur de vérification";
        break;
    }

    DashboardUtils.refreshIcons(document.getElementById("tokenVerification"));
  },

  hideTokenVerification() {
    this.hide(this.$("tokenVerification"));
    this.hide(this.$("botTokenAlert"));
  },

  // ── Custom Service Modal ─────────────────────
  openCustomServiceModal(editIndex = -1) {
    const isEditing = editIndex >= 0;
    const service = isEditing ? this.customServices[editIndex] : null;

    this.$("customServiceModalTitle").textContent = isEditing
      ? "Modifier le service"
      : "Ajouter un service personnalisé";
    this.$("btnConfirmAddServiceText").textContent = isEditing ? "Enregistrer" : "Ajouter";

    this.$("customServiceEditIndex").value = editIndex;

    // Reset/fill form
    this.$("customServiceName").value = service?.name || "";
    this.$("customServiceBotId").value = service?.botId || "";
    this.$("customServiceCommand").value = service?.command || "";
    this.$("customServiceMinDelay").value = service ? service.minDelay / 3600000 : "2";
    this.$("customServiceMaxDelay").value = service ? service.maxDelay / 3600000 : "3";

    // Reset bot avatar preview
    this.hideBotAvatarPreview();

    // If editing with existing botId, verify it
    if (service?.botId) this.verifyBotId(service.botId);

    // Debounced input listener for bot ID
    const botIdInput = this.$("customServiceBotId");
    botIdInput.removeEventListener("input", this._handleBotIdInput);
    this._handleBotIdInput = DashboardUtils.debounce((e) => {
      const botId = e.target.value.trim();
      if (/^\d{17,20}$/.test(botId)) {
        this.verifyBotId(botId);
      } else {
        this.hideBotAvatarPreview();
      }
    }, 500);
    botIdInput.addEventListener("input", this._handleBotIdInput);

    Modal.open("customServiceModal");
    DashboardUtils.refreshIcons(document.getElementById("customServiceModal"));
  },

  async verifyBotId(botId) {
    try {
      const response = await DashboardUtils.fetch(`/api/autobump/verify-bot/${encodeURIComponent(botId)}`);

      if (response.success && response.isBot) {
        this.showBotAvatarPreview(response.user);
      } else {
        this.showBotAvatarError(response.error || "Cet ID n'appartient pas à un bot");
      }
    } catch {
      this.showBotAvatarError("Impossible de vérifier l'ID");
    }
  },

  showBotAvatarPreview(bot) {
    const preview = this.$("botAvatarPreview");
    const error = this.$("botAvatarError");
    const img = this.$("botAvatarImg");
    const name = this.$("botAvatarName");

    if (preview && img && name) {
      img.src = bot.avatarUrl || "https://cdn.discordapp.com/embed/avatars/0.png";
      name.textContent = bot.username + (bot.isBot ? " (Bot)" : "");
      this.show(preview);
      this.hide(error);
    }
  },

  showBotAvatarError(message) {
    const preview = this.$("botAvatarPreview");
    const error = this.$("botAvatarError");
    const errorText = this.$("botAvatarErrorText");

    if (error && errorText) {
      errorText.textContent = message;
      this.show(error);
      this.hide(preview);
      DashboardUtils.refreshIcons(error);
    }
  },

  hideBotAvatarPreview() {
    this.hide(this.$("botAvatarPreview"));
    this.hide(this.$("botAvatarError"));
  },

  addCustomService() {
    const editIndex = parseInt(this.$("customServiceEditIndex").value);
    const isEditing = editIndex >= 0;

    const name = this.$("customServiceName").value.trim();
    const botId = this.$("customServiceBotId").value.trim();
    const command = this.$("customServiceCommand").value.trim();
    const minDelay = parseFloat(this.$("customServiceMinDelay").value) || 2;
    const maxDelay = parseFloat(this.$("customServiceMaxDelay").value) || 3;

    if (!name || !botId || !command) {
      Toast.error("Veuillez remplir tous les champs");
      return;
    }

    if (!/^\d{17,20}$/.test(botId)) {
      Toast.error("L'ID du bot doit être un identifiant Discord valide");
      return;
    }

    if (maxDelay <= minDelay) {
      Toast.error("Le délai maximum doit être supérieur au minimum");
      return;
    }

    if (!isEditing && this.customServices.length >= 10) {
      Toast.error("Limite de 10 services personnalisés atteinte");
      return;
    }

    const serviceData = {
      name,
      botId,
      command,
      enabled: true,
      minDelay: minDelay * 3600000,
      maxDelay: maxDelay * 3600000,
    };

    if (isEditing) {
      serviceData.enabled = this.customServices[editIndex]?.enabled !== false;
      this.customServices[editIndex] = serviceData;
      Toast.success(`Service "${name}" modifié`);
    } else {
      this.customServices.push(serviceData);
      Toast.success(`Service "${name}" ajouté`);
    }

    Modal.close("customServiceModal");
    this.renderServices();
  },

  removeCustomService(index) {
    const service = this.customServices[index];
    if (service) {
      this.customServices.splice(index, 1);
      this.renderServices();
      Toast.success(`Service "${service.name}" supprimé`);
    }
  },

  // ── Config Save/Delete ───────────────────────
  collectServicesConfig() {
    const services = {};
    const customServices = [];

    this.availableServices.forEach((service) => {
      const checkbox = document.querySelector(`input[name="service_enabled_${service.id}"]`);
      const minInput = document.querySelector(`input[name="service_min_${service.id}"]`);
      const maxInput = document.querySelector(`input[name="service_max_${service.id}"]`);

      services[service.id] = {
        enabled: checkbox?.checked || false,
        minDelay: (parseFloat(minInput?.value) || 2) * 3600000,
        maxDelay: (parseFloat(maxInput?.value) || 3) * 3600000,
      };
    });

    this.customServices.forEach((service, index) => {
      const checkbox = document.querySelector(`input[name="service_enabled_custom_${index}"]`);
      const minInput = document.querySelector(`input[name="service_min_custom_${index}"]`);
      const maxInput = document.querySelector(`input[name="service_max_custom_${index}"]`);

      customServices.push({
        name: service.name,
        botId: service.botId,
        command: service.command,
        enabled: checkbox?.checked !== false,
        minDelay: (parseFloat(minInput?.value) || 2) * 3600000,
        maxDelay: (parseFloat(maxInput?.value) || 3) * 3600000,
      });
    });

    return { services, customServices };
  },

  async saveConfig() {
    if (this.isSaving) return;

    const token = this.$("userToken")?.value?.trim();
    const channelId = this.$("bumpChannel")?.value;

    if (!token && !this.config?.configured) {
      Toast.error("Veuillez entrer votre token");
      return;
    }
    if (!channelId) {
      Toast.error("Veuillez sélectionner un salon");
      return;
    }

    const { services, customServices } = this.collectServicesConfig();
    const hasEnabledService = Object.values(services).some((s) => s.enabled) || customServices.some((s) => s.enabled);
    if (!hasEnabledService) {
      Toast.error("Veuillez activer au moins un service");
      return;
    }

    if (token && !this.isTokenVerified) {
      await this.verifyToken();
      if (!this.isTokenVerified) {
        Toast.error("Veuillez d'abord vérifier votre token");
        return;
      }
    }

    this.isSaving = true;

    try {
      await DashboardUtils.fetch(`/api/autobump/${this.guildId}`, {
        method: "POST",
        body: JSON.stringify({
          channelId,
          services,
          customServices,
          ...(token && { token }),
        }),
      });

      Toast.success("Configuration sauvegardée avec succès");

      // Clear auth fields
      const tokenField = this.$("userToken");
      if (tokenField) tokenField.value = "";
      this.hideTokenVerification();
      this.hide(this.$("authCard"));

      // Reload config
      await this.loadStatus();
      this.originalCustomServices = JSON.parse(JSON.stringify(this.customServices));
    } catch (error) {
      Toast.error(error.message || "Erreur lors de la sauvegarde");
    } finally {
      this.isSaving = false;
    }
  },

  async deleteConfig() {
    try {
      await DashboardUtils.fetch(`/api/autobump/${this.guildId}`, { method: "DELETE" });

      Toast.success("Configuration supprimée");
      this.config = null;
      this.customServices = [];
      await this.loadStatus();
    } catch (error) {
      const errorMessage = error?.message || error?.error || "Erreur lors de la suppression";
      Toast.error(errorMessage);
    }
  },

  // ── History Rendering ────────────────────────
  renderHistory(history) {
    const tbody = this.$("historyTableBody");
    if (!tbody) return;

    // Update count badge
    const countBadge = this.$("historyCount");
    if (countBadge && history.length > 0) {
      countBadge.textContent = `${history.length} entrées`;
      this.show(countBadge);
    }

    if (history.length === 0) {
      tbody.innerHTML = '<tr><td colspan="4" class="text-center text-muted">Aucun historique disponible</td></tr>';
      return;
    }

    tbody.innerHTML = history
      .map((item) => {
        const date = new Date(item.bumped_at * 1000);
        const formattedDate = date.toLocaleString("fr-FR", {
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        });

        const serviceName = this.availableServices.find((s) => s.id === item.service)?.name || item.service;
        const badgeClass = item.status === "success" ? "badge-success" : "badge-danger";
        const badgeText = item.status === "success" ? "Succès" : "Échec";
        const badgeIcon = item.status === "success" ? "check" : "x";

        return `
        <tr>
          <td>${formattedDate}</td>
          <td>${DashboardUtils.escapeHtml(serviceName)}</td>
          <td><span class="badge ${badgeClass} badge-sm"><i data-lucide="${badgeIcon}"></i> ${badgeText}</span></td>
          <td>${item.error_message ? DashboardUtils.escapeHtml(item.error_message) : '<span class="text-muted">—</span>'}</td>
        </tr>
      `;
      })
      .join("");

    DashboardUtils.refreshIcons(document.getElementById("historyTable"));
  },

  // ── Utilities ────────────────────────────────
  formatDuration(ms) {
    const hours = Math.floor(ms / 3600000);
    const minutes = Math.floor((ms % 3600000) / 60000);
    return minutes === 0 ? `${hours}h` : `${hours}h ${minutes}m`;
  },

  async testBumpService(serviceId, btnEl) {
    let serviceName = serviceId;
    if (serviceId.startsWith("custom_")) {
      const customIndex = parseInt(serviceId.replace("custom_", ""));
      serviceName = this.customServices[customIndex]?.name || `Custom ${customIndex}`;
    } else {
      const service = this.availableServices.find((s) => s.id === serviceId);
      serviceName = service?.name || serviceId;
    }

    const btnTest = btnEl || document.querySelector(`[data-service-id="${serviceId}"]`);
    if (!btnTest) return;
    const originalHTML = btnTest.innerHTML;

    try {
      btnTest.disabled = true;
      btnTest.innerHTML = '<div class="spinner spinner-sm"></div>';

      const response = await DashboardUtils.fetch(`/api/autobump/${this.guildId}/test`, {
        method: "POST",
        body: JSON.stringify({ service: serviceId }),
      });

      Toast.success(response.message || "Bump de test exécuté avec succès");
      await this.loadHistory();
    } catch (error) {
      Toast.error(error.message || "Erreur lors du test");
    } finally {
      btnTest.disabled = false;
      btnTest.innerHTML = originalHTML;
      DashboardUtils.refreshIcons(btnTest);
    }
  },
};

// ============================================
// INITIALIZATION
// ============================================
document.addEventListener("DOMContentLoaded", () => {
  AutoBump.init();
});
