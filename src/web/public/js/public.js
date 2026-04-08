/**
 * UnixBot — Public pages JavaScript
 * Shared logic for all public (non-dashboard) pages.
 *
 * Features:
 *   - Sticky header scroll effect
 *   - Mobile hamburger menu
 *   - OAuth popup helper
 *   - Scroll animations (Intersection Observer)
 *   - Smooth scroll for anchor links
 *   - Active nav link highlight
 *
 * Compatible with SPA router (spa-router.js):
 *   - Functions are idempotent and can be called on new content.
 *   - No duplicate listeners on global elements (header, hamburger).
 */

(function () {
  'use strict';

  // ============================================
  // STICKY HEADER
  // ============================================
  var header = document.getElementById('siteHeader');
  if (header) {
    var onScroll = function () {
      header.classList.toggle('scrolled', window.scrollY > 20);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }

  // ============================================
  // MOBILE MENU
  // ============================================
  var hamburger = document.getElementById('navHamburger');
  var mobileMenu = document.getElementById('mobileMenu');

  if (hamburger && mobileMenu) {
    hamburger.addEventListener('click', function () {
      var isOpen = mobileMenu.classList.toggle('open');
      hamburger.classList.toggle('open', isOpen);
      hamburger.setAttribute('aria-expanded', String(isOpen));
      document.body.style.overflow = isOpen ? 'hidden' : '';
    });

    // Close on link click
    mobileMenu.addEventListener('click', function (e) {
      var link = e.target.closest('a');
      if (link) {
        mobileMenu.classList.remove('open');
        hamburger.classList.remove('open');
        hamburger.setAttribute('aria-expanded', 'false');
        document.body.style.overflow = '';
      }
    });

    // Close on escape
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && mobileMenu.classList.contains('open')) {
        mobileMenu.classList.remove('open');
        hamburger.classList.remove('open');
        hamburger.setAttribute('aria-expanded', 'false');
        document.body.style.overflow = '';
      }
    });
  }

  // ============================================
  // OAUTH POPUP
  // ============================================
  function openOAuthPopup(url) {
    var w = 500, h = 700;
    var left = Math.round((screen.width  - w) / 2) + (window.screenX || 0);
    var top  = Math.round((screen.height - h) / 2) + (window.screenY || 0);

    var popup = window.open(
      url,
      'UnixBotOAuth',
      'width=' + w + ',height=' + h + ',left=' + left + ',top=' + top +
      ',toolbar=no,location=no,status=no,menubar=no,scrollbars=yes,resizable=yes'
    );

    if (!popup) {
      // Popup bloquée → redirection directe de la fenêtre courante
      window.location.href = url + (url.indexOf('?') !== -1 ? '&' : '?') + 'redirect=%2Fdashboard%2Fuser';
      return;
    }

    popup.focus();

    // Écouter la réponse du callback OAuth via BroadcastChannel.
    // BroadcastChannel fonctionne même quand window.opener est null
    // (Discord sert ses pages avec COOP: same-origin qui isole le contexte
    // de navigation de la popup et rend window.opener inaccessible).
    var channel = null;
    var storageHandler = null;
    var checkInterval = null;

    function cleanup() {
      if (channel) { try { channel.close(); } catch(_) {} channel = null; }
      if (storageHandler) { window.removeEventListener('storage', storageHandler); storageHandler = null; }
      if (checkInterval) { clearInterval(checkInterval); checkInterval = null; }
    }

    function handleResult(data) {
      cleanup();
      if (data && data.type === 'oauth_success' && data.redirect) {
        window.location.href = data.redirect;
      } else if (data && data.type === 'oauth_error') {
        var reasons = {
          invalid_state: 'Session expirée, veuillez réessayer.',
          cancelled: 'Connexion annulée.',
        };
        console.warn('OAuth error:', data.reason);
        // Afficher un message non-bloquant si disponible
        if (typeof window.showToast === 'function') {
          window.showToast(reasons[data.reason] || 'Erreur lors de la connexion.', 'error');
        }
      }
    }

    // Primary: BroadcastChannel
    try {
      channel = new BroadcastChannel('unixbot_oauth');
      channel.onmessage = function(event) { handleResult(event.data); };
    } catch(_) {
      channel = null;
    }

    // Fallback: localStorage storage event
    storageHandler = function(event) {
      if (event.key !== 'unixbot_oauth_result') return;
      try {
        var data = JSON.parse(event.newValue);
        localStorage.removeItem('unixbot_oauth_result');
        handleResult(data);
      } catch(_) {}
    };
    window.addEventListener('storage', storageHandler);

    // Sécurité : nettoyer si la popup est fermée sans compléter
    checkInterval = setInterval(function() {
      if (popup.closed) cleanup();
    }, 800);
  }

  /**
   * Bind OAuth popup to all [data-oauth-url] buttons in the given root.
   * Guards against double-binding with data-oauth-bound attribute.
   */
  function bindOAuthButtons(root) {
    (root || document).querySelectorAll('[data-oauth-url]').forEach(function (btn) {
      if (btn.dataset.oauthBound) return;
      btn.dataset.oauthBound = '1';
      btn.addEventListener('click', function () {
        openOAuthPopup(btn.dataset.oauthUrl);
      });
    });
  }

  // Expose globally AND bind to any [data-oauth-url] buttons on current page
  window.openOAuthPopup = openOAuthPopup;
  window.bindOAuthButtons = bindOAuthButtons;

  // Bind on initial load
  bindOAuthButtons();

  // ============================================
  // SPA RE-INIT HOOK
  // Called by spa-router.js after each page swap.
  // ============================================
  window.publicReinit = function (container) {
    bindOAuthButtons(container);
    initAnimations(container);
    initSmoothScroll(container);
  };

  // ============================================
  // SCROLL ANIMATIONS (Intersection Observer)
  // ============================================
  function initAnimations(root) {
    var elements = (root || document).querySelectorAll('[data-animate]');
    if (elements.length > 0 && 'IntersectionObserver' in window) {
      var observer = new IntersectionObserver(
        function (entries) {
          entries.forEach(function (entry) {
            if (entry.isIntersecting) {
              var el = entry.target;
              var animation = el.dataset.animate || 'fadeInUp';
              el.style.animation = animation + ' var(--duration-500) var(--ease-out) forwards';
              el.style.opacity = '1';
              observer.unobserve(el);
            }
          });
        },
        { threshold: 0.1, rootMargin: '0px 0px -40px 0px' }
      );
      elements.forEach(function (el) {
        el.style.opacity = '0';
        observer.observe(el);
      });
    }
  }

  // Init on page load
  initAnimations();

  // ============================================
  // SMOOTH SCROLL for anchor links
  // ============================================
  function initSmoothScroll(root) {
    (root || document).querySelectorAll('a[href^="#"]').forEach(function (anchor) {
      anchor.addEventListener('click', function (e) {
        var target = document.querySelector(this.getAttribute('href'));
        if (target) {
          e.preventDefault();
          target.scrollIntoView({ behavior: 'smooth', block: 'start' });
          // Close mobile menu if open
          if (mobileMenu && mobileMenu.classList.contains('open')) {
            mobileMenu.classList.remove('open');
            hamburger.classList.remove('open');
            document.body.style.overflow = '';
          }
        }
      });
    });
  }

  initSmoothScroll();

  // ============================================
  // ACTIVE NAV LINK (initial load only)
  // SPA router handles this on subsequent navigations.
  // ============================================
  var path = window.location.pathname;
  document.querySelectorAll('.site-nav__link, .mobile-menu__link').forEach(function (link) {
    var href = link.getAttribute('href');
    if (href === path || (href !== '/' && path.startsWith(href))) {
      link.classList.add('active');
    }
  });

})();
