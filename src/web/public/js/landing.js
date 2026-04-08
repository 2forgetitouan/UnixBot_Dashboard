/**
 * Landing Page JavaScript
 * Stats loading & landing-specific interactions.
 *
 * SPA-compatible: cleans up interval when re-executed,
 * and re-initializes fresh on each load.
 */

(function () {
  'use strict';

  // ============================================
  // CLEANUP — stop previous interval if SPA re-loaded this script
  // ============================================
  if (window.__landingCleanup) {
    window.__landingCleanup();
  }

  // ============================================
  // LIVE STATS
  // ============================================

  var STATS_INTERVAL = 10000; // 10s

  /**
   * Animated counter — counts from 0 to target with ease-out cubic.
   * @param {HTMLElement} el
   * @param {number} target
   * @param {string} [suffix]
   */
  function animateValue(el, target, suffix) {
    if (!el) return;
    suffix = suffix || '';
    var duration = 1200;
    var start = performance.now();

    function tick(now) {
      var elapsed = now - start;
      var progress = Math.min(elapsed / duration, 1);
      var eased = 1 - Math.pow(1 - progress, 3);
      var current = Math.round(target * eased);
      el.textContent = current.toLocaleString('fr-FR') + suffix;
      if (progress < 1) requestAnimationFrame(tick);
    }

    requestAnimationFrame(tick);
  }

  /**
   * Format uptime in days/hours.
   * @param {number} uptimeMs
   * @returns {{ text: string, label: string }}
   */
  function formatUptime(uptimeMs) {
    if (typeof uptimeMs !== 'number' || uptimeMs <= 0) {
      return { text: 'Online', label: 'Statut' };
    }
    var days = Math.floor(uptimeMs / 86400000);
    if (days > 0) return { text: days + 'j', label: 'Uptime' };
    var hours = Math.floor(uptimeMs / 3600000);
    if (hours > 0) return { text: hours + 'h', label: 'Uptime' };
    return { text: 'Online', label: 'Statut' };
  }

  var firstLoad = true;

  function applyStats(s) {
    var elServers      = document.getElementById('statServers');
    var elUsers        = document.getElementById('statUsers');
    var elUptime       = document.getElementById('statUptime');
    var elBannerServers = document.getElementById('statBannerServers');
    var offline = s.botOnline === false;

    // Serveurs et utilisateurs
    if (offline) {
      if (elServers)       elServers.textContent      = '-';
      if (elUsers)         elUsers.textContent        = '-';
      if (elBannerServers) elBannerServers.textContent = '-';
    } else if (firstLoad) {
      animateValue(elServers,       s.guilds || 0);
      animateValue(elUsers,         s.users  || 0);
      animateValue(elBannerServers, s.guilds || 0);
    } else {
      if (elServers)       elServers.textContent      = (s.guilds || 0).toLocaleString('fr-FR');
      if (elUsers)         elUsers.textContent        = (s.users  || 0).toLocaleString('fr-FR');
      if (elBannerServers) elBannerServers.textContent = (s.guilds || 0).toLocaleString('fr-FR');
    }

    // Uptime / statut
    if (elUptime) {
      var label = elUptime.nextElementSibling;
      if (offline) {
        elUptime.textContent = 'Hors ligne';
        if (label) label.textContent = 'Statut';
      } else {
        var up = formatUptime(s.uptime);
        elUptime.textContent = up.text;
        if (label) label.textContent = up.label;
      }
    }

    firstLoad = false;
  }

  function loadStats() {
    if (!document.getElementById('statServers')) return;
    fetch('/api/stats', { cache: 'no-store' })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (data.success && data.stats) applyStats(data.stats);
      })
      .catch(function () { /* stats cosmétiques, échec silencieux */ });
  }

  // Démarrage
  loadStats();
  var intervalId = setInterval(loadStats, STATS_INTERVAL);

  // Register cleanup so SPA router can stop the interval
  window.__landingCleanup = function () {
    clearInterval(intervalId);
    window.__landingCleanup = null;
  };

})();
