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
    currency: 'USD',
    month: '',

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
    if (cur === 'TRY') return '₺';
    if (cur === 'EUR') return '€';
    if (cur === 'SAR') return '﷼';
    return '$';
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
    // Keep one AM/PM at the end (like the reference)
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
    if (tp && typeof tp.renderTimeBlocks === "function") {
      try { tp.renderTimeBlocks(); } catch (_) {}
    }
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
      var dateStr = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(d);
      var dayStr = new Intl.DateTimeFormat('en-US', { weekday: 'long' }).format(d);
      setText('lnDate', dateStr);
      setText('lnDay', '- ' + dayStr);
    } catch (_) {
      setText('lnDate', '');
      setText('lnDay', '');
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
    if (tp && typeof tp.renderPriorities === "function") {
      try { tp.renderPriorities(list); } catch (_) {}
    }
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
    var root = qs('#studyGrid');
    if (!root) return;
    root.innerHTML = '';
    state.studyById = {};

    if (!items || !items.length) {
      var empty = document.createElement('div');
      empty.className = 'study-card';
      empty.innerHTML = '<div class="study-card__top"><div class="study-card__title">No study items yet</div></div><div class="study-card__note">Add one from the button below</div>';
      root.appendChild(empty);
      return;
    }

    items.forEach(function (it) {
      state.studyById[String(it.id)] = it;
      var planned = clampInt(it.planned_minutes || 0, 0, 1000000);
      var done = clampInt(it.done_minutes || 0, 0, 1000000);
      var pct = planned > 0 ? Math.round((done / planned) * 100) : 0;
      pct = clampInt(pct, 0, 100);

      var card = document.createElement('div');
      card.className = 'study-card';
      card.setAttribute('data-study-id', String(it.id));

      var top = document.createElement('div');
      top.className = 'study-card__top';

      var t = document.createElement('div');
      t.className = 'study-card__title';
      t.textContent = String(it.title || '');
      top.appendChild(t);

      var more = document.createElement('button');
      more.className = 'icon-btn icon-btn--tiny';
      more.type = 'button';
      more.setAttribute('data-action', 'edit-study');
      more.setAttribute('aria-label', 'More');
      more.innerHTML = '<svg class="icon icon--sm" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Zm0 8a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Zm0 8a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z" fill="currentColor"/></svg>';
      top.appendChild(more);

      card.appendChild(top);

      var hours = document.createElement('div');
      hours.className = 'study-card__hours';
      hours.textContent = Math.floor(done / 60) + '/' + Math.floor(planned / 60) + 'h';
      card.appendChild(hours);

      var bar = document.createElement('div');
      bar.className = 'study-card__bar p' + pct;
      bar.setAttribute('aria-label', 'Study progress');
      bar.innerHTML = '<div class="study-card__track"></div><div class="study-card__fill"></div>';
      card.appendChild(bar);

      var note = document.createElement('div');
      note.className = 'study-card__note';
      note.textContent = it.next_due_date ? ('next due ' + fmtDateYMD(it.next_due_date)) : 'no due date';
      card.appendChild(note);

      root.appendChild(card);
    });
  }

  function updateSnapshot(d) {
    var snap = d && d.snapshot ? d.snapshot : null;
    if (!snap) return;

    // Snapshot Panel rendering (Stage 3C)
    var sm = (window.LN && window.LN.snapshot) ? window.LN.snapshot : null;
    if (sm && typeof sm.render === 'function') {
      try { sm.render(snap, d); } catch (_) {}
    }

    // Budget Panel values remain here until Stage 5 cleanup
    var b = snap.budget;
    if (!b) return;
    state.currency = b.currency || 'USD';
    state.month = b.month || monthYM();

    setText('budgetHeadAmount', fmtMoneyFromCents(b.spent_cents, state.currency) + ' of ' + fmtMoneyFromCents(b.budget_cents, state.currency));
    var spentPct = b.budget_cents > 0 ? Math.round((b.spent_cents / b.budget_cents) * 100) : 0;
    spentPct = clampInt(spentPct, 0, 100);
    replaceProgressClass(qs('#budgetBar'), spentPct);

    setText('budgetSub', 'Remaining: ' + fmtMoneyFromCents(b.remaining_cents, state.currency) + ' (' + b.days_left + ' days left), Daily Allowance: ' + fmtMoneyFromCents(b.daily_allowance_cents, state.currency));
    var mob = qs('#budgetMobileRemaining');
    if (mob) mob.innerHTML = 'Remaining: <strong>' + fmtMoneyFromCents(b.remaining_cents, state.currency) + '</strong>';

    var alert = qs('#budgetAlert');
    if (alert) {
      var show = (b.budget_cents > 0) && (spentPct >= 85 || (b.days_left <= 3 && b.remaining_cents <= b.daily_allowance_cents * 2));
      alert.classList.toggle('is-hidden', !show);
      if (show) setText('budgetAlertText', 'Budget Limit Approaching');
    }
  }

  function updatePanels(d) {
    var p = d && d.panels ? d.panels : null;
    if (!p) return;

    renderPriorities(p.top_priorities);
    renderStudy(p.study_items);

    // last expenses total
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
    // Keep a few defaults at the end for first-time users
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
  }

  async function loadWeeklySpark(weekStart) {
    var sm = (window.LN && window.LN.snapshot) ? window.LN.snapshot : null;
    if (sm && typeof sm.loadWeeklySpark === 'function') {
      return sm.loadWeeklySpark(weekStart);
    }
  }

  function syncTaskFilterSelects() {
    var fk = qs('#filterKind');
    if (fk) fk.value = state.taskFilters.kind || '';

    var fp = qs('#filterPriority');
    if (fp) fp.value = state.taskFilters.priority || '';

    var fs = qs('#filterStatus');
    if (fs) fs.value = state.taskFilters.status || '';

    var clr = qs('#filtersClear');
    if (clr) {
      var any = !!(state.taskFilters.kind || state.taskFilters.priority || state.taskFilters.status);
      clr.hidden = !any;
    }
  }

  function clearTaskFilters() {
    state.taskFilters.kind = '';
    state.taskFilters.priority = '';
    state.taskFilters.status = '';
    syncTaskFilterSelects();
  }

  function setTaskTabUI(active) {
    qsa('.tab').forEach(function (t) {
      var tab = t.getAttribute('data-tab') || 'today';
      var on = String(tab) === String(active);
      t.classList.toggle('is-active', on);
      t.setAttribute('aria-selected', on ? 'true' : 'false');
    });
  }

  async function loadTasks(tab, q) {
    state.activeTab = tab || state.activeTab;
    setTaskTabUI(state.activeTab);

    // Selection is local to the current visible list.
    if (state.selectMode) clearTaskSelection();

    var url = '/api/tasks.php?tab=' + encodeURIComponent(state.activeTab) + '&limit=200';
    if (state.taskFilters.kind) url += '&kind=' + encodeURIComponent(state.taskFilters.kind);
    if (state.taskFilters.priority) url += '&priority=' + encodeURIComponent(state.taskFilters.priority);
    if (state.taskFilters.status) url += '&status=' + encodeURIComponent(state.taskFilters.status);
    if (q) url += '&q=' + encodeURIComponent(q);
    var d = await api('GET', url);
    var list = d.tasks || [];
    state.tasksById = {};
    for (var i = 0; i < list.length; i++) {
      state.tasksById[String(list[i].id)] = list[i];
    }
    renderTasks(list);
  }

  async function setTaskDone(taskId, done) {
    await api('PATCH', '/api/tasks.php?id=' + encodeURIComponent(taskId), { status: done ? 'done' : 'todo' });
    await Promise.all([loadDashboard(), loadTasks(state.activeTab, qs('#taskSearch') ? qs('#taskSearch').value.trim() : '')]);
  }



  // ===== v4: Task selection + bulk actions =====
  function selectedTaskIdList() {
    var ids = [];
    for (var k in state.selectedTaskIds) {
      if (Object.prototype.hasOwnProperty.call(state.selectedTaskIds, k) && state.selectedTaskIds[k]) {
        ids.push(String(k));
      }
    }
    return normalizeIdList(ids, 200);
  }

  function clearTaskSelection() {
    state.selectedTaskIds = {};
    qsa('.task.is-selected').forEach(function (el) { el.classList.remove('is-selected'); });
    updateTaskBulkBar();
  }

  function setSelectMode(on) {
    state.selectMode = !!on;
    var btn = qs('#btnTaskSelect');
    if (btn) {
      btn.setAttribute('aria-pressed', state.selectMode ? 'true' : 'false');
      btn.textContent = state.selectMode ? 'Cancel' : 'Select';
    }
    if (!state.selectMode) {
      clearTaskSelection();
    } else {
      updateTaskBulkBar();
    }
  }

  function toggleTaskSelection(taskId) {
    var id = String(taskId || '');
    if (!id) return;
    if (isTaskIdPending(id)) return;

    state.selectedTaskIds[id] = !state.selectedTaskIds[id];
    var row = qs('.task[data-task-id="' + id + '"]');
    if (row) row.classList.toggle('is-selected', !!state.selectedTaskIds[id]);
    updateTaskBulkBar();
  }

  function updateTaskBulkBar() {
    var bar = qs('#taskBulkBar');
    var cnt = qs('#taskBulkCount');
    if (!bar || !cnt) return;
    var n = selectedTaskIdList().length;
    cnt.textContent = String(n);
    var show = state.selectMode && n > 0;
    bar.setAttribute('aria-hidden', show ? 'false' : 'true');
  }

  async function bulkUpdateTasks(action, extra) {
    var ids = selectedTaskIdList();
    if (!ids.length) return;

    // Block operations when any selected task is pending deletion
    for (var i = 0; i < ids.length; i++) {
      if (isTaskIdPending(ids[i])) {
        window.alert('Some selected tasks are pending deletion. Undo or wait, then try again.');
        return;
      }
    }

    // UI lock
    qsa('#taskBulkBar button').forEach(function (b) { b.disabled = true; });
    try {
      var payload = { action: String(action || ''), ids: ids };
      if (extra && typeof extra === 'object') {
        for (var k in extra) {
          if (Object.prototype.hasOwnProperty.call(extra, k)) payload[k] = extra[k];
        }
      }
      await api('POST', '/api/tasks_bulk.php', payload);
      clearTaskSelection();
      await Promise.all([loadDashboard(), loadTasks(state.activeTab, (qs('#taskSearch') && qs('#taskSearch').value || '').trim())]);
    } catch (err) {
      window.alert(err && err.message ? err.message : 'Failed.');
    } finally {
      qsa('#taskBulkBar button').forEach(function (b) { b.disabled = false; });
      updateTaskBulkBar();
    }
  }

  function openBulkPriorityMenu() {
    var ids = selectedTaskIdList();
    if (!ids.length) return;
    if (!window.LifeNestUI || !window.LifeNestUI.openContextMenu) return;
    window.LifeNestUI.openContextMenu('Set priority', [
      { label: 'High', cmd: 'bulk:priority:high' },
      { label: 'Medium', cmd: 'bulk:priority:medium' },
      { label: 'Low', cmd: 'bulk:priority:low' }
    ]);
  }

  function scheduleDeleteTasks(ids) {
    var list = normalizeIdList(ids || [], 200);
    if (!list.length) return;
    // Confirm once
    if (!window.confirm('Delete selected task(s)?')) return;

    var type = (list.length === 1) ? 'task_delete' : 'tasks_bulk_delete';
    var op = addPendingOp(type, list);
    if (!op) return;

    // Deselect deleted tasks
    list.forEach(function (id) {
      if (state.selectedTaskIds[id]) delete state.selectedTaskIds[id];
      var row = qs('.task[data-task-id="' + id + '"]');
      if (row) row.classList.remove('is-selected');
    });
    updateTaskBulkBar();
    renderPendingModal();
  }

  function resetTaskFormForCreate() {
    state.editTaskId = null;
    if (qs('#taskId')) qs('#taskId').value = '';
    setText('modalTaskTitle', 'Add Task');
    setText('taskFormHint', '');
    if (qs('#taskDeleteBtn')) qs('#taskDeleteBtn').hidden = true;
    if (qs('#taskTitle')) qs('#taskTitle').value = '';
    if (qs('#taskKind')) qs('#taskKind').value = 'personal';
    if (qs('#taskPriority')) qs('#taskPriority').value = 'medium';
    if (qs('#taskDur')) qs('#taskDur').value = '';
  }

  async function fetchTaskById(taskId) {
    var t = state.tasksById[String(taskId)] || null;
    if (t) return t;
    // Fallback: load from all (bounded)
    var d = await api('GET', '/api/tasks.php?tab=all&limit=200');
    var list = d.tasks || [];
    for (var i = 0; i < list.length; i++) {
      state.tasksById[String(list[i].id)] = list[i];
    }
    return state.tasksById[String(taskId)] || null;
  }

  async function openTaskEditor(taskId) {
    var t = await fetchTaskById(taskId);
    if (!t) throw new Error('Task not found');

    state.editTaskId = String(taskId);
    if (qs('#taskId')) qs('#taskId').value = String(taskId);
    setText('modalTaskTitle', 'Edit Task');
    setText('taskFormHint', '');
    if (qs('#taskDeleteBtn')) qs('#taskDeleteBtn').hidden = false;

    if (qs('#taskTitle')) qs('#taskTitle').value = String(t.title || '');
    if (qs('#taskKind')) qs('#taskKind').value = String(t.kind || 'personal');
    if (qs('#taskPriority')) qs('#taskPriority').value = String(t.priority || 'medium');
    if (qs('#taskDue')) qs('#taskDue').value = t.due_date ? String(t.due_date) : '';
    if (qs('#taskDur')) qs('#taskDur').value = (t.duration_minutes === null || typeof t.duration_minutes === 'undefined') ? '' : String(t.duration_minutes);

    if (window.LifeNestUI) window.LifeNestUI.openModal('task');
  }

  async function deleteTask(taskId) {
    // v4: schedule delete with undo
    var id = String(taskId || '');
    if (!id) return;

    var op = addPendingOp('task_delete', [id]);
    if (!op) return;

    // Close editor if it targets this task
    if (String(state.editTaskId || '') == id) {
      resetTaskFormForCreate();
      if (window.LifeNestUI) window.LifeNestUI.closeModal('modalTask');
    }

    clearTaskSelection();
    renderPendingModal();
  }

  async function submitTaskForm(e) {
    e.preventDefault();
    setText('taskFormHint', '');

    var title = (qs('#taskTitle') && qs('#taskTitle').value || '').trim();
    var kind = (qs('#taskKind') && qs('#taskKind').value) || 'personal';
    var priority = (qs('#taskPriority') && qs('#taskPriority').value) || 'medium';
    var due = (qs('#taskDue') && qs('#taskDue').value) || null;
    var dur = (qs('#taskDur') && qs('#taskDur').value) || '';

    if (!title) {
      setText('taskFormHint', 'Write a title.');
      return;
    }

    var payload = { title: title, kind: kind, priority: priority, due_date: due || null };
    if (dur !== '') payload.duration_minutes = dur;

    try {
      if (state.editTaskId) {
        await api('PATCH', '/api/tasks.php?id=' + encodeURIComponent(state.editTaskId), payload);
      } else {
        await api('POST', '/api/tasks.php', payload);
      }
      setText('taskFormHint', 'Saved.');
      if (window.LifeNestUI) window.LifeNestUI.closeModal('modalTask');
      // reset
      resetTaskFormForCreate();
      await Promise.all([loadDashboard(), loadTasks(state.activeTab)]);
    } catch (err) {
      setText('taskFormHint', err && err.message ? err.message : 'Failed.');
    }
  }

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

  function resetExpenseFormForCreate() {
    state.editExpenseId = null;
    if (qs('#expenseId')) qs('#expenseId').value = '';
    setText('modalExpenseTitle', 'Add Expense');
    setText('expenseFormHint', '');
    if (qs('#expenseDeleteBtn')) qs('#expenseDeleteBtn').hidden = true;
    if (qs('#expAmount2')) qs('#expAmount2').value = '';
    if (qs('#expCategory2')) qs('#expCategory2').value = '';
    if (qs('#expDate2')) qs('#expDate2').value = todayYMD();
    if (qs('#expCurrency2')) qs('#expCurrency2').value = state.currency;
    if (qs('#expNote2')) qs('#expNote2').value = '';
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

    var cents = parseMoneyToCents(amountEl ? amountEl.value : '');
    var cat = catEl ? catEl.value : '';
    var date = dateEl ? dateEl.value : '';
    var cur = fromModal && curEl ? curEl.value : state.currency;
    var note = fromModal && noteEl ? (noteEl.value || '').trim() : '';

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
          note: note || null
        });
        setText(hintId, 'Updated.');
      } else {
        await api('POST', '/api/expenses.php', {
          amount_cents: cents,
          currency: cur,
          category: cat,
          expense_date: date,
          note: note || null
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
      if (qs('#modalExpenses') && qs('#modalExpenses').getAttribute('aria-hidden') === 'false') {
        await loadExpensesList(qs('#expensesMonth') ? qs('#expensesMonth').value : (state.month || monthYM()));
      }
    } catch (err) {
      setText(hintId, err && err.message ? err.message : 'Failed.');
    }
  }

  function resetStudyFormForCreate() {
    state.editStudyId = null;
    if (qs('#studyId')) qs('#studyId').value = '';
    setText('modalStudyTitle', 'Add Study Task');
    setText('studyFormHint', '');
    if (qs('#studyDeleteBtn')) qs('#studyDeleteBtn').hidden = true;
    if (qs('#studyTitle')) qs('#studyTitle').value = '';
    if (qs('#studyPlanned')) qs('#studyPlanned').value = '60';
    if (qs('#studyDone')) qs('#studyDone').value = '0';
    if (qs('#studyDue')) qs('#studyDue').value = '';
  }

  async function openStudyEditor(studyId) {
    var it = state.studyById[String(studyId)] || null;
    if (!it) {
      var d = await api('GET', '/api/study.php');
      var list = d.items || [];
      state.studyById = {};
      for (var i = 0; i < list.length; i++) state.studyById[String(list[i].id)] = list[i];
      it = state.studyById[String(studyId)] || null;
    }
    if (!it) throw new Error('Study item not found');

    state.editStudyId = String(studyId);
    if (qs('#studyId')) qs('#studyId').value = String(studyId);
    setText('modalStudyTitle', 'Edit Study Task');
    setText('studyFormHint', '');
    if (qs('#studyDeleteBtn')) qs('#studyDeleteBtn').hidden = false;

    if (qs('#studyTitle')) qs('#studyTitle').value = String(it.title || '');
    if (qs('#studyPlanned')) qs('#studyPlanned').value = String(it.planned_minutes || 0);
    if (qs('#studyDone')) qs('#studyDone').value = String(it.done_minutes || 0);
    if (qs('#studyDue')) qs('#studyDue').value = it.next_due_date ? String(it.next_due_date) : '';

    if (window.LifeNestUI) window.LifeNestUI.openModal('study');
  }

  async function deleteStudy(studyId) {
    await api('DELETE', '/api/study.php?id=' + encodeURIComponent(studyId), {});
    if (String(state.editStudyId || '') === String(studyId)) {
      resetStudyFormForCreate();
      if (window.LifeNestUI) window.LifeNestUI.closeModal('modalStudy');
    }
    await loadDashboard();
  }

  async function submitStudyForm(e) {
    e.preventDefault();
    setText('studyFormHint', '');

    var title = (qs('#studyTitle') && qs('#studyTitle').value || '').trim();
    var planned = clampInt(qs('#studyPlanned') ? qs('#studyPlanned').value : 0, 0, 1000000);
    var done = clampInt(qs('#studyDone') ? qs('#studyDone').value : 0, 0, 1000000);
    var due = (qs('#studyDue') && qs('#studyDue').value) || null;

    if (!title) {
      setText('studyFormHint', 'Write a title.');
      return;
    }

    try {
      if (state.editStudyId) {
        await api('PATCH', '/api/study.php?id=' + encodeURIComponent(state.editStudyId), {
          title: title,
          planned_minutes: planned,
          done_minutes: done,
          next_due_date: due || null
        });
      } else {
        await api('POST', '/api/study.php', {
          title: title,
          planned_minutes: planned,
          done_minutes: done,
          next_due_date: due || null
        });
      }
      setText('studyFormHint', 'Saved.');
      if (window.LifeNestUI) window.LifeNestUI.closeModal('modalStudy');
      resetStudyFormForCreate();
      await loadDashboard();
    } catch (err) {
      setText('studyFormHint', err && err.message ? err.message : 'Failed.');
    }
  }

  async function submitBudgetForm(e) {
    e.preventDefault();
    setText('budgetFormHint', '');

    var m = (qs('#budgetMonth') && qs('#budgetMonth').value) || '';
    var cur = (qs('#budgetCurrency') && qs('#budgetCurrency').value) || 'USD';
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
      if (window.LifeNestUI) window.LifeNestUI.closeModal('modalBudget');
      await loadDashboard();
    } catch (err) {
      setText('budgetFormHint', err && err.message ? err.message : 'Failed.');
    }
  }



  // ---- Task Notes (v2 UI)
  var NOTE_COLORS = ['blue','mint','yellow','pink','gray'];

  function normalizeNoteColor(c) {
    var s = String(c || '').trim();
    return NOTE_COLORS.indexOf(s) >= 0 ? s : 'blue';
  }

  function setNoteColor(c) {
    state.noteColor = normalizeNoteColor(c);
    var composer = qs('#noteComposer');
    if (composer) composer.setAttribute('data-color', state.noteColor);

    qsa('#noteColors .ln-note2__color').forEach(function (btn) {
      var active = (btn.getAttribute('data-color') === state.noteColor);
      if (active) btn.classList.add('is-active');
      else btn.classList.remove('is-active');
      btn.setAttribute('aria-checked', active ? 'true' : 'false');
    });
  }

  function clearRenderedNoteCards() {
    qsa('#notesList .ln-note2__note, #notesList .ln-note2__empty').forEach(function (el) {
      try { el.remove(); } catch (_) { if (el && el.parentNode) el.parentNode.removeChild(el); }
    });
  }

  function setComposerMode(isEdit) {
    setText('noteComposerTitle', isEdit ? 'Edit Note' : 'Add New Note');
  }

  async function openNotesForTask(taskId, title) {
    state.activeTaskForNotes = taskId;
    state.editNoteId = null;

    setText('noteTaskTitle', title || '');
    setText('noteFormHint', 'Changes saved instantly.');
    setComposerMode(false);

    if (qs('#noteSaveBtn')) qs('#noteSaveBtn').textContent = 'Save Note';
    if (qs('#noteBody')) qs('#noteBody').value = '';

    setNoteColor('blue');
    clearRenderedNoteCards();

    try {
      var d = await api('GET', '/api/task_notes.php?task_id=' + encodeURIComponent(taskId) + '&limit=50');
      renderNotes(d.notes || []);
      if (window.LifeNestUI) window.LifeNestUI.openModal('note');
    } catch (err) {
      setText('noteFormHint', 'Failed to load notes.');
      clearRenderedNoteCards();
      if (window.LifeNestUI) window.LifeNestUI.openModal('note');
    }
  }

  function renderNotes(notes) {
    var list = qs('#notesList');
    if (!list) return;

    clearRenderedNoteCards();
    state.notesById = {};

    if (!notes || !notes.length) {
      return;
    }

    var editSvg = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20h9" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5Z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>';
    var trashSvg = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M8 6V4h8v2" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M19 6l-1 14H6L5 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M10 11v6M14 11v6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';

    notes.forEach(function (n) {
      state.notesById[String(n.id)] = n;

      var color = normalizeNoteColor(n.color || 'blue');
      var it = document.createElement('div');
      it.className = 'ln-note2__card ln-note2__note ln-note2__note--' + color;
      it.setAttribute('data-note-id', String(n.id));

      var head = document.createElement('div');
      head.className = 'ln-note2__noteHead';

      var time = document.createElement('div');
      time.className = 'ln-note2__time';
      time.textContent = fmtNoteTime(n.created_at || '');
      head.appendChild(time);

      var icons = document.createElement('div');
      icons.className = 'ln-note2__icons';

      var edit = document.createElement('button');
      edit.className = 'ln-note2__iconBtn';
      edit.type = 'button';
      edit.setAttribute('data-action', 'edit-note');
      edit.setAttribute('aria-label', 'Edit note');
      edit.innerHTML = editSvg;
      icons.appendChild(edit);

      var del = document.createElement('button');
      del.className = 'ln-note2__iconBtn';
      del.type = 'button';
      del.setAttribute('data-action', 'delete-note');
      del.setAttribute('aria-label', 'Delete note');
      del.innerHTML = trashSvg;
      icons.appendChild(del);

      head.appendChild(icons);
      it.appendChild(head);

      var body = document.createElement('div');
      body.className = 'ln-note2__body';
      body.textContent = String(n.body || '');
      it.appendChild(body);

      list.appendChild(it);
    });
  }

  async function submitNoteForm(e) {
    e.preventDefault();
    setText('noteFormHint', '');

    var taskId = state.activeTaskForNotes;
    var bodyEl = qs('#noteBody');
    var body = (bodyEl && bodyEl.value || '').trim();
    var color = normalizeNoteColor(state.noteColor || 'blue');

    if (!taskId) {
      setText('noteFormHint', 'Pick a task first.');
      return;
    }
    if (!body) {
      setText('noteFormHint', 'Write a note.');
      return;
    }

    try {
      if (state.editNoteId) {
        await api('PATCH', '/api/task_notes.php?id=' + encodeURIComponent(state.editNoteId), { body: body, color: color });
      } else {
        await api('POST', '/api/task_notes.php', { task_id: taskId, body: body, color: color });
      }

      if (bodyEl) bodyEl.value = '';
      state.editNoteId = null;
      setComposerMode(false);
      setNoteColor('blue');

      var d = await api('GET', '/api/task_notes.php?task_id=' + encodeURIComponent(taskId) + '&limit=50');
      renderNotes(d.notes || []);
      setText('noteFormHint', 'Changes saved instantly.');
    } catch (err) {
      setText('noteFormHint', err && err.message ? err.message : 'Failed.');
    }
  }

  async function deleteNote(noteId) {
    await api('DELETE', '/api/task_notes.php?id=' + encodeURIComponent(noteId), {});

    if (state.editNoteId && String(state.editNoteId) === String(noteId)) {
      state.editNoteId = null;
      var bodyEl = qs('#noteBody');
      if (bodyEl) bodyEl.value = '';
      setComposerMode(false);
      setNoteColor('blue');
    }

    var taskId = state.activeTaskForNotes;
    if (taskId) {
      var d = await api('GET', '/api/task_notes.php?task_id=' + encodeURIComponent(taskId) + '&limit=50');
      renderNotes(d.notes || []);
    }

    setText('noteFormHint', 'Changes saved instantly.');
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

  async function loadWeeklyReport() {
    setText('repWeekRange', '—');
    setText('repWeekDone', '—');
    setText('repWeekTotal', '—');
    setText('repWeekPct', '—');
    setText('repWeekSpend', '—');
    replaceProgressClass(qs('#repWeekBar'), 0);
    renderReportCats('repWeekCats', [], state.currency);

    var d = await api('GET', '/api/reports/weekly.php');

    var ws = String(d.week_start || '');
    var wn = String(d.week_next || '');
    setText('repWeekRange', ws && wn ? (ws + ' → ' + wn) : (ws || '—'));

    var tasks = d.tasks || {};
    var total = Number(tasks.total || 0) || 0;
    var done = Number(tasks.done || 0) || 0;
    var pct = clampInt(Number(tasks.percent || 0) || 0, 0, 100);

    setText('repWeekDone', String(done));
    setText('repWeekTotal', String(total));
    setText('repWeekPct', pct + '%');
    replaceProgressClass(qs('#repWeekBar'), pct);

    var ex = d.expenses || {};
    var cur = String(ex.currency || state.currency || 'USD');
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
    replaceProgressClass(qs('#repMonthBar'), 0);
    renderReportCats('repMonthCats', [], state.currency);

    var ym = month && String(month).trim() ? String(month).trim() : monthYM();
    var d = await api('GET', '/api/reports/monthly.php?month=' + encodeURIComponent(ym));

    setText('repMonthRange', String(d.month || ym));

    var b = d.budget || {};
    var cur = String(b.currency || state.currency || 'USD');
    var budgetC = Number(b.budget_cents || 0) || 0;
    var spentC = Number(b.spent_cents || 0) || 0;
    var remC = Number(b.remaining_cents || 0) || 0;

    setText('repMonthBudget', fmtMoneyFromCents(budgetC, cur));
    setText('repMonthSpent', fmtMoneyFromCents(spentC, cur));
    setText('repMonthRemaining', fmtMoneyFromCents(remC, cur));

    var pct = budgetC > 0 ? Math.round((spentC / budgetC) * 100) : 0;
    pct = clampInt(pct, 0, 100);
    replaceProgressClass(qs('#repMonthBar'), pct);

    var ex = d.expenses || {};
    renderReportCats('repMonthCats', ex.by_category || [], cur);
  }

  async function openReports() {
    setReportsHint('');
    if (qs('#reportsMonth')) {
      if (!qs('#reportsMonth').value) qs('#reportsMonth').value = monthYM();
    }
    var ym = qs('#reportsMonth') ? qs('#reportsMonth').value : monthYM();
    try {
      await Promise.all([loadWeeklyReport(), loadMonthlyReport(ym)]);
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
    // Tabs -> load tasks
    qsa('.tab').forEach(function (t) {
      t.addEventListener('click', function () {
        var tab = t.getAttribute('data-tab') || 'today';
        loadTasks(tab, (qs('#taskSearch') && qs('#taskSearch').value || '').trim()).catch(function () {});
      });
    });

    // Search
    var search = qs('#taskSearch');
    if (search) {
      search.addEventListener('keydown', function (e) {
        if (e.key !== 'Enter') return;
        e.preventDefault();
        loadTasks(state.activeTab, search.value.trim()).catch(function () {});
      });
    }

    // Quick filters (match the reference UI)
    syncTaskFilterSelects();

    var fk = qs('#filterKind');
    if (fk) {
      fk.addEventListener('change', function () {
        state.taskFilters.kind = fk.value || '';
        syncTaskFilterSelects();
        loadTasks(state.activeTab, (qs('#taskSearch') && qs('#taskSearch').value || '').trim()).catch(function () {});
      });
    }

    var fp = qs('#filterPriority');
    if (fp) {
      fp.addEventListener('change', function () {
        state.taskFilters.priority = fp.value || '';
        syncTaskFilterSelects();
        loadTasks(state.activeTab, (qs('#taskSearch') && qs('#taskSearch').value || '').trim()).catch(function () {});
      });
    }

    var fs = qs('#filterStatus');
    if (fs) {
      fs.addEventListener('change', function () {
        state.taskFilters.status = fs.value || '';
        syncTaskFilterSelects();
        loadTasks(state.activeTab, (qs('#taskSearch') && qs('#taskSearch').value || '').trim()).catch(function () {});
      });
    }

    var clr = qs('#filtersClear');
    if (clr) {
      clr.addEventListener('click', function (e) {
        e.preventDefault();
        clearTaskFilters();
        if (qs('#taskSearch')) qs('#taskSearch').value = '';
        loadTasks(state.activeTab, '').catch(function () {});
      });
    }


    // v4: Selection mode + bulk actions
    var selBtn = qs('#btnTaskSelect');
    if (selBtn) {
      selBtn.addEventListener('click', function (e) {
        e.preventDefault();
        setSelectMode(!state.selectMode);
      });
    }

    var bDone = qs('#taskBulkDone');
    if (bDone) bDone.addEventListener('click', function (e) { e.preventDefault(); bulkUpdateTasks('done').catch(function () {}); });

    var bTodo = qs('#taskBulkTodo');
    if (bTodo) bTodo.addEventListener('click', function (e) { e.preventDefault(); bulkUpdateTasks('todo').catch(function () {}); });

    var bPr = qs('#taskBulkPriority');
    if (bPr) bPr.addEventListener('click', function (e) { e.preventDefault(); openBulkPriorityMenu(); });

    var bDel = qs('#taskBulkDelete');
    if (bDel) bDel.addEventListener('click', function (e) {
      e.preventDefault();
      scheduleDeleteTasks(selectedTaskIdList());
    });

    var bClr = qs('#taskBulkClear');
    if (bClr) bClr.addEventListener('click', function (e) { e.preventDefault(); clearTaskSelection(); });

    updateTaskBulkBar();

    // v4: Snackbar buttons
    var snUndo = qs('#lnSnackAction');
    if (snUndo) {
      snUndo.addEventListener('click', function (e) {
        e.preventDefault();
        if (!snackOpId) return;
        undoPendingOp(snackOpId);
      });
    }

    var snClose = qs('#lnSnackClose');
    if (snClose) snClose.addEventListener('click', function (e) { e.preventDefault(); hideSnack(); });

    var snPend = qs('#lnSnackPending');
    if (snPend) {
      snPend.addEventListener('click', function (e) {
        e.preventDefault();
        renderPendingModal();
        startPendingTick();
        if (window.LifeNestUI) window.LifeNestUI.openModal('pending');
      });
    }

    // v4: Pending modal events
    var pm = qs('#pendingList');
    if (pm) {
      pm.addEventListener('click', function (e) {
        var row = e.target && e.target.closest ? e.target.closest('.pending-row') : null;
        if (!row) return;
        var opId = row.getAttribute('data-op-id');
        if (!opId) return;
        var undo = e.target && e.target.closest ? e.target.closest('[data-action="pending-undo"]') : null;
        if (undo) { e.preventDefault(); undoPendingOp(opId); return; }
        var retry = e.target && e.target.closest ? e.target.closest('[data-action="pending-retry"]') : null;
        if (retry) { e.preventDefault(); retryPendingOp(opId).catch(function () {}); return; }
      });
    }

    // Ensure modal countdown refresh when opened from anywhere
    qsa('[data-open="pending"]').forEach(function (b) {
      b.addEventListener('click', function () {
        renderPendingModal();
        startPendingTick();
      }, true);
    });

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

    // Forms
    var taskForm = qs('#taskForm');
    if (taskForm) taskForm.addEventListener('submit', submitTaskForm);

    qsa('[data-open="task"]').forEach(function (b) {
      b.addEventListener('click', function () {
        resetTaskFormForCreate();
      }, true);
    });

    var taskDel = qs('#taskDeleteBtn');
    if (taskDel) {
      taskDel.addEventListener('click', function (e) {
        e.preventDefault();
        if (!state.editTaskId) return;
        if (!window.confirm('Delete this task?')) return;
        deleteTask(state.editTaskId).catch(function () {});
      });
    }

    // Quick add expense: matches the reference UI (no explicit Add button) — submit with Enter.
    var expAmt1 = qs('#expAmount');
    if (expAmt1) {
      expAmt1.addEventListener('keydown', function (e) {
        if (e.key !== 'Enter') return;
        e.preventDefault();
        quickAddExpense(false).catch(function () {});
      });
    }

    var expDate1 = qs('#expDate');
    if (expDate1) {
      expDate1.addEventListener('keydown', function (e) {
        if (e.key !== 'Enter') return;
        e.preventDefault();
        quickAddExpense(false).catch(function () {});
      });
    }

    var expForm = qs('#expenseForm');
    if (expForm) expForm.addEventListener('submit', function (e) { e.preventDefault(); quickAddExpense(true).catch(function () {}); });

    qsa('[data-open="expense"]').forEach(function (b) {
      b.addEventListener('click', function () {
        resetExpenseFormForCreate();
      }, true);
    });

    var expDel = qs('#expenseDeleteBtn');
    if (expDel) {
      expDel.addEventListener('click', function (e) {
        e.preventDefault();
        if (!state.editExpenseId) return;
        if (!window.confirm('Delete this expense?')) return;
        deleteExpense(state.editExpenseId).catch(function () {});
      });
    }

    var stForm = qs('#studyForm');
    if (stForm) stForm.addEventListener('submit', submitStudyForm);

    qsa('[data-open="study"]').forEach(function (b) {
      b.addEventListener('click', function () {
        resetStudyFormForCreate();
      }, true);
    });

    // Focus session
    qsa('[data-open="focus"]').forEach(function (b) {
      b.addEventListener('click', function () {
        prepareFocusModal().catch(function () {});
      }, true);
    });

    // Fixed events (time blocks)
    qsa('[data-open="fixed"]').forEach(function (b) {
      b.addEventListener('click', function () {
        loadFixedEvents();
        renderTimeBlocks();
        renderFixedList();
        resetFixedForm();
      }, true);
    });

    var fixedList = qs('#fixedList');
    if (fixedList) {
      fixedList.addEventListener('click', function (e) {
        var row = e.target && e.target.closest ? e.target.closest('.ln-fixed__row') : null;
        if (!row) return;
        var fid = row.getAttribute('data-fixed-id');
        if (!fid) return;
        openFixedEditorById(fid);
      });
    }

    var fixedForm = qs('#fixedForm');
    if (fixedForm) {
      fixedForm.addEventListener('submit', function (e) {
        e.preventDefault();
        var idEl = qs('#fixedId');
        var nameEl = qs('#fixedName');
        var typeEl = qs('#fixedType');
        var stEl = qs('#fixedStart');
        var enEl = qs('#fixedEnd');

        var fid = idEl ? String(idEl.value || '').trim() : '';
        var nm = nameEl ? String(nameEl.value || '').trim() : '';
        var ty = typeEl ? String(typeEl.value || '').trim() : 'focus';
        var st = stEl ? String(stEl.value || '').trim() : '';
        var en = enEl ? String(enEl.value || '').trim() : '';

        if (!nm) { setFixedHint('Name is required.'); return; }
        if (!/^\d{2}:\d{2}$/.test(st) || !/^\d{2}:\d{2}$/.test(en)) { setFixedHint('Start/End time is invalid.'); return; }
        if (timeToMinutes(en) <= timeToMinutes(st)) { setFixedHint('End time must be after start time.'); return; }

        var ev = normalizeFixedEvent({ id: fid || null, name: nm, type: ty, start: st, end: en });
        if (!ev) { setFixedHint('Invalid event.'); return; }

        // Update or create
        var next = [];
        var updated = false;
        for (var i = 0; i < state.fixedEvents.length; i++) {
          var cur = state.fixedEvents[i];
          if (String(cur.id) === String(ev.id)) {
            next.push(ev);
            updated = true;
          } else {
            next.push(cur);
          }
        }
        if (!updated) next.push(ev);
        state.fixedEvents = next;
        persistFixedEvents();
        renderTimeBlocks();
        renderFixedList();
        resetFixedForm();
        setFixedHint(updated ? 'Updated.' : 'Saved.');
      });
    }

    var fixedCancel = qs('#fixedCancel');
    if (fixedCancel) fixedCancel.addEventListener('click', function (e) { e.preventDefault(); resetFixedForm(); });

    var fixedDel = qs('#fixedDelete');
    if (fixedDel) {
      fixedDel.addEventListener('click', function (e) {
        e.preventDefault();
        var idEl = qs('#fixedId');
        var fid = idEl ? String(idEl.value || '').trim() : '';
        if (!fid) return;
        if (!window.confirm('Delete this fixed event?')) return;
        state.fixedEvents = (state.fixedEvents || []).filter(function (x) { return String(x.id) !== String(fid); });
        persistFixedEvents();
        renderTimeBlocks();
        renderFixedList();
        resetFixedForm();
        setFixedHint('Deleted.');
      });
    }

    var fStart = qs('#focusStart');
    if (fStart) fStart.addEventListener('click', function (e) { e.preventDefault(); startFocus(); });
    var fPause = qs('#focusPause');
    if (fPause) fPause.addEventListener('click', function (e) { e.preventDefault(); pauseFocus(); });
    var fResume = qs('#focusResume');
    if (fResume) fResume.addEventListener('click', function (e) { e.preventDefault(); resumeFocus(); });
    var fStop = qs('#focusStop');
    if (fStop) fStop.addEventListener('click', function (e) { e.preventDefault(); stopFocus().catch(function () {}); });

    var fMin = qs('#focusMinutes');
    if (fMin) {
      fMin.addEventListener('input', function () {
        if (focusState.running) return;
        var mins = clampInt(fMin.value, 5, 240);
        focusState.totalSec = mins * 60;
        focusState.remainingSec = focusState.totalSec;
        updateFocusTimerUI();
      });
    }

    var fSel = qs('#focusStudyId');
    if (fSel) {
      fSel.addEventListener('change', function () {
        focusState.studyId = fSel.value ? String(fSel.value) : '';
      });
    }

    // Prevent accidental close while running (click close/backdrop)
    qsa('#modalFocus [data-close="modal"]').forEach(function (c) {
      c.addEventListener('click', function (e) {
        if (!focusState.running) return;
        e.preventDefault();
        e.stopPropagation();
        if (window.confirm('Focus session is running. Stop it and close?')) {
          stopFocus().catch(function () {});
          if (window.LifeNestUI) window.LifeNestUI.closeModal('modalFocus');
        }
      }, true);
    });

    // Prevent accidental close via Escape
    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape') return;
      var mf = qs('#modalFocus');
      if (!mf || mf.getAttribute('aria-hidden') !== 'false') return;
      if (!focusState.running) return;
      e.preventDefault();
      e.stopPropagation();
      if (window.confirm('Focus session is running. Stop it and close?')) {
        stopFocus().catch(function () {});
        if (window.LifeNestUI) window.LifeNestUI.closeModal('modalFocus');
      }
    }, true);

    var studyDel = qs('#studyDeleteBtn');
    if (studyDel) {
      studyDel.addEventListener('click', function (e) {
        e.preventDefault();
        if (!state.editStudyId) return;
        if (!window.confirm('Delete this study item?')) return;
        deleteStudy(state.editStudyId).catch(function () {});
      });
    }

    var bForm = qs('#budgetForm');
    if (bForm) bForm.addEventListener('submit', submitBudgetForm);

    var noteForm = qs('#noteForm');
    if (noteForm) noteForm.addEventListener('submit', submitNoteForm);

    var noteColors = qs('#noteColors');
    if (noteColors) {
      noteColors.addEventListener('click', function (e) {
        var btn = e.target && e.target.closest ? e.target.closest('.ln-note2__color[data-color]') : null;
        if (!btn) return;
        setNoteColor(btn.getAttribute('data-color'));
      });
    }

    var notesList = qs('#notesList');
    if (notesList) {
      notesList.addEventListener('click', function (e) {
        var edit = e.target && e.target.closest ? e.target.closest('[data-action="edit-note"]') : null;
        if (edit) {
          var it2 = edit.closest('.ln-note2__note');
          if (!it2) return;
          var nid2 = it2.getAttribute('data-note-id');
          if (!nid2) return;
          var note = state.notesById[String(nid2)] || null;
          if (!note) return;
          state.editNoteId = String(nid2);
          setComposerMode(true);
          setNoteColor(note.color || 'blue');
          if (qs('#noteBody')) qs('#noteBody').value = String(note.body || '');
          if (qs('#noteSaveBtn')) qs('#noteSaveBtn').textContent = 'Save Note';
          try { if (qs('#noteBody')) qs('#noteBody').focus(); } catch (_) {}
          return;
        }

        var del = e.target && e.target.closest ? e.target.closest('[data-action="delete-note"]') : null;
        if (!del) return;
        var it = del.closest('.ln-note2__note');
        if (!it) return;
        var nid = it.getAttribute('data-note-id');
        if (!nid) return;
        deleteNote(nid).catch(function () {});
      });
    }

    var noteCancel = qs('#noteCancelEdit');
    if (noteCancel) {
      noteCancel.addEventListener('click', function (e) {
        e.preventDefault();
        state.editNoteId = null;
        noteCancel.hidden = true;
        if (qs('#noteSaveBtn')) qs('#noteSaveBtn').textContent = 'Save Note';
        if (qs('#noteBody')) qs('#noteBody').value = '';
        setText('noteFormHint', '');
      });
    }

    // Replan button -> jump to tasks and refresh Today tab
    var rp = qs('#btnReplan');
    if (rp) {
      rp.addEventListener('click', function (e) {
        e.preventDefault();
        clearTaskFilters();
        if (qs('#taskSearch')) qs('#taskSearch').value = '';
        loadTasks('today', '').catch(function () {});
        try {
          var card = qs('.card--tasks');
          if (card) card.scrollIntoView({ behavior: 'smooth', block: 'start' });
          if (qs('#taskSearch')) qs('#taskSearch').focus();
        } catch (_) {}
      });
    }

    // Add Study button
    var addStudy = qs('#btnAddStudy');
    if (addStudy) addStudy.addEventListener('click', function (e) {
      e.preventDefault();
      resetStudyFormForCreate();
      if (window.LifeNestUI) window.LifeNestUI.openModal('study');
    });

    // Logout
    var lo = qs('#btnLogout');
    if (lo) lo.addEventListener('click', function (e) { e.preventDefault(); logout(); });

    // Reports
    qsa('[data-report]').forEach(function (b) {
      b.addEventListener('click', function (e) {
        e.preventDefault();
        // We show both weekly + monthly inside the modal.
        openReports().catch(function () {});
      });
    });

    qsa('[data-open="reports"]').forEach(function (b) {
      b.addEventListener('click', function (e) {
        e.preventDefault();
        openReports().catch(function () {});
      });
    });

    var repReload = qs('#btnReloadReports');
    if (repReload) {
      repReload.addEventListener('click', function (e) {
        e.preventDefault();
        loadWeeklyReport().catch(function () {});
        loadMonthlyReport(qs('#reportsMonth') ? qs('#reportsMonth').value : monthYM()).catch(function () {});
      });
    }

    // Notes modal from speed-dial
    qsa('[data-open="note"]').forEach(function (b) {
      b.addEventListener('click', function (e) {
        e.preventDefault();
        // If a task is selected already, open notes. Else just open modal with hint.
        if (state.activeTaskForNotes) {
          if (window.LifeNestUI) window.LifeNestUI.openModal('note');
          return;
        }
        setText('noteTaskTitle', 'Open notes from a task ("Add note") button.');
        renderNotes([]);
        if (window.LifeNestUI) window.LifeNestUI.openModal('note');
      });
    });

    // Expenses list modal (managed here; app.js ignores it)
    qsa('[data-open="expenses"]').forEach(function (b) {
      b.addEventListener('click', function (e) {
        e.preventDefault();
        if (window.LifeNestUI) window.LifeNestUI.openModal('expenses');
        var m = state.month || monthYM();
        if (qs('#expensesMonth')) qs('#expensesMonth').value = m;
        loadExpensesList(m).catch(function (err) {
          setText('expensesHint', err && err.message ? err.message : 'Failed to load expenses.');
        });
      });
    });

    var btnReload = qs('#btnReloadExpenses');
    if (btnReload) {
      btnReload.addEventListener('click', function (e) {
        e.preventDefault();
        loadExpensesList(qs('#expensesMonth') ? qs('#expensesMonth').value : (state.month || monthYM())).catch(function (err) {
          setText('expensesHint', err && err.message ? err.message : 'Failed to load expenses.');
        });
      });
    }

    var btnAddFromList = qs('#btnAddExpenseFromList');
    if (btnAddFromList) {
      btnAddFromList.addEventListener('click', function (e) {
        e.preventDefault();
        resetExpenseFormForCreate();
        if (qs('#expDate2')) qs('#expDate2').value = todayYMD();
        if (window.LifeNestUI) window.LifeNestUI.closeModal('modalExpenses');
        if (window.LifeNestUI) window.LifeNestUI.openModal('expense');
      });
    }

    var expList = qs('#expensesList');
    if (expList) {
      expList.addEventListener('click', function (e) {
        var edit = e.target && e.target.closest ? e.target.closest('[data-action="edit-expense"]') : null;
        if (edit) {
          var rowE = edit.closest('.ln-exp-row');
          if (!rowE) return;
          var idE = rowE.getAttribute('data-expense-id');
          if (!idE) return;
          if (window.LifeNestUI) window.LifeNestUI.closeModal('modalExpenses');
          openExpenseEditor(idE).catch(function () {});
          return;
        }

        var del = e.target && e.target.closest ? e.target.closest('[data-action="delete-expense"]') : null;
        if (!del) return;
        var rowD = del.closest('.ln-exp-row');
        if (!rowD) return;
        var idD = rowD.getAttribute('data-expense-id');
        if (!idD) return;
        if (!window.confirm('Delete this expense?')) return;
        deleteExpense(idD).catch(function () {});
      });
    }

    // Commands from app.js (context menu and special items)
    window.addEventListener('lifenest:cmd', function (ev) {
      var cmd = ev && ev.detail ? String(ev.detail.cmd || '') : '';
      if (!cmd) return;

      // open:* commands for reports/expenses
      if (cmd === 'open:reports' || cmd === 'reports:open') {
        openReports().catch(function () {});
        return;
      }
      if (cmd === 'open:expenses' || cmd === 'expenses:open') {
        // click any existing opener to reuse logic
        var btn = qs('[data-open="expenses"]');
        if (btn) { btn.click(); return; }
        if (window.LifeNestUI) window.LifeNestUI.openModal('expenses');
        loadExpensesList(state.month || monthYM()).catch(function () {});
        return;
      }

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
      if (cmd === 'expense:new') {
        resetExpenseFormForCreate();
        if (qs('#expDate2')) qs('#expDate2').value = todayYMD();
        if (window.LifeNestUI) window.LifeNestUI.openModal('expense');
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
      if (cmd === 'focus:open') {
        prepareFocusModal().then(function () {
          if (window.LifeNestUI) window.LifeNestUI.openModal('focus');
        }).catch(function () {
          if (window.LifeNestUI) window.LifeNestUI.openModal('focus');
        });
      }
    });
  }

  async function bootstrap() {
    setTodayLabel();
    setSyncedNow();

    var b = await fetchJSON('/api/bootstrap.php', { credentials: 'same-origin' });
    state.csrf = String(b.csrf_token || '');
    state.user = b.user || null;

    // Disable legacy pending/undo UI (keeps the dashboard clean & consistent with the reference layout)
    state.pendingOps = [];
    try { sessionStorage.removeItem(PENDING_STORAGE_KEY); } catch (_) {}

    // Profile UI
    if (state.user && state.user.email) {
      var email = String(state.user.email);
      setText('profileName', email);
      var a = qs('#profileAvatar');
      if (a) a.textContent = (email[0] || 'U').toUpperCase();
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

    await loadDashboard();
    await loadTasks(state.activeTab);
  }

  document.addEventListener('DOMContentLoaded', function () {
    bootstrap().catch(function () {
      // If not logged in, backend index.php already redirects.
    });
  });
})();
