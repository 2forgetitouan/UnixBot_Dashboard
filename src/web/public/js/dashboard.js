/**
 * UnixBot Dashboard - JavaScript
 * Gestion des interactions frontend du dashboard
 */

// ============================================
// UTILITIES
// ============================================
const DashboardUtils = {
  /**
   * Escape HTML pour éviter les injections XSS
   */
  escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  },

  /**
   * Debounce function
   */
  debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout);
        func(...args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  },

  /**
   * Rafraîchir les icônes Lucide — scopé à un conteneur si fourni.
   * Évite de re-scanner tout le DOM à chaque render partiel.
   * @param {Element} [container] - Conteneur à cibler (par défaut: document)
   */
  refreshIcons(container) {
    if (!window.lucide) return;
    if (container) {
      lucide.createIcons({ nodes: container.querySelectorAll("[data-lucide]") });
    } else {
      lucide.createIcons();
    }
  },

  /**
   * Fetch wrapper avec gestion d'erreurs
   */
  async fetch(url, options = {}) {
    try {
      const response = await fetch(url, {
        ...options,
        headers: {
          "Content-Type": "application/json",
          ...options.headers,
        },
        credentials: "include",
      });

      const data = await response.json();

      if (!response.ok) {
        const errorMsg = data.error || data.message || "Une erreur est survenue";
        const error = new Error(errorMsg);
        error.status = response.status;
        error.data = data;
        throw error;
      }

      return data;
    } catch (error) {
      console.error("API Error:", error);
      throw error;
    }
  },
};

// ============================================
// TOAST NOTIFICATIONS
// ============================================
const Toast = {
  container: null,

  init() {
    this.container = document.getElementById("toastContainer");
    if (!this.container) {
      this.container = document.createElement("div");
      this.container.id = "toastContainer";
      this.container.className = "toast-container";
      document.body.appendChild(this.container);
    }
  },

  show(message, type = "success", duration = 4000) {
    if (!this.container) this.init();

    // Convertir le message en string proprement
    let displayMessage = "";
    if (typeof message === 'string') {
      displayMessage = message;
    } else if (message instanceof Error) {
      displayMessage = message.message;
    } else if (typeof message === 'object' && message !== null) {
      displayMessage = message.message || message.error || JSON.stringify(message);
    } else {
      displayMessage = String(message);
    }

    const toast = document.createElement("div");
    toast.className = `toast ${type}`;

    const iconName =
      type === "success"
        ? "check-circle"
        : type === "error"
        ? "x-circle"
        : "alert-triangle";

    toast.innerHTML = `
      <i data-lucide="${iconName}"></i>
      <span>${DashboardUtils.escapeHtml(displayMessage)}</span>
    `;

    this.container.appendChild(toast);

    // Rafraîchir les icônes du toast uniquement
    DashboardUtils.refreshIcons(toast);

    setTimeout(() => {
      toast.classList.add('removing');
      setTimeout(() => toast.remove(), 250);
    }, duration);
  },

  success(message) {
    this.show(message, "success");
  },

  error(message) {
    this.show(message, "error");
  },

  warning(message) {
    this.show(message, "warning");
  },
};

// ============================================
// MODAL MANAGER
// ============================================
const Modal = {
  open(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
      modal.classList.add("active");
      document.body.style.overflow = "hidden";
    }
  },

  close(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
      modal.classList.remove("active");
      document.body.style.overflow = "";
    }
  },

  closeAll() {
    document.querySelectorAll(".modal.active").forEach((modal) => {
      modal.classList.remove("active");
    });
    document.body.style.overflow = "";
  },

  init() {
    // Close on backdrop click
    document.querySelectorAll(".modal-backdrop").forEach((backdrop) => {
      backdrop.addEventListener("click", () => Modal.closeAll());
    });

    // Close buttons
    document
      .querySelectorAll(".modal-close, [data-modal-close]")
      .forEach((btn) => {
        btn.addEventListener("click", () => Modal.closeAll());
      });

    // Open buttons
    document.querySelectorAll("[data-modal-open]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const modalId = btn.dataset.modalOpen;
        Modal.open(modalId);
      });
    });

    // Escape key
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        Modal.closeAll();
      }
    });
  },
};

