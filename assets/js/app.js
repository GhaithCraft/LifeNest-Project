(function () {
  function qs(sel, root) { return (root || document).querySelector(sel); }
  function qsa(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  var focusStack = [];

  function rememberFocus() {
    try { focusStack.push(document.activeElement); } catch (_) { focusStack.push(null); }
  }

  function restoreFocus() {
    var el = focusStack.pop();
    if (el && el.focus) {
      try { el.focus(); } catch (_) {}
    }
  }

  function isVisible(el) {
    if (!el) return false;
    if (el.disabled) return false;
    if (el.getAttribute && el.getAttribute('aria-hidden') === 'true') return false;
    // getClientRects() works with fixed/absolute elements.
    var rects = el.getClientRects ? el.getClientRects() : [];
    return rects && rects.length > 0;
  }

  function focusables(root) {
    var sel = [
      'a[href]',
      'button:not([disabled])',
      'input:not([disabled])',
      'select:not([disabled])',
      'textarea:not([disabled])',
      '[tabindex]:not([tabindex="-1"])'
    ].join(',');
    return qsa(sel, root).filter(isVisible);
  }

  function focusFirst(root) {
    var f = focusables(root);
    if (f.length) {
      try { f[0].focus(); } catch (_) {}
    }
  }

  function trapTab(e, root) {
    if (e.key !== 'Tab') return;
    var f = focusables(root);
    if (!f.length) return;
    var first = f[0];
    var last = f[f.length - 1];
    var active = document.activeElement;
    if (e.shiftKey) {
      if (active === first || !root.contains(active)) {
        e.preventDefault();
        try { last.focus(); } catch (_) {}
      }
    } else {
      if (active === last) {
        e.preventDefault();
        try { first.focus(); } catch (_) {}
      }
    }
  }

  // ---- Modals
  function openModal(modal) {
    if (!modal) return;
    rememberFocus();
    modal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('ln-modal-open');
    // Focus first focusable element.
    setTimeout(function () { focusFirst(modal); }, 0);
  }

  function closeModal(modal) {
    if (!modal) return;
    modal.setAttribute('aria-hidden', 'true');
    var anyOpen = qsa('.ln-modal[aria-hidden="false"]').length > 0;
    if (!anyOpen) document.body.classList.remove('ln-modal-open');
    restoreFocus();
  }

  function closeClosestModal(el) {
    var m = el && el.closest ? el.closest('.ln-modal') : null;
    closeModal(m);
  }

  function openModalByName(name) {
    var id = null;
    if (name === 'task') id = 'modalTask';
    else if (name === 'expense') id = 'modalExpense';
    else if (name === 'expenses') id = 'modalExpenses';
    else if (name === 'study') id = 'modalStudy';
    else if (name === 'budget') id = 'modalBudget';
    else if (name === 'note') id = 'modalNote';
    else if (name === 'focus') id = 'modalFocus';
    else if (name === 'reports') id = 'modalReports';
    else if (name === 'fixed') id = 'modalFixed';
    else if (name === 'pending') id = 'modalPending';
    else if (name === 'todayPlanDetails') id = 'modalTodayPlanDetails';

    if (!id) return false;
    var modal = document.getElementById(id);
    if (!modal) return false;
    openModal(modal);
    return true;
  }

  // ---- Drawer
  function drawerEl() { return qs('#drawer'); }

  function openDrawer() {
    var d = drawerEl();
    if (!d) return;
    rememberFocus();
    d.setAttribute('aria-hidden', 'false');
    document.body.classList.add('ln-drawer-open');
    var menuBtn = qs('.menu-btn');
    if (menuBtn) menuBtn.setAttribute('aria-expanded', 'true');
    setTimeout(function () { focusFirst(d); }, 0);
  }

  function closeDrawer() {
    var d = drawerEl();
    if (!d) return;
    d.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('ln-drawer-open');
    var menuBtn = qs('.menu-btn');
    if (menuBtn) menuBtn.setAttribute('aria-expanded', 'false');
    restoreFocus();
  }

  // ---- Speed dial
  function closeSpeedDial(dial) { if (dial) dial.classList.remove('is-open'); }
  function toggleSpeedDial(dial) { if (dial) dial.classList.toggle('is-open'); }

  // ---- Context menu (centered sheet, CSP-safe)
  function ctxBackdrop() { return qs('#ctxBackdrop'); }
  function ctxMenu() { return qs('#ctxMenu'); }

  function closeContextMenu() {
    var b = ctxBackdrop();
    var m = ctxMenu();
    if (b) b.classList.remove('is-open');
    if (m) {
      m.classList.remove('is-open');
      m.setAttribute('aria-hidden', 'true');
      m.innerHTML = '';
    }
    document.body.classList.remove('ln-ctx-open');
    restoreFocus();
  }

  function openContextMenu(title, items) {
    var b = ctxBackdrop();
    var m = ctxMenu();
    if (!b || !m) return;
    rememberFocus();
    m.setAttribute('aria-hidden', 'false');
    m.classList.add('is-open');
    b.classList.add('is-open');
    document.body.classList.add('ln-ctx-open');

    m.innerHTML = '';
    var head = document.createElement('div');
    head.className = 'ctx-menu__head';
    head.textContent = String(title || 'Menu');
    m.appendChild(head);

    var list = document.createElement('div');
    list.className = 'ctx-menu__list';
    (items || []).forEach(function (it) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'ctx-menu__item' + (it && it.danger ? ' ctx-menu__item--danger' : '');
      btn.textContent = String(it && it.label ? it.label : '');
      btn.setAttribute('data-cmd', String(it && it.cmd ? it.cmd : ''));
      if (it && it.disabled) btn.disabled = true;
      list.appendChild(btn);
    });
    m.appendChild(list);

    var foot = document.createElement('div');
    foot.className = 'ctx-menu__foot';
    var close = document.createElement('button');
    close.type = 'button';
    close.className = 'btn btn--ghost';
    close.textContent = 'Close';
    close.setAttribute('data-cmd', 'ctx:close');
    foot.appendChild(close);
    m.appendChild(foot);

    setTimeout(function () { focusFirst(m); }, 0);
  }

  // ---- Profile menu
  function setupProfileMenu() {
    var btn = qs('#profileBtn');
    var menu = qs('#profileMenu');
    if (!btn || !menu) return;

    function setOpen(open) {
      menu.setAttribute('aria-hidden', open ? 'false' : 'true');
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    }

    btn.addEventListener('click', function (e) {
      e.preventDefault();
      var isOpen = menu.getAttribute('aria-hidden') === 'false';
      setOpen(!isOpen);
    });

    document.addEventListener('click', function (e) {
      if (menu.getAttribute('aria-hidden') !== 'false') return;
      var inside = menu.contains(e.target) || btn.contains(e.target);
      if (!inside) setOpen(false);
    });

    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape') return;
      if (menu.getAttribute('aria-hidden') === 'false') setOpen(false);
    });
  }

  // ---- Navigation helpers
  function scrollToSection(name) {
    var el = null;
    if (name === 'home') el = qs('main.page');
    if (name === 'tasks') el = qs('.card--tasks');
    if (name === 'study') el = qs('.card--study');
    if (name === 'budget') el = qs('.card--budget');
    if (!el) return;
    try { el.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch (_) { el.scrollIntoView(true); }
  }

  document.addEventListener('DOMContentLoaded', function () {
    var fab = qs('.fab');
    var dial = qs('.speed-dial');

    if (fab && dial) {
      fab.addEventListener('click', function (e) {
        e.preventDefault();
        toggleSpeedDial(dial);
      });
      document.addEventListener('click', function (e) {
        if (!dial.classList.contains('is-open')) return;
        var inside = dial.contains(e.target) || fab.contains(e.target);
        if (!inside) closeSpeedDial(dial);
      });
    }

    // Drawer
    var menuBtn = qs('.menu-btn');
    if (menuBtn) {
      menuBtn.addEventListener('click', function (e) {
        e.preventDefault();
        var d = drawerEl();
        var isOpen = d && d.getAttribute('aria-hidden') === 'false';
        if (isOpen) closeDrawer(); else openDrawer();
      });
    }

    qsa('[data-close="drawer"]').forEach(function (c) {
      c.addEventListener('click', function (e) {
        e.preventDefault();
        closeDrawer();
      });
    });

    // Drawer navigation
    qsa('#drawer [data-nav]').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.preventDefault();
        var name = btn.getAttribute('data-nav');
        closeDrawer();
        scrollToSection(name);
      });
    });

    // Drawer logout delegates to the existing logout button.
    var dLogout = qs('#drawerLogout');
    if (dLogout) {
      dLogout.addEventListener('click', function (e) {
        e.preventDefault();
        closeDrawer();
        var lo = qs('#btnLogout');
        if (lo) lo.click();
      });
    }

    // Bottom nav
    qsa('.bottom-nav [data-nav]').forEach(function (a) {
      a.addEventListener('click', function (e) {
        e.preventDefault();
        qsa('.bottom-nav__item').forEach(function (x) { x.classList.remove('is-active'); });
        a.classList.add('is-active');
        scrollToSection(a.getAttribute('data-nav'));
      });
    });
    var addBtn = qs('.bottom-nav [data-action="quick"]');
    if (addBtn && fab) {
      addBtn.addEventListener('click', function (e) {
        e.preventDefault();
        if (fab) fab.click();
      });
    }
    var moreBtn = qs('.bottom-nav [data-action="drawer"]');
    if (moreBtn) {
      moreBtn.addEventListener('click', function (e) {
        e.preventDefault();
        openDrawer();
      });
    }

    // Generic open actions
    qsa('[data-open]').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        var name = btn.getAttribute('data-open');
        if (!name) return;
        // reports/note/expenses handled by dashboard.js
        if (name === 'reports' || name === 'note' || name === 'expenses') return;
        e.preventDefault();
        openModalByName(name);
        closeSpeedDial(dial);
        closeDrawer();
      });
    });

    // Close modals
    qsa('[data-close="modal"]').forEach(function (c) {
      c.addEventListener('click', function (e) {
        e.preventDefault();
        closeClosestModal(c);
      });
    });

    // Context menu close on backdrop
    var cb = ctxBackdrop();
    if (cb) {
      cb.addEventListener('click', function (e) {
        e.preventDefault();
        closeContextMenu();
      });
    }

    // Context menu command clicks
    var cm = ctxMenu();
    if (cm) {
      cm.addEventListener('click', function (e) {
        var t = e.target;
        if (!t || !t.getAttribute) return;
        var cmd = t.getAttribute('data-cmd');
        if (!cmd) return;
        e.preventDefault();
        closeContextMenu();
        if (cmd === 'ctx:close') return;
        // Basic commands
        if (cmd.indexOf('open:') === 0) {
          var name = cmd.slice(5);
          if (name === 'reports' || name === 'note' || name === 'expenses') {
            window.dispatchEvent(new CustomEvent('lifenest:cmd', { detail: { cmd: cmd } }));
            return;
          }
          openModalByName(name);
          return;
        }
        if (cmd.indexOf('nav:') === 0) {
          scrollToSection(cmd.slice(4));
          return;
        }
        // Delegate to dashboard.js
        window.dispatchEvent(new CustomEvent('lifenest:cmd', { detail: { cmd: cmd } }));
      });
    }

    setupProfileMenu();
  });

  // Global key handling
  document.addEventListener('keydown', function (e) {
    // Trap focus inside open modal/drawer/context menu
    var openModalEl = qs('.ln-modal[aria-hidden="false"]');
    if (openModalEl) trapTab(e, openModalEl);

    var d = drawerEl();
    if (d && d.getAttribute('aria-hidden') === 'false') trapTab(e, d);

    var m = ctxMenu();
    if (m && m.getAttribute('aria-hidden') === 'false') trapTab(e, m);

    if (e.key !== 'Escape') return;

    // Close priority: context menu -> modal -> drawer
    if (m && m.getAttribute('aria-hidden') === 'false') {
      closeContextMenu();
      return;
    }
    if (openModalEl) {
      closeModal(openModalEl);
      return;
    }
    if (d && d.getAttribute('aria-hidden') === 'false') {
      closeDrawer();
      return;
    }
  });

  // Expose minimal helpers for other modules
  window.LifeNestUI = window.LifeNestUI || {};
  window.LifeNestUI.openModal = openModalByName;
  window.LifeNestUI.closeModal = function (id) { closeModal(document.getElementById(id)); };
  window.LifeNestUI.openDrawer = openDrawer;
  window.LifeNestUI.closeDrawer = closeDrawer;
  window.LifeNestUI.openContextMenu = openContextMenu;
  window.LifeNestUI.closeContextMenu = closeContextMenu;
})();
