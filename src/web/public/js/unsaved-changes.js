/**
 * UnixBot Dashboard - Unsaved Changes Manager
 * Système de détection et notification des modifications non sauvegardées
 * Style Discord avec barre flottante en bas de l'écran
 */

const UnsavedChanges = {
  // État
  originalData: {},
  currentData: {},
  isShowing: false,
  isSaving: false, // État de sauvegarde en cours
  form: null,
  bar: null,
  
  // Configuration
  config: {
    debounceDelay: 300,
    animationDuration: 200,
  },

  /**
   * Initialiser le gestionnaire
   * @param {HTMLFormElement} form - Le formulaire à surveiller
   */
  init(form) {
    if (!form) return;

    this.form = form;
    this.createBar();
    this.captureOriginalData();
    this.bindEvents();
  },

  /**
   * Créer la barre de notification
   */
  createBar() {
    // Supprimer l'ancienne barre si elle existe
    const existing = document.getElementById('unsaved-changes-bar');
    if (existing) existing.remove();

    // Créer la barre
    this.bar = document.createElement('div');
    this.bar.id = 'unsaved-changes-bar';
    this.bar.className = 'unsaved-changes-bar';
    this.bar.innerHTML = `
      <div class="unsaved-changes-content">
        <div class="unsaved-changes-text">
          <span class="unsaved-changes-label">Attention —</span>
          <span class="unsaved-changes-message">vous avez des modifications non sauvegardées !</span>
        </div>
        <div class="unsaved-changes-actions">
          <button type="button" class="btn-unsaved-reset" id="resetChangesBtn">
            Réinitialiser
          </button>
          <button type="button" class="btn-unsaved-save" id="saveChangesBtn">
            Enregistrer les modifications
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(this.bar);

    // Bind actions
    const resetBtn = this.bar.querySelector('#resetChangesBtn');
    const saveBtn = this.bar.querySelector('#saveChangesBtn');

    resetBtn.addEventListener('click', () => this.reset());
    saveBtn.addEventListener('click', () => this.save());
  },

  /**
   * Capturer les données originales du formulaire
   */
  captureOriginalData() {
    this.originalData = this.getFormData();
    this.currentData = { ...this.originalData };
    // Ne pas appeler checkChanges ici car ça pourrait réafficher la barre
  },

  /**
   * Récupérer les données du formulaire
   * @returns {Object} Les données du formulaire
   */
  getFormData() {
    const data = {};
    const formData = new FormData(this.form);

    // Récupérer les valeurs des champs
    for (const [key, value] of formData.entries()) {
      data[key] = value;
    }

    // Gérer les checkboxes (non présentes dans FormData si décoché)
    this.form.querySelectorAll('input[type="checkbox"]').forEach((checkbox) => {
      data[checkbox.name] = checkbox.checked;
    });

    return data;
  },

  /**
   * Comparer deux objets de données
   * @param {Object} obj1 
   * @param {Object} obj2 
   * @returns {boolean}
   */
  isEqual(obj1, obj2) {
    const keys1 = Object.keys(obj1);
    const keys2 = Object.keys(obj2);

    if (keys1.length !== keys2.length) return false;

    for (const key of keys1) {
      if (obj1[key] !== obj2[key]) return false;
    }

    return true;
  },

  /**
   * Vérifier si le formulaire a changé
   * @returns {boolean}
   */
  hasChanges() {
    this.currentData = this.getFormData();
    return !this.isEqual(this.originalData, this.currentData);
  },

  /**
   * Afficher la barre
   */
  show() {
    // Ne pas afficher pendant une sauvegarde
    if (this.isSaving) return;
    if (this.isShowing) return;
    
    this.isShowing = true;
    this.bar.classList.add('visible');
  },

  /**
   * Masquer la barre
   */
  hide() {
    if (!this.isShowing) return;
    
    this.isShowing = false;
    this.isSaving = false;
    this.bar.classList.remove('visible', 'saving');
  },

  /**
   * Animer la barre (shake) pour bloquer la navigation
   */
  shake() {
    this.bar.classList.add('shake');
    setTimeout(() => {
      this.bar.classList.remove('shake');
    }, 500);
  },

  /**
   * Vérifier et mettre à jour l'affichage
   */
  checkChanges() {
    // Ne pas interférer pendant une sauvegarde
    if (this.isSaving) return;
    
    if (this.hasChanges()) {
      this.show();
    } else {
      this.hide();
    }
  },

  /**
   * Réinitialiser le formulaire aux valeurs originales
   */
  reset() {
    // Restaurer les valeurs
    for (const [key, value] of Object.entries(this.originalData)) {
      const field = this.form.elements[key];
      
      if (!field) continue;

      if (field.type === 'checkbox') {
        field.checked = value;
      } else if (field.type === 'radio') {
        this.form.querySelectorAll(`input[name="${key}"]`).forEach((radio) => {
          radio.checked = radio.value === value;
        });
      } else {
        field.value = value;
      }
    }

    // Masquer la barre
    this.hide();

    // Toast de confirmation
    Toast.info('Modifications annulées');
  },

  /**
   * Sauvegarder le formulaire
   */
  save() {
    // Pour la page autobump, utiliser directement la méthode dédiée
    if (window.AutoBump && typeof window.AutoBump.saveConfig === 'function') {
      window.AutoBump.saveConfig();
    } else {
      // Déclencher la soumission du formulaire pour les autres pages
      if (this.form.requestSubmit) {
        this.form.requestSubmit();
      } else {
        // Fallback pour navigateurs plus anciens
        this.form.dispatchEvent(new Event('submit', { cancelable: true }));
      }
    }
  },

  /**
   * Notification de succès après sauvegarde
   */
  onSaveSuccess() {
    this.captureOriginalData();
    this.hide();
  },

  /**
   * Lier les événements
   */
  bindEvents() {
    let debounceTimer;

    // Surveiller les changements sur tous les champs
    const fields = this.form.querySelectorAll('input, select, textarea');
    
    fields.forEach((field) => {
      // Pour les inputs/textareas, utiliser 'input' pour une détection en temps réel
      field.addEventListener('input', () => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
          this.checkChanges();
        }, this.config.debounceDelay);
      });

      // Pour les selects et checkboxes, utiliser 'change'
      field.addEventListener('change', () => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
          this.checkChanges();
        }, this.config.debounceDelay);
      });
    });

    // NOTE: La soumission du formulaire est gérée par le code appelant (ex: autobump.js)
    // On ne fait PAS de onSaveSuccess() automatique ici car la sauvegarde est async

    // Popup de confirmation avant de quitter si modifications non sauvegardées
    this._beforeUnloadHandler = (e) => {
      if (this.hasChanges()) {
        e.preventDefault();
        e.returnValue = 'Vous avez des modifications non sauvegardées. Voulez-vous vraiment quitter ?';
        return e.returnValue;
      }
    };
    window.addEventListener('beforeunload', this._beforeUnloadHandler);

    // Navigation interne (détection des clics sur liens) - bloquer avec animation
    this._navGuardHandler = (e) => {
      const link = e.target.closest('a');
      
      if (link && link.href && !link.target && this.hasChanges()) {
        const isExternal = link.hostname !== window.location.hostname;
        const isSamePage = link.href === window.location.href;
        const isAnchor = link.href.includes('#') && link.href.split('#')[0] === window.location.href.split('#')[0];
        
        // Ne bloquer que pour les liens internes (même domaine)
        if (!isExternal && !isSamePage && !isAnchor) {
          e.preventDefault();
          e.stopPropagation();
          
          // Animation shake pour indiquer le blocage
          this.shake();
        }
      }
    };
    document.addEventListener('click', this._navGuardHandler, true); // Use capture phase
  },

  /**
   * Détruire le gestionnaire
   */
  destroy() {
    if (this._beforeUnloadHandler) {
      window.removeEventListener('beforeunload', this._beforeUnloadHandler);
      this._beforeUnloadHandler = null;
    }
    if (this._navGuardHandler) {
      document.removeEventListener('click', this._navGuardHandler, true);
      this._navGuardHandler = null;
    }

    if (this.bar) {
      this.bar.remove();
      this.bar = null;
    }
    
    this.isShowing = false;
  },
};

// Export pour utilisation globale
window.UnsavedChanges = UnsavedChanges;
