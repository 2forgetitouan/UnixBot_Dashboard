/**
 * UnixBot Dashboard - Giveaways Management
 * Gestion des giveaways depuis le dashboard
 */

// ============================================
// GIVEAWAYS MANAGER
// ============================================

const GiveawaysManager = {
  giveaways: [],
  currentFilter: "active",
  timeUpdateInterval: null,
  guildId: null,
  _pendingConfirmAction: null,

  async init() {
    // Read guild ID from body data attribute (set by layout)
    this.guildId = document.body.dataset.guildId;
    if (!this.guildId) {
      console.error("GiveawaysManager: missing data-guild-id on body");
      return;
    }

    this.bindEvents();
    await this.loadGiveaways();
    this.startTimeUpdates();
  },

  bindEvents() {
    // Create giveaway buttons
    document.getElementById("createGiveawayBtn")
      ?.addEventListener("click", () => Modal.open("createModal"));
    document.getElementById("createFirstBtn")
      ?.addEventListener("click", () => Modal.open("createModal"));

    // Tab switching
    document.querySelectorAll(".tab").forEach((tab) => {
      tab.addEventListener("click", () => {
        this.currentFilter = tab.dataset.tab;
        document.querySelectorAll(".tab")
          .forEach((t) => t.classList.remove("active"));
        tab.classList.add("active");
        this.renderGiveaways();
      });
    });

    // Create form submission
    document.getElementById("createGiveawayForm")
      ?.addEventListener("submit", (e) => this.handleCreate(e));

    // Confirm modal action button
    document.getElementById("confirmActionBtn")
      ?.addEventListener("click", () => this.executeConfirmAction());

    // Card action delegation
    document.getElementById("giveawaysGrid")
      ?.addEventListener("click", (e) => {
        const btn = e.target.closest("[data-action]");
        if (!btn) return;

        const action = btn.dataset.action;
        const id = btn.dataset.id;

        if (action === "reroll") {
          this.showConfirm(
            "Relancer le tirage",
            "Un nouveau gagnant sera tiré au sort parmi les participants. L'ancien gagnant sera remplacé.",
            "Relancer",
            () => this.rerollGiveaway(id)
          );
        } else if (action === "delete") {
          this.showConfirm(
            "Supprimer le giveaway",
            "Cette action est irréversible. Le giveaway et toutes ses données seront supprimés.",
            "Supprimer",
            () => this.deleteGiveaway(id)
          );
        } else if (action === "participants") {
          this.showParticipants(id);
        } else if (action === "edit") {
          this.openEditModal(id);
        }
      });
  },

  // ── Confirmation modal ──────────────────────────
  showConfirm(title, message, actionText, callback) {
    document.getElementById("confirmTitle").textContent = title;
    document.getElementById("confirmMessage").textContent = message;
    document.getElementById("confirmActionText").textContent = actionText;
    this._pendingConfirmAction = callback;
    Modal.open("confirmModal");
  },

  executeConfirmAction() {
    if (this._pendingConfirmAction) {
      this._pendingConfirmAction();
      this._pendingConfirmAction = null;
    }
    Modal.close("confirmModal");
  },

  // ── Time updates ────────────────────────────────
  startTimeUpdates() {
    if (this.timeUpdateInterval) clearInterval(this.timeUpdateInterval);
    this.timeUpdateInterval = setInterval(() => this.updateAllTimes(), 1000);
  },

  updateAllTimes() {
    this.giveaways.forEach((giveaway) => {
      if (giveaway.status !== "active") return;
      const card = document.querySelector(`.giveaway-card[data-id="${giveaway.id}"]`);
      const timeEl = card?.querySelector(".giveaway-time .time-text");
      if (!timeEl) return;

      const timeLeft = new Date(giveaway.ends_at) - new Date();
      if (timeLeft <= 0) {
        timeEl.textContent = "Terminé";
        this.loadGiveaways();
      } else {
        timeEl.textContent = this.formatTimeLeft(timeLeft);
      }
    });
  },

  formatTimeLeft(ms) {
    if (ms <= 0) return "Terminé";
    const s = Math.floor((ms / 1000) % 60);
    const m = Math.floor((ms / (1000 * 60)) % 60);
    const h = Math.floor((ms / (1000 * 60 * 60)) % 24);
    const d = Math.floor(ms / (1000 * 60 * 60 * 24));

    if (d > 0) return `${d}j ${h}h ${m}m ${s}s`;
    if (h > 0) return `${h}h ${m}m ${s}s`;
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
  },

  formatDateShort(date) {
    const d = new Date(date);
    const day = d.getDate();
    const month = d.toLocaleDateString("fr-FR", { month: "long" });
    const hours = d.getHours().toString().padStart(2, "0");
    const minutes = d.getMinutes().toString().padStart(2, "0");
    return `${day} ${month} à ${hours}:${minutes}`;
  },

  // ── Data loading ────────────────────────────────
  async loadGiveaways() {
    const loadingState = document.getElementById("loadingState");
    const emptyState = document.getElementById("emptyState");
    const grid = document.getElementById("giveawaysGrid");

    try {
      loadingState?.classList.remove("hidden");
      emptyState?.classList.add("hidden");
      grid?.classList.add("hidden");

      const response = await DashboardUtils.fetch(
        `/api/guilds/${this.guildId}/giveaways`
      );

      this.giveaways = response.giveaways || [];

      // Update active tab count
      const activeCount = this.giveaways.filter((g) => g.status === "active").length;
      const el = document.getElementById("activeCount");
      if (el) el.textContent = activeCount;

      this.renderGiveaways();
    } catch (error) {
      console.error("Error loading giveaways:", error);
      Toast.error("Erreur lors du chargement des giveaways");
      loadingState?.classList.add("hidden");
      emptyState?.classList.remove("hidden");
    }
  },

  // ── Rendering ───────────────────────────────────
  renderGiveaways() {
    const loadingState = document.getElementById("loadingState");
    const emptyState = document.getElementById("emptyState");
    const grid = document.getElementById("giveawaysGrid");

    loadingState?.classList.add("hidden");

    let filtered = this.giveaways;
    if (this.currentFilter === "active") {
      filtered = this.giveaways.filter((g) => g.status === "active");
    } else if (this.currentFilter === "ended") {
      filtered = this.giveaways.filter((g) => g.status === "ended");
    }

    if (filtered.length === 0) {
      emptyState?.classList.remove("hidden");
      grid?.classList.add("hidden");
      if (grid) grid.innerHTML = "";
      return;
    }

    emptyState?.classList.add("hidden");
    grid?.classList.remove("hidden");

    if (grid) {
      grid.innerHTML = filtered.map((g) => this.renderCard(g)).join("");
      DashboardUtils.refreshIcons(grid);
    }
  },

  renderCard(giveaway) {
    const isActive = giveaway.status === "active";
    const timeLeft = new Date(giveaway.ends_at) - new Date();
    const timeText = isActive && timeLeft > 0 ? this.formatTimeLeft(timeLeft) : "Terminé";
    const dateText = this.formatDateShort(giveaway.ends_at);
    const statusClass = isActive ? "active" : "ended";
    const statusText = isActive ? "En cours" : "Terminé";

    const description = giveaway.description
      ? `<p class="giveaway-description">${DashboardUtils.escapeHtml(giveaway.description)}</p>`
      : "";

    let winnersHtml = "";
    if (!isActive && giveaway.winners && giveaway.winners.length > 0) {
      const badges = giveaway.winners.map((w) => {
        const name = w.display_name || w.username || `User ${w.user_id}`;
        return `<span class="winner-badge"><i data-lucide="trophy"></i> ${DashboardUtils.escapeHtml(name)}</span>`;
      }).join("");
      winnersHtml = `<div class="giveaway-winners-section">
        <span class="winners-label">Gagnant(s)</span>
        <div class="winners-list">${badges}</div>
      </div>`;
    }

    const actionsHtml = isActive
      ? `<button class="btn btn-icon btn-sm" data-action="edit" data-id="${giveaway.id}" title="Modifier">
           <i data-lucide="pencil"></i>
         </button>`
      : `<button class="btn btn-icon btn-sm" data-action="reroll" data-id="${giveaway.id}" title="Relancer">
           <i data-lucide="refresh-cw"></i>
         </button>`;

    return `
      <div class="giveaway-card ${statusClass}" data-id="${giveaway.id}">
        <div class="giveaway-card-header">
          <div class="giveaway-status ${statusClass}">
            <span class="status-dot"></span>
            <span>${statusText}</span>
          </div>
          <div class="giveaway-actions">
            ${actionsHtml}
            <button class="btn btn-icon btn-sm" data-action="participants" data-id="${giveaway.id}" title="Participants">
              <i data-lucide="users"></i>
            </button>
            <button class="btn btn-icon btn-sm btn-danger" data-action="delete" data-id="${giveaway.id}" title="Supprimer">
              <i data-lucide="trash-2"></i>
            </button>
          </div>
        </div>
        <div class="giveaway-card-body">
          <h3 class="giveaway-prize">${DashboardUtils.escapeHtml(giveaway.prize)}</h3>
          ${description}
          ${winnersHtml}
        </div>
        <div class="giveaway-card-footer">
          <div class="giveaway-stats">
            <div class="giveaway-stat">
              <i data-lucide="users"></i>
              <span>${giveaway.participants_count || 0} participants</span>
            </div>
            <div class="giveaway-stat">
              <i data-lucide="trophy"></i>
              <span>${giveaway.winners_count || 1} gagnant(s)</span>
            </div>
          </div>
          <div class="giveaway-timing">
            <div class="giveaway-time">
              <i data-lucide="clock"></i>
              <span class="time-text">${timeText}</span>
            </div>
            <div class="giveaway-enddate">${dateText}</div>
          </div>
        </div>
      </div>
    `;
  },

  // ── Create ──────────────────────────────────────
  async handleCreate(e) {
    e.preventDefault();

    const form = e.target;
    const submitBtn = form.querySelector('button[type="submit"]');
    const originalHtml = submitBtn.innerHTML;

    try {
      submitBtn.disabled = true;
      submitBtn.innerHTML = '<div class="spinner spinner-sm"></div>';

      const fd = new FormData(form);
      const data = {
        channel_id: fd.get("channelId"),
        prize: fd.get("prize"),
        description: fd.get("description") || undefined,
        duration: parseInt(fd.get("durationValue")),
        duration_unit: fd.get("durationUnit"),
        winners_count: parseInt(fd.get("winnersCount")) || 1,
      };

      if (!data.channel_id) throw new Error("Veuillez sélectionner un salon");
      if (!data.prize) throw new Error("Veuillez entrer un prix");
      if (!data.duration || data.duration < 1) throw new Error("Veuillez entrer une durée valide");

      await DashboardUtils.fetch(`/api/guilds/${this.guildId}/giveaways`, {
        method: "POST",
        body: JSON.stringify(data),
      });

      Toast.success("Giveaway créé avec succès !");
      Modal.close("createModal");
      form.reset();
      await this.loadGiveaways();
    } catch (error) {
      Toast.error(error.message || "Erreur lors de la création du giveaway");
    } finally {
      submitBtn.disabled = false;
      submitBtn.innerHTML = originalHtml;
    }
  },

  // ── Reroll ──────────────────────────────────────
  async rerollGiveaway(id) {
    try {
      await DashboardUtils.fetch(
        `/api/guilds/${this.guildId}/giveaways/${id}/reroll`,
        { method: "POST" }
      );
      Toast.success("Nouveau gagnant tiré au sort !");
      await this.loadGiveaways();
    } catch (error) {
      Toast.error(error.message || "Erreur lors du reroll");
    }
  },

  // ── Delete ──────────────────────────────────────
  async deleteGiveaway(id) {
    const card = document.querySelector(`.giveaway-card[data-id="${id}"]`);
    try {
      if (card) {
        card.classList.add("giveaway-card-removing");
      }

      await DashboardUtils.fetch(`/api/guilds/${this.guildId}/giveaways/${id}`, {
        method: "DELETE",
      });

      Toast.success("Giveaway supprimé");
      this.giveaways = this.giveaways.filter((g) => g.id !== parseInt(id));
      this.renderGiveaways();
    } catch (error) {
      if (card) card.classList.remove("giveaway-card-removing");
      Toast.error(error.message || "Erreur lors de la suppression");
    }
  },

  // ── Participants modal ──────────────────────────
  async showParticipants(id) {
    try {
      this.showInfoModal(
        "Participants",
        '<div class="modal-loading"><div class="spinner"></div><p>Chargement...</p></div>'
      );

      const response = await DashboardUtils.fetch(
        `/api/guilds/${this.guildId}/giveaways/${id}/participants`
      );

      const giveaway = this.giveaways.find((g) => g.id === parseInt(id));
      const participants = response.participants || [];

      let listHtml = "";
      if (participants.length === 0) {
        listHtml = '<p class="no-participants">Aucun participant pour le moment</p>';
      } else {
        listHtml = participants.map((p) => {
          const displayName = p.display_name || p.username || `User ${p.user_id}`;
          const avatar = p.avatar
            ? `<img src="${DashboardUtils.escapeHtml(p.avatar)}" alt="" class="participant-avatar">`
            : '<i data-lucide="user"></i>';
          const username = p.username && p.display_name !== p.username
            ? `<span class="participant-username">@${DashboardUtils.escapeHtml(p.username)}</span>`
            : "";
          return `
            <div class="participant-item">
              ${avatar}
              <div class="participant-info">
                <span class="participant-name">${DashboardUtils.escapeHtml(displayName)}</span>
                ${username}
              </div>
            </div>`;
        }).join("");
      }

      this.showInfoModal("Participants", `
        <div class="participants-modal">
          <h3>${DashboardUtils.escapeHtml(giveaway?.prize || "Giveaway")}</h3>
          <p class="participants-count">${participants.length} participant(s)</p>
          <div class="participants-list">${listHtml}</div>
        </div>
      `);
    } catch (error) {
      Toast.error(error.message || "Erreur lors du chargement des participants");
    }
  },

  showInfoModal(title, content) {
    const modalId = "infoModal";
    let modal = document.getElementById(modalId);

    if (!modal) {
      modal = document.createElement("div");
      modal.id = modalId;
      modal.className = "modal";
      document.body.appendChild(modal);
    }

    modal.innerHTML = `
      <div class="modal-backdrop" data-modal-close></div>
      <div class="modal-content modal-sm">
        <div class="modal-header">
          <h2 class="modal-title">${DashboardUtils.escapeHtml(title)}</h2>
          <button class="modal-close" data-modal-close>
            <i data-lucide="x"></i>
          </button>
        </div>
        <div class="modal-body">${content}</div>
      </div>
    `;

    // Bind close buttons on dynamic modal
    modal.querySelectorAll("[data-modal-close]").forEach((el) => {
      el.addEventListener("click", () => Modal.close(modalId));
    });

    Modal.open(modalId);
    DashboardUtils.refreshIcons(modal);
  },

  // ── Edit modal ──────────────────────────────────
  openEditModal(id) {
    const giveaway = this.giveaways.find((g) => g.id === parseInt(id));
    if (!giveaway) {
      Toast.error("Giveaway introuvable");
      return;
    }

    const modalId = "editModal";
    let modal = document.getElementById(modalId);

    if (!modal) {
      modal = document.createElement("div");
      modal.id = modalId;
      modal.className = "modal";
      document.body.appendChild(modal);
    }

    // Format end date for datetime-local input (Europe/Paris)
    const endDate = new Date(giveaway.ends_at);
    const formatter = new Intl.DateTimeFormat("fr-FR", {
      timeZone: "Europe/Paris",
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", hour12: false,
    });
    const parts = formatter.formatToParts(endDate);
    const v = (type) => parts.find((p) => p.type === type)?.value || "";
    const dateStr = `${v("year")}-${v("month")}-${v("day")}T${v("hour")}:${v("minute")}`;

    modal.innerHTML = `
      <div class="modal-backdrop" data-modal-close></div>
      <div class="modal-content">
        <div class="modal-header">
          <h2 class="modal-title">Modifier le giveaway</h2>
          <button class="modal-close" data-modal-close>
            <i data-lucide="x"></i>
          </button>
        </div>
        <form id="editGiveawayForm" data-giveaway-id="${id}">
          <div class="modal-body">
            <div class="form-group">
              <label for="editPrize">Lot</label>
              <input type="text" id="editPrize" name="prize" class="form-input"
                value="${DashboardUtils.escapeHtml(giveaway.prize)}" required>
            </div>
            <div class="form-group">
              <label for="editDescription">Description (optionnelle)</label>
              <textarea id="editDescription" name="description" class="form-textarea" rows="3"
                placeholder="Description du giveaway...">${DashboardUtils.escapeHtml(giveaway.description || "")}</textarea>
            </div>
            <div class="form-row">
              <div class="form-group">
                <label for="editWinners">Nombre de gagnants</label>
                <input type="number" id="editWinners" name="winners_count" class="form-input"
                  min="1" max="10" value="${giveaway.winners_count || 1}" required>
              </div>
              <div class="form-group">
                <label for="editEndTime">Date de fin</label>
                <input type="datetime-local" id="editEndTime" name="end_time" class="form-input"
                  value="${dateStr}" required>
              </div>
            </div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" data-modal-close>Annuler</button>
            <button type="submit" class="btn btn-primary">Enregistrer</button>
          </div>
        </form>
      </div>
    `;

    // Bind close + submit
    modal.querySelectorAll("[data-modal-close]").forEach((el) => {
      el.addEventListener("click", () => Modal.close(modalId));
    });
    document.getElementById("editGiveawayForm")
      .addEventListener("submit", (e) => this.handleEdit(e));

    Modal.open(modalId);
    DashboardUtils.refreshIcons(modal);
  },

  async handleEdit(e) {
    e.preventDefault();

    const form = e.target;
    const id = form.dataset.giveawayId;
    const submitBtn = form.querySelector('button[type="submit"]');
    const originalHtml = submitBtn.innerHTML;

    try {
      submitBtn.disabled = true;
      submitBtn.innerHTML = '<div class="spinner spinner-sm"></div>';

      const fd = new FormData(form);
      const data = {
        prize: fd.get("prize"),
        description: fd.get("description") || null,
        winners_count: parseInt(fd.get("winners_count")) || 1,
        end_time: new Date(fd.get("end_time")).toISOString(),
      };

      if (!data.prize) throw new Error("Veuillez entrer un lot");
      if (!data.end_time || new Date(data.end_time) < new Date()) {
        throw new Error("La date de fin doit être dans le futur");
      }

      await DashboardUtils.fetch(`/api/guilds/${this.guildId}/giveaways/${id}`, {
        method: "PUT",
        body: JSON.stringify(data),
      });

      Toast.success("Giveaway modifié avec succès !");
      Modal.close("editModal");
      await this.loadGiveaways();
    } catch (error) {
      Toast.error(error.message || "Erreur lors de la modification du giveaway");
    } finally {
      submitBtn.disabled = false;
      submitBtn.innerHTML = originalHtml;
    }
  },
};

// Initialize on DOM ready
document.addEventListener("DOMContentLoaded", () => {
  GiveawaysManager.init();
});

// Cleanup timer on page hide (SPA safety)
document.addEventListener("visibilitychange", () => {
  if (document.hidden && GiveawaysManager.timeUpdateInterval) {
    clearInterval(GiveawaysManager.timeUpdateInterval);
    GiveawaysManager.timeUpdateInterval = null;
  } else if (!document.hidden && GiveawaysManager.giveaways.some((g) => g.status === "active")) {
    GiveawaysManager.startTimeUpdates();
  }
});
