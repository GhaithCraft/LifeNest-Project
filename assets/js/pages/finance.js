/* finance.js — Finance page (budget + expenses) — CSP-safe */
(function () {
  'use strict';

  function qs(sel, root) { return (root || document).querySelector(sel); }
  function qsa(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  var state = {
    csrf: '',
    user: null,
    month: '',
    currency: 'TRY',
    budgetCents: 0,
    spentCents: 0,
    remainingCents: 0,
    dailyAllowanceCents: 0,
    daysInMonth: 0,
    daysLeft: 0,
    period: 'today',
    expenses: [],
    categoryFilter: '',
    categories: [],
    rememberedBudget: null,
    taskOptions: [],
    editExpenseId: ''
  };

  var CAT_STORAGE_KEY = 'ln_finance_categories_v1';

  function pad2(n) { return (n < 10 ? '0' : '') + String(n); }

  function ymd(d) {
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  }

  function ym(d) {
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1);
  }

  function today() { return new Date(); }

  function weekRange(now) {
    // Week starts Monday.
    var d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    var dow = d.getDay(); // 0..6 (Sun..Sat)
    var offset = (dow + 6) % 7; // Monday=0
    var start = new Date(d);
    start.setDate(d.getDate() - offset);
    var end = new Date(start);
    end.setDate(start.getDate() + 6);
    return { start: start, end: end };
  }

  function moneySymbol(cur) {
    return '₺';
  }

  function fmtMoney(cents, cur) {
    var c = parseInt(String(cents || 0), 10);
    if (!isFinite(c)) c = 0;
    var val = (c / 100);
    var s = (c % 100 === 0) ? val.toFixed(0) : val.toFixed(2);
    return moneySymbol(cur) + s;
  }

  function parseMoneyToCents(str) {
    var s = String(str || '').trim();
    if (!s) return null;
    // allow "1,234.56" and "1234,56"
    s = s.replace(/\s+/g, '');
    if (s.indexOf(',') !== -1 && s.indexOf('.') === -1) {
      // comma decimals
      s = s.replace(',', '.');
    }
    s = s.replace(/,/g, '');
    var n = Number(s);
    if (!isFinite(n)) return null;
    if (n < 0) return null;
    return Math.round(n * 100);
  }

  function clampInt(n, a, b) {
    var x = parseInt(String(n), 10);
    if (!isFinite(x)) x = 0;
    if (x < a) x = a;
    if (x > b) x = b;
    return x;
  }


  function fmtMoneyInput(cents) {
    var c = clampInt(cents, 0, 1000000000);
    if (c % 100 === 0) return String(Math.floor(c / 100));
    return (c / 100).toFixed(2);
  }

  function normalizeRememberedBudget(raw) {
    if (!raw || typeof raw !== 'object') return null;
    var month = String(raw.month || '').trim();
    var currency = String(raw.currency || 'TRY').trim() || 'TRY';
    var amount = clampInt(raw.amount_cents || 0, 0, 1000000000);
    if (!month && amount <= 0) return null;
    return {
      month: month,
      currency: currency,
      amount_cents: amount
    };
  }

  function replaceProgressClass(el, pct) {
    if (!el) return;
    var p = clampInt(pct, 0, 100);
    var toRemove = [];
    for (var i = 0; i < el.classList.length; i++) {
      var c = el.classList.item(i);
      if (c && /^p\d{1,3}$/.test(c)) toRemove.push(c);
    }
    toRemove.forEach(function (c) { el.classList.remove(c); });
    el.classList.add('p' + p);
  }

  function setText(id, txt) {
    var el = typeof id === 'string' ? qs('#' + id) : id;
    if (!el) return;
    el.textContent = (txt === null || typeof txt === 'undefined') ? '' : String(txt);
  }

  function setHint(id, msg, ok) {
    var el = qs('#' + id);
    if (!el) return;
    el.textContent = msg ? String(msg) : '';
    el.style && (el.style.display = msg ? '' : '');
    el.classList.toggle('is-ok', !!ok);
    el.classList.toggle('is-bad', msg && !ok);
  }

  // ---- API
  function apiFetch(url, opts) {
    var o = opts || {};
    var headers = o.headers || {};
    headers['Accept'] = 'application/json';
    if (o.json) {
      headers['Content-Type'] = 'application/json';
    }
    if (o.csrf) {
      headers['X-CSRF-Token'] = state.csrf;
    }

    return fetch(url, {
      method: o.method || 'GET',
      credentials: 'same-origin',
      headers: headers,
      body: o.json ? JSON.stringify(o.json) : undefined
    }).then(function (r) {
      return r.json().catch(function () { return { ok: false, error: 'Invalid JSON response' }; })
        .then(function (b) {
          if (!r.ok || !b || b.ok === false) {
            var msg = (b && b.error) ? b.error : ('Request failed (' + r.status + ')');
            var err = new Error(msg);
            err.status = r.status;
            err.payload = b;
            throw err;
          }
          return b;
        });
    });
  }

  function loadBootstrap() {
    return apiFetch('/api/bootstrap.php').then(function (b) {
      state.csrf = String(b.csrf_token || '');
      state.user = b.user || null;
      applyUser();
    });
  }

  function applyUser() {
    var u = state.user || {};
    var name = String(u.display_name || u.full_name || u.name || u.email || 'User');
    setText('profileName', name.length > 18 ? (name.slice(0, 18) + '…') : name);
    var avatar = qs('#profileAvatar');
    if (avatar) {
      avatar.textContent = '';
      avatar.classList.remove('avatar--image');
      var avatarUrl = String(u.avatar_url || '');
      if (avatarUrl) {
        var img = document.createElement('img');
        img.className = 'avatar__img';
        img.src = avatarUrl;
        img.alt = '';
        avatar.classList.add('avatar--image');
        avatar.appendChild(img);
      } else {
        setText('profileAvatar', String(u.initials || (name.trim().charAt(0).toUpperCase() || 'U')));
      }
    }
  }

  function loadBudget(month) {
    return apiFetch('/api/budget.php?month=' + encodeURIComponent(month)).then(function (b) {
      state.month = String(b.month || month);
      state.currency = String(b.currency || 'TRY');
      state.budgetCents = clampInt(b.budget_cents || 0, 0, 1000000000);
      state.spentCents = clampInt(b.spent_cents || 0, 0, 1000000000);
      state.remainingCents = clampInt(b.remaining_cents || 0, 0, 1000000000);
      state.dailyAllowanceCents = clampInt(b.daily_allowance_cents || 0, 0, 1000000000);
      state.daysInMonth = clampInt(b.days_in_month || 0, 0, 60);
      state.daysLeft = clampInt(b.days_left || 0, 0, 60);
      state.rememberedBudget = normalizeRememberedBudget(b.remembered || null);

      // Fill form defaults
      var curSel = qs('#finBudgetCurrency');
      var amt = qs('#finBudgetAmount');
      if (b.has_budget) {
        if (curSel) curSel.value = state.currency;
        if (amt) amt.value = state.budgetCents ? fmtMoneyInput(state.budgetCents) : '';
      } else if (state.rememberedBudget) {
        if (curSel) curSel.value = state.rememberedBudget.currency;
        if (amt) amt.value = state.rememberedBudget.amount_cents ? fmtMoneyInput(state.rememberedBudget.amount_cents) : '';
      } else {
        if (curSel) curSel.value = state.currency;
        if (amt) amt.value = '';
      }

      renderSummary();
    });
  }

  function loadExpensesForPeriod(period) {
    state.period = period;
    var now = today();

    var url = '/api/expenses.php?limit=200';
    if (period === 'today') {
      var t = ymd(now);
      url += '&from=' + encodeURIComponent(t) + '&to=' + encodeURIComponent(t);
    } else if (period === 'week') {
      var wr = weekRange(now);
      url += '&from=' + encodeURIComponent(ymd(wr.start)) + '&to=' + encodeURIComponent(ymd(wr.end));
    } else {
      url += '&month=' + encodeURIComponent(state.month);
    }

    return apiFetch(url).then(function (b) {
      state.expenses = Array.isArray(b.expenses) ? b.expenses : [];
      renderLedger();
      // Update categories from month view for better suggestions
      if (period === 'month') {
        mergeCategoriesFromExpenses(state.expenses);
        renderCategoriesUI();
        renderCategorySelects();
      }
    });
  }

  function loadMonthExpensesForTrend() {
    var url = '/api/expenses.php?limit=200&month=' + encodeURIComponent(state.month);
    return apiFetch(url).then(function (b) {
      var exp = Array.isArray(b.expenses) ? b.expenses : [];
      mergeCategoriesFromExpenses(exp);
      renderCategoriesUI();
      renderCategorySelects();
      drawTrend(exp);
      // also used for spent today calc
      updateRemainingToday(exp);
    });
  }

  // ---- Categories
  function safeJsonParse(s) {
    try { return JSON.parse(String(s || '')); } catch (_) { return null; }
  }

  function loadStoredCategories() {
    state.categories = [];
    try {
      var raw = localStorage.getItem(CAT_STORAGE_KEY);
      var arr = safeJsonParse(raw);
      if (Array.isArray(arr)) {
        arr.forEach(function (x) {
          var s = String(x || '').trim();
          if (s && state.categories.indexOf(s) === -1) state.categories.push(s);
        });
      }
    } catch (_) {}

    if (!state.categories.length) {
      state.categories = ['Rent', 'Food', 'Transport', 'Health', 'Bills', 'Entertainment'];
    }
  }

  function persistCategories() {
    try { localStorage.setItem(CAT_STORAGE_KEY, JSON.stringify(state.categories.slice(0, 120))); } catch (_) {}
  }

  function mergeCategoriesFromExpenses(expenses) {
    var seen = {};
    state.categories.forEach(function (c) { seen[String(c).toLowerCase()] = true; });
    (expenses || []).forEach(function (e) {
      var c = String(e && e.category ? e.category : '').trim();
      if (!c) return;
      var k = c.toLowerCase();
      if (seen[k]) return;
      seen[k] = true;
      state.categories.unshift(c);
    });
    // de-dupe and clamp
    var out = [];
    var s2 = {};
    state.categories.forEach(function (c) {
      var t = String(c || '').trim();
      if (!t) return;
      var k = t.toLowerCase();
      if (s2[k]) return;
      s2[k] = true;
      out.push(t);
    });
    state.categories = out.slice(0, 120);
    persistCategories();
  }

  function categoryIconKey(cat) {
    var c = String(cat || '').toLowerCase();
    if (c.indexOf('rent') !== -1 || c.indexOf('house') !== -1) return 'home';
    if (c.indexOf('food') !== -1 || c.indexOf('cafe') !== -1) return 'coffee';
    if (c.indexOf('transport') !== -1 || c.indexOf('train') !== -1 || c.indexOf('bus') !== -1) return 'bus';
    if (c.indexOf('health') !== -1 || c.indexOf('pharm') !== -1) return 'receipt';
    if (c.indexOf('bill') !== -1 || c.indexOf('util') !== -1) return 'bulb';
    if (c.indexOf('entertain') !== -1) return 'gamepad';
    return 'dot';
  }

  function categoryIconSvg(key) {
    var k = String(key || 'dot');
    if (k === 'home') return "<svg class=\"icon icon--sm\" viewBox=\"0 0 24 24\" aria-hidden=\"true\"><path d=\"M3 11 12 3l9 8v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1V11Z\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linejoin=\"round\"/></svg>";
    if (k === 'coffee') return "<svg class=\"icon icon--sm\" viewBox=\"0 0 24 24\" aria-hidden=\"true\"><path d=\"M6 8h10v6a4 4 0 0 1-4 4h-2a4 4 0 0 1-4-4V8Z\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linejoin=\"round\"/><path d=\"M16 10h2a2 2 0 0 1 0 4h-2\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\"/><path d=\"M6 8V6h10v2\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\"/></svg>";
    if (k === 'bus') return "<svg class=\"icon icon--sm\" viewBox=\"0 0 24 24\" aria-hidden=\"true\"><path d=\"M7 3h10a2 2 0 0 1 2 2v12H5V5a2 2 0 0 1 2-2Z\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linejoin=\"round\"/><path d=\"M5 11h14\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\"/><path d=\"M8 18a1 1 0 1 0 0 2 1 1 0 0 0 0-2Zm8 0a1 1 0 1 0 0 2 1 1 0 0 0 0-2Z\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\"/><path d=\"M7 17v3M17 17v3\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\"/></svg>";
    if (k === 'receipt') return "<svg class=\"icon icon--sm\" viewBox=\"0 0 24 24\" aria-hidden=\"true\"><path d=\"M6 3h12v18l-2-1-2 1-2-1-2 1-2-1-2 1V3Z\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linejoin=\"round\"/><path d=\"M8 8h8M8 12h8M8 16h6\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\"/></svg>";
    if (k === 'bulb') return "<svg class=\"icon icon--sm\" viewBox=\"0 0 24 24\" aria-hidden=\"true\"><path d=\"M9 18h6\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\"/><path d=\"M10 22h4\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\"/><path d=\"M8 14a6 6 0 1 1 8 0c-1 1-1.5 2-1.5 3H9.5C9.5 16 9 15 8 14Z\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linejoin=\"round\"/></svg>";
    if (k === 'gamepad') return "<svg class=\"icon icon--sm\" viewBox=\"0 0 24 24\" aria-hidden=\"true\"><path d=\"M7 14h10a4 4 0 0 1 4 4v1a2 2 0 0 1-3.2 1.6l-2.2-1.6H8.4l-2.2 1.6A2 2 0 0 1 3 19v-1a4 4 0 0 1 4-4Z\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linejoin=\"round\"/><path d=\"M8.5 17h3M10 15.5v3\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\"/><path d=\"M16.5 16.5h.01M18 18h.01\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"3\" stroke-linecap=\"round\"/></svg>";
    return "<svg class=\"icon icon--xs\" viewBox=\"0 0 24 24\" aria-hidden=\"true\"><path d=\"M12 12h.01\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"6\" stroke-linecap=\"round\"/></svg>";
  }


  function renderCategoriesUI() {
    var wrap = qs('#finCats');
    if (!wrap) return;

    wrap.innerHTML = '';
    state.categories.slice(0, 10).forEach(function (c) {
      var row = document.createElement('div');
      row.className = 'fin-cat';
      row.setAttribute('data-cat', c);

      var left = document.createElement('div');
      left.className = 'fin-cat__left';

      var ic = document.createElement('div');
      ic.className = 'fin-cat__ic';
      ic.innerHTML = categoryIconSvg(categoryIconKey(c));

      var name = document.createElement('div');
      name.className = 'fin-cat__name';
      name.textContent = c;

      left.appendChild(ic);
      left.appendChild(name);

      var actions = document.createElement('div');
      actions.className = 'fin-cat__actions';

      var edit = document.createElement('button');
      edit.type = 'button';
      edit.className = 'icon-btn icon-btn--tiny';
      edit.setAttribute('aria-label', 'Edit category');
      edit.setAttribute('data-action', 'cat-edit');
      edit.innerHTML = '<svg class="icon icon--xs" viewBox="0 0 24 24" aria-hidden="true"><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5Z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>';

      var del = document.createElement('button');
      del.type = 'button';
      del.className = 'icon-btn icon-btn--tiny';
      del.setAttribute('aria-label', 'Remove category');
      del.setAttribute('data-action', 'cat-del');
      del.innerHTML = '<svg class="icon icon--xs" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M10 11v7M14 11v7M6 7l1-3h10l1 3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';

      actions.appendChild(edit);
      actions.appendChild(del);

      row.appendChild(left);
      row.appendChild(actions);
      wrap.appendChild(row);
    });
  }

  function renderCategorySelects() {
    var sel = qs('#finExpCategory');
    if (sel) {
      sel.innerHTML = '';
      state.categories.slice(0, 50).forEach(function (c) {
        var opt = document.createElement('option');
        opt.value = c;
        opt.textContent = c;
        sel.appendChild(opt);
      });
      if (state.categories.length) sel.value = state.categories[0];
    }

    // datalist used by other pages too
    var dl = qs('#expenseCats');
    if (dl) {
      dl.innerHTML = '';
      state.categories.slice(0, 80).forEach(function (c) {
        var o = document.createElement('option');
        o.value = c;
        dl.appendChild(o);
      });
    }
  }

  function taskAreaLabel(area) {
    var a = String(area || 'general');
    if (a === 'study') return 'Study';
    if (a === 'personal') return 'Personal';
    return 'General';
  }

  function taskOptionLabel(task) {
    if (!task || !task.id) return '';
    var bits = [];
    bits.push('[' + taskAreaLabel(task.kind || 'general') + ']');
    bits.push(String(task.title || 'Untitled task'));
    if (task.due_date) bits.push('· due ' + String(task.due_date));
    return bits.join(' ');
  }

  function ensureTaskOption(taskId, title, kind) {
    var id = String(taskId || '').trim();
    if (!id) return;
    var exists = (state.taskOptions || []).some(function (task) { return String(task.id) === id; });
    if (exists) return;
    state.taskOptions.unshift({
      id: id,
      title: String(title || 'Linked task'),
      kind: String(kind || 'general')
    });
  }

  function renderTaskSelect() {
    var sel = qs('#finExpLinkedTask');
    if (!sel) return;
    var current = String(sel.value || '');
    sel.innerHTML = '';

    var empty = document.createElement('option');
    empty.value = '';
    empty.textContent = 'Not linked';
    sel.appendChild(empty);

    (state.taskOptions || []).forEach(function (task) {
      if (!task || !task.id) return;
      var opt = document.createElement('option');
      opt.value = String(task.id);
      opt.textContent = taskOptionLabel(task);
      sel.appendChild(opt);
    });

    if (current && (state.taskOptions || []).some(function (t) { return String(t.id) === current; })) {
      sel.value = current;
    } else {
      sel.value = '';
    }

    syncExpenseTaskLinkUI();
  }

  function findTaskOptionById(taskId) {
    var id = String(taskId || '');
    if (!id) return null;
    var found = null;
    (state.taskOptions || []).some(function (task) {
      if (String(task.id) === id) {
        found = task;
        return true;
      }
      return false;
    });
    return found;
  }

  function syncExpenseTaskLinkUI() {
    var sel = qs('#finExpLinkedTask');
    var area = qs('#finExpLifeArea');
    var hint = qs('#finExpLinkedHint');
    var task = findTaskOptionById(sel ? sel.value : '');

    if (!task) {
      if (area) {
        area.disabled = false;
        if (!area.value) area.value = 'general';
      }
      if (hint) hint.textContent = 'Use this when the expense belongs to a specific task so reports and planning stay aligned.';
      return;
    }

    if (area) {
      area.value = String(task.kind || 'general');
      area.disabled = true;
    }

    if (hint) {
      var parts = ['Linked to ' + String(task.title || 'task') + '.'];
      if (task.due_date) parts.push('Due ' + String(task.due_date) + '.');
      hint.textContent = parts.join(' ');
    }
  }

  function loadTaskOptions() {
    return apiFetch('/api/tasks.php?limit=200').then(function (b) {
      state.taskOptions = Array.isArray(b.tasks) ? b.tasks : [];
      renderTaskSelect();
    }).catch(function () {
      state.taskOptions = [];
      renderTaskSelect();
    });
  }

  function bindTaskLinkField() {
    var sel = qs('#finExpLinkedTask');
    if (sel) {
      sel.addEventListener('change', function () {
        syncExpenseTaskLinkUI();
      });
    }
    var area = qs('#finExpLifeArea');
    if (area) {
      area.addEventListener('change', function () {
        var task = findTaskOptionById(qs('#finExpLinkedTask') ? qs('#finExpLinkedTask').value : '');
        if (!task) syncExpenseTaskLinkUI();
      });
    }
  }

  function enterExpenseEditMode(expense) {
    if (!expense || !expense.id) return;
    state.editExpenseId = String(expense.id);
    var cat = qs('#finExpCategory');
    var date = qs('#finExpDate');
    var amt = qs('#finExpAmount');
    var note = qs('#finExpNote');
    var linked = qs('#finExpLinkedTask');
    var area = qs('#finExpLifeArea');
    var submit = qs('#finAddExpense');
    var cancel = qs('#finCancelExpenseEdit');
    var del = qs('#finDeleteExpense');

    if (cat) cat.value = String(expense.category || '');
    if (date) date.value = String(expense.expense_date || '');
    if (amt) amt.value = fmtMoneyInput(expense.amount_cents || 0);
    if (note) note.value = String(expense.note || '');
    ensureTaskOption(expense.linked_task_id, expense.linked_task_title, expense.life_area);
    renderTaskSelect();
    if (linked) linked.value = expense.linked_task_id ? String(expense.linked_task_id) : '';
    if (area) area.value = String(expense.life_area || 'general');
    syncExpenseTaskLinkUI();

    if (submit) submit.textContent = 'Save Changes';
    if (cancel) cancel.hidden = false;
    if (del) del.hidden = false;
    setText('finExpenseHint', 'Editing expense #' + String(expense.id) + '.');

    var panel = qs('.fin-panel--expense');
    if (panel && panel.scrollIntoView) panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function exitExpenseEditMode(clearForm) {
    state.editExpenseId = '';
    var form = qs('#finExpenseForm');
    var submit = qs('#finAddExpense');
    var cancel = qs('#finCancelExpenseEdit');
    var del = qs('#finDeleteExpense');
    var area = qs('#finExpLifeArea');
    var linked = qs('#finExpLinkedTask');

    if (clearForm && form) form.reset();
    if (submit) submit.textContent = 'Add Expense';
    if (cancel) cancel.hidden = true;
    if (del) del.hidden = true;
    if (linked) linked.value = '';
    if (area) {
      area.disabled = false;
      if (!area.value) area.value = 'general';
    }
    setDefaultDates();
    syncExpenseTaskLinkUI();
  }

  function deleteExpenseById(expenseId) {
    var id = String(expenseId || '').trim();
    if (!id) return Promise.resolve();
    return apiFetch('/api/expenses.php?id=' + encodeURIComponent(id), { method: 'DELETE', json: {}, csrf: true })
      .then(function () {
        if (state.editExpenseId === id) exitExpenseEditMode(true);
        setText('finExpenseHint', 'Expense deleted.');
        return loadBudget(state.month)
          .then(function () { return loadMonthExpensesForTrend(); })
          .then(function () { return loadExpensesForPeriod(state.period); });
      });
  }

  // ---- Summary rendering
  function drawDonut(canvas, pct) {
    if (!canvas || !canvas.getContext) return;
    var ctx = canvas.getContext('2d');

    var dpr = (window.devicePixelRatio || 1);
    var rect = canvas.getBoundingClientRect ? canvas.getBoundingClientRect() : null;
    var cssW = rect && rect.width ? rect.width : canvas.width;
    var cssH = rect && rect.height ? rect.height : canvas.height;
    var w = Math.max(1, Math.round(cssW * dpr));
    var h = Math.max(1, Math.round(cssH * dpr));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }

    ctx.clearRect(0, 0, w, h);

    var cx = w / 2, cy = h / 2;
    var r = Math.min(w, h) / 2 - 6;
    var lw = Math.max(8, Math.round(r * 0.22));
    var start = -Math.PI / 2;
    var t = Math.max(0, Math.min(1, (Number(pct) || 0) / 100));

    ctx.lineCap = 'round';

    // Track
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(0,0,0,.12)';
    ctx.lineWidth = lw;
    ctx.stroke();

    // Arc (remaining)
    ctx.beginPath();
    ctx.arc(cx, cy, r, start, start + Math.PI * 2 * t);
    ctx.strokeStyle = 'rgba(47,111,85,.78)';
    ctx.lineWidth = lw;
    ctx.stroke();

    // Small accent segment
    ctx.beginPath();
    ctx.arc(cx, cy, r, start + Math.PI * 2 * t, start + Math.PI * 2 * Math.min(1, t + 0.10));
    ctx.strokeStyle = 'rgba(230, 170, 60, .75)';
    ctx.lineWidth = lw;
    ctx.stroke();
  }

  function renderSummary() {
    var cur = state.currency;

    setText('finRemainingMonth', fmtMoney(state.remainingCents, cur));

    var pctRemain = 0;
    if (state.budgetCents > 0) {
      pctRemain = Math.round((state.remainingCents / state.budgetCents) * 100);
      if (pctRemain < 0) pctRemain = 0;
      if (pctRemain > 100) pctRemain = 100;
    }
    setText('finRemainPct', pctRemain + '%');
    drawDonut(qs('#finDonut'), pctRemain);

    // planned spend to date vs actual
    var now = today();
    var day = now.getDate();
    var plannedToDate = 0;
    if (state.budgetCents > 0 && state.daysInMonth > 0) {
      plannedToDate = Math.round(state.budgetCents * (day / state.daysInMonth));
    }
    var delta = plannedToDate - state.spentCents;
    if (state.budgetCents === 0) {
      setText('finMonthDelta', 'Set a monthly budget to see insights.');
    } else if (delta >= 0) {
      setText('finMonthDelta', 'You have saved ' + fmtMoney(delta, cur) + ' more than planned so far.');
    } else {
      setText('finMonthDelta', 'You are ' + fmtMoney(Math.abs(delta), cur) + ' over the planned spend so far.');
    }

    // daily allowance
    var plannedToday = state.dailyAllowanceCents;
    if (plannedToday <= 0) {
      setText('finPlannedToday', '');
      setText('finRemainingToday', '—');
      setText('finTodayHint', 'Daily allowance is available for the current month only.');
      replaceProgressClass(qs('#finTodayBar'), 0);
    } else {
      setText('finPlannedToday', '/ ' + fmtMoney(plannedToday, cur) + ' planned');
      // remaining today is computed after month expenses load
      setText('finRemainingToday', fmtMoney(plannedToday, cur));
      replaceProgressClass(qs('#finTodayBar'), 0);
      setText('finTodayHint', 'Track today to stay on plan.');
    }

    // warnings
    var warnCard = qs('.fin-card--warn');
    if (warnCard) warnCard.classList.remove('is-danger');

    if (state.budgetCents <= 0) {
      setText('finWarnTitle', 'No budget set yet.');
      setText('finWarnMsg', 'Set your monthly budget to unlock warnings and daily allowance.');
    } else if (state.spentCents > state.budgetCents) {
      var over = state.spentCents - state.budgetCents;
      setText('finWarnTitle', 'ALERT: Budget overspent.');
      setText('finWarnMsg', 'You are over by ' + fmtMoney(over, cur) + '.');
      if (warnCard) warnCard.classList.add('is-danger');
    } else {
      var used = Math.round((state.spentCents / state.budgetCents) * 100);
      if (used >= 95) {
        setText('finWarnTitle', 'ALERT: Budget (' + used + '% used).');
        setText('finWarnMsg', 'Slow down to avoid overspending this month.');
      } else {
        setText('finWarnTitle', 'All good.');
        setText('finWarnMsg', 'You are on track for this month.');
      }
    }

    // savings goal (proxy = remaining percent)
    setText('finGoalPct', pctRemain + '%');
    replaceProgressClass(qs('#finGoalBar'), pctRemain);
  }

  function updateRemainingToday(monthExpenses) {
    var planned = state.dailyAllowanceCents;
    if (planned <= 0) return;

    var t = ymd(today());
    var spentToday = 0;
    (monthExpenses || []).forEach(function (e) {
      if (!e) return;
      if (String(e.expense_date || '') !== t) return;
      spentToday += clampInt(e.amount_cents || 0, 0, 1000000000);
    });

    var remainingToday = Math.max(0, planned - spentToday);
    setText('finRemainingToday', fmtMoney(remainingToday, state.currency));

    var usedPct = planned > 0 ? Math.round((spentToday / planned) * 100) : 0;
    if (usedPct < 0) usedPct = 0;
    if (usedPct > 100) usedPct = 100;
    replaceProgressClass(qs('#finTodayBar'), usedPct);

    if (spentToday === 0) {
      setText('finTodayHint', 'Great job! Spend responsibly.');
    } else {
      setText('finTodayHint', fmtMoney(remainingToday, state.currency) + ' remaining today.');
    }
  }

  // ---- Ledger
  function renderLedger() {
    var tbody = qs('#finExpensesBody');
    var empty = qs('#finEmpty');
    if (!tbody) return;

    var q = String((qs('#financeSearch') && qs('#financeSearch').value) || '').trim().toLowerCase();
    var catFilter = String(state.categoryFilter || '').trim().toLowerCase();

    var list = (state.expenses || []).slice();
    if (catFilter) {
      list = list.filter(function (e) { return String(e.category || '').toLowerCase() === catFilter; });
    }
    if (q) {
      list = list.filter(function (e) {
        var s = (String(e.category || '') + ' ' + String(e.note || '') + ' ' + String(e.linked_task_title || '') + ' ' + String(e.life_area || '')).toLowerCase();
        return s.indexOf(q) !== -1;
      });
    }

    tbody.innerHTML = '';

    if (!list.length) {
      if (empty) empty.hidden = false;
      refreshLedgerCategoryFilter();
      return;
    }
    if (empty) empty.hidden = true;

    list.forEach(function (e) {
      var tr = document.createElement('tr');
      tr.setAttribute('data-expense-id', String(e.id || ''));

      var tdIc = document.createElement('td');
      tdIc.className = 'ledger__ic';
      var ic = document.createElement('div');
      ic.className = 'ledger-ic';
      ic.textContent = categoryIcon(e.category);
      tdIc.appendChild(ic);

      var tdDt = document.createElement('td');
      tdDt.textContent = formatDateTime(e);

      var tdCat = document.createElement('td');
      tdCat.textContent = String(e.category || '');

      var tdDesc = document.createElement('td');
      var descMain = document.createElement('div');
      descMain.className = 'ledger__descmain';
      descMain.textContent = String(e.note || '') || '—';
      tdDesc.appendChild(descMain);
      if (e.linked_task_title) {
        var descTask = document.createElement('div');
        descTask.className = 'ledger__tasklink';
        var taskPill = document.createElement('span');
        taskPill.className = 'ledger__taskpill';
        taskPill.textContent = 'Task: ' + String(e.linked_task_title || '');
        descTask.appendChild(taskPill);
        tdDesc.appendChild(descTask);
      } else if (e.life_area) {
        var descMeta = document.createElement('div');
        descMeta.className = 'ledger__descmeta';
        descMeta.textContent = 'Area: ' + taskAreaLabel(e.life_area);
        tdDesc.appendChild(descMeta);
      }

      var tdCtx = document.createElement('td');
      var area = String(e.life_area || 'general');
      var chip = document.createElement('span');
      chip.className = 'context-chip context-chip--' + area + (e.linked_task_id ? ' context-chip--linked' : '');
      chip.textContent = e.linked_task_id ? ('Linked · ' + taskAreaLabel(area)) : taskAreaLabel(area);
      tdCtx.appendChild(chip);

      var tdAmt = document.createElement('td');
      tdAmt.className = 'ledger__amt';
      tdAmt.textContent = fmtMoney(e.amount_cents || 0, e.currency || state.currency);

      var tdActions = document.createElement('td');
      tdActions.className = 'ledger__actions';
      var actions = document.createElement('div');
      actions.className = 'ledger-actions';

      var editBtn = document.createElement('button');
      editBtn.type = 'button';
      editBtn.className = 'icon-btn icon-btn--tiny ledger-action';
      editBtn.setAttribute('aria-label', 'Edit expense');
      editBtn.setAttribute('data-action', 'edit');
      editBtn.innerHTML = '<svg class="icon icon--xs" viewBox="0 0 24 24" aria-hidden="true"><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5Z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>';

      var delBtn = document.createElement('button');
      delBtn.type = 'button';
      delBtn.className = 'icon-btn icon-btn--tiny ledger-action';
      delBtn.setAttribute('aria-label', 'Delete expense');
      delBtn.setAttribute('data-action', 'delete');
      delBtn.innerHTML = '<svg class="icon icon--xs" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M10 11v7M14 11v7M6 7l1-3h10l1 3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';

      actions.appendChild(editBtn);
      actions.appendChild(delBtn);
      tdActions.appendChild(actions);

      tr.appendChild(tdIc);
      tr.appendChild(tdDt);
      tr.appendChild(tdCat);
      tr.appendChild(tdDesc);
      tr.appendChild(tdCtx);
      tr.appendChild(tdAmt);
      tr.appendChild(tdActions);
      tbody.appendChild(tr);
    });

    refreshLedgerCategoryFilter();
  }

  function formatDateTime(exp) {
    var dt = String(exp && exp.created_at ? exp.created_at : '');
    var date = String(exp && exp.expense_date ? exp.expense_date : '');
    try {
      if (dt) {
        var d = new Date(dt.replace(' ', 'T') + 'Z');
        if (!isNaN(d.getTime())) {
          return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(d)
            + ', ' + new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' }).format(d);
        }
      }
      if (date) {
        var d2 = new Date(date + 'T00:00:00');
        return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(d2);
      }
    } catch (_) {}
    return date || '—';
  }

  function refreshLedgerCategoryFilter() {
    var sel = qs('#finFilterCat');
    if (!sel) return;

    var existing = String(sel.value || '');
    var cats = {};
    (state.expenses || []).forEach(function (e) {
      var c = String(e && e.category ? e.category : '').trim();
      if (!c) return;
      cats[c] = true;
    });
    var list = Object.keys(cats).sort(function (a, b) { return a.localeCompare(b); });

    sel.innerHTML = '';
    var opt0 = document.createElement('option');
    opt0.value = '';
    opt0.textContent = 'Filter by Category';
    sel.appendChild(opt0);

    list.forEach(function (c) {
      var opt = document.createElement('option');
      opt.value = c;
      opt.textContent = c;
      sel.appendChild(opt);
    });

    if (existing && cats[existing]) sel.value = existing;
  }

  // ---- Trend chart
  function drawTrend(expenses) {
    var canvas = qs('#finTrend');
    if (!canvas || !canvas.getContext) return;

    var ctx = canvas.getContext('2d');

    var dpr = (window.devicePixelRatio || 1);
    var rect = canvas.getBoundingClientRect ? canvas.getBoundingClientRect() : null;
    var cssW = rect && rect.width ? rect.width : canvas.width;
    var cssH = rect && rect.height ? rect.height : canvas.height;
    var w = Math.max(1, Math.round(cssW * dpr));
    var h = Math.max(1, Math.round(cssH * dpr));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }

    ctx.clearRect(0, 0, w, h);

    if (!state.month) return;

    // Build day sums
    var parts = state.month.split('-');
    var y = parseInt(parts[0], 10);
    var m = parseInt(parts[1], 10);
    if (!isFinite(y) || !isFinite(m)) return;

    var daysIn = state.daysInMonth || 30;
    var sums = [];
    for (var i = 0; i < daysIn; i++) sums.push(0);

    (expenses || []).forEach(function (e) {
      var d = String(e && e.expense_date ? e.expense_date : '');
      if (!d || d.indexOf(state.month) !== 0) return;
      var dd = parseInt(d.slice(8, 10), 10);
      if (!isFinite(dd) || dd < 1 || dd > daysIn) return;
      sums[dd - 1] += clampInt(e.amount_cents || 0, 0, 1000000000);
    });

    // Convert to dollars
    var vals = sums.map(function (c) { return c / 100; });
    var max = 0;
    for (var j = 0; j < vals.length; j++) if (vals[j] > max) max = vals[j];
    if (max <= 0) max = 1;

    var pad = Math.round(14 * dpr);

    function x(i) {
      if (vals.length <= 1) return pad;
      return pad + (w - pad * 2) * (i / (vals.length - 1));
    }

    function yv(v) {
      var t = v / max;
      return (h - pad) - (h - pad * 2) * t;
    }

    // guideline at daily allowance (planned)
    if (state.dailyAllowanceCents > 0) {
      var target = (state.dailyAllowanceCents / 100);
      var ty = yv(Math.min(max, target));
      ctx.beginPath();
      ctx.moveTo(pad, ty);
      ctx.lineTo(w - pad, ty);
      ctx.lineWidth = Math.max(1, 2 * dpr);
      ctx.strokeStyle = 'rgba(230, 170, 60, .60)';
      ctx.stroke();
    }

    // area
    ctx.beginPath();
    ctx.moveTo(x(0), h - pad);
    for (var k = 0; k < vals.length; k++) {
      ctx.lineTo(x(k), yv(vals[k]));
    }
    ctx.lineTo(x(vals.length - 1), h - pad);
    ctx.closePath();
    ctx.fillStyle = 'rgba(47,111,85,.10)';
    ctx.fill();

    // line
    ctx.beginPath();
    for (var k2 = 0; k2 < vals.length; k2++) {
      var px = x(k2), py = yv(vals[k2]);
      if (k2 === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.lineWidth = Math.max(2, 3 * dpr);
    ctx.strokeStyle = 'rgba(47,111,85,.62)';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();

    // last dot
    ctx.beginPath();
    ctx.arc(x(vals.length - 1), yv(vals[vals.length - 1]), Math.max(3, 4 * dpr), 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(47,111,85,.72)';
    ctx.fill();
  }

  // ---- Actions
  function bindLogout() {
    function doLogout() {
      // logout endpoint is CSRF-protected.
      var ensure = Promise.resolve();
      if (!state.csrf) {
        ensure = apiFetch('/api/bootstrap.php').then(function (b) {
          state.csrf = String(b.csrf_token || '');
        }).catch(function () {});
      }

      ensure
        .then(function () { return apiFetch('/api/auth/logout.php', { method: 'POST', json: {}, csrf: true }); })
        .catch(function () {})
        .finally(function () { window.location.href = '/login.php'; });
    }

    var lo = qs('#btnLogout');
    if (lo) lo.addEventListener('click', function (e) { e.preventDefault(); doLogout(); });
    var dlo = qs('#drawerLogout');
    if (dlo) dlo.addEventListener('click', function (e) { e.preventDefault(); doLogout(); });
  }

  function bindCategories() {
    var add = qs('#finAddCatBtn');
    var inp = qs('#finNewCat');

    if (add && inp) {
      add.addEventListener('click', function (e) {
        e.preventDefault();
        var v = String(inp.value || '').trim();
        if (!v) return;
        state.categories.unshift(v);
        mergeCategoriesFromExpenses([]);
        inp.value = '';
        renderCategoriesUI();
        renderCategorySelects();
      });

      inp.addEventListener('keydown', function (e) {
        if (e.key !== 'Enter') return;
        e.preventDefault();
        add.click();
      });
    }

    var list = qs('#finCats');
    if (list) {
      list.addEventListener('click', function (e) {
        var btn = e.target && e.target.closest ? e.target.closest('button[data-action]') : null;
        if (!btn) return;
        var row = btn.closest('.fin-cat');
        var cat = row ? row.getAttribute('data-cat') : '';
        if (!cat) return;

        var act = btn.getAttribute('data-action');
        if (act === 'cat-del') {
          state.categories = state.categories.filter(function (c) { return String(c).toLowerCase() !== String(cat).toLowerCase(); });
          persistCategories();
          renderCategoriesUI();
          renderCategorySelects();
        }

        if (act === 'cat-edit') {
          var next = prompt('Rename category:', cat);
          next = String(next || '').trim();
          if (!next) return;
          state.categories = state.categories.map(function (c) {
            return (String(c).toLowerCase() === String(cat).toLowerCase()) ? next : c;
          });
          persistCategories();
          renderCategoriesUI();
          renderCategorySelects();
        }
      });
    }
  }

  function bindBudgetSave() {
    var btn = qs('#finSaveBudget');
    if (!btn) return;

    btn.addEventListener('click', function (e) {
      e.preventDefault();
      setText('finBudgetHint', '');

      var amt = qs('#finBudgetAmount');
      var cur = qs('#finBudgetCurrency');
      var cents = parseMoneyToCents(amt ? amt.value : '');
      if (cents === null) {
        setText('finBudgetHint', 'Enter a valid budget amount.');
        return;
      }

      var payload = {
        month: state.month,
        amount_cents: cents,
        currency: cur ? String(cur.value || 'TRY') : 'TRY'
      };

      btn.disabled = true;
      apiFetch('/api/budget.php', { method: 'POST', json: payload, csrf: true })
        .then(function () {
          setText('finBudgetHint', 'Saved.');
          state.rememberedBudget = {
            month: state.month,
            currency: payload.currency,
            amount_cents: payload.amount_cents
          };
          return loadBudget(state.month).then(function () { return loadMonthExpensesForTrend(); });
        })
        .catch(function () {
          setText('finBudgetHint', 'Could not save budget. Please try again.');
        })
        .finally(function () { btn.disabled = false; });
    });
  }

  function bindExpenseAdd() {
    var form = qs('#finExpenseForm');
    if (!form) return;

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      setText('finExpenseHint', '');

      var cat = qs('#finExpCategory');
      var date = qs('#finExpDate');
      var amt = qs('#finExpAmount');
      var note = qs('#finExpNote');
      var linkedTask = qs('#finExpLinkedTask');
      var lifeArea = qs('#finExpLifeArea');

      var cents = parseMoneyToCents(amt ? amt.value : '');
      if (cents === null || cents <= 0) {
        setText('finExpenseHint', 'Enter a valid expense amount.');
        return;
      }

      var payload = {
        amount_cents: cents,
        currency: state.currency,
        category: cat ? String(cat.value || '') : '',
        expense_date: date ? String(date.value || '') : '',
        note: note ? String(note.value || '') : '',
        linked_task_id: linkedTask && linkedTask.value ? String(linkedTask.value) : null,
        life_area: lifeArea ? String(lifeArea.value || 'general') : 'general'
      };

      if (!payload.category || !payload.expense_date) {
        setText('finExpenseHint', 'Choose a category and date.');
        return;
      }

      var btn = qs('#finAddExpense');
      if (btn) btn.disabled = true;

      var isEditing = !!state.editExpenseId;
      var request;
      if (isEditing) {
        request = apiFetch('/api/expenses.php?id=' + encodeURIComponent(state.editExpenseId), { method: 'PATCH', json: payload, csrf: true });
      } else {
        request = apiFetch('/api/expenses.php', { method: 'POST', json: payload, csrf: true });
      }

      request
        .then(function () {
          mergeCategoriesFromExpenses([{ category: payload.category }]);
          renderCategoriesUI();
          renderCategorySelects();
          exitExpenseEditMode(true);
          setText('finExpenseHint', isEditing ? 'Expense updated.' : (payload.linked_task_id ? 'Added and linked to task.' : 'Added.'));
          return loadBudget(state.month)
            .then(function () { return loadTaskOptions(); })
            .then(function () { return loadMonthExpensesForTrend(); })
            .then(function () { return loadExpensesForPeriod(state.period); });
        })
        .catch(function (err) {
          setText('finExpenseHint', err && err.message ? err.message : 'Could not save expense. Please try again.');
        })
        .finally(function () {
          if (btn) btn.disabled = false;
        });
    });

    var cancelBtn = qs('#finCancelExpenseEdit');
    if (cancelBtn) {
      cancelBtn.addEventListener('click', function () {
        exitExpenseEditMode(true);
        setText('finExpenseHint', '');
      });
    }

    var deleteBtn = qs('#finDeleteExpense');
    if (deleteBtn) {
      deleteBtn.addEventListener('click', function () {
        if (!state.editExpenseId) return;
        if (!window.confirm('Delete this expense?')) return;
        deleteBtn.disabled = true;
        deleteExpenseById(state.editExpenseId)
          .catch(function (err) {
            setText('finExpenseHint', err && err.message ? err.message : 'Could not delete expense.');
          })
          .finally(function () { deleteBtn.disabled = false; });
      });
    }

    var tbody = qs('#finExpensesBody');
    if (tbody) {
      tbody.addEventListener('click', function (e) {
        var btn = e.target && e.target.closest ? e.target.closest('[data-action]') : null;
        if (!btn) return;
        var row = btn.closest('tr[data-expense-id]');
        if (!row) return;
        var expenseId = String(row.getAttribute('data-expense-id') || '');
        if (!expenseId) return;
        var expense = null;
        (state.expenses || []).some(function (item) {
          if (String(item.id) === expenseId) { expense = item; return true; }
          return false;
        });
        if (!expense) return;

        var action = btn.getAttribute('data-action');
        if (action === 'edit') {
          enterExpenseEditMode(expense);
          return;
        }
        if (action === 'delete') {
          if (!window.confirm('Delete this expense?')) return;
          deleteExpenseById(expenseId).catch(function (err) {
            setText('finExpenseHint', err && err.message ? err.message : 'Could not delete expense.');
          });
        }
      });
    }
  }

  function bindPeriodTabs() {
    qsa('.fin-ledger [data-period]').forEach(function (b) {
      b.addEventListener('click', function (e) {
        e.preventDefault();
        qsa('.fin-ledger [data-period]').forEach(function (x) {
          x.classList.remove('is-active');
          x.setAttribute('aria-selected', 'false');
        });
        b.classList.add('is-active');
        b.setAttribute('aria-selected', 'true');

        state.categoryFilter = '';
        var f = qs('#finFilterCat');
        if (f) f.value = '';

        loadExpensesForPeriod(b.getAttribute('data-period')).catch(function () {});
      });
    });
  }

  function bindCategoryFilter() {
    var sel = qs('#finFilterCat');
    if (!sel) return;
    sel.addEventListener('change', function () {
      state.categoryFilter = String(sel.value || '');
      renderLedger();
    });
  }

  function bindSearch() {
    var s = qs('#financeSearch');
    if (!s) return;
    s.addEventListener('input', function () {
      renderLedger();
    });
  }

  function setDefaultDates() {
    var d = qs('#finExpDate');
    if (!d) return;
    d.value = ymd(today());
  }

  function renderLastSynced() {
    var el = qs('#lastSynced');
    if (!el) return;
    el.textContent = 'just now';
    var t0 = Date.now();
    setInterval(function () {
      var sec = Math.floor((Date.now() - t0) / 1000);
      if (sec < 60) el.textContent = sec + 's ago';
      else el.textContent = Math.floor(sec / 60) + 'm ago';
    }, 20000);
  }

  function renderTopDate() {
    var d = today();
    try {
      setText('lnDate', new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(d));
      setText('lnDay', new Intl.DateTimeFormat('en-US', { weekday: 'long' }).format(d));
    } catch (_) {
      setText('lnDate', ymd(d));
      setText('lnDay', '');
    }
  }

  // ---- init
  function init() {
    renderTopDate();
    renderLastSynced();

    loadStoredCategories();
    renderCategoriesUI();
    renderCategorySelects();

    bindLogout();
    bindCategories();
    bindTaskLinkField();
    bindBudgetSave();
    bindExpenseAdd();
    bindPeriodTabs();
    bindCategoryFilter();
    bindSearch();
    setDefaultDates();

    var m = ym(today());

    loadBootstrap()
      .then(function () { return Promise.all([loadBudget(m), loadTaskOptions()]); })
      .then(function () { return loadMonthExpensesForTrend(); })
      .then(function () { return loadExpensesForPeriod('today'); })
      .catch(function () {
        setText('finWarnTitle', 'Could not load finance data.');
        setText('finWarnMsg', 'Please refresh and try again.');
      });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