// ============================================
// SIDEBAR MANAGER
// ============================================
const Sidebar = {
  STORAGE_KEY: 'unixbot_sidebar_collapsed',
  SWIPE_THRESHOLD: 60,
  sidebar: null,
  backdrop: null,
  mobileMenuBtn: null,
  collapseBtn: null,
  sidebarCloseBtn: null,
  _touchStartX: 0,
  _touchStartY: 0,
  _touchTracking: false,

  init() {
    this.sidebar = document.querySelector('.sidebar');
    this.backdrop = document.getElementById('sidebarBackdrop');
    this.mobileMenuBtn = document.getElementById('mobileMenuToggle');
    this.collapseBtn = document.getElementById('sidebarCollapseBtn');
    this.sidebarCloseBtn = document.querySelector('.sidebar-toggle');

    if (!this.sidebar) return;

    // Restore collapsed state from localStorage (desktop only)
    if (window.innerWidth > 1024 && localStorage.getItem(this.STORAGE_KEY) === '1') {
      this.sidebar.classList.add('collapsed');
      this._updateCollapseLabel();
    }

    // Mobile open
    this.mobileMenuBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.openMobile();
    });

    // Mobile close (X button)
    this.sidebarCloseBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.closeMobile();
    });

    // Backdrop close
    this.backdrop?.addEventListener('click', () => this.closeMobile());

    // Desktop collapse toggle
    this.collapseBtn?.addEventListener('click', () => this.toggleCollapse());

    // Close mobile sidebar on outside click
    document.addEventListener('click', (e) => {
      if (this.sidebar.classList.contains('open') &&
          !this.sidebar.contains(e.target) &&
          !this.mobileMenuBtn?.contains(e.target)) {
        this.closeMobile();
      }
    });

    // Keyboard: Escape closes mobile sidebar
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.sidebar.classList.contains('open')) {
        this.closeMobile();
      }
    });

    // Touch swipe support
    this._initSwipe();

    // Resize: if going from mobile to desktop, clean up mobile state
    window.addEventListener('resize', DashboardUtils.debounce(() => {
      if (window.innerWidth > 1024 && this.sidebar.classList.contains('open')) {
        this.closeMobile();
      }
    }, 150));
  },

  openMobile() {
    this.sidebar?.classList.add('open');
    this.backdrop?.classList.add('active');
    document.body.style.overflow = 'hidden';
  },

  closeMobile() {
    this.sidebar?.classList.remove('open');
    this.backdrop?.classList.remove('active');
    document.body.style.overflow = '';
  },

  toggleCollapse() {
    if (!this.sidebar) return;
    const willCollapse = !this.sidebar.classList.contains('collapsed');
    this.sidebar.classList.toggle('collapsed', willCollapse);
    localStorage.setItem(this.STORAGE_KEY, willCollapse ? '1' : '0');
    this._updateCollapseLabel();
  },

  _updateCollapseLabel() {
    const label = this.collapseBtn?.querySelector('.collapse-label');
    if (label) {
      const isCollapsed = this.sidebar?.classList.contains('collapsed');
      label.textContent = isCollapsed ? 'Étendre' : 'Réduire';
    }
  },

  /* ── Swipe handling (mobile) ── */
  _initSwipe() {
    // Swipe right from left edge → open sidebar
    document.addEventListener('touchstart', (e) => {
      if (window.innerWidth > 1024) return;
      const touch = e.touches[0];
      // Only track if starting from left 25px edge (when closed)
      // or anywhere on sidebar (when open for closing swipe)
      if (!this.sidebar.classList.contains('open') && touch.clientX <= 25) {
        this._touchStartX = touch.clientX;
        this._touchStartY = touch.clientY;
        this._touchTracking = true;
      } else if (this.sidebar.classList.contains('open')) {
        this._touchStartX = touch.clientX;
        this._touchStartY = touch.clientY;
        this._touchTracking = true;
      }
    }, { passive: true });

    document.addEventListener('touchend', (e) => {
      if (!this._touchTracking) return;
      this._touchTracking = false;

      const touch = e.changedTouches[0];
      const deltaX = touch.clientX - this._touchStartX;
      const deltaY = Math.abs(touch.clientY - this._touchStartY);

      // Vertical scroll dominates → ignore
      if (deltaY > Math.abs(deltaX)) return;

      if (!this.sidebar.classList.contains('open') && deltaX > this.SWIPE_THRESHOLD) {
        // Swipe right → open
        this.openMobile();
      } else if (this.sidebar.classList.contains('open') && deltaX < -this.SWIPE_THRESHOLD) {
        // Swipe left → close
        this.closeMobile();
      }
    }, { passive: true });
  },
};

// ============================================
// TABS MANAGER
// ============================================
const Tabs = {
  init() {
    document.querySelectorAll(".tabs").forEach((tabContainer) => {
      const tabs = tabContainer.querySelectorAll(".tab");
      const contents =
        tabContainer.parentElement.querySelectorAll(".tab-content");

      tabs.forEach((tab) => {
        tab.addEventListener("click", () => {
          const target = tab.dataset.tab;

          // Update tabs
          tabs.forEach((t) => {
            t.classList.remove("active");
            t.setAttribute("aria-selected", "false");
          });
          tab.classList.add("active");
          tab.setAttribute("aria-selected", "true");

          // Update contents
          contents.forEach((content) => {
            content.classList.toggle("active", content.id === target);
          });
        });
      });
    });
  },
};

// ============================================
// INITIALIZATION
// ============================================
document.addEventListener("DOMContentLoaded", () => {
  Toast.init();
  Modal.init();
  Sidebar.init();
  Tabs.init();
});

// Export pour utilisation externe
window.Toast = Toast;
window.Modal = Modal;
window.Sidebar = Sidebar;
window.DashboardUtils = DashboardUtils;
