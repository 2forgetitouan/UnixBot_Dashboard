/**
 * UnixBot — SPA Router
 * Client-side navigation for public pages.
 *
 * Strategy:
 *   1. Intercept clicks on internal <a> tags
 *   2. Fetch the target page as full HTML
 *   3. Parse with DOMParser, extract <main> + metadata
 *   4. Swap page-specific CSS, replace content, fade transition
 *   5. Re-init scripts, icons, animations
 *   6. history.pushState / popstate for back/forward
 *
 * Graceful degradation: if JS is disabled or fetch fails,
 * normal link navigation still works.
 */
(function () {
  'use strict';

  // ============================================
  // CONSTANTS
  // ============================================

  var MAIN_ID        = 'siteMain';
  var HEADER_ID      = 'siteHeader';
  var TRANSITION_OUT = 200;  // ms — fade-out duration
  var TRANSITION_IN  = 250;  // ms — fade-in duration

  /** Paths that use a different layout — skip SPA */
  var SKIP_PREFIXES = ['/api/', '/dashboard', '/admin', '/logout'];

  /** CSS files that are always loaded — never removed during navigation */
  var PERSISTENT_CSS = {
    '/css/design-system.css': true,
    '/css/components.css':    true,
    '/css/public.css':        true,
  };

  /** JS files that are always loaded — never touched */
  var PERSISTENT_JS = {
    '/js/public.js':      true,
    '/js/spa-router.js':  true,
  };

  var currentAbortCtrl = null;
  var navigating       = false;

  // ============================================
  // HELPERS
  // ============================================

  function sleep(ms) {
    return new Promise(function (resolve) { setTimeout(resolve, ms); });
  }

  /**
   * Is this anchor eligible for SPA navigation?
   */
  function isSpaEligible(anchor) {
    // Must be a plain left-click link
    if (!anchor || !anchor.href) return false;
    if (anchor.target && anchor.target !== '_self') return false;
    if (anchor.hasAttribute('download')) return false;
    if (anchor.dataset.spaIgnore !== undefined) return false;

    var url;
    try { url = new URL(anchor.href, location.origin); }
    catch (_) { return false; }

    // Must be same origin
    if (url.origin !== location.origin) return false;

    // Hash-only link on same page → let browser handle
    if (url.pathname === location.pathname && (url.hash || anchor.getAttribute('href') === '#')) return false;

    // Skip non-public paths
    for (var i = 0; i < SKIP_PREFIXES.length; i++) {
      if (url.pathname.startsWith(SKIP_PREFIXES[i])) return false;
    }

    return true;
  }

  // ============================================
  // PAGE DATA EXTRACTION
  // ============================================

  /**
   * Parse fetched HTML and extract everything we need.
   * Returns null if the page doesn't contain our main element.
   */
  function extractPageData(html) {
    var parser = new DOMParser();
    var doc    = parser.parseFromString(html, 'text/html');
    var main   = doc.getElementById(MAIN_ID);

    if (!main) return null;

    // Title
    var titleEl = doc.querySelector('title');
    var title   = titleEl ? titleEl.textContent : 'UnixBot';

    // Collect all stylesheet hrefs
    var pageCss = [];
    doc.querySelectorAll('link[rel="stylesheet"]').forEach(function (link) {
      var href = link.getAttribute('href');
      if (href && !PERSISTENT_CSS[href] && !isExternalUrl(href)) {
        pageCss.push(href);
      }
    });

    // Collect page-specific external script sources
    var pageJs = [];
    doc.querySelectorAll('script[src]').forEach(function (s) {
      var src = s.getAttribute('src');
      if (src && !PERSISTENT_JS[src] && !isExternalUrl(src)) {
        pageJs.push(src);
      }
    });

    // Collect inline scripts inside <main> (e.g. login OAuth popup)
    var inlineScripts = [];
    main.querySelectorAll('script').forEach(function (s) {
      if (!s.src && s.textContent.trim()) {
        inlineScripts.push(s.textContent);
      }
    });

    // Meta description (for accessibility / og)
    var metaDesc = doc.querySelector('meta[name="description"]');
    var description = metaDesc ? metaDesc.getAttribute('content') : '';

    return {
      title: title,
      description: description,
      html: main.innerHTML,
      pageCss: pageCss,
      pageJs: pageJs,
      inlineScripts: inlineScripts,
    };
  }

  function isExternalUrl(url) {
    return url.startsWith('http://') || url.startsWith('https://') || url.startsWith('//');
  }

  // ============================================
  // CSS MANAGEMENT
  // ============================================

  /**
   * Swap page-specific stylesheets:
   *  - Remove CSS from previous page that the new page doesn't need
   *  - Add CSS that the new page needs and we don't already have
   *  - Wait for new CSS to finish loading before resolving
   */
  function swapPageCss(newCssHrefs) {
    var head = document.head;
    var newSet = {};
    newCssHrefs.forEach(function (h) { newSet[h] = true; });

    // Find current page-specific CSS links
    var currentLinks = head.querySelectorAll('link[rel="stylesheet"][data-spa-page]');
    var currentSet = {};

    currentLinks.forEach(function (link) {
      var href = link.getAttribute('href');
      currentSet[href] = link;
    });

    // Remove CSS that's no longer needed (with a brief fade to avoid flash)
    Object.keys(currentSet).forEach(function (href) {
      if (!newSet[href]) {
        currentSet[href].remove();
      }
    });

    // Add CSS that we don't have yet
    var loadPromises = [];
    newCssHrefs.forEach(function (href) {
      if (!currentSet[href]) {
        var link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = href;
        link.dataset.spaPage = '';
        loadPromises.push(new Promise(function (resolve) {
          link.onload  = resolve;
          link.onerror = resolve; // resolve even on error to not block
        }));
        head.appendChild(link);
      }
    });

    return loadPromises.length > 0
      ? Promise.all(loadPromises)
      : Promise.resolve();
  }

  // ============================================
  // SCRIPT MANAGEMENT
  // ============================================

  /**
   * Remove old page scripts and load new ones.
   * External scripts are loaded by creating new <script> elements.
   * Inline scripts are evaluated via Function().
   */
  function swapPageScripts(newJsSources, inlineScripts) {
    // Remove old page scripts
    document.querySelectorAll('script[data-spa-page]').forEach(function (s) {
      s.remove();
    });

    // Load new external scripts
    newJsSources.forEach(function (src) {
      var el = document.createElement('script');
      el.src = src;
      el.dataset.spaPage = '';
      document.body.appendChild(el);
    });

    // Execute inline scripts (e.g. OAuth popup on login page)
    inlineScripts.forEach(function (code) {
      try {
        new Function(code)();
      } catch (_) {
        // silently ignore inline script errors
      }
    });
  }

  // ============================================
  // UI UPDATES
  // ============================================

  /**
   * Update active state on navigation links.
   */
  function updateActiveNav(pathname) {
    document.querySelectorAll('.site-nav__link, .mobile-menu__link').forEach(function (link) {
      var href = link.getAttribute('href');
      var isActive = href === pathname || (href !== '/' && pathname.startsWith(href));
      link.classList.toggle('active', isActive);
    });
  }

  /**
   * Close mobile menu if open.
   */
  function closeMobileMenu() {
    var menu = document.getElementById('mobileMenu');
    var btn  = document.getElementById('navHamburger');
    if (menu && menu.classList.contains('open')) {
      menu.classList.remove('open');
      if (btn) {
        btn.classList.remove('open');
        btn.setAttribute('aria-expanded', 'false');
      }
      document.body.style.overflow = '';
    }
  }

  /**
   * Re-initialize Lucide icons in the given container.
   */
  function reinitIcons() {
    if (typeof lucide !== 'undefined' && lucide.createIcons) {
      lucide.createIcons();
    }
  }

  /**
   * Re-initialize scroll-reveal animations ([data-animate] elements).
   */
  function reinitAnimations(container) {
    if (!container || !('IntersectionObserver' in window)) return;

    var elements = container.querySelectorAll('[data-animate]');
    if (!elements.length) return;

    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        var el = entry.target;
        var anim = el.dataset.animate || 'fadeInUp';
        el.style.animation = anim + ' var(--duration-500) var(--ease-out) forwards';
        el.style.opacity = '1';
        observer.unobserve(el);
      });
    }, { threshold: 0.1, rootMargin: '0px 0px -40px 0px' });

    elements.forEach(function (el) {
      el.style.opacity = '0';
      observer.observe(el);
    });
  }

  /**
   * Update meta description tag.
   */
  function updateMetaDescription(desc) {
    if (!desc) return;
    var meta = document.querySelector('meta[name="description"]');
    if (meta) {
      meta.setAttribute('content', desc);
    }
  }

  // ============================================
  // NAVIGATION
  // ============================================

  /**
   * Navigate to a URL via SPA.
   *
   * @param {string}  url
   * @param {Object}  [opts]
   * @param {boolean} [opts.isPopstate] - true if triggered by browser back/forward
   */
  async function navigate(url, opts) {
    if (navigating) return;
    navigating = true;
    opts = opts || {};

    var main = document.getElementById(MAIN_ID);
    if (!main) {
      // No main element — can't do SPA, fall back
      location.href = url;
      return;
    }

    // Cancel any in-flight request
    if (currentAbortCtrl) {
      currentAbortCtrl.abort();
    }
    currentAbortCtrl = new AbortController();

    try {
      // ---- Phase 1: Fade out current content ----
      main.classList.add('spa-leaving');
      main.classList.remove('spa-entering');
      await sleep(TRANSITION_OUT);

      // ---- Phase 2: Fetch target page ----
      var response = await fetch(url, {
        signal: currentAbortCtrl.signal,
        headers: { 'X-Requested-With': 'SPA' },
        credentials: 'same-origin',
      });

      if (!response.ok) {
        // Server error — fall back to full navigation
        location.href = url;
        return;
      }

      var html = await response.text();
      var data = extractPageData(html);

      if (!data) {
        // Target page doesn't have our layout — full navigation
        location.href = url;
        return;
      }

      // ---- Phase 3: Swap CSS (wait for load) ----
      await swapPageCss(data.pageCss);

      // ---- Phase 4: Swap content ----
      // Remove inline scripts from the HTML before insertion
      // (they'll be executed separately)
      var cleanHtml = data.html.replace(/<script[\s\S]*?<\/script>/gi, '');
      main.innerHTML = cleanHtml;

      // ---- Phase 5: Update document metadata ----
      document.title = data.title;
      updateMetaDescription(data.description);

      // ---- Phase 6: History ----
      var targetUrl = new URL(url, location.origin);
      if (!opts.isPopstate) {
        history.pushState({ spa: true, url: url }, '', url);
      }

      // ---- Phase 7: Post-swap updates ----
      updateActiveNav(targetUrl.pathname);
      closeMobileMenu();
      window.scrollTo({ top: 0, behavior: 'instant' });
      reinitIcons();
      reinitAnimations(main);

      // Re-bind public-page behaviours (OAuth buttons, animations, etc.)
      if (typeof window.publicReinit === 'function') {
        window.publicReinit(main);
      }

      // Re-bind smooth scroll for anchor links in new content
      main.querySelectorAll('a[href^="#"]').forEach(function (anchor) {
        anchor.addEventListener('click', function (e) {
          var target = document.querySelector(this.getAttribute('href'));
          if (target) {
            e.preventDefault();
            target.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }
        });
      });

      // ---- Phase 8: Load page scripts ----
      swapPageScripts(data.pageJs, data.inlineScripts);

      // ---- Phase 9: Fade in new content ----
      main.classList.remove('spa-leaving');
      main.classList.add('spa-entering');
      await sleep(TRANSITION_IN);
      main.classList.remove('spa-entering');

    } catch (err) {
      if (err.name === 'AbortError') {
        // Navigation was cancelled by a newer request — that's fine
        navigating = false;
        return;
      }
      // SPA navigation failed — hard redirect as fallback
      location.href = url;
    } finally {
      navigating = false;
    }
  }

  // ============================================
  // EVENT LISTENERS
  // ============================================

  /**
   * Click delegation — intercept all internal link clicks.
   */
  document.addEventListener('click', function (e) {
    // Ignore modified clicks (new tab, etc.)
    if (e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
    if (e.button !== 0) return;

    var anchor = e.target.closest('a');
    if (!anchor) return;

    if (isSpaEligible(anchor)) {
      // Don't navigate to current page
      if (anchor.href === location.href) {
        e.preventDefault();
        return;
      }
      e.preventDefault();
      navigate(anchor.href);
    }
  });

  /**
   * Browser back/forward navigation.
   */
  window.addEventListener('popstate', function (e) {
    // Only handle states we pushed
    if (!e.state || !e.state.spa) return;
    navigate(location.href, { isPopstate: true });
  });

  // ============================================
  // INITIALIZATION
  // ============================================

  // Mark the initial history entry as SPA-managed
  history.replaceState({ spa: true, url: location.href }, '', location.href);

  // Tag existing page-specific CSS/JS for proper cleanup later
  document.querySelectorAll('link[rel="stylesheet"]').forEach(function (link) {
    var href = link.getAttribute('href');
    if (href && !PERSISTENT_CSS[href] && !isExternalUrl(href)) {
      link.dataset.spaPage = '';
    }
  });

  document.querySelectorAll('script[src]').forEach(function (s) {
    var src = s.getAttribute('src');
    if (src && !PERSISTENT_JS[src] && !isExternalUrl(src)) {
      s.dataset.spaPage = '';
    }
  });

  // Expose navigate for programmatic use (e.g., from other scripts)
  window.__spaNavigate = navigate;

})();
