/**
 * UnixBot Dashboard - Guild Settings
 * Gestion des paramètres du serveur
 */

// ============================================
// GUILD SETTINGS MANAGER
// ============================================
const GuildSettings = {
  form: null,
  guildId: null,

  init() {
    this.form = document.getElementById("settingsForm");
    if (!this.form) return;

    this.guildId = this.form.dataset.guildId;

    this.bindEvents();
    
    // Initialiser le gestionnaire de modifications non sauvegardées
    if (window.UnsavedChanges) {
      UnsavedChanges.init(this.form);
    }
  },

  bindEvents() {
    // Form submission
    this.form.addEventListener("submit", (e) => this.handleSubmit(e));

    // Inline validation on inputs
    this.form.querySelectorAll("input[maxlength], textarea[maxlength]").forEach((field) => {
      field.addEventListener("input", () => this.validateField(field));
    });
  },

  /**
   * Valide un champ et affiche un message d'éerreur inline si nécessaire.
   * @param {HTMLElement} field
   * @returns {boolean}
   */
  validateField(field) {
    const name = field.name;
    const value = field.value;
    let errorMsg = null;

    // Règles par champ
    if (name === "prefix") {
      if (!value.trim()) errorMsg = "Le préfixe ne peut pas être vide.";
      else if (value.length > 5) errorMsg = "5 caractères maximum.";
      else if (/\s/.test(value)) errorMsg = "Le préfixe ne doit pas contenir d'espace.";
    } else if (name === "giveaway_emoji") {
      if (!value.trim()) errorMsg = "L'emoji ne peut pas être vide.";
    } else if (name === "welcome_message") {
      if (value.length > 1024) errorMsg = "1024 caractères maximum.";
    }

    this.setFieldError(field, errorMsg);
    return !errorMsg;
  },

  setFieldError(field, message) {
    const group = field.closest(".form-group");
    if (!group) return;

    // Supprimer l'éerreur précédente
    const existing = group.querySelector(".form-error");
    if (existing) existing.remove();
    field.classList.remove("is-invalid", "is-valid");

    if (message) {
      field.classList.add("is-invalid");
      const errorDiv = document.createElement("div");
      errorDiv.className = "form-error";
      errorDiv.innerHTML = `<i data-lucide="alert-circle"></i><span>${DashboardUtils.escapeHtml(message)}</span>`;
      group.appendChild(errorDiv);
      DashboardUtils.refreshIcons(errorDiv);
    } else if (field.value.trim()) {
      field.classList.add("is-valid");
    }
  },

  async handleSubmit(e) {
    e.preventDefault();

    const submitBtn = this.form.querySelector('button[type="submit"]');
    const originalText = submitBtn.innerHTML;

    try {
      submitBtn.disabled = true;
      submitBtn.innerHTML =
        '<div class="spinner spinner-sm"></div> Sauvegarde...';

      // Validate all fields before submitting
      let isValid = true;
      this.form.querySelectorAll("input[maxlength], textarea[maxlength]").forEach((field) => {
        if (!this.validateField(field)) isValid = false;
      });

      if (!isValid) {
        Toast.error("Veuillez corriger les erreurs avant de sauvegarder.");
        return;
      }

      // Collect form data
      const formData = new FormData(this.form);
      const data = {};

      // Process form fields
      for (const [key, value] of formData.entries()) {
        data[key] = value;
      }

      // Handle checkboxes (they're not in FormData if unchecked)
      this.form.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
        data[cb.name] = cb.checked;
      });

      // Clean up empty string values for channel/role IDs
      [
        "welcome_channel_id",
        "goodbye_channel_id",
        "log_channel_id",
        "mod_log_channel_id",
        "logs_channel_id",
        "giveaway_channel_id",
        "bump_channel_id",
        "mute_role_id",
      ].forEach((key) => {
        if (data[key] === "") {
          data[key] = null;
        }
      });

      // Send to API
      await DashboardUtils.fetch(`/api/guilds/${this.guildId}/settings`, {
        method: "PUT",
        body: JSON.stringify(data),
      });

      // Notifier le gestionnaire de modifications
      if (window.UnsavedChanges) {
        UnsavedChanges.onSaveSuccess();
      }
      
      Toast.success("Paramètres sauvegardés avec succès !");
    } catch (error) {
      Toast.error(error.message || "Erreur lors de la sauvegarde");
    } finally {
      submitBtn.disabled = false;
      submitBtn.innerHTML = originalText;
    }
  },
};

// Initialize on DOM ready
document.addEventListener("DOMContentLoaded", () => {
  GuildSettings.init();
});

// Export for global access
window.GuildSettings = GuildSettings;
