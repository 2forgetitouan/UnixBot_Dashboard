/**
 * UnixBot Dashboard - Messages Management
 * Gestion des messages depuis le dashboard avec aperçu Discord réaliste
 */

// ============================================
// MESSAGES MANAGER
// ============================================
const MessagesManager = {
  currentFormat: "simple",
  currentType: "channel",
  searchTimeout: null,
  members: [],
  guildId: null,

  async init() {
    this.guildId = document.body.dataset.guildId;
    if (!this.guildId) {
      console.error("MessagesManager: missing data-guild-id on body");
      return;
    }

    this.bindEvents();
    this.updatePreview();
    await this.loadHistory();
  },

  bindEvents() {
    // Message type radio buttons (channel vs DM)
    document.querySelectorAll('input[name="messageType"]').forEach((radio) => {
      radio.addEventListener("change", (e) => {
        this.currentType = e.target.value;
        this.toggleTypeFields();
      });
    });

    // Format radio buttons (simple vs embed)
    document.querySelectorAll('input[name="format"]').forEach((radio) => {
      radio.addEventListener("change", (e) => {
        this.currentFormat = e.target.value;
        this.toggleFormatFields();
        this.updatePreview();
      });
    });

    // Content changes for preview
    document.getElementById("content")?.addEventListener("input", () => {
      this.updateCharCount();
      this.updatePreview();
    });

    // Embed fields for preview
    ["embedTitle", "embedDescription", "embedColor", "embedFooter", "embedImage", "embedThumbnail"]
      .forEach((id) => {
        document.getElementById(id)?.addEventListener("input", () => this.updatePreview());
      });

    // Timestamp checkbox
    document.getElementById("embedTimestamp")
      ?.addEventListener("change", () => this.updatePreview());

    // User search for DMs
    const userSearch = document.getElementById("userSearch");
    if (userSearch) {
      userSearch.addEventListener("input", (e) => this.handleUserSearch(e.target.value));
      userSearch.addEventListener("focus", () => this.showSearchResults());
    }

    // Close search results on outside click
    document.addEventListener("click", (e) => {
      if (!e.target.closest(".user-search-container")) {
        this.hideSearchResults();
      }
    });

    // Form submission
    document.getElementById("sendMessageForm")
      ?.addEventListener("submit", (e) => this.handleSend(e));

    // Clear history → open confirm modal
    document.getElementById("clearHistoryBtn")
      ?.addEventListener("click", () => Modal.open("confirmClearModal"));

    // Confirm clear action
    document.getElementById("confirmClearBtn")
      ?.addEventListener("click", () => this.executeClearHistory());

    // Tab switching
    document.querySelectorAll(".tab").forEach((tab) => {
      tab.addEventListener("click", () => {
        const target = tab.dataset.tab;

        document.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
        tab.classList.add("active");

        document.querySelectorAll(".tab-content").forEach((c) => c.classList.remove("active"));

        if (target === "send") {
          document.getElementById("sendTab")?.classList.add("active");
        } else if (target === "history") {
          document.getElementById("historyTab")?.classList.add("active");
          this.loadHistory();
        }
      });
    });
  },

  toggleTypeFields() {
    const channelGroup = document.getElementById("channelGroup");
    const userGroup = document.getElementById("userGroup");

    if (this.currentType === "channel") {
      channelGroup?.classList.remove("hidden");
      userGroup?.classList.add("hidden");
    } else {
      channelGroup?.classList.add("hidden");
      userGroup?.classList.remove("hidden");
      if (this.members.length === 0) this.loadMembers();
    }
  },

  toggleFormatFields() {
    const simpleContent = document.getElementById("simpleContent");
    const embedBuilder = document.getElementById("embedBuilder");

    if (this.currentFormat === "simple") {
      simpleContent?.classList.remove("hidden");
      embedBuilder?.classList.add("hidden");
    } else {
      simpleContent?.classList.add("hidden");
      embedBuilder?.classList.remove("hidden");
    }
  },

  updateCharCount() {
    const content = document.getElementById("content");
    const countEl = document.getElementById("contentCount");
    if (content && countEl) countEl.textContent = content.value.length;
  },

  // ── Preview ─────────────────────────────────────
  updatePreview() {
    const previewContent = document.getElementById("previewContent");
    if (!previewContent) return;

    if (this.currentFormat === "simple") {
      const content = document.getElementById("content")?.value || "";
      previewContent.innerHTML = this.renderSimplePreview(content);
    } else {
      previewContent.innerHTML = this.renderEmbedPreview();
    }
  },

  renderSimplePreview(content) {
    if (!content.trim()) {
      return '<span class="preview-placeholder">Votre message apparaîtra ici...</span>';
    }
    return `<div class="preview-text">${this.formatDiscordMarkdown(content)}</div>`;
  },

  formatDiscordMarkdown(text) {
    let formatted = DashboardUtils.escapeHtml(text);

    // Code blocks ```
    formatted = formatted.replace(/```([\s\S]*?)```/g, '<pre class="code-block">$1</pre>');

    // Block quotes >>>
    formatted = formatted.replace(/^&gt;&gt;&gt; ([\s\S]+)/gm, '<div class="quote-block">$1</div>');

    // __***bold italic underline***__
    formatted = formatted.replace(/__\*\*\*(.*?)\*\*\*__/g, "<u><strong><em>$1</em></strong></u>");
    formatted = formatted.replace(/__\*\*(.*?)\*\*__/g, "<u><strong>$1</strong></u>");
    formatted = formatted.replace(/__\*(.*?)\*__/g, "<u><em>$1</em></u>");

    // ***bold italic***
    formatted = formatted.replace(/\*\*\*(.*?)\*\*\*/g, "<strong><em>$1</em></strong>");
    // **bold**
    formatted = formatted.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");
    // *italic* or _italic_
    formatted = formatted.replace(/\*(.*?)\*/g, "<em>$1</em>");
    formatted = formatted.replace(/\b_(.*?)_\b/g, "<em>$1</em>");
    // __underline__
    formatted = formatted.replace(/__(.*?)__/g, "<u>$1</u>");
    // ~~strikethrough~~
    formatted = formatted.replace(/~~(.*?)~~/g, "<s>$1</s>");

    // `inline code`
    formatted = formatted.replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>');

    // Masked links [text](url) — sanitize protocol to prevent javascript: XSS
    formatted = formatted.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (match, text, url) => {
      const safeUrl = /^(https?:\/\/|\/)/.test(url) ? url : '#';
      return `<a href="${safeUrl}" class="md-link" target="_blank" rel="noopener noreferrer">${text}</a>`;
    });

    // ||spoiler||
    formatted = formatted.replace(/\|\|(.*?)\|\|/g, '<span class="spoiler">$1</span>');

    // > single quote
    formatted = formatted.replace(/^&gt; (.+)$/gm, '<div class="quote">$1</div>');

    // Headings # ## ###
    formatted = formatted.replace(/^# (.+)$/gm, '<h1 class="md-h1">$1</h1>');
    formatted = formatted.replace(/^## (.+)$/gm, '<h2 class="md-h2">$1</h2>');
    formatted = formatted.replace(/^### (.+)$/gm, '<h3 class="md-h3">$1</h3>');

    // Sub-text -#
    formatted = formatted.replace(/^-# (.+)$/gm, '<div class="subtext">$1</div>');

    // Bullet lists
    formatted = formatted.replace(/^[\-\*] (.+)$/gm, '<li class="list-item">$1</li>');
    formatted = formatted.replace(/^ {1,3}[\-\*] (.+)$/gm, '<li class="list-item-indent">$1</li>');

    // Line breaks
    formatted = formatted.replace(/\n/g, "<br>");

    return formatted;
  },

  renderEmbedPreview() {
    const title = document.getElementById("embedTitle")?.value || "";
    const description = document.getElementById("embedDescription")?.value || "";
    const color = document.getElementById("embedColor")?.value || "#5865F2";
    const footer = document.getElementById("embedFooter")?.value || "";
    const image = document.getElementById("embedImage")?.value || "";
    const thumbnail = document.getElementById("embedThumbnail")?.value || "";
    const timestamp = document.getElementById("embedTimestamp")?.checked || false;

    if (!title && !description) {
      return '<span class="preview-placeholder">Configurez votre embed...</span>';
    }

    const safeColor = /^#[0-9a-fA-F]{3,8}$/.test(color) ? color : '#5865F2';
    let html = `<div class="preview-embed" style="border-left-color: ${safeColor}">`;

    if (thumbnail) {
      html += `<img src="${DashboardUtils.escapeHtml(thumbnail)}" class="preview-embed-thumbnail" alt="" onerror="this.style.display='none'">`;
    }
    if (title) {
      html += `<div class="preview-embed-title">${DashboardUtils.escapeHtml(title)}</div>`;
    }
    if (description) {
      html += `<div class="preview-embed-description">${this.formatDiscordMarkdown(description)}</div>`;
    }
    if (image) {
      html += `<img src="${DashboardUtils.escapeHtml(image)}" class="preview-embed-image" alt="" onerror="this.style.display='none'">`;
    }
    if (footer || timestamp) {
      html += '<div class="preview-embed-footer">';
      if (footer) html += `<span>${DashboardUtils.escapeHtml(footer)}</span>`;
      if (footer && timestamp) html += " • ";
      if (timestamp) html += `<span>${new Date().toLocaleString("fr-FR")}</span>`;
      html += "</div>";
    }

    html += "</div>";
    return html;
  },

  // ── Members / DM search ─────────────────────────
  async loadMembers() {
    try {
      const response = await DashboardUtils.fetch(`/api/guilds/${this.guildId}/members`);
      this.members = response.members || [];
    } catch (error) {
      console.error("Error loading members:", error);
      this.members = [];
    }
  },

  handleUserSearch(query) {
    clearTimeout(this.searchTimeout);
    if (!query.trim()) { this.hideSearchResults(); return; }
    this.searchTimeout = setTimeout(() => this.searchUsers(query), 300);
  },

  async searchUsers(query) {
    const resultsContainer = document.getElementById("userSearchResults");
    if (!resultsContainer) return;

    try {
      const response = await DashboardUtils.fetch(
        `/api/guilds/${this.guildId}/members/search?q=${encodeURIComponent(query)}`
      );
      this.renderSearchResults(response.members || []);
    } catch {
      const filtered = this.members
        .filter((m) =>
          m.username?.toLowerCase().includes(query.toLowerCase()) ||
          m.displayName?.toLowerCase().includes(query.toLowerCase())
        ).slice(0, 10);
      this.renderSearchResults(filtered);
    }
  },

  renderSearchResults(members) {
    const resultsContainer = document.getElementById("userSearchResults");
    if (!resultsContainer) return;

    if (members.length === 0) {
      resultsContainer.innerHTML = '<div class="user-search-empty">Aucun utilisateur trouvé</div>';
      this.showSearchResults();
      return;
    }

    resultsContainer.innerHTML = members.map((member) => `
      <div class="user-search-item" data-id="${DashboardUtils.escapeHtml(member.id)}" data-name="${DashboardUtils.escapeHtml(member.displayName || member.username)}">
        <img src="${DashboardUtils.escapeHtml(member.avatarUrl || 'https://cdn.discordapp.com/embed/avatars/0.png')}" alt="" class="user-search-avatar">
        <div class="user-search-info">
          <span class="user-search-name">${DashboardUtils.escapeHtml(member.displayName || member.username)}</span>
          <span class="user-search-tag">@${DashboardUtils.escapeHtml(member.username)}</span>
        </div>
      </div>
    `).join("");

    resultsContainer.querySelectorAll(".user-search-item").forEach((item) => {
      item.addEventListener("click", () => {
        document.getElementById("targetUserId").value = item.dataset.id;
        document.getElementById("userSearch").value = item.dataset.name;
        this.hideSearchResults();
      });
    });

    this.showSearchResults();
  },

  showSearchResults() {
    const c = document.getElementById("userSearchResults");
    if (c && c.innerHTML) c.classList.add("active");
  },

  hideSearchResults() {
    document.getElementById("userSearchResults")?.classList.remove("active");
  },

  // ── Send message ────────────────────────────────
  async handleSend(e) {
    e.preventDefault();

    const form = e.target;
    const submitBtn = form.querySelector('button[type="submit"]');
    const originalHtml = submitBtn.innerHTML;

    try {
      submitBtn.disabled = true;
      submitBtn.innerHTML = '<div class="spinner spinner-sm"></div> <span>Envoi...</span>';

      let endpoint = `/api/guilds/${this.guildId}/messages`;
      const data = {};

      if (this.currentType === "dm") {
        endpoint = `/api/guilds/${this.guildId}/messages/dm`;
        const targetUserId = document.getElementById("targetUserId")?.value;
        if (!targetUserId) throw new Error("Veuillez sélectionner un utilisateur");
        data.user_id = targetUserId;
      } else {
        const channelId = document.getElementById("channelId")?.value;
        if (!channelId) throw new Error("Veuillez sélectionner un salon");
        data.channel_id = channelId;
      }

      if (this.currentFormat === "simple") {
        const content = document.getElementById("content")?.value;
        if (!content?.trim()) throw new Error("Veuillez entrer un message");
        data.content = content;
      } else {
        const colorHex = document.getElementById("embedColor")?.value;
        const footerText = document.getElementById("embedFooter")?.value;

        const embed = {
          title: document.getElementById("embedTitle")?.value || undefined,
          description: document.getElementById("embedDescription")?.value || undefined,
          color: colorHex ? parseInt(colorHex.replace("#", ""), 16) : undefined,
          footer: footerText ? { text: footerText } : undefined,
          image: document.getElementById("embedImage")?.value
            ? { url: document.getElementById("embedImage").value } : undefined,
          thumbnail: document.getElementById("embedThumbnail")?.value
            ? { url: document.getElementById("embedThumbnail").value } : undefined,
          timestamp: document.getElementById("embedTimestamp")?.checked
            ? new Date().toISOString() : undefined,
        };

        Object.keys(embed).forEach((key) => {
          if (embed[key] === undefined) delete embed[key];
        });

        if (!embed.title && !embed.description) {
          throw new Error("L'embed doit avoir au moins un titre ou une description");
        }

        data.embed = embed;
      }

      await DashboardUtils.fetch(endpoint, {
        method: "POST",
        body: JSON.stringify(data),
      });

      Toast.success("Message envoyé avec succès !");

      // Reset form fields
      document.getElementById("content").value = "";
      document.getElementById("contentCount").textContent = "0";
      document.getElementById("embedTitle").value = "";
      document.getElementById("embedDescription").value = "";
      document.getElementById("embedFooter").value = "";
      document.getElementById("embedImage").value = "";
      document.getElementById("embedThumbnail").value = "";
      document.getElementById("userSearch").value = "";
      document.getElementById("targetUserId").value = "";
      this.updatePreview();
    } catch (error) {
      Toast.error(error.message || "Erreur lors de l'envoi du message");
    } finally {
      submitBtn.disabled = false;
      submitBtn.innerHTML = originalHtml;
    }
  },

  // ── History ─────────────────────────────────────
  async loadHistory() {
    const loadingEl = document.getElementById("historyLoading");
    const emptyEl = document.getElementById("historyEmpty");
    const wrapperEl = document.getElementById("historyTableWrapper");
    const bodyEl = document.getElementById("historyBody");
    const clearBtn = document.getElementById("clearHistoryBtn");

    try {
      loadingEl?.classList.remove("hidden");
      emptyEl?.classList.add("hidden");
      wrapperEl?.classList.add("hidden");

      const response = await DashboardUtils.fetch(`/api/guilds/${this.guildId}/messages`);
      const messages = response.messages || [];

      loadingEl?.classList.add("hidden");

      if (messages.length === 0) {
        emptyEl?.classList.remove("hidden");
        clearBtn?.classList.add("hidden");
        return;
      }

      wrapperEl?.classList.remove("hidden");
      clearBtn?.classList.remove("hidden");

      if (bodyEl) {
        bodyEl.innerHTML = messages.map((msg) => `
          <tr>
            <td data-label="Type">
              <span class="badge ${msg.type === "dm" ? "badge-warning" : "badge-primary"}">
                ${msg.type === "dm" ? "DM" : "Salon"}
              </span>
            </td>
            <td data-label="Destination">${DashboardUtils.escapeHtml(msg.destination || "N/A")}</td>
            <td data-label="Contenu" class="truncate">${DashboardUtils.escapeHtml(msg.content || "[Embed]")}</td>
            <td data-label="Statut">
              <span class="badge ${msg.status === "sent" ? "badge-success" : "badge-danger"}">
                ${msg.status === "sent" ? "Envoyé" : "Échec"}
              </span>
            </td>
            <td data-label="Date" class="text-nowrap">${msg.sent_at ? new Date(msg.sent_at * 1000).toLocaleString("fr-FR") : "N/A"}</td>
          </tr>
        `).join("");
      }
    } catch (error) {
      console.error("Error loading history:", error);
      loadingEl?.classList.add("hidden");
      emptyEl?.classList.remove("hidden");
      clearBtn?.classList.add("hidden");
    }
  },

  async executeClearHistory() {
    const btn = document.getElementById("confirmClearBtn");
    const originalHtml = btn.innerHTML;

    try {
      btn.disabled = true;
      btn.innerHTML = '<div class="spinner spinner-sm"></div>';

      await DashboardUtils.fetch(`/api/guilds/${this.guildId}/messages`, {
        method: "DELETE",
      });

      Toast.success("Historique vidé avec succès");
      Modal.close("confirmClearModal");
      await this.loadHistory();
    } catch (error) {
      Toast.error(error.message || "Erreur lors de la suppression de l'historique");
    } finally {
      btn.disabled = false;
      btn.innerHTML = originalHtml;
      DashboardUtils.refreshIcons(btn);
    }
  },
};

// Initialize on DOM ready
document.addEventListener("DOMContentLoaded", () => {
  MessagesManager.init();
});
