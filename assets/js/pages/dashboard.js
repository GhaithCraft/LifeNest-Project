/* dashboard.js — wires LifeNest UI to backend APIs (CSP-safe) */
(function () {
  function qs(sel, root) { return (root || document).querySelector(sel); }
  function qsa(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  var state = {
    csrf: '',
    user: null,
    activeTab: 'today',
    activeTaskForNotes: null,
    tasksById: {},
    expensesById: {},
    studyById: {},
    notesById: {},
    editTaskId: null,
    editExpenseId: null,
    editStudyId: null,
    editNoteId: null,
    noteColor: 'blue',
    taskFilters: {
      kind: '',
      priority: '',
      status: ''
    },
    expenseCategories: [],
    expenseTaskOptions: [],
    currency: 'TRY',
    month: '',
    budgetMemory: null,
    budgetPrefillReqId: 0,

    // Fixed events (time blocks)
    fixedEvents: [],

    // v4: selection + pending actions (undo)
    selectMode: false,
    selectedTaskIds: {},
    pendingOps: []
  };

  var UNDO_MS = 6500;
  var PENDING_STORAGE_KEY = 'ln_pending_ops_v1';

  function clampInt(n, a, b) {
    var x = parseInt(String(n), 10);
    if (!isFinite(x)) x = 0;
    if (x < a) x = a;
    if (x > b) x = b;
    return x;
  }

  function moneySymbol(cur) {
    return '₺';
  }

  function fmtMoneyFromCents(cents, cur) {
    var c = clampInt(cents, 0, 1000000000);
    var val = (c / 100).toFixed(0);
    // If has decimals, show 2.
    if (c % 100 !== 0) val = (c / 100).toFixed(2);
    return moneySymbol(cur) + val;
  }

  function fmtDuration(mins) {
    var m = parseInt(String(mins || ''), 10);
    if (!isFinite(m) || m <= 0) return '';
    var h = Math.floor(m / 60);
    var r = m % 60;
    if (h > 0 && r > 0) return h + 'h ' + r + 'm';
    if (h > 0) return h + 'h';
    return r + 'm';
  }

  function fmtDateYMD(ymd) {
    if (!ymd) return '';
    try {
      var d = new Date(String(ymd) + 'T00:00:00');
      return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(d);
    } catch (_) {
      return String(ymd);
    }
  }


  function formatUserLabel(email) {
    var raw = String(email || '').trim();
    if (!raw) return 'User';
    var local = raw.split('@')[0] || raw;
    local = local.replace(/[._-]+/g, ' ').trim();
    if (!local) return raw;
    return local.replace(/\w/g, function (m) { return m.toUpperCase(); });
  }

  function setText(id, txt) {
    var el = typeof id === 'string' ? qs('#' + id) : id;
    if (!el) return;
    el.textContent = (txt === null || typeof txt === 'undefined') ? '' : String(txt);
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

  function uniqStrings(list, max) {
    var seen = {};
    var out = [];
    (list || []).forEach(function (x) {
      var s = String(x || '').trim();
      if (!s) return;
      var k = s.toLowerCase();
      if (seen[k]) return;
      seen[k] = true;
      out.push(s);
    });
    if (max && out.length > max) out = out.slice(0, max);
    return out;
  }

  function setExpenseCategories(cats) {
    state.expenseCategories = uniqStrings(cats || [], 120);
    var dl = qs('#expenseCats');
    if (!dl) return;
    dl.innerHTML = '';
    state.expenseCategories.forEach(function (c) {
      var opt = document.createElement('option');
      opt.value = c;
      dl.appendChild(opt);
    });
  }

  function addExpenseCategory(cat) {
    var s = String(cat || '').trim();
    if (!s) return;
    var next = state.expenseCategories.slice();
    next.unshift(s);
    setExpenseCategories(next);
  }

  // ===== Fixed Events (Time Blocks) =====
  var FIXED_STORAGE_KEY = 'ln_fixed_events_v1';

  function safeJsonParse(str) {
    try {
      var v = JSON.parse(String(str || ''));
      return v;
    } catch (_) {
      return null;
    }
  }

  function defaultFixedEvents() {
    return [
      { id: 'focus', name: 'Focus', type: 'focus', start: '09:00', end: '11:00' },
      { id: 'admin', name: 'Admin', type: 'admin', start: '13:00', end: '14:00' },
      { id: 'low', name: 'Low', type: 'low', start: '16:00', end: '17:00' }
    ];
  }

  function normalizeFixedEvent(ev) {
    if (!ev || typeof ev !== 'object') return null;
    var id = String(ev.id || '').trim();
    var name = String(ev.name || '').trim();
    var type = String(ev.type || '').trim();
    var start = String(ev.start || '').trim();
    var end = String(ev.end || '').trim();

    if (!name) return null;
    if (type !== 'focus' && type !== 'admin' && type !== 'low') type = 'focus';
    if (!/^\d{2}:\d{2}$/.test(start)) start = '09:00';
    if (!/^\d{2}:\d{2}$/.test(end)) end = '10:00';
    if (!id) id = 'fx_' + Math.random().toString(36).slice(2, 10);
    return { id: id, name: name, type: type, start: start, end: end };
  }

  function loadFixedEvents() {
    state.fixedEvents = [];
    try {
      var raw = localStorage.getItem(FIXED_STORAGE_KEY);
      if (raw) {
        var arr = safeJsonParse(raw);
        if (Array.isArray(arr)) {
          arr.forEach(function (x) {
            var ev = normalizeFixedEvent(x);
            if (ev) state.fixedEvents.push(ev);
          });
        }
      }
    } catch (_) {}

    if (!state.fixedEvents.length) {
      state.fixedEvents = defaultFixedEvents();
      persistFixedEvents();
    }
  }

  function persistFixedEvents() {
    try {
      localStorage.setItem(FIXED_STORAGE_KEY, JSON.stringify(state.fixedEvents));
    } catch (_) {}
  }

  function fmtTime12(hhmm) {
    if (!/^\d{2}:\d{2}$/.test(String(hhmm || ''))) return '';
    var hh = parseInt(hhmm.slice(0, 2), 10);
    var mm = hhmm.slice(3, 5);
    var ap = (hh >= 12) ? 'PM' : 'AM';
    var h12 = hh % 12;
    if (h12 === 0) h12 = 12;
    return h12 + ':' + mm + ' ' + ap;
  }

  function fmtRange(start, end) {
    var s = fmtTime12(start);
    var e = fmtTime12(end);
    if (s && e) {
      var sAp = s.slice(-2);
      var eAp = e.slice(-2);
      if (sAp === eAp) {
        return s.replace(' ' + sAp, '') + '-' + e;
      }
      return s + '-' + e;
    }
    return s + '-' + e;
  }

  function timeToMinutes(hhmm) {
    if (!/^\d{2}:\d{2}$/.test(String(hhmm || ''))) return 0;
    var hh = parseInt(hhmm.slice(0, 2), 10);
    var mm = parseInt(hhmm.slice(3, 5), 10);
    return hh * 60 + mm;
  }

  function renderTimeBlocks() {
    var tp = (window.LN && window.LN.today_plan) ? window.LN.today_plan : null;
    if (tp && typeof tp.renderTimeBlocks === 'function') {
      try { tp.renderTimeBlocks(); } catch (_) {}
      return;
    }

    var root = qs('#timeBlocks');
    if (!root) return;
    root.innerHTML = '';

    var list = (state.fixedEvents || []).slice();
    list.sort(function (a, b) {
      return timeToMinutes(a.start) - timeToMinutes(b.start);
    });

    list.forEach(function (ev) {
      var row = document.createElement('div');
      row.className = 'time-row time-row--' + String(ev.type || 'focus');
      row.setAttribute('data-fixed-id', String(ev.id));

      var name = document.createElement('div');
      name.className = 'time-row__name';
      name.textContent = ev.name;
      row.appendChild(name);

      var t = document.createElement('div');
      t.className = 'time-row__time';
      t.textContent = fmtRange(ev.start, ev.end);
      row.appendChild(t);

      root.appendChild(row);
    });
  }

  function renderFixedList() {
    var root = qs('#fixedList');
    if (!root) return;
    root.innerHTML = '';

    var list = (state.fixedEvents || []).slice();
    list.sort(function (a, b) { return timeToMinutes(a.start) - timeToMinutes(b.start); });

    if (!list.length) {
      var empty = document.createElement('div');
      empty.className = 'ln-fixed__empty';
      empty.textContent = 'No fixed events yet.';
      root.appendChild(empty);
      return;
    }

    list.forEach(function (ev) {
      var row = document.createElement('button');
      row.type = 'button';
      row.className = 'ln-fixed__row';
      row.setAttribute('data-fixed-id', String(ev.id));

      var left = document.createElement('div');
      left.className = 'ln-fixed__left';

      var nm = document.createElement('div');
      nm.className = 'ln-fixed__name';
      nm.textContent = ev.name;
      left.appendChild(nm);

      var sub = document.createElement('div');
      sub.className = 'ln-fixed__sub';
      sub.textContent = fmtRange(ev.start, ev.end);
      left.appendChild(sub);

      row.appendChild(left);

      var tag = document.createElement('span');
      tag.className = 'ln-fixed__tag ln-fixed__tag--' + String(ev.type || 'focus');
      tag.textContent = (ev.type === 'admin') ? 'Admin' : (ev.type === 'low' ? 'Low' : 'Focus');
      row.appendChild(tag);

      root.appendChild(row);
    });
  }

  function setFixedHint(msg) {
    setText('fixedHint', msg || '');
  }

  function resetFixedForm() {
    var id = qs('#fixedId');
    if (id) id.value = '';
    var name = qs('#fixedName');
    if (name) name.value = '';
    var type = qs('#fixedType');
    if (type) type.value = 'focus';
    var st = qs('#fixedStart');
    if (st) st.value = '09:00';
    var en = qs('#fixedEnd');
    if (en) en.value = '10:00';
    var del = qs('#fixedDelete');
    if (del) del.hidden = true;
    setFixedHint('');
  }

  function openFixedEditorById(fid) {
    var ev = null;
    for (var i = 0; i < state.fixedEvents.length; i++) {
      if (String(state.fixedEvents[i].id) === String(fid)) {
        ev = state.fixedEvents[i];
        break;
      }
    }
    if (!ev) return;

    var id = qs('#fixedId');
    if (id) id.value = String(ev.id);
    var name = qs('#fixedName');
    if (name) name.value = ev.name;
    var type = qs('#fixedType');
    if (type) type.value = ev.type;
    var st = qs('#fixedStart');
    if (st) st.value = ev.start;
    var en = qs('#fixedEnd');
    if (en) en.value = ev.end;
    var del = qs('#fixedDelete');
    if (del) del.hidden = false;
    setFixedHint('Editing “' + ev.name + '”.');
  }

  // ===== v4: Pending actions + snackbar (Undo) =====
  var pendingTimers = {};
  var snackOpId = null;
  var pendingTick = null;

  function nowMs() {
    try { return Date.now(); } catch (_) { return (new Date()).getTime(); }
  }

  function normalizeIdList(ids, max) {
    var out = [];
    var seen = {};
    (ids || []).forEach(function (x) {
      var s = String(x || '').trim();
      if (!/^[0-9]+$/.test(s)) return;
      if (seen[s]) return;
      seen[s] = true;
      out.push(s);
    });
    if (max && out.length > max) out = out.slice(0, max);
    return out;
  }

  function serializableOp(op) {
    return {
      op_id: String(op.op_id || ''),
      type: String(op.type || ''),
      ids: normalizeIdList(op.ids || [], 200),
      due_at: clampInt(op.due_at || 0, 0, 9999999999999),
      status: String(op.status || 'pending')
    };
  }

  function persistPendingOps() {
    try {
      var payload = state.pendingOps.map(serializableOp);
      sessionStorage.setItem(PENDING_STORAGE_KEY, JSON.stringify(payload));
    } catch (_) {}
  }

  function loadPendingOpsFromStorage() {
    state.pendingOps = [];
    try {
      var raw = sessionStorage.getItem(PENDING_STORAGE_KEY);
      if (!raw) return;
      var arr = safeJsonParse(raw);
      if (!Array.isArray(arr)) return;
      arr.forEach(function (x) {
        if (!x || typeof x !== 'object') return;
        var op = serializableOp(x);
        if (!op.op_id || !op.type || !op.ids.length) return;
        if (op.status !== 'pending' && op.status !== 'failed') op.status = 'pending';
        state.pendingOps.push(op);
      });
    } catch (_) {}
  }

  function isTaskIdPending(id) {
    var sid = String(id);
    for (var i = 0; i < state.pendingOps.length; i++) {
      var op = state.pendingOps[i];
      if (!op || op.status !== 'pending') continue;
      if (op.type !== 'task_delete' && op.type !== 'tasks_bulk_delete') continue;
      if (op.ids.indexOf(sid) !== -1) return true;
    }
    return false;
  }

  function isExpenseIdPending(id) {
    var sid = String(id);
    for (var i = 0; i < state.pendingOps.length; i++) {
      var op = state.pendingOps[i];
      if (!op || op.status !== 'pending') continue;
      if (op.type !== 'expense_delete') continue;
      if (op.ids.indexOf(sid) !== -1) return true;
    }
    return false;
  }

  function clearTimer(opId) {
    var t = pendingTimers[String(opId || '')];
    if (t) {
      try { clearTimeout(t); } catch (_) {}
    }
    delete pendingTimers[String(opId || '')];
  }

  function opTitle(op) {
    if (!op) return 'Action';
    if (op.type === 'task_delete') return 'Delete task';
    if (op.type === 'tasks_bulk_delete') return 'Delete tasks';
    if (op.type === 'expense_delete') return 'Delete expense';
    return 'Action';
  }

  function opMessage(op) {
    if (!op) return '';
    var n = (op.ids || []).length;
    if (op.type === 'task_delete') return 'Task will be deleted. You can undo.';
    if (op.type === 'expense_delete') return 'Expense will be deleted. You can undo.';
    if (op.type === 'tasks_bulk_delete') return n + ' tasks will be deleted. You can undo.';
    return 'Action pending.';
  }

  function opTimeLeft(op) {
    if (!op || op.status !== 'pending') return 0;
    return Math.max(0, (op.due_at || 0) - nowMs());
  }

  function showSnackForOp(op) {
    var snack = qs('#lnSnack');
    if (!snack) return;
    var msg = qs('#lnSnackMsg');
    var act = qs('#lnSnackAction');
    if (msg) msg.textContent = opMessage(op);

    snackOpId = op ? String(op.op_id || '') : null;

    if (act) {
      act.disabled = !(op && op.status === 'pending');
      act.textContent = 'Undo';
    }

    snack.setAttribute('aria-hidden', 'false');
  }

  function hideSnack() {
    var snack = qs('#lnSnack');
    if (!snack) return;
    snack.setAttribute('aria-hidden', 'true');
    snackOpId = null;
  }

  function latestPendingOp() {
    if (!state.pendingOps.length) return null;
    // Choose latest due_at (last created-ish)
    var best = null;
    for (var i = 0; i < state.pendingOps.length; i++) {
      var op = state.pendingOps[i];
      if (!op) continue;
      if (!best) best = op;
      else if ((op.due_at || 0) > (best.due_at || 0)) best = op;
    }
    return best;
  }

  function refreshSnack() {
    var open = qs('#lnSnack') && qs('#lnSnack').getAttribute('aria-hidden') === 'false';
    if (!open) return;
    var op = null;
    if (snackOpId) {
      op = state.pendingOps.filter(function (x) { return x && String(x.op_id) === String(snackOpId); })[0] || null;
    }
    if (!op) op = latestPendingOp();
    if (!op) { hideSnack(); return; }
    showSnackForOp(op);
  }

  function markPendingInDom() {
    // Tasks list
    qsa('.task[data-task-id]').forEach(function (el) {
      var id = el.getAttribute('data-task-id');
      el.classList.toggle('is-pending', isTaskIdPending(id));
    });
    // Priorities list
    qsa('.prio-row[data-task-id]').forEach(function (el) {
      var id = el.getAttribute('data-task-id');
      el.classList.toggle('is-pending', isTaskIdPending(id));
    });
    // Expenses list modal
    qsa('.ln-exp-row[data-expense-id]').forEach(function (el) {
      var id = el.getAttribute('data-expense-id');
      el.classList.toggle('is-pending', isExpenseIdPending(id));
    });
  }

  async function commitPendingOp(opId) {
    var id = String(opId || '');
    if (!id) return;
    var op = state.pendingOps.filter(function (x) { return x && String(x.op_id) === id; })[0] || null;
    if (!op || op.status !== 'pending') return;

    clearTimer(id);

    try {
      if (op.type === 'task_delete') {
        await api('DELETE', '/api/tasks.php?id=' + encodeURIComponent(op.ids[0] || ''), {});
      } else if (op.type === 'tasks_bulk_delete') {
        await api('POST', '/api/tasks_bulk.php', { action: 'delete', ids: op.ids });
      } else if (op.type === 'expense_delete') {
        await api('DELETE', '/api/expenses.php?id=' + encodeURIComponent(op.ids[0] || ''), {});
      }

      // remove op
      state.pendingOps = state.pendingOps.filter(function (x) { return x && String(x.op_id) !== id; });
      persistPendingOps();
      markPendingInDom();
      refreshSnack();
      renderPendingModal();

      // refresh data
      await Promise.all([loadDashboard(), loadTasks(state.activeTab, (qs('#taskSearch') && qs('#taskSearch').value || '').trim())]);
      if (qs('#modalExpenses') && qs('#modalExpenses').getAttribute('aria-hidden') === 'false') {
        await loadExpensesList(qs('#expensesMonth') ? qs('#expensesMonth').value : (state.month || monthYM()));
      }
    } catch (err) {
      // mark as failed (allow retry)
      op.status = 'failed';
      persistPendingOps();
      markPendingInDom();
      renderPendingModal();
      showSnackForOp(op);
      refreshSnack();
    }
  }

  function undoPendingOp(opId) {
    var id = String(opId || '');
    if (!id) return;
    clearTimer(id);

    state.pendingOps = state.pendingOps.filter(function (x) { return x && String(x.op_id) !== id; });
    persistPendingOps();
    markPendingInDom();
    renderPendingModal();
    refreshSnack();
  }

  async function retryPendingOp(opId) {
    var id = String(opId || '');
    if (!id) return;
    var op = state.pendingOps.filter(function (x) { return x && String(x.op_id) === id; })[0] || null;
    if (!op) return;
    op.status = 'pending';
    op.due_at = nowMs();
    persistPendingOps();
    renderPendingModal();
    await commitPendingOp(id);
  }

  function scheduleTimerForOp(op) {
    if (!op || op.status !== 'pending') return;
    clearTimer(op.op_id);
    var ms = opTimeLeft(op);
    if (ms <= 0) {
      // commit now
      commitPendingOp(op.op_id).catch(function () {});
      return;
    }
    pendingTimers[String(op.op_id)] = setTimeout(function () {
      commitPendingOp(op.op_id).catch(function () {});
    }, ms);
  }

  function addPendingOp(type, ids) {
    var op = {
      op_id: 'op_' + String(nowMs()) + '_' + String(Math.floor(Math.random() * 100000)),
      type: String(type),
      ids: normalizeIdList(ids || [], 200),
      due_at: nowMs() + UNDO_MS,
      status: 'pending'
    };
    if (!op.ids.length) return null;
    state.pendingOps.push(op);
    persistPendingOps();
    scheduleTimerForOp(op);
    markPendingInDom();
    showSnackForOp(op);
    return op;
  }

  function renderPendingModal() {
    var root = qs('#pendingList');
    var hint = qs('#pendingHint');
    if (!root || !hint) return;

    root.innerHTML = '';
    var ops = state.pendingOps.slice();
    if (!ops.length) {
      hint.textContent = 'No pending actions.';
      return;
    }

    hint.textContent = 'You can undo deletions for a few seconds. Failed actions can be retried.';

    ops.sort(function (a, b) { return (b.due_at || 0) - (a.due_at || 0); });

    ops.forEach(function (op) {
      var row = document.createElement('div');
      row.className = 'pending-row' + (op.status === 'failed' ? ' is-failed' : '');
      row.setAttribute('data-op-id', String(op.op_id));

      var left = document.createElement('div');
      left.className = 'pending-row__left';

      var title = document.createElement('div');
      title.className = 'pending-row__title';
      title.textContent = opTitle(op) + ' (' + (op.ids ? op.ids.length : 0) + ')';
      left.appendChild(title);

      var meta = document.createElement('div');
      meta.className = 'pending-row__meta';
      if (op.status === 'failed') {
        meta.textContent = 'Failed. You can retry or undo.';
      } else {
        meta.textContent = 'Deleting in ' + Math.ceil(opTimeLeft(op) / 1000) + 's';
      }
      left.appendChild(meta);

      var actions = document.createElement('div');
      actions.className = 'pending-row__actions';

      var undo = document.createElement('button');
      undo.type = 'button';
      undo.className = 'btn btn--ghost btn--sm';
      undo.textContent = 'Undo';
      undo.setAttribute('data-action', 'pending-undo');
      actions.appendChild(undo);

      if (op.status === 'failed') {
        var retry = document.createElement('button');
        retry.type = 'button';
        retry.className = 'btn btn--primary btn--sm';
        retry.textContent = 'Retry';
        retry.setAttribute('data-action', 'pending-retry');
        actions.appendChild(retry);
      }

      row.appendChild(left);
      row.appendChild(actions);
      root.appendChild(row);
    });
  }

  function startPendingTick() {
    if (pendingTick) return;
    pendingTick = setInterval(function () {
      var modal = qs('#modalPending');
      if (!modal || modal.getAttribute('aria-hidden') !== 'false') {
        stopPendingTick();
        return;
      }
      // Update countdown texts
      qsa('.pending-row[data-op-id]').forEach(function (row) {
        var opId = row.getAttribute('data-op-id');
        var op = state.pendingOps.filter(function (x) { return x && String(x.op_id) === String(opId); })[0] || null;
        if (!op) return;
        var meta = qs('.pending-row__meta', row);
        if (!meta) return;
        if (op.status === 'failed') return;
        meta.textContent = 'Deleting in ' + Math.ceil(opTimeLeft(op) / 1000) + 's';
      });
    }, 350);
  }

  function stopPendingTick() {
    if (!pendingTick) return;
    try { clearInterval(pendingTick); } catch (_) {}
    pendingTick = null;
  }


  async function fetchJSON(url, opts) {
    var res = await fetch(url, opts);
    var ct = (res.headers.get('content-type') || '');
    var isJson = ct.indexOf('application/json') !== -1;
    var data = isJson ? await res.json() : { ok: false, error: 'Non-JSON response' };

    // Auth/CSRF hardening
    if (res.status === 401) {
      try { window.location.href = '/login.php'; } catch (_) {}
    }
    if (res.status === 403 && data && typeof data.error === 'string' && data.error.toLowerCase().indexOf('csrf') !== -1) {
      throw new Error('Security check failed. Please reload the page.');
    }
    if (!res.ok || !data || data.ok === false) {
      var msg = (data && data.error) ? data.error : ('Request failed: ' + res.status);
      throw new Error(msg);
    }
    return data;
  }

  async function api(method, url, body) {
    var headers = {};
    if (method !== 'GET') {
      headers['Content-Type'] = 'application/json';
      headers['X-CSRF-Token'] = state.csrf;
    }
    return fetchJSON(url, {
      method: method,
      credentials: 'same-origin',
      headers: headers,
      body: (method === 'GET' ? undefined : JSON.stringify(body || {}))
    });
  }

  function todayYMD() {
    var d = new Date();
    var y = d.getFullYear();
    var m = String(d.getMonth() + 1).padStart(2, '0');
    var dd = String(d.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + dd;
  }

  function monthYM() {
    var d = new Date();
    var y = d.getFullYear();
    var m = String(d.getMonth() + 1).padStart(2, '0');
    return y + '-' + m;
  }

  function setTodayLabel() {
    try {
      var d = new Date();
      var dateShort = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(d);
      var dateLong = new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }).format(d);
      var dayStr = new Intl.DateTimeFormat('en-US', { weekday: 'long' }).format(d);
      setText('lnDate', dateShort);
      setText('lnDay', '- ' + dayStr);
      setText('heroCurrentDate', dateLong);
    } catch (_) {
      setText('lnDate', '');
      setText('lnDay', '');
      setText('heroCurrentDate', '');
    }
  }

  function setSyncedNow() {
    try {
      var d = new Date();
      var t = new Intl.DateTimeFormat('en-US', { hour: '2-digit', minute: '2-digit' }).format(d);
      setText('lastSynced', t);
    } catch (_) {
      setText('lastSynced', 'now');
    }
  }

  function priorityPillClass(priority) {
    if (priority === 'high') return 'pill pill--red pill--sm';
    if (priority === 'medium') return 'pill pill--amber pill--sm';
    return 'pill pill--mint pill--sm';
  }

  function priorityLabel(priority) {
    if (priority === 'high') return 'High';
    if (priority === 'medium') return 'Medium';
    return 'Low';
  }

  function badgeClass(durationMinutes) {
    var m = parseInt(String(durationMinutes || ''), 10);
    if (!isFinite(m) || m <= 120) return 'badge badge--mint';
    return 'badge badge--blue';
  }

  function buildCheck(checked, disabled) {
    var lab = document.createElement('label');
    lab.className = 'check' + (checked ? ' is-checked' : '');

    var inp = document.createElement('input');
    inp.type = 'checkbox';
    inp.checked = !!checked;
    inp.disabled = !!disabled;

    var box = document.createElement('span');
    box.className = 'check__box';
    box.setAttribute('aria-hidden', 'true');

    var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'check__mark');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    var path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', 'M20 6 9 17l-5-5');
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', 'currentColor');
    path.setAttribute('stroke-width', '2.6');
    path.setAttribute('stroke-linecap', 'round');
    path.setAttribute('stroke-linejoin', 'round');
    svg.appendChild(path);

    lab.appendChild(inp);
    lab.appendChild(box);
    lab.appendChild(svg);
    return lab;
  }

  function buildDueMeta(dueYmd) {
    var s = document.createElement('span');
    s.className = 'meta-item';

    var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'icon icon--xs');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');

    var p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    p.setAttribute('d', 'M7 2v3m10-3v3M4 8h16M6 6h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2Z');
    p.setAttribute('fill', 'none');
    p.setAttribute('stroke', 'currentColor');
    p.setAttribute('stroke-width', '1.7');
    p.setAttribute('stroke-linecap', 'round');
    svg.appendChild(p);

    s.appendChild(svg);
    var txt = document.createTextNode(' ' + (dueYmd ? ('Due ' + fmtDateYMD(dueYmd)) : 'No due date'));
    s.appendChild(txt);

    return s;
  }

  function buildDurationBadge(durationMinutes) {
    var badge = document.createElement('span');
    badge.className = badgeClass(durationMinutes);

    var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'icon icon--xs badge__ic');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');

    var p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    p.setAttribute('d', 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Zm0-12v6l4 2');
    p.setAttribute('fill', 'none');
    p.setAttribute('stroke', 'currentColor');
    p.setAttribute('stroke-width', '2');
    p.setAttribute('stroke-linecap', 'round');
    p.setAttribute('stroke-linejoin', 'round');
    svg.appendChild(p);

    badge.appendChild(svg);
    var span = document.createElement('span');
    span.textContent = fmtDuration(durationMinutes) || '—';
    badge.appendChild(span);
    return badge;
  }

  function renderPriorities(list) {
    var tp = (window.LN && window.LN.today_plan) ? window.LN.today_plan : null;
    if (tp && typeof tp.renderPriorities === 'function') {
      try { tp.renderPriorities(list); } catch (_) {}
      return;
    }

    var root = qs('#prioList');
    if (!root) return;
    root.innerHTML = '';

    if (!list || !list.length) {
      var empty = document.createElement('div');
      empty.className = 'muted';
      empty.textContent = 'No priorities yet.';
      root.appendChild(empty);
      return;
    }

    list.forEach(function (t) {
      var row = document.createElement('div');
      row.className = 'prio-row' + (isTaskIdPending(t.id) ? ' is-pending' : '');
      row.setAttribute('data-task-id', String(t.id));

      var chk = buildCheck(t.status === 'done', isTaskIdPending(t.id));
      row.appendChild(chk);

      var txt = document.createElement('div');
      txt.className = 'prio-row__text';
      txt.textContent = String(t.title || '');
      row.appendChild(txt);

      var pill = document.createElement('span');
      pill.className = (t.priority === 'high') ? 'pill pill--red' : (t.priority === 'medium' ? 'pill pill--amber' : 'pill pill--mint');
      pill.textContent = priorityLabel(t.priority);
      row.appendChild(pill);

      root.appendChild(row);
    });
  }

  function renderTasks(list) {
    var root = qs('#tasksList');
    if (!root) return;
    root.innerHTML = '';

    if (!list || !list.length) {
      var e = document.createElement('div');
      e.className = 'task task--empty';
      e.textContent = 'No tasks in this tab.';
      root.appendChild(e);
      return;
    }

    list.forEach(function (t) {
      var task = document.createElement('div');
      task.className = 'task' + ((state.selectMode && state.selectedTaskIds[String(t.id)]) ? ' is-selected' : '') + (isTaskIdPending(t.id) ? ' is-pending' : '');
      task.setAttribute('data-task-id', String(t.id));

      var chk = buildCheck(t.status === 'done', isTaskIdPending(t.id));
      task.appendChild(chk);

      var main = document.createElement('div');
      main.className = 'task__main';

      var title = document.createElement('div');
      title.className = 'task__title';
      title.textContent = String(t.title || '');
      main.appendChild(title);

      var meta = document.createElement('div');
      meta.className = 'task__meta';
      meta.appendChild(buildDueMeta(t.due_date));

      var pill = document.createElement('span');
      pill.className = priorityPillClass(t.priority);
      pill.textContent = priorityLabel(t.priority);
      meta.appendChild(pill);

      main.appendChild(meta);
      task.appendChild(main);

      var side = document.createElement('div');
      side.className = 'task__side';

      side.appendChild(buildDurationBadge(t.duration_minutes));

      var btnNote = document.createElement('button');
      btnNote.className = 'btn-mini';
      btnNote.type = 'button';
      btnNote.setAttribute('data-action', 'note');
      btnNote.innerHTML = '<svg class="icon icon--xs" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 19.5V21h1.5L19 7.5l-1.5-1.5L4 19.5Zm15.8-11.2a1 1 0 0 0 0-1.4L18.1 5.2a1 1 0 0 0-1.4 0l-1.1 1.1 2.9 2.9 1.3-1.3Z" fill="currentColor"/></svg> Add note';
      side.appendChild(btnNote);

      task.appendChild(side);
      root.appendChild(task);
    });
  }

  function renderStudy(items) {
    var m = (window.LN && window.LN.study) ? window.LN.study : null;
    if (m && typeof m.render === 'function') {
      m.render(items);
    }
  }

  function updateSnapshot(d) {
    var snap = d && d.snapshot ? d.snapshot : null;
    if (!snap) return;
    var sm = (window.LN && window.LN.snapshot) ? window.LN.snapshot : null;
    if (sm && typeof sm.render === 'function') {
      try { sm.render(snap, d); } catch (_) {}
    }
    var bm = (window.LN && window.LN.budget) ? window.LN.budget : null;
    if (bm && typeof bm.applySnapshot === 'function') {
      try { bm.applySnapshot(snap.budget); } catch (_) {}
    }

  }

  function renderBudgetRecentExpenses(items) {
    var root = qs('#budgetRecentList');
    if (!root) return;
    root.innerHTML = '';

    if (!items || !items.length) {
      var empty = document.createElement('div');
      empty.className = 'budget-activity__empty';
      empty.textContent = 'No expenses yet.';
      root.appendChild(empty);
      return;
    }

    function iconText(category) {
      var c = String(category || '').trim().toLowerCase();
      if (!c) return '•';
      if (c.indexOf('coffee') !== -1 || c.indexOf('drink') !== -1) return '☕';
      if (c.indexOf('gas') !== -1 || c.indexOf('fuel') !== -1 || c.indexOf('transport') !== -1) return '⛽';
      if (c.indexOf('course') !== -1 || c.indexOf('study') !== -1 || c.indexOf('book') !== -1) return '🎓';
      return String(category || '').trim().charAt(0).toUpperCase();
    }

    items.slice(0, 4).forEach(function (item) {
      var row = document.createElement('div');
      row.className = 'budget-expense';

      var icon = document.createElement('div');
      icon.className = 'budget-expense__icon';
      icon.textContent = iconText(item.category);
      row.appendChild(icon);

      var body = document.createElement('div');
      var title = document.createElement('div');
      title.className = 'budget-expense__title';
      title.textContent = String(item.category || item.note || 'Expense');
      body.appendChild(title);

      var meta = document.createElement('div');
      meta.className = 'budget-expense__meta';
      meta.textContent = item.expense_date ? fmtDateYMD(item.expense_date) : 'Recent entry';
      body.appendChild(meta);
      row.appendChild(body);

      var amount = document.createElement('div');
      amount.className = 'budget-expense__amount';
      amount.textContent = fmtMoneyFromCents(item.amount_cents || 0, item.currency || state.currency || 'TRY');
      row.appendChild(amount);

      root.appendChild(row);
    });
  }

  function updatePanels(d) {
    var p = d && d.panels ? d.panels : null;
    if (!p) return;

    renderPriorities(p.top_priorities);
    renderStudy(p.study_items);
    renderBudgetRecentExpenses(p.last_expenses || []);

    var sum = 0;
    if (p.last_expenses && p.last_expenses.length) {
      for (var i = 0; i < p.last_expenses.length; i++) {
        sum += clampInt(p.last_expenses[i].amount_cents || 0, 0, 1000000000);
      }
    }
    setText('last5Total', fmtMoneyFromCents(sum, state.currency));
  }

  async function loadDashboard() {
    var d = await api('GET', '/api/dashboard.php');
    updateSnapshot(d);
    updatePanels(d);

    // Suggestions
    var cats = (d && d.suggestions && d.suggestions.expense_categories) ? d.suggestions.expense_categories : [];
    setExpenseCategories(cats.concat(['Food', 'Transport', 'Bills', 'Shopping', 'Coffee', 'Other']));

    setSyncedNow();

    // Set defaults for forms
    var date1 = qs('#expDate');
    if (date1 && !date1.value) date1.value = d.today || todayYMD();

    var date2 = qs('#expDate2');
    if (date2 && !date2.value) date2.value = d.today || todayYMD();

    var due = qs('#taskDue');
    if (due && !due.value) due.value = d.today || todayYMD();

    var bm = qs('#budgetMonth');
    if (bm && !bm.value) bm.value = (state.month || monthYM());

    // Weekly sparkline from report
    try {
      await loadWeeklySpark(d.snapshot && d.snapshot.weekly_progress ? d.snapshot.weekly_progress.week_start : null);
    } catch (_) {
      // ignore
    }

    if (state.budgetMemory && !(qs('#budgetAmount') && qs('#budgetAmount').value)) {
      setBudgetFormValues((state.month || monthYM()), state.budgetMemory.currency, state.budgetMemory.amount_cents);
    }
  }

  async function loadWeeklySpark(weekStart) {
    var sm = (window.LN && window.LN.snapshot) ? window.LN.snapshot : null;
    if (sm && typeof sm.loadWeeklySpark === 'function') {
      return sm.loadWeeklySpark(weekStart);
    }
  }
  function lnTasks() { return (window.LN && window.LN.tasks) ? window.LN.tasks : null; }
  function syncTaskFilterSelects() { var m = lnTasks(); if (m && m.syncFilters) m.syncFilters(); }
  function clearTaskFilters() { var m = lnTasks(); if (m && m.clearFilters) m.clearFilters(); }
  function loadTasks(tab, q) { var m = lnTasks(); return (m && m.load) ? m.load(tab, q) : Promise.resolve(); }
  function setTaskDone(taskId, done) { var m = lnTasks(); return (m && m.setDone) ? m.setDone(taskId, done) : Promise.resolve(); }
  function resetTaskFormForCreate() { var m = lnTasks(); if (m && m.resetForm) m.resetForm(); }
  function openTaskEditor(taskId) { var m = lnTasks(); return (m && m.openEditor) ? m.openEditor(taskId) : Promise.resolve(); }
  function bulkUpdateTasks(action, extra) { var m = lnTasks(); return (m && m.bulkUpdate) ? m.bulkUpdate(action, extra) : Promise.resolve(); }
  function scheduleDeleteTasks(ids) { var m = lnTasks(); if (m && m.scheduleDelete) m.scheduleDelete(ids); }
  function openNotesForTask(taskId, title) { var m = lnTasks(); return (m && m.openNotesForTask) ? m.openNotesForTask(taskId, title) : Promise.resolve(); }
  function submitTaskForm(e) { var m = lnTasks(); if (m && m.submitTaskForm) return m.submitTaskForm(e); }
  function deleteTask(taskId) { var m = lnTasks(); return (m && m.deleteTask) ? m.deleteTask(taskId) : Promise.resolve(); }
  function submitNoteForm(e) { var m = lnTasks(); if (m && m.submitNoteForm) return m.submitNoteForm(e); }
  function parseMoneyToCents(str) {
    var s = String(str || '').replace(/[^0-9.,]/g, '').replace(',', '.');
    if (!s) return null;
    var f = parseFloat(s);
    if (!isFinite(f) || f <= 0) return null;
    return Math.round(f * 100);
  }

  function fmtMoneyForInput(cents) {
    var c = clampInt(cents, 0, 1000000000);
    if (c % 100 === 0) return String(Math.floor(c / 100));
    return (c / 100).toFixed(2);
  }


  function normalizeBudgetMemory(raw) {
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

  function setBudgetFormValues(month, currency, amountCents) {
    var monthEl = qs('#budgetMonth');
    var curEl = qs('#budgetCurrency');
    var amtEl = qs('#budgetAmount');
    if (monthEl && month) monthEl.value = month;
    if (curEl) curEl.value = currency || 'TRY';
    if (amtEl) amtEl.value = amountCents > 0 ? fmtMoneyForInput(amountCents) : '';
  }

  async function loadBudgetFormMemory(month) {
    var targetMonth = String(month || (qs('#budgetMonth') ? qs('#budgetMonth').value : '') || state.month || monthYM()).trim();
    if (!targetMonth) targetMonth = monthYM();

    var requestId = clampInt((state.budgetPrefillReqId || 0) + 1, 1, 1000000);
    state.budgetPrefillReqId = requestId;

    try {
      var b = await api('GET', '/api/budget.php?month=' + encodeURIComponent(targetMonth));
      if (state.budgetPrefillReqId !== requestId) return;

      var remembered = normalizeBudgetMemory(b && b.remembered ? b.remembered : null);
      if (remembered) state.budgetMemory = remembered;

      if (b && b.has_budget) {
        setBudgetFormValues(targetMonth, String(b.currency || 'TRY'), clampInt(b.budget_cents || 0, 0, 1000000000));
        return;
      }

      if (remembered) {
        setBudgetFormValues(targetMonth, remembered.currency, remembered.amount_cents);
        return;
      }

      setBudgetFormValues(targetMonth, state.currency || 'TRY', 0);
    } catch (_) {
      if (state.budgetMemory) {
        setBudgetFormValues(targetMonth, state.budgetMemory.currency, state.budgetMemory.amount_cents);
      } else {
        setBudgetFormValues(targetMonth, state.currency || 'TRY', 0);
      }
    }
  }

  function bindBudgetMemoryUI() {
    var monthEl = qs('#budgetMonth');
    if (monthEl && monthEl.getAttribute('data-ln-budget-memory-bound') !== '1') {
      monthEl.setAttribute('data-ln-budget-memory-bound', '1');
      monthEl.addEventListener('change', function () {
        loadBudgetFormMemory(monthEl.value);
      });
    }

    qsa('[data-open="budget"]').forEach(function (btn) {
      if (btn.getAttribute('data-ln-budget-open-bound') === '1') return;
      btn.setAttribute('data-ln-budget-open-bound', '1');
      btn.addEventListener('click', function () {
        window.setTimeout(function () {
          loadBudgetFormMemory((qs('#budgetMonth') ? qs('#budgetMonth').value : '') || state.month || monthYM());
        }, 0);
      });
    });
  }

  function normalizeExpenseTaskOption(task) {
    if (!task || typeof task !== 'object') return null;
    var id = String(task.id || '').trim();
    var title = String(task.title || '').trim();
    var kind = String(task.kind || 'personal');
    if (!id || !title) return null;
    if (kind !== 'study' && kind !== 'personal') kind = 'personal';
    return { id: id, title: title, kind: kind, due_date: String(task.due_date || '') };
  }

  function renderExpenseTaskOptions(list) {
    state.expenseTaskOptions = Array.isArray(list) ? list.slice() : [];
    var sel = qs('#expLinkedTask');
    if (!sel) return;
    var current = String(sel.value || '');
    sel.innerHTML = '';

    var empty = document.createElement('option');
    empty.value = '';
    empty.textContent = 'Not linked';
    sel.appendChild(empty);

    state.expenseTaskOptions.forEach(function (task) {
      var opt = document.createElement('option');
      opt.value = String(task.id);
      opt.textContent = String(task.title) + ' • ' + (task.kind === 'study' ? 'Study' : 'Personal');
      opt.setAttribute('data-kind', task.kind);
      sel.appendChild(opt);
    });

    if (current) sel.value = current;
    syncExpenseTaskLinkUI();
  }

  async function loadExpenseTaskOptions(force) {
    if (!force && Array.isArray(state.expenseTaskOptions) && state.expenseTaskOptions.length) {
      renderExpenseTaskOptions(state.expenseTaskOptions);
      return state.expenseTaskOptions;
    }
    var d = await api('GET', '/api/tasks.php?tab=all&limit=200');
    var list = (d.tasks || []).map(normalizeExpenseTaskOption).filter(Boolean);
    list.sort(function (a, b) {
      if (!!a.due_date !== !!b.due_date) return a.due_date ? -1 : 1;
      if (a.due_date !== b.due_date) return String(a.due_date || '').localeCompare(String(b.due_date || ''));
      return String(a.title).localeCompare(String(b.title));
    });
    renderExpenseTaskOptions(list);
    return list;
  }

  function selectedExpenseTaskOption() {
    var sel = qs('#expLinkedTask');
    if (!sel) return null;
    var id = String(sel.value || '').trim();
    if (!id) return null;
    for (var i = 0; i < state.expenseTaskOptions.length; i++) {
      if (String(state.expenseTaskOptions[i].id) === id) return state.expenseTaskOptions[i];
    }
    return null;
  }

  function syncExpenseTaskLinkUI() {
    var sel = qs('#expLinkedTask');
    var area = qs('#expLifeArea');
    var hint = qs('#expenseTaskHint');
    if (!area) return;
    var task = selectedExpenseTaskOption();
    if (task) {
      area.value = task.kind === 'study' ? 'study' : 'personal';
      area.disabled = true;
      if (hint) hint.textContent = 'This expense will be linked to “' + task.title + '” and counted as ' + (task.kind === 'study' ? 'study' : 'personal') + ' behavior.';
      return;
    }
    area.disabled = false;
    if (!area.value) area.value = 'general';
    if (hint) hint.textContent = 'Link expenses to tasks when the spending belongs to real work so Today Plan and Reports can reflect it.';
  }

  function setExpenseTaskValue(taskId) {
    var sel = qs('#expLinkedTask');
    if (!sel) return;
    var id = String(taskId || '').trim();
    sel.value = id;
    syncExpenseTaskLinkUI();
  }

  function resetExpenseFormForCreate(preset) {
    var p = (preset && typeof preset === 'object') ? preset : {};
    state.editExpenseId = null;
    if (qs('#expenseId')) qs('#expenseId').value = '';
    setText('modalExpenseTitle', 'Add Expense');
    setText('expenseFormHint', '');
    if (qs('#expenseDeleteBtn')) qs('#expenseDeleteBtn').hidden = true;
    if (qs('#expAmount2')) qs('#expAmount2').value = '';
    if (qs('#expCategory2')) qs('#expCategory2').value = p.category ? String(p.category) : '';
    if (qs('#expDate2')) qs('#expDate2').value = p.expense_date ? String(p.expense_date) : todayYMD();
    if (qs('#expCurrency2')) qs('#expCurrency2').value = p.currency ? String(p.currency) : state.currency;
    if (qs('#expNote2')) qs('#expNote2').value = p.note ? String(p.note) : '';
    if (qs('#expLifeArea')) qs('#expLifeArea').value = p.lifeArea ? String(p.lifeArea) : 'general';
    if (qs('#expLinkedTask')) qs('#expLinkedTask').value = p.taskId ? String(p.taskId) : '';
    syncExpenseTaskLinkUI();
  }

  async function loadExpensesList(month) {
    setText('expensesHint', '');
    var m = month || (qs('#expensesMonth') ? qs('#expensesMonth').value : '') || (state.month || monthYM());
    if (qs('#expensesMonth')) qs('#expensesMonth').value = m;
    var d = await api('GET', '/api/expenses.php?month=' + encodeURIComponent(m) + '&limit=200');
    var list = d.expenses || [];
    state.expensesById = {};
    for (var i = 0; i < list.length; i++) {
      state.expensesById[String(list[i].id)] = list[i];
    }
    renderExpensesList(list);
    markPendingInDom();
  }

  function renderExpensesList(list) {
    var root = qs('#expensesList');
    if (!root) return;
    root.innerHTML = '';

    var total = 0;
    for (var i = 0; i < (list || []).length; i++) {
      total += clampInt(list[i].amount_cents || 0, 0, 1000000000);
    }
    setText('expensesSummary', (list && list.length ? (list.length + ' items • ' + fmtMoneyFromCents(total, state.currency)) : 'No expenses yet.'));

    if (!list || !list.length) {
      var e = document.createElement('div');
      e.className = 'muted';
      e.textContent = 'No expenses found for this month.';
      root.appendChild(e);
      return;
    }

    list.forEach(function (x) {
      var row = document.createElement('div');
      row.className = 'ln-exp-row';
      row.setAttribute('data-expense-id', String(x.id));

      var main = document.createElement('div');
      main.className = 'ln-exp-row__main';

      var title = document.createElement('div');
      title.className = 'ln-exp-row__title';
      title.textContent = String(x.category || 'Expense');
      main.appendChild(title);

      var meta = document.createElement('div');
      meta.className = 'ln-exp-row__meta';

      var amt = document.createElement('span');
      amt.className = 'ln-exp-row__amt';
      amt.textContent = fmtMoneyFromCents(x.amount_cents, x.currency || state.currency);
      meta.appendChild(amt);

      var d = document.createElement('span');
      d.textContent = x.expense_date ? ('• ' + fmtDateYMD(x.expense_date)) : '';
      meta.appendChild(d);

      if (x.life_area) {
        var area = document.createElement('span');
        area.textContent = '• ' + String(x.life_area).charAt(0).toUpperCase() + String(x.life_area).slice(1);
        meta.appendChild(area);
      }

      if (x.linked_task_title) {
        var taskMeta = document.createElement('span');
        taskMeta.textContent = '• Task: ' + String(x.linked_task_title);
        meta.appendChild(taskMeta);
      }

      if (x.note) {
        var n = document.createElement('span');
        n.textContent = '• ' + String(x.note);
        meta.appendChild(n);
      }

      main.appendChild(meta);
      row.appendChild(main);

      var actions = document.createElement('div');
      actions.className = 'ln-exp-row__actions';

      var edit = document.createElement('button');
      edit.className = 'icon-btn icon-btn--tiny';
      edit.type = 'button';
      edit.setAttribute('data-action', 'edit-expense');
      edit.setAttribute('aria-label', 'Edit');
      edit.innerHTML = '<svg class="icon icon--sm" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 19.5V21h1.5L19 7.5l-1.5-1.5L4 19.5Zm15.8-11.2a1 1 0 0 0 0-1.4L18.1 5.2a1 1 0 0 0-1.4 0l-1.1 1.1 2.9 2.9 1.3-1.3Z" fill="currentColor"/></svg>';
      actions.appendChild(edit);

      var del = document.createElement('button');
      del.className = 'icon-btn icon-btn--tiny';
      del.type = 'button';
      del.setAttribute('data-action', 'delete-expense');
      del.setAttribute('aria-label', 'Delete');
      del.innerHTML = '<svg class="icon icon--sm" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 3h6l1 2h4v2H4V5h4l1-2Zm1 6h2v10h-2V9Zm4 0h2v10h-2V9ZM7 9h2v10H7V9Z" fill="currentColor"/></svg>';
      actions.appendChild(del);

      row.appendChild(actions);
      root.appendChild(row);
    });
  }

  async function openExpenseEditor(expenseId) {
    var x = state.expensesById[String(expenseId)] || null;
    if (!x) throw new Error('Expense not found');

    await loadExpenseTaskOptions();

    state.editExpenseId = String(expenseId);
    if (qs('#expenseId')) qs('#expenseId').value = String(expenseId);
    setText('modalExpenseTitle', 'Edit Expense');
    setText('expenseFormHint', '');
    if (qs('#expenseDeleteBtn')) qs('#expenseDeleteBtn').hidden = false;

    if (qs('#expAmount2')) qs('#expAmount2').value = fmtMoneyForInput(x.amount_cents);
    if (qs('#expCurrency2')) qs('#expCurrency2').value = String(x.currency || state.currency);
    if (qs('#expCategory2')) qs('#expCategory2').value = String(x.category || '');
    if (qs('#expDate2')) qs('#expDate2').value = String(x.expense_date || todayYMD());
    if (qs('#expNote2')) qs('#expNote2').value = String(x.note || '');
    if (qs('#expLifeArea')) qs('#expLifeArea').value = String(x.life_area || 'general');
    if (qs('#expLinkedTask')) qs('#expLinkedTask').value = x.linked_task_id ? String(x.linked_task_id) : '';
    syncExpenseTaskLinkUI();

    if (window.LifeNestUI) window.LifeNestUI.openModal('expense');
  }

  async function deleteExpense(expenseId) {
    // v4: schedule delete with undo
    var id = String(expenseId || '');
    if (!id) return;
    var op = addPendingOp('expense_delete', [id]);
    if (!op) return;

    if (String(state.editExpenseId || '') == id) {
      resetExpenseFormForCreate();
      if (window.LifeNestUI) window.LifeNestUI.closeModal('modalExpense');
    }
    renderPendingModal();
  }

  async function quickAddExpense(fromModal) {
    var hintId = fromModal ? 'expenseFormHint' : 'expHint';
    setText(hintId, '');

    var amountEl = qs(fromModal ? '#expAmount2' : '#expAmount');
    var catEl = qs(fromModal ? '#expCategory2' : '#expCategory');
    var dateEl = qs(fromModal ? '#expDate2' : '#expDate');
    var curEl = qs(fromModal ? '#expCurrency2' : null);
    var noteEl = qs(fromModal ? '#expNote2' : null);
    var linkedTaskEl = qs(fromModal ? '#expLinkedTask' : null);
    var lifeAreaEl = qs(fromModal ? '#expLifeArea' : null);

    var cents = parseMoneyToCents(amountEl ? amountEl.value : '');
    var cat = catEl ? catEl.value : '';
    var date = dateEl ? dateEl.value : '';
    var cur = fromModal && curEl ? curEl.value : state.currency;
    var note = fromModal && noteEl ? (noteEl.value || '').trim() : '';
    var linkedTaskId = fromModal && linkedTaskEl && linkedTaskEl.value ? String(linkedTaskEl.value) : '';
    var lifeArea = fromModal && lifeAreaEl ? String(lifeAreaEl.value || 'general') : 'general';

    if (cents === null || !cat || !date) {
      setText(hintId, 'Fill amount, category, and date.');
      return;
    }

    try {
      if (fromModal && state.editExpenseId) {
        await api('PATCH', '/api/expenses.php?id=' + encodeURIComponent(state.editExpenseId), {
          amount_cents: cents,
          currency: cur,
          category: cat,
          expense_date: date,
          note: note || null,
          linked_task_id: linkedTaskId || null,
          life_area: lifeArea
        });
        setText(hintId, 'Updated.');
      } else {
        await api('POST', '/api/expenses.php', {
          amount_cents: cents,
          currency: cur,
          category: cat,
          expense_date: date,
          note: note || null,
          linked_task_id: linkedTaskId || null,
          life_area: lifeArea
        });
        setText(hintId, 'Added.');
      }

      addExpenseCategory(cat);

      if (amountEl) amountEl.value = '';
      if (fromModal && noteEl) noteEl.value = '';

      if (fromModal) {
        resetExpenseFormForCreate();
        if (window.LifeNestUI) window.LifeNestUI.closeModal('modalExpense');
      }

      await loadDashboard();
      if (window.LN && window.LN.today_plan && typeof window.LN.today_plan.scheduleRefresh === 'function') {
        window.LN.today_plan.scheduleRefresh({ immediate: true, announce: true });
      }
      if (qs('#modalExpenses') && qs('#modalExpenses').getAttribute('aria-hidden') === 'false') {
        await loadExpensesList(qs('#expensesMonth') ? qs('#expensesMonth').value : (state.month || monthYM()));
      }
    } catch (err) {
      setText(hintId, err && err.message ? err.message : 'Failed.');
    }
  }

  function resetStudyFormForCreate() {
    var m = (window.LN && window.LN.study) ? window.LN.study : null;
    if (m && typeof m.resetForm === 'function') m.resetForm();
  }

  async function openStudyEditor(studyId) {
    var m = (window.LN && window.LN.study) ? window.LN.study : null;
    if (m && typeof m.openEditor === 'function') return m.openEditor(studyId);
  }

  async function deleteStudy(studyId) {
    var m = (window.LN && window.LN.study) ? window.LN.study : null;
    if (m && typeof m.deleteById === 'function') return m.deleteById(studyId);
  }

  async function submitStudyForm(e) {
    var m = (window.LN && window.LN.study) ? window.LN.study : null;
    if (m && typeof m.submitForm === 'function') return m.submitForm(e);
  }

  async function submitBudgetForm(e) {
    e.preventDefault();
    setText('budgetFormHint', '');

    var m = (qs('#budgetMonth') && qs('#budgetMonth').value) || '';
    var cur = (qs('#budgetCurrency') && qs('#budgetCurrency').value) || 'TRY';
    var cents = parseMoneyToCents(qs('#budgetAmount') ? qs('#budgetAmount').value : '');

    if (!m || cents === null) {
      setText('budgetFormHint', 'Fill month and amount.');
      return;
    }

    try {
      await api('POST', '/api/budget.php', { month: m, currency: cur, amount_cents: cents });
      setText('budgetFormHint', 'Saved.');
      state.currency = cur;
      state.month = m;
      state.budgetMemory = {
        month: m,
        currency: cur,
        amount_cents: cents
      };
      setBudgetFormValues(m, cur, cents);
      if (window.LifeNestUI) window.LifeNestUI.closeModal('modalBudget');
      await loadDashboard();
    } catch (err) {
      setText('budgetFormHint', err && err.message ? err.message : 'Failed.');
    }
  }




  // ---- Reports
  function renderReportCats(rootId, cats, currency) {
    var root = qs('#' + rootId);
    if (!root) return;
    root.innerHTML = '';

    if (!cats || !cats.length) {
      var e = document.createElement('div');
      e.className = 'ln-rep__cat ln-rep__cat--empty';
      e.textContent = 'No expenses.';
      root.appendChild(e);
      return;
    }

    cats.slice(0, 6).forEach(function (c) {
      var row = document.createElement('div');
      row.className = 'ln-rep__cat';

      var left = document.createElement('div');
      left.className = 'ln-rep__cat-name';
      left.textContent = String(c.category || '—');

      var right = document.createElement('div');
      right.className = 'ln-rep__cat-amt';
      right.textContent = fmtMoneyFromCents(c.c || 0, currency);

      row.appendChild(left);
      row.appendChild(right);
      root.appendChild(row);
    });
  }

  function setReportsHint(msg) {
    setText('reportsHint', msg || '');
  }

  function renderReviewInsights(items) {
    var root = qs('#repReviewInsights');
    if (!root) return;
    root.innerHTML = '';

    if (!items || !items.length) {
      var empty = document.createElement('div');
      empty.className = 'ln-rep__cat ln-rep__cat--empty';
      empty.textContent = 'No review insights yet.';
      root.appendChild(empty);
      return;
    }

    items.forEach(function (txt) {
      var row = document.createElement('div');
      row.className = 'ln-rep__insight';

      var dot = document.createElement('div');
      dot.className = 'ln-rep__insight-dot';
      row.appendChild(dot);

      var body = document.createElement('div');
      body.className = 'ln-rep__insight-text';
      body.textContent = String(txt || '');
      row.appendChild(body);

      root.appendChild(row);
    });
  }

  async function loadWeeklyReport() {
    setText('repWeekRange', '—');
    setText('repWeekDone', '—');
    setText('repWeekTotal', '—');
    setText('repWeekPct', '—');
    setText('repWeekStarted', '—');
    setText('repWeekPostponed', '—');
    setText('repWeekSpend', '—');
    replaceProgressClass(qs('#repWeekBar'), 0);
    renderReportCats('repWeekCats', [], state.currency);

    var d = await api('GET', '/api/reports/weekly.php');

    var ws = String(d.week_start || '');
    var wn = String(d.week_next || '');
    setText('repWeekRange', ws && wn ? (ws + ' → ' + wn) : (ws || '—'));
    setText('repReviewRange', ws && wn ? ('Week ' + ws + ' → ' + wn) : 'Based on your current week');

    var tasks = d.tasks || {};
    var total = Number(tasks.total || 0) || 0;
    var done = Number(tasks.done || 0) || 0;
    var pct = clampInt(Number(tasks.percent || 0) || 0, 0, 100);

    setText('repWeekDone', String(done));
    setText('repWeekTotal', String(total));
    setText('repWeekPct', pct + '%');
    replaceProgressClass(qs('#repWeekBar'), pct);

    var exec = d.execution || {};
    setText('repWeekStarted', String(Number(exec.started || 0) || 0));
    setText('repWeekPostponed', String(Number(exec.postponed || 0) || 0));

    var ex = d.expenses || {};
    var cur = String(ex.currency || state.currency || 'TRY');
    var spent = Number(ex.spent_cents || 0) || 0;
    setText('repWeekSpend', 'Spent: ' + fmtMoneyFromCents(spent, cur));

    renderReportCats('repWeekCats', ex.by_category || [], cur);
  }

  async function loadMonthlyReport(month) {
    setReportsHint('');
    setText('repMonthRange', '—');
    setText('repMonthBudget', '—');
    setText('repMonthSpent', '—');
    setText('repMonthRemaining', '—');
    setText('repMonthCompleted', '—');
    setText('repMonthPostponed', '—');
    replaceProgressClass(qs('#repMonthBar'), 0);
    renderReportCats('repMonthCats', [], state.currency);

    var ym = month && String(month).trim() ? String(month).trim() : monthYM();
    var d = await api('GET', '/api/reports/monthly.php?month=' + encodeURIComponent(ym));

    setText('repMonthRange', String(d.month || ym));

    var b = d.budget || {};
    var cur = String(b.currency || state.currency || 'TRY');
    var budgetC = Number(b.budget_cents || 0) || 0;
    var spentC = Number(b.spent_cents || 0) || 0;
    var remC = Number(b.remaining_cents || 0) || 0;

    setText('repMonthBudget', fmtMoneyFromCents(budgetC, cur));
    setText('repMonthSpent', fmtMoneyFromCents(spentC, cur));
    setText('repMonthRemaining', fmtMoneyFromCents(remC, cur));

    var exec = d.execution || {};
    setText('repMonthCompleted', String(Number(exec.completed || 0) || 0));
    setText('repMonthPostponed', String(Number(exec.postponed || 0) || 0));

    var pct = budgetC > 0 ? Math.round((spentC / budgetC) * 100) : 0;
    pct = clampInt(pct, 0, 100);
    replaceProgressClass(qs('#repMonthBar'), pct);

    var ex = d.expenses || {};
    renderReportCats('repMonthCats', ex.by_category || [], cur);
  }

  async function loadReviewReport() {
    setText('repReviewDecision', '—');
    setText('repReviewCarry', '—');
    setText('repReviewOverdue', '—');
    setText('repReviewStudyDone', '—');
    setText('repReviewTopSpend', '—');
    renderReviewInsights([]);

    var d = await api('GET', '/api/reports/review.php');
    var s = d.summary || {};
    var cur = String(s.currency || state.currency || 'TRY');
    var topSpendCat = String(s.top_spend_category || '').trim();
    var topSpend = Number(s.top_spend_cents || 0) || 0;

    setText('repReviewDecision', String(d.decision || 'Keep going.'));
    setText('repReviewCarry', String(Number(s.carry_over || 0) || 0));
    setText('repReviewOverdue', String(Number(s.overdue_open || 0) || 0));
    setText('repReviewStudyDone', String(Number(s.completed_study || 0) || 0));
    setText('repReviewTopSpend', topSpendCat ? (topSpendCat + ' • ' + fmtMoneyFromCents(topSpend, cur)) : '—');
    renderReviewInsights(d.insights || []);
  }

  async function openReports() {
    setReportsHint('');
    if (qs('#reportsMonth')) {
      if (!qs('#reportsMonth').value) qs('#reportsMonth').value = monthYM();
    }
    var ym = qs('#reportsMonth') ? qs('#reportsMonth').value : monthYM();
    try {
      await Promise.all([loadWeeklyReport(), loadMonthlyReport(ym), loadReviewReport()]);
    } catch (err) {
      setReportsHint(err && err.message ? err.message : 'Failed to load reports.');
    }
    if (window.LifeNestUI) window.LifeNestUI.openModal('reports');
  }

  // ---- Focus session
  var focusState = {
    running: false,
    paused: false,
    totalSec: 0,
    remainingSec: 0,
    timer: null,
    studyId: ''
  };

  function fmtMMSS(sec) {
    var s = clampInt(sec, 0, 1000000);
    var m = Math.floor(s / 60);
    var r = s % 60;
    return String(m).padStart(2, '0') + ':' + String(r).padStart(2, '0');
  }

  function setFocusHint(msg) {
    setText('focusHint', msg || '');
  }

  function updateFocusTimerUI() {
    setText('focusTimer', fmtMMSS(focusState.remainingSec));
  }

  function focusButtons() {
    return {
      start: qs('#focusStart'),
      pause: qs('#focusPause'),
      resume: qs('#focusResume'),
      stop: qs('#focusStop')
    };
  }

  function setFocusButtonsState() {
    var b = focusButtons();
    if (!b.start || !b.pause || !b.resume || !b.stop) return;
    b.start.hidden = focusState.running;
    b.pause.hidden = !focusState.running || focusState.paused;
    b.resume.hidden = !focusState.running || !focusState.paused;
    b.stop.disabled = !focusState.running;
  }

  function stopFocusTimer() {
    if (focusState.timer) {
      clearInterval(focusState.timer);
      focusState.timer = null;
    }
  }

  async function populateFocusStudySelect() {
    var sel = qs('#focusStudyId');
    if (!sel) return;
    // Keep first option (None)
    while (sel.options.length > 1) sel.remove(1);

    try {
      var d = await api('GET', '/api/study.php');
      var items = d.items || [];
      items.forEach(function (it) {
        var opt = document.createElement('option');
        opt.value = String(it.id);
        opt.textContent = String(it.title || ('Study #' + it.id));
        sel.appendChild(opt);
      });
    } catch (_) {
      // ignore
    }
  }

  async function prepareFocusModal() {
    setFocusHint('');
    stopFocusTimer();
    focusState.running = false;
    focusState.paused = false;
    focusState.studyId = '';

    var minsEl = qs('#focusMinutes');
    var mins = clampInt(minsEl ? minsEl.value : 25, 5, 240);
    if (minsEl) minsEl.value = String(mins);
    focusState.totalSec = mins * 60;
    focusState.remainingSec = focusState.totalSec;
    updateFocusTimerUI();
    setFocusButtonsState();

    await populateFocusStudySelect();
  }

  async function logFocusMinutesToStudy(minutes) {
    var sid = focusState.studyId;
    if (!sid) return;
    var m = clampInt(minutes, 1, 240);
    try {
      await api('PATCH', '/api/study.php?id=' + encodeURIComponent(sid), { done_delta_minutes: m });
      await loadDashboard();
    } catch (err) {
      setFocusHint(err && err.message ? err.message : 'Failed to log study minutes.');
    }
  }

  function startFocus() {
    if (focusState.running) return;
    setFocusHint('');
    var minsEl = qs('#focusMinutes');
    var mins = clampInt(minsEl ? minsEl.value : 25, 5, 240);
    if (minsEl) minsEl.value = String(mins);
    focusState.totalSec = mins * 60;
    focusState.remainingSec = focusState.totalSec;
    updateFocusTimerUI();

    var sel = qs('#focusStudyId');
    focusState.studyId = sel && sel.value ? String(sel.value) : '';

    focusState.running = true;
    focusState.paused = false;
    setFocusButtonsState();

    stopFocusTimer();
    focusState.timer = setInterval(function () {
      if (!focusState.running || focusState.paused) return;
      focusState.remainingSec = Math.max(0, focusState.remainingSec - 1);
      updateFocusTimerUI();
      if (focusState.remainingSec <= 0) {
        // complete
        stopFocusTimer();
        focusState.running = false;
        focusState.paused = false;
        setFocusButtonsState();
        setFocusHint('Done!');
        if (focusState.studyId) {
          logFocusMinutesToStudy(Math.round(focusState.totalSec / 60)).catch(function () {});
        }
      }
    }, 1000);
  }

  function pauseFocus() {
    if (!focusState.running) return;
    focusState.paused = true;
    setFocusButtonsState();
  }

  function resumeFocus() {
    if (!focusState.running) return;
    focusState.paused = false;
    setFocusButtonsState();
  }

  async function stopFocus() {
    if (!focusState.running) return;
    var elapsed = focusState.totalSec - focusState.remainingSec;
    stopFocusTimer();
    focusState.running = false;
    focusState.paused = false;
    setFocusButtonsState();

    // Offer logging partial minutes
    if (focusState.studyId && elapsed >= 60) {
      var mins = Math.floor(elapsed / 60);
      if (window.confirm('Log ' + mins + ' minute(s) to the selected study item?')) {
        await logFocusMinutesToStudy(mins);
      }
    }
    setFocusHint('Stopped.');
  }

  async function logout() {
    try {
      await api('POST', '/api/auth/logout.php', {});
    } catch (_) {
      // ignore
    }
    window.location.href = '/login.php';
  }

  function bindUIEvents() {
    // Card menus (three-dot buttons)
    qsa('.dots-btn[data-menu]').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.preventDefault();
        if (!window.LifeNestUI || !window.LifeNestUI.openContextMenu) return;
        var k = btn.getAttribute('data-menu');
        if (k === 'tasks') {
          window.LifeNestUI.openContextMenu('Tasks', [
            { label: 'New Task', cmd: 'task:new' },
            { label: 'View All Tasks', cmd: 'tasks:tab:all' },
            { label: 'Overdue', cmd: 'tasks:tab:overdue' },
            { label: 'Clear Filters', cmd: 'filters:clear' },
            { label: 'Jump to Tasks', cmd: 'nav:tasks' }
          ]);
        } else if (k === 'study') {
          window.LifeNestUI.openContextMenu('Study', [
            { label: 'New Study Item', cmd: 'study:new' },
            { label: 'Focus Session', cmd: 'focus:open' },
            { label: 'Jump to Study', cmd: 'nav:study' }
          ]);
        } else if (k === 'budget') {
          window.LifeNestUI.openContextMenu('Budget', [
            { label: 'New Expense', cmd: 'expense:new' },
            { label: 'All Expenses', cmd: 'expenses:open' },
            { label: 'Set Budget', cmd: 'budget:open' },
            { label: 'Reports', cmd: 'reports:open' },
            { label: 'Jump to Budget', cmd: 'nav:budget' }
          ]);
        }
      });
    });

    // Logout (profile + drawer)
    var lo = qs('#btnLogout');
    if (lo) lo.addEventListener('click', function (e) { e.preventDefault(); logout(); });
    var dlo = qs('#drawerLogout');
    if (dlo) dlo.addEventListener('click', function (e) { e.preventDefault(); logout(); });

    // Commands from app.js (context menu and special items)
    window.addEventListener('lifenest:cmd', function (ev) {
      var cmd = ev && ev.detail ? String(ev.detail.cmd || '') : '';
      if (!cmd) return;

      if (cmd === 'filters:clear') {
        clearTaskFilters();
        if (qs('#taskSearch')) qs('#taskSearch').value = '';
        loadTasks(state.activeTab, '').catch(function () {});
        return;
      }

      if (cmd.indexOf('tasks:tab:') === 0) {
        var tab = cmd.split(':').pop();
        loadTasks(tab, (qs('#taskSearch') && qs('#taskSearch').value || '').trim()).catch(function () {});
        return;
      }

      if (cmd.indexOf('bulk:priority:') === 0) {
        var pr = cmd.split(':').pop();
        bulkUpdateTasks('priority', { priority: pr }).catch(function () {});
        return;
      }

      if (cmd === 'task:new') {
        resetTaskFormForCreate();
        if (window.LifeNestUI) window.LifeNestUI.openModal('task');
        return;
      }

      if (cmd === 'budget:open') {
        if (window.LifeNestUI) window.LifeNestUI.openModal('budget');
        return;
      }

      if (cmd === 'study:new') {
        resetStudyFormForCreate();
        if (window.LifeNestUI) window.LifeNestUI.openModal('study');
        return;
      }
    });
  }
  var LN = (window.LN = window.LN || {});
  LN.core = LN.core || {};
  LN.core.qs = qs;
  LN.core.qsa = qsa;
  LN.core.state = state;
  LN.core.api = api;
  LN.core.fetchJSON = fetchJSON;
  LN.core.setText = setText;
  LN.core.replaceProgressClass = replaceProgressClass;
  LN.core.fmtDateYMD = fmtDateYMD;
  LN.core.fmtDuration = fmtDuration;
  LN.core.fmtMoneyFromCents = fmtMoneyFromCents;
  LN.core.todayYMD = todayYMD;
  LN.core.monthYM = monthYM;
  LN.core.priorityPillClass = priorityPillClass;
  LN.core.priorityLabel = priorityLabel;
  LN.core.buildCheck = buildCheck;
  LN.core.buildDueMeta = buildDueMeta;
  LN.core.buildDurationBadge = buildDurationBadge;
  LN.core.normalizeIdList = normalizeIdList;
  LN.core.isTaskIdPending = isTaskIdPending;
  LN.core.addPendingOp = addPendingOp;
  LN.core.renderPendingModal = renderPendingModal;
  LN.core.startPendingTick = startPendingTick;
  LN.core.markPendingInDom = markPendingInDom;
  LN.core.loadDashboard = loadDashboard;
  LN.core.quickAddExpense = quickAddExpense;
  LN.core.pending = LN.core.pending || {};
  LN.core.pending.undo = undoPendingOp;
  LN.core.pending.retry = retryPendingOp;
  LN.core.pending.render = renderPendingModal;
  LN.core.pending.tick = startPendingTick;
  LN.core.pending.hideSnack = hideSnack;
  LN.core.pending.undoSnack = function () { if (snackOpId) undoPendingOp(snackOpId); };

  LN.core.fixed = LN.core.fixed || {};
  LN.core.fixed.normalize = normalizeFixedEvent;
  LN.core.fixed.persist = persistFixedEvents;
  LN.core.fixed.renderTimeBlocks = renderTimeBlocks;
  LN.core.fixed.renderList = renderFixedList;
  LN.core.fixed.resetForm = resetFixedForm;
  LN.core.fixed.setHint = setFixedHint;
  LN.core.fixed.openEditor = openFixedEditorById;

  LN.core.focus = LN.core.focus || {};
  LN.core.focus.prepare = prepareFocusModal;
  LN.core.focus.start = function () { try { startFocus(); } catch (_) {} };
  LN.core.focus.pause = function () { try { pauseFocus(); } catch (_) {} };
  LN.core.focus.resume = function () { try { resumeFocus(); } catch (_) {} };
  LN.core.focus.stop = function () { try { stopFocus().catch(function () {}); } catch (_) {} };
  LN.core.focus.isRunning = function () { return !!(focusState && focusState.running); };
  LN.core.focus.setMinutes = function (v) {
    if (!focusState || focusState.running) return;
    var mins = clampInt(v, 5, 240);
    focusState.totalSec = mins * 60;
    focusState.remainingSec = focusState.totalSec;
    updateFocusTimerUI();
  };
  LN.core.focus.setStudyId = function (id) { focusState.studyId = id ? String(id) : ''; };

  LN.core.budget = LN.core.budget || {};
  LN.core.budget.submit = submitBudgetForm;

  LN.core.reports = LN.core.reports || {};
  LN.core.reports.open = function () { openReports().catch(function () {}); };
  LN.core.reports.reload = function () {
    loadWeeklyReport().catch(function () {});
    loadMonthlyReport(qs('#reportsMonth') ? qs('#reportsMonth').value : monthYM()).catch(function () {});
    loadReviewReport().catch(function () {});
  };

  LN.core.expensesList = LN.core.expensesList || {};
  LN.core.expensesList.load = loadExpensesList;

  LN.core.expense = LN.core.expense || {};
  LN.core.expense.resetForCreate = resetExpenseFormForCreate;
  LN.core.expense.openEditor = openExpenseEditor;
  LN.core.expense.delete = deleteExpense;
  LN.core.expense.save = function () { quickAddExpense(true); };
  LN.core.expense.currentId = function () { return (state && state.editExpenseId) ? String(state.editExpenseId) : ''; };
  LN.core.expense.ensureTaskOptions = loadExpenseTaskOptions;
  LN.core.expense.syncTaskLinkUI = syncExpenseTaskLinkUI;
  function applyIncomingNavIntent() {
    var params = null;
    try {
      params = new URLSearchParams(window.location.search || '');
    } catch (_) {
      params = null;
    }
    if (!params) return;
    var open = String(params.get('open') || '').trim();
    if (!open || !window.LifeNestUI || typeof window.LifeNestUI.openModal !== 'function') return;

    var supported = { reports: true, expenses: true, expense: true, budget: true, task: true, study: true, focus: true };
    if (!supported[open]) return;

    setTimeout(function () {
      try { window.LifeNestUI.openModal(open); } catch (_) {}
      try {
        params.delete('open');
        var next = window.location.pathname + (params.toString() ? ('?' + params.toString()) : '') + window.location.hash;
        window.history.replaceState({}, '', next);
      } catch (_) {}
    }, 0);
  }

  LN.core.expense.openCreateForTask = function (taskId, taskTitle, lifeArea) {
    return loadExpenseTaskOptions().then(function () {
      resetExpenseFormForCreate({
        taskId: taskId ? String(taskId) : '',
        lifeArea: lifeArea || 'general',
        note: ''
      });
      setExpenseTaskValue(taskId ? String(taskId) : '');
      if (window.LifeNestUI) window.LifeNestUI.openModal('expense');
    });
  };


  async function bootstrap() {
    setTodayLabel();
    setSyncedNow();

    var b = await fetchJSON('/api/bootstrap.php', { credentials: 'same-origin' });
    state.csrf = String(b.csrf_token || '');
    state.user = b.user || null;
    state.pendingOps = [];
    try { sessionStorage.removeItem(PENDING_STORAGE_KEY); } catch (_) {}

    // Profile UI
    if (state.user) {
      var rawDisplay = String(state.user.display_name || state.user.full_name || state.user.email || 'User');
      var label = formatUserLabel(rawDisplay);
      setText('profileName', label);
      setText('heroUserName', label);
      var a = qs('#profileAvatar');
      if (a) {
        a.textContent = '';
        a.classList.remove('avatar--image');
        var avatarUrl = String(state.user.avatar_url || '');
        if (avatarUrl) {
          var img = document.createElement('img');
          img.className = 'avatar__img';
          img.src = avatarUrl;
          img.alt = '';
          a.classList.add('avatar--image');
          a.appendChild(img);
        } else {
          a.textContent = String(state.user.initials || (label[0] || 'U'));
        }
      }
    }

    // Set defaults
    var d = todayYMD();
    if (qs('#expDate')) qs('#expDate').value = d;
    if (qs('#expDate2')) qs('#expDate2').value = d;
    if (qs('#taskDue')) qs('#taskDue').value = d;
    if (qs('#budgetMonth')) qs('#budgetMonth').value = monthYM();

    // Fixed events (time blocks)
    loadFixedEvents();
    renderTimeBlocks();

    bindUIEvents();
    bindBudgetMemoryUI();

    await loadDashboard();
    await loadTasks(state.activeTab);
    applyIncomingNavIntent();
  }

  document.addEventListener('DOMContentLoaded', function () {
    bootstrap().catch(function () {
      // If not logged in, backend index.php already redirects.
    });
  });
})();
