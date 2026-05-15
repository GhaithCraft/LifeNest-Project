(function () {
  function qs(sel, root) { return (root || document).querySelector(sel); }
  function qsa(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
  function fmtDate(v) {
    if (!v) return '—';
    var normalized = String(v).replace(' ', 'T');
    var d = new Date(normalized);
    if (isNaN(d.getTime())) return String(v);
    return d.toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });
  }
  function money(cents) {
    var n = Number(cents || 0) / 100;
    return new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(n);
  }

  var csrf = document.body.getAttribute('data-csrf') || '';
  var state = { bootstrap: null, users: [], panels: [] };

  function toast(msg) {
    var el = qs('#adminToast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'adminToast';
      el.className = 'admin-toast';
      document.body.appendChild(el);
    }
    el.textContent = String(msg || 'Done');
    el.classList.add('is-show');
    clearTimeout(el._hideTimer);
    el._hideTimer = setTimeout(function () { el.classList.remove('is-show'); }, 2200);
  }

  function fetchJSON(url, opts) {
    var options = opts || {};
    var headers = options.headers || {};
    if (options.body) headers['Content-Type'] = 'application/json';
    if (options.method && options.method !== 'GET') headers['X-CSRF-Token'] = csrf;
    options.headers = headers;
    return fetch(url, options).then(function (r) {
      return r.json().then(function (j) {
        if (!r.ok || !j || j.ok === false) {
          var err = (j && (j.error || j.message)) || ('HTTP ' + r.status);
          throw new Error(err);
        }
        return j;
      });
    });
  }

  function fetchForm(url, formData) {
    return fetch(url, {
      method: 'POST',
      headers: { 'X-CSRF-Token': csrf },
      body: formData
    }).then(function (r) {
      return r.json().then(function (j) {
        if (!r.ok || !j || j.ok === false) {
          var err = (j && (j.error || j.message)) || ('HTTP ' + r.status);
          throw new Error(err);
        }
        return j;
      });
    });
  }

  function setImagePreview(img, src) {
    if (!img || !src) return;
    img.src = String(src);
  }

  function applyBrandingToChrome(branding) {
    if (!branding) return;
    qsa('.dashboard-sidebar__logo, .brand__mark').forEach(function (img) {
      setImagePreview(img, branding.logo_url);
    });
    var favicon = document.querySelector('link[rel="icon"]');
    if (favicon && branding.favicon_url) favicon.href = branding.favicon_url;
  }

  function previewSelectedFile(input, img) {
    if (!input || !img || !input.files || !input.files[0]) return;
    img.src = URL.createObjectURL(input.files[0]);
  }

  function bindBrandingPreview() {
    var logoInput = qs('#siteLogoInput');
    var faviconInput = qs('#siteFaviconInput');
    var logoImg = qs('#appearanceLogoPreview');
    var faviconImg = qs('#appearanceFaviconPreview');
    if (logoInput) logoInput.addEventListener('change', function () { previewSelectedFile(logoInput, logoImg); });
    if (faviconInput) faviconInput.addEventListener('change', function () { previewSelectedFile(faviconInput, faviconImg); });
  }

  function applySectionNav() {
    qsa('.admin-side__item').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var target = btn.getAttribute('data-target');
        qsa('.admin-side__item').forEach(function (x) { x.classList.toggle('is-active', x === btn); });
        qsa('.admin-section').forEach(function (sec) {
          sec.classList.toggle('is-active', sec.id === 'section-' + target);
        });
      });
    });
  }

  function renderStats(stats) {
    var items = [
      ['Total users', stats.users_total, 'Active: ' + stats.users_active + ' / Disabled: ' + stats.users_disabled],
      ['Admins', stats.admins_total, 'Current administrative accounts'],
      ['Total tasks', stats.tasks_total, 'Completed: ' + stats.tasks_done],
      ["Today's tasks", stats.tasks_due_today, 'Overdue: ' + stats.tasks_overdue],
      ['Study items', stats.study_items_total, 'Total items linked to study workflows'],
      ['Notes', stats.notes_total, 'Task-attached notes in storage'],
      ['Active sessions', stats.active_sessions, 'Remember-me sessions not yet expired'],
      ["This month's expenses", stats.expenses_month_count, 'Approx. total: ' + money(stats.expenses_month_total_cents)]
    ];
    qs('#adminStatsGrid').innerHTML = items.map(function (it) {
      return '<article class="admin-stat">'
        + '<div class="admin-stat__label">' + escapeHtml(it[0]) + '</div>'
        + '<div class="admin-stat__value">' + escapeHtml(it[1]) + '</div>'
        + '<div class="admin-stat__hint">' + escapeHtml(it[2]) + '</div>'
        + '</article>';
    }).join('');
  }

  function renderRecentUsers(users) {
    qs('#recentUsersList').innerHTML = users.map(function (u) {
      var badgeClass = u.role === 'admin' ? '' : ' admin-badge--warn';
      return '<div class="admin-list__item">'
        + '<div>'
        + '<div class="admin-list__email">' + escapeHtml(u.email) + '</div>'
        + '<div class="admin-list__meta">Created: ' + escapeHtml(fmtDate(u.created_at)) + ' — Last login: ' + escapeHtml(fmtDate(u.last_login_at)) + '</div>'
        + '</div>'
        + '<span class="admin-badge' + badgeClass + '">' + escapeHtml(u.role === 'admin' ? 'Admin' : 'User') + '</span>'
        + '</div>';
    }).join('');
  }

  function renderSummary(data) {
    var s = data.stats || {};
    var runtime = data.runtime || {};
    var items = [
      ['Disabled accounts', s.users_disabled || 0],
      ['Overdue tasks', s.tasks_overdue || 0],
      ['Runtime environment', runtime.app_env || 'prod'],
      ['Install lock', runtime.install_locked ? 'Enabled' : 'Disabled']
    ];
    qs('#adminSummaryBox').innerHTML = items.map(function (it) {
      return '<div class="admin-summary__item"><div class="admin-summary__label">' + escapeHtml(it[0]) + '</div><div class="admin-summary__value">' + escapeHtml(it[1]) + '</div></div>';
    }).join('');
  }

  function fillSettings(settings) {
    qs('#siteName').value = settings.site_name || '';
    qs('#siteTagline').value = settings.site_tagline || '';
    qs('#supportEmail').value = settings.support_email || '';
    qs('#registrationOpen').checked = !!settings.registration_open;
    if (settings.theme) {
      qs('#accentColor').value = settings.theme.accent_color || '#2f6f55';
      qs('#bgColor1').value = settings.theme.bg_color_1 || '#eaf0ef';
      qs('#bgColor2').value = settings.theme.bg_color_2 || '#e6eceb';
      qs('#uiScaleDesktop').value = settings.theme.ui_scale_desktop || '0.95';
    }
    state.panels = Array.isArray(settings.dashboard_panels) ? settings.dashboard_panels.slice() : [];
    if (settings.branding) {
      setImagePreview(qs('#appearanceLogoPreview'), settings.branding.logo_url);
      setImagePreview(qs('#appearanceFaviconPreview'), settings.branding.favicon_url);
      applyBrandingToChrome(settings.branding);
    }
    renderLayoutPanels();
  }

  function renderUsers(users) {
    state.users = users.slice();
    qs('#adminUsersTable').innerHTML = users.map(function (u) {
      var roleOptions = ['user', 'admin'].map(function (role) {
        return '<option value="' + role + '"' + (u.role === role ? ' selected' : '') + '>' + (role === 'admin' ? 'Admin' : 'User') + '</option>';
      }).join('');
      var statusOptions = ['active', 'disabled'].map(function (status) {
        return '<option value="' + status + '"' + (u.status === status ? ' selected' : '') + '>' + (status === 'active' ? 'Active' : 'Disabled') + '</option>';
      }).join('');
      return '<div class="admin-user" data-user-id="' + escapeHtml(u.id) + '">'
        + '<div>'
        + '<div class="admin-user__email">' + escapeHtml(u.email) + '</div>'
        + '<div class="admin-user__meta">Created: ' + escapeHtml(fmtDate(u.created_at)) + ' — Last login: ' + escapeHtml(fmtDate(u.last_login_at)) + '</div>'
        + '</div>'
        + '<div class="admin-user__ctrl"><label>Role</label><select class="select select--native admin-role">' + roleOptions + '</select></div>'
        + '<div class="admin-user__ctrl"><label>Status</label><select class="select select--native admin-status">' + statusOptions + '</select></div>'
        + '<div class="admin-user__actions"><button class="btn btn--primary btn--sm admin-save-user" type="button">Save</button></div>'
        + '</div>';
    }).join('');

    qsa('.admin-save-user').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var row = btn.closest('.admin-user');
        var id = Number(row.getAttribute('data-user-id'));
        var role = qs('.admin-role', row).value;
        var status = qs('.admin-status', row).value;
        btn.disabled = true;
        fetchJSON('/api/admin/users.php', {
          method: 'PATCH',
          body: JSON.stringify({ id: id, role: role, status: status })
        }).then(function () {
          toast('User updated successfully');
          return loadUsers(qs('#adminUserSearch').value || '');
        }).catch(function (err) {
          toast(err.message || 'Unable to update user');
        }).finally(function () { btn.disabled = false; });
      });
    });
  }

  function renderLayoutPanels() {
    var host = qs('#dashboardPanelsList');
    if (!host) return;
    host.innerHTML = state.panels.map(function (p, idx) {
      return '<div class="admin-layout-item" data-index="' + idx + '">'
        + '<div><div class="admin-layout-item__title">' + escapeHtml(p.label || p.id) + '</div><div class="admin-layout-item__meta">Panel ID: ' + escapeHtml(p.id) + '</div></div>'
        + '<label class="admin-check"><input type="checkbox" class="layout-enabled"' + (p.enabled ? ' checked' : '') + ' /><span>Enabled</span></label>'
        + '<button class="admin-icon-btn layout-up" type="button" aria-label="Move up">↑</button>'
        + '<button class="admin-icon-btn layout-down" type="button" aria-label="Move down">↓</button>'
        + '</div>';
    }).join('');

    qsa('.layout-enabled', host).forEach(function (chk) {
      chk.addEventListener('change', function () {
        var row = chk.closest('.admin-layout-item');
        var idx = Number(row.getAttribute('data-index'));
        if (state.panels[idx]) state.panels[idx].enabled = chk.checked;
      });
    });

    qsa('.layout-up', host).forEach(function (btn) {
      btn.addEventListener('click', function () {
        var idx = Number(btn.closest('.admin-layout-item').getAttribute('data-index'));
        if (idx <= 0) return;
        var tmp = state.panels[idx - 1];
        state.panels[idx - 1] = state.panels[idx];
        state.panels[idx] = tmp;
        renderLayoutPanels();
      });
    });

    qsa('.layout-down', host).forEach(function (btn) {
      btn.addEventListener('click', function () {
        var idx = Number(btn.closest('.admin-layout-item').getAttribute('data-index'));
        if (idx >= state.panels.length - 1) return;
        var tmp = state.panels[idx + 1];
        state.panels[idx + 1] = state.panels[idx];
        state.panels[idx] = tmp;
        renderLayoutPanels();
      });
    });
  }

  function renderSystem(runtime) {
    var items = [
      ['PHP Version', runtime.php_version || '—'],
      ['Application environment', runtime.app_env || '—'],
      ['DB Host', runtime.db_host || '—'],
      ['install.php lock state', runtime.install_locked ? 'Locked' : 'Unlocked']
    ];
    qs('#systemInfoBox').innerHTML = items.map(function (it) {
      return '<div class="admin-system__item"><div class="admin-system__label">' + escapeHtml(it[0]) + '</div><div class="admin-system__value">' + escapeHtml(it[1]) + '</div></div>';
    }).join('');
  }

  function loadBootstrap() {
    return fetchJSON('/api/admin/bootstrap.php').then(function (data) {
      state.bootstrap = data;
      renderStats(data.stats || {});
      renderRecentUsers(data.recent_users || []);
      renderSummary(data);
      fillSettings(data.settings || {});
      renderSystem(data.runtime || {});
      return data;
    }).catch(function (err) {
      toast(err.message || 'Unable to load admin dashboard');
    });
  }

  function loadUsers(q) {
    var url = '/api/admin/users.php';
    if (q) url += '?q=' + encodeURIComponent(q);
    return fetchJSON(url).then(function (data) {
      renderUsers(data.users || []);
    }).catch(function (err) {
      toast(err.message || 'Unable to load users');
    });
  }

  function bindForms() {
    var siteForm = qs('#siteSettingsForm');
    if (siteForm) {
      siteForm.addEventListener('submit', function (e) {
        e.preventDefault();
        fetchJSON('/api/admin/settings.php', {
          method: 'POST',
          body: JSON.stringify({
            site_name: qs('#siteName').value,
            site_tagline: qs('#siteTagline').value,
            support_email: qs('#supportEmail').value,
            registration_open: qs('#registrationOpen').checked
          })
        }).then(function () {
          qs('#siteSaveMsg').textContent = 'Saved.';
          toast('Site settings saved');
        }).catch(function (err) {
          qs('#siteSaveMsg').textContent = err.message || 'Unable to save';
          toast(err.message || 'Unable to save');
        });
      });
    }

    var appearanceForm = qs('#appearanceForm');
    if (appearanceForm) {
      appearanceForm.addEventListener('submit', function (e) {
        e.preventDefault();
        var saveMsg = qs('#appearanceSaveMsg');
        var logoInput = qs('#siteLogoInput');
        var faviconInput = qs('#siteFaviconInput');
        fetchJSON('/api/admin/settings.php', {
          method: 'POST',
          body: JSON.stringify({
            accent_color: qs('#accentColor').value,
            bg_color_1: qs('#bgColor1').value,
            bg_color_2: qs('#bgColor2').value,
            ui_scale_desktop: qs('#uiScaleDesktop').value
          })
        }).then(function () {
          var hasLogo = !!(logoInput && logoInput.files && logoInput.files[0]);
          var hasFavicon = !!(faviconInput && faviconInput.files && faviconInput.files[0]);
          if (!hasLogo && !hasFavicon) {
            return null;
          }
          var fd = new FormData();
          if (hasLogo) fd.append('site_logo', logoInput.files[0]);
          if (hasFavicon) fd.append('site_favicon', faviconInput.files[0]);
          return fetchForm('/api/admin/branding.php', fd);
        }).then(function (uploadResp) {
          saveMsg.textContent = 'Saved. Refresh other pages to see the change immediately.';
          toast('Appearance saved');
          var themeLink = document.querySelector('link[href^="/theme.php"]');
          if (themeLink) themeLink.href = '/theme.php?v=' + Date.now();
          if (uploadResp && uploadResp.branding) {
            applyBrandingToChrome(uploadResp.branding);
            setImagePreview(qs('#appearanceLogoPreview'), uploadResp.branding.logo_url);
            setImagePreview(qs('#appearanceFaviconPreview'), uploadResp.branding.favicon_url);
            if (logoInput) logoInput.value = '';
            if (faviconInput) faviconInput.value = '';
          }
        }).catch(function (err) {
          saveMsg.textContent = err.message || 'Unable to save';
          toast(err.message || 'Unable to save');
        });
      });
    }

    var layoutForm = qs('#layoutForm');
    if (layoutForm) {
      layoutForm.addEventListener('submit', function (e) {
        e.preventDefault();
        fetchJSON('/api/admin/settings.php', {
          method: 'POST',
          body: JSON.stringify({ dashboard_panels: state.panels })
        }).then(function () {
          qs('#layoutSaveMsg').textContent = 'Saved.';
          toast('Dashboard layout saved');
        }).catch(function (err) {
          qs('#layoutSaveMsg').textContent = err.message || 'Unable to save';
          toast(err.message || 'Unable to save');
        });
      });
    }

    var search = qs('#adminUserSearch');
    if (search) {
      var timer = null;
      search.addEventListener('input', function () {
        clearTimeout(timer);
        timer = setTimeout(function () { loadUsers(search.value || ''); }, 220);
      });
    }

    var refreshBtn = qs('#adminRefreshBtn');
    if (refreshBtn) {
      refreshBtn.addEventListener('click', function () {
        Promise.all([loadBootstrap(), loadUsers(qs('#adminUserSearch').value || '')]).then(function () {
          toast('Admin data refreshed');
        });
      });
    }

    var logoutBtn = qs('#btnLogout');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', function () {
        fetch('/api/auth/logout.php', { method: 'POST', headers: { 'X-CSRF-Token': csrf } })
          .then(function () { window.location.href = '/login.php'; })
          .catch(function () { window.location.href = '/login.php'; });
      });
    }
  }

  document.addEventListener('DOMContentLoaded', function () {
    applySectionNav();
    bindForms();
    bindBrandingPreview();
    loadBootstrap();
    loadUsers('');
  });
})();
