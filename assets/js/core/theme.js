(function () {
  var STORAGE_KEY = 'lifenest-theme';
  var root = document.documentElement;

  function normalizeTheme(value) {
    return value === 'dark' || value === 'light' ? value : '';
  }

  function systemTheme() {
    try {
      return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    } catch (_) {
      return 'light';
    }
  }

  function storedTheme() {
    try {
      return normalizeTheme(window.localStorage.getItem(STORAGE_KEY) || '');
    } catch (_) {
      return '';
    }
  }

  function hasExplicitPreference() {
    return storedTheme() !== '';
  }

  function activeTheme() {
    return normalizeTheme(root.getAttribute('data-theme')) || storedTheme() || systemTheme();
  }

  function setTheme(theme, persist) {
    var next = normalizeTheme(theme) || systemTheme();
    root.setAttribute('data-theme', next);
    root.style.colorScheme = next;
    if (persist !== false) {
      try { window.localStorage.setItem(STORAGE_KEY, next); } catch (_) {}
    }
    syncThemeButtons(next);
  }

  function toggleTheme() {
    setTheme(activeTheme() === 'dark' ? 'light' : 'dark', true);
  }

  function createIcon(pathD, extraClass) {
    var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('class', 'theme-toggle__icon ' + extraClass);
    var path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', pathD);
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', 'currentColor');
    path.setAttribute('stroke-width', '1.8');
    path.setAttribute('stroke-linecap', 'round');
    path.setAttribute('stroke-linejoin', 'round');
    svg.appendChild(path);
    return svg;
  }

  function decorateThemeButton(btn, floating) {
    if (!btn || btn.getAttribute('data-theme-toggle') === 'ready') return btn;
    btn.type = 'button';
    btn.setAttribute('data-theme-toggle', 'ready');
    btn.className = (floating ? 'theme-toggle theme-toggle--floating' : 'icon-btn theme-toggle');
    btn.appendChild(createIcon('M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8Z', 'theme-toggle__icon--moon'));
    btn.appendChild(createIcon('M12 3v2.2M12 18.8V21M4.9 4.9l1.6 1.6M17.5 17.5l1.6 1.6M3 12h2.2M18.8 12H21M4.9 19.1l1.6-1.6M17.5 6.5l1.6-1.6M12 7.2a4.8 4.8 0 1 1 0 9.6 4.8 4.8 0 0 1 0-9.6Z', 'theme-toggle__icon--sun'));
    btn.addEventListener('click', function (e) {
      e.preventDefault();
      toggleTheme();
    });
    return btn;
  }

  function ensureTopbarButtons() {
    var containers = document.querySelectorAll('.topbar__right');
    if (!containers.length) return false;
    containers.forEach(function (container) {
      if (container.querySelector('[data-theme-toggle]')) return;
      var btn = decorateThemeButton(document.createElement('button'), false);
      var before = container.querySelector('.profile-wrap') || container.querySelector('.profile') || null;
      if (before) container.insertBefore(btn, before);
      else container.appendChild(btn);
    });
    return true;
  }

  function ensureFloatingButton() {
    if (document.querySelector('[data-theme-toggle][data-theme-placement="floating"]')) return;
    var authLike = document.body && (document.body.classList.contains('ln-auth') || document.body.classList.contains('install-page'));
    if (!authLike) return;
    var btn = decorateThemeButton(document.createElement('button'), true);
    btn.setAttribute('data-theme-placement', 'floating');
    document.body.appendChild(btn);
  }

  function syncThemeButtons(theme) {
    var current = normalizeTheme(theme) || activeTheme();
    var nextLabel = current === 'dark' ? 'Switch to light mode' : 'Switch to dark mode';
    Array.prototype.forEach.call(document.querySelectorAll('[data-theme-toggle]'), function (btn) {
      btn.setAttribute('data-theme-active', current);
      btn.setAttribute('aria-label', nextLabel);
      btn.setAttribute('title', nextLabel);
    });
  }

  function bootButtons() {
    if (!document.body) return;
    if (!ensureTopbarButtons()) ensureFloatingButton();
    syncThemeButtons(activeTheme());
  }

  setTheme(storedTheme() || systemTheme(), false);

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootButtons);
  } else {
    bootButtons();
  }

  try {
    var media = window.matchMedia('(prefers-color-scheme: dark)');
    var onChange = function () {
      if (!hasExplicitPreference()) setTheme(systemTheme(), false);
    };
    if (media.addEventListener) media.addEventListener('change', onChange);
    else if (media.addListener) media.addListener(onChange);
  } catch (_) {}



  // ---- Deployment freshness watcher
  // Detects changed PHP/CSS/JS files after upload and refreshes the current page automatically.
  var VERSION_ENDPOINT = '/api/app_version.php';
  var versionState = {
    current: '',
    inFlight: false,
    reloadScheduled: false
  };

  function shouldCheckVersion() {
    if (!window.fetch) return false;
    if (versionState.inFlight || versionState.reloadScheduled) return false;
    if (document.visibilityState && document.visibilityState !== 'visible') return false;
    return true;
  }

  function reloadForNewVersion() {
    if (versionState.reloadScheduled) return;
    versionState.reloadScheduled = true;
    try { window.sessionStorage.setItem('lifenest-last-auto-refresh', String(Date.now())); } catch (_) {}
    window.location.reload();
  }

  function checkAppVersion() {
    if (!shouldCheckVersion()) return;
    versionState.inFlight = true;
    fetch(VERSION_ENDPOINT, {
      method: 'GET',
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { 'Accept': 'application/json' }
    }).then(function (res) {
      return res && res.ok ? res.json() : null;
    }).then(function (data) {
      var next = data && data.ok && data.version ? String(data.version) : '';
      if (!next) return;
      if (!versionState.current) {
        versionState.current = next;
        return;
      }
      if (next !== versionState.current) {
        reloadForNewVersion();
      }
    }).catch(function () {
      // Ignore network failures; this checker must never break the UI.
    }).then(function () {
      versionState.inFlight = false;
    });
  }

  function bootVersionWatcher() {
    checkAppVersion();
    window.setInterval(checkAppVersion, 15000);
    document.addEventListener('visibilitychange', function () {
      if (!document.visibilityState || document.visibilityState === 'visible') {
        checkAppVersion();
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootVersionWatcher);
  } else {
    bootVersionWatcher();
  }

  window.LifeNestTheme = {
    get: activeTheme,
    set: function (theme) { setTheme(theme, true); },
    toggle: toggleTheme,
    clearPreference: function () {
      try { window.localStorage.removeItem(STORAGE_KEY); } catch (_) {}
      setTheme(systemTheme(), false);
    }
  };
})();
