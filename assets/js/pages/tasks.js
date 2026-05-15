/* tasks.js — Tasks page (list + details + notes) — CSP-safe */
(function () {
  'use strict';

  function qs(sel, root) { return (root || document).querySelector(sel); }
  function qsa(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  var state = {
    csrf: '',
    user: null,
    tasks: [],
    notes: [],
    view: 'today',
    kindFilter: '', // 'personal' | 'study' | ''
    tagFilter: '',  // extracted [TAG]
    search: '',
    activeTaskId: null,
    activeNoteId: null,
    lastSyncAt: 0,
    preferredCurrency: 'TRY'
  };

  function pad2(n) { return (n < 10 ? '0' : '') + String(n); }
  function ymd(d) { return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); }
  function todayYmd() { return ymd(new Date()); }

  // Deep-link support: /tasks.php?task_id=123
  var urlSelectionApplied = false;

  function getUrlTaskId() {
    try {
      var sp = new URLSearchParams((window.location && window.location.search) ? window.location.search : '');
      var v = sp.get('task_id') || sp.get('task') || sp.get('id');
      if (!v) return null;
      var n = parseInt(String(v), 10);
      return isFinite(n) && n > 0 ? n : null;
    } catch (_) {
      return null;
    }
  }

  function applyUrlSelection() {
    if (urlSelectionApplied) return;
    urlSelectionApplied = true;

    var id = getUrlTaskId();
    if (!id) return;

    var t = findTask(id);
    if (!t) return;

    // Clear filters so the task can be visible.
    state.kindFilter = '';
    state.tagFilter = '';
    state.search = '';

    // Switch to a view that will include this task.
    var due = t && t.due_date ? String(t.due_date) : '';
    var st = t && t.status ? String(t.status) : 'todo';
    var ty = todayYmd();

    if (st === 'done') state.view = 'completed';
    else if (due && due === ty) state.view = 'today';
    else if (due && due < ty) state.view = 'overdue';
    else state.view = 'upcoming';

    renderAll();
    selectTask(t.id);

    // Try to scroll selected row into view (desktop/mobile).
    setTimeout(function () {
      var row = qs('.tk-item[data-task-id="' + String(t.id) + '"]');
      if (row && row.scrollIntoView) {
        try { row.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch (_) { row.scrollIntoView(); }
      }
    }, 60);
  }

  function safeText(el, txt) {
    if (!el) return;
    el.textContent = (txt === null || typeof txt === 'undefined') ? '' : String(txt);
  }

  function setHint(el, msg, ok) {
    if (!el) return;
    safeText(el, msg || '');
    el.classList.toggle('is-ok', !!ok);
    el.classList.toggle('is-bad', !!msg && !ok);
  }

  function setLoading(on) {
    var el = qs('#tkLoading');
    if (!el) return;
    if (on) el.removeAttribute('hidden');
    else el.setAttribute('hidden', 'hidden');
  }

  function setError(msg) {
    var wrap = qs('#tkError');
    var m = qs('#tkErrorMsg');
    var has = !!(msg && String(msg).trim());
    if (m) safeText(m, has ? msg : '');
    if (wrap) wrap.hidden = !has;
  }

  function modalEl() { return qs('#tkDetailModal'); }

  function openTaskModal() {
    var modal = modalEl();
    if (!modal) return;
    modal.hidden = false;
    modal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('tk-modal-open');
  }

  function closeTaskModal() {
    var modal = modalEl();
    if (!modal) return;
    modal.setAttribute('aria-hidden', 'true');
    modal.hidden = true;
    document.body.classList.remove('tk-modal-open');
  }

  function focusQuickAdd() {
    var t = qs('#tkNewTitle');
    if (!t) return;
    try { t.focus(); } catch (_) {}
  }

  function setSyncedNow() {
    state.lastSyncAt = Date.now();
    var el = qs('#lastSynced');
    if (!el) return;
    try {
      var d = new Date();
      safeText(el, new Intl.DateTimeFormat('en-US', { hour: '2-digit', minute: '2-digit' }).format(d));
    } catch (_) {
      safeText(el, 'now');
    }
  }

  function parseYmd(s) {
    if (!s) return null;
    var m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return null;
    return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  }

  function fmtDate(ymdStr) {
    var d = parseYmd(ymdStr);
    if (!d) return '—';
    try { return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(d); }
    catch (_) { return String(ymdStr); }
  }

  function parseMoneyToCents(str) {
    var s = String(str || '').replace(/[^0-9.,]/g, '').replace(',', '.');
    if (!s) return null;
    var f = parseFloat(s);
    if (!isFinite(f) || f <= 0) return null;
    return Math.round(f * 100);
  }

  function fmtMoneyForInput(cents) {
    var n = parseInt(String(cents || '0'), 10);
    if (!isFinite(n) || n <= 0) return '';
    if (n % 100 === 0) return String(Math.floor(n / 100));
    return (n / 100).toFixed(2);
  }

  function moneySymbol(cur) {
    return '₺';
  }

  function fmtMoneyFromCents(cents, cur) {
    var n = parseInt(String(cents || '0'), 10);
    if (!isFinite(n) || n <= 0) return moneySymbol(cur || 'TRY') + '0';
    var val = (n % 100 === 0) ? String(Math.floor(n / 100)) : (n / 100).toFixed(2);
    return moneySymbol(cur || 'TRY') + val;
  }

  function extractTag(title) {
    var t = String(title || '').trim();
    var m = t.match(/^\[([^\]]{1,40})\]\s*/);
    return m ? String(m[1]).trim() : '';
  }

  function stripTag(title) {
    var t = String(title || '').trim();
    return t.replace(/^\[[^\]]{1,40}\]\s*/, '');
  }

  // ---- API (aligned with dashboard.js hardening)
  function fetchJSON(url, opts) {
    return fetch(url, opts).then(function (res) {
      var ct = (res.headers.get('content-type') || '');
      var isJson = ct.indexOf('application/json') !== -1;
      return (isJson ? res.json() : Promise.resolve({ ok: false, error: 'Non-JSON response' }))
        .then(function (data) {
          if (res.status === 401) {
            try { window.location.href = '/login.php'; } catch (_) {}
          }
          if (res.status === 403 && data && typeof data.error === 'string' && data.error.toLowerCase().indexOf('csrf') !== -1) {
            throw new Error('Security check failed. Please reload the page.');
          }
          if (!res.ok || !data || data.ok === false) {
            var msg = (data && (data.error || data.message)) ? (data.error || data.message) : ('Request failed: ' + res.status);
            throw new Error(msg);
          }
          return data;
        });
    });
  }

  function api(method, url, body) {
    var headers = {};
    if (method !== 'GET') {
      headers['Content-Type'] = 'application/json';
      if (state.csrf) headers['X-CSRF-Token'] = state.csrf;
    }
    return fetchJSON(url, {
      method: method,
      credentials: 'same-origin',
      headers: headers,
      body: (method === 'GET' ? undefined : JSON.stringify(body || {}))
    });
  }

  function loadBootstrap() {
    return fetchJSON('/api/bootstrap.php', { credentials: 'same-origin' }).then(function (j) {
      state.csrf = j && j.csrf_token ? String(j.csrf_token) : '';
      state.user = j && j.user ? j.user : null;
      state.preferredCurrency = String((j && j.preferred_budget_currency) || 'TRY');
      renderUser();
      renderDate();
    });
  }

  function renderUser() {
    var nameEl = qs('#profileName');
    var avEl = qs('#profileAvatar');

    var u = state.user || null;
    var display = u ? String(u.display_name || u.full_name || u.email || 'User') : 'User';
    var email = (u && u.email) ? String(u.email) : '';
    var label = display;
    if (label.length > 18) label = label.slice(0, 18) + '…';
    safeText(nameEl, label);

    if (nameEl && display) {
      try { nameEl.setAttribute('title', display + (email ? ' — ' + email : '')); } catch (_) {}
    }

    if (avEl) {
      avEl.textContent = '';
      avEl.classList.remove('avatar--image');
      var avatarUrl = u && u.avatar_url ? String(u.avatar_url) : '';
      if (avatarUrl) {
        var img = document.createElement('img');
        img.className = 'avatar__img';
        img.src = avatarUrl;
        img.alt = '';
        avEl.classList.add('avatar--image');
        avEl.appendChild(img);
      } else {
        safeText(avEl, String((u && u.initials) || (label.charAt(0) || 'U')));
      }
    }
  }

  function renderDate() {
    var d = new Date();
    try {
      safeText(qs('#lnDate'), new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(d));
      safeText(qs('#lnDay'), new Intl.DateTimeFormat('en-US', { weekday: 'long' }).format(d));
    } catch (_) {
      safeText(qs('#lnDate'), ymd(d));
      safeText(qs('#lnDay'), '');
    }
  }

  function loadTasks() {
    setLoading(true);
    setError('');
    return api('GET', '/api/tasks.php?tab=all&limit=200').then(function (j) {
      state.tasks = (j && j.tasks) ? j.tasks : [];
      setSyncedNow();
      setLoading(false);

      // Friendly default: if Today is empty but there are other tasks, switch automatically.
      var c = counts();
      if (state.view === 'today' && c.today === 0) {
        var next = (c.overdue > 0) ? 'overdue' : ((c.upcoming > 0) ? 'upcoming' : ((c.done > 0) ? 'completed' : 'today'));
        if (next !== 'today') {
          state.view = next;
          var hint = qs('#tkQuickHint');
          setHint(hint, 'No tasks due today — showing ' + (next === 'completed' ? 'Completed' : (next.charAt(0).toUpperCase() + next.slice(1))) + '.', true);
          setTimeout(function () { setHint(hint, '', true); }, 1800);
        }
      }

      renderAll();

      // Keep selection if still exists.
      if (state.activeTaskId) {
        var t = findTask(state.activeTaskId);
        if (t && taskMatchesFilters(t)) {
          selectTask(t.id);
        } else {
          clearSelection();
        }
      }
    }).catch(function (e) {
      setLoading(false);
      setError(e && e.message ? e.message : 'Failed to load tasks.');
      // Keep UI usable even on failure.
      renderViewsActive();
      renderCounts();
      renderList();
      throw e;
    });
  }

  function autoSelectFirstIfNeeded() {
    // Intentionally disabled: task details now open only on explicit user selection.
  }

  function findTask(id) {
    var n = parseInt(String(id), 10);
    for (var i = 0; i < state.tasks.length; i++) {
      if (parseInt(String(state.tasks[i].id), 10) === n) return state.tasks[i];
    }
    return null;
  }

  function taskMatchesView(t) {
    var view = state.view;
    var due = t && t.due_date ? String(t.due_date) : '';
    var st = t && t.status ? String(t.status) : 'todo';
    var ty = todayYmd();

    if (view === 'completed') return st === 'done';

    // Actionable views => todo only
    if (st !== 'todo') return false;

    if (view === 'today') {
      return !!due && due === ty;
    }
    if (view === 'overdue') {
      return !!due && due < ty;
    }
    if (view === 'upcoming') {
      // Upcoming includes future-due and no-due tasks.
      return (!due) || (due > ty);
    }
    return true;
  }

  function taskMatchesFilters(t) {
    if (!t) return false;

    if (!taskMatchesView(t)) return false;

    if (state.kindFilter) {
      if (String(t.kind || '') !== state.kindFilter) return false;
    }

    if (state.tagFilter) {
      var tag = extractTag(t.title || '');
      if (tag !== state.tagFilter) return false;
    }

    if (state.search) {
      var s = state.search;
      var title = String(t.title || '');
      var hay = title.toLowerCase();
      if (hay.indexOf(s) === -1) return false;
    }

    return true;
  }

  function filteredTasks() {
    return state.tasks.filter(taskMatchesFilters);
  }

  function counts() {
    var ty = todayYmd();
    var c = { today: 0, upcoming: 0, overdue: 0, done: 0, personal: 0, study: 0, tags: {} };

    for (var i = 0; i < state.tasks.length; i++) {
      var t = state.tasks[i];
      var due = t && t.due_date ? String(t.due_date) : '';
      var st = t && t.status ? String(t.status) : 'todo';
      var kind = t && t.kind ? String(t.kind) : '';

      if (kind === 'personal') c.personal++;
      if (kind === 'study') c.study++;

      var tag = extractTag(t.title || '');
      if (tag) c.tags[tag] = (c.tags[tag] || 0) + 1;

      if (st === 'done') { c.done++; continue; }

      if (due && due === ty) c.today++;
      else if (due && due < ty) c.overdue++;
      else c.upcoming++; // future-due OR no-due
    }

    return c;
  }

  function renderCounts() {
    var c = counts();
    safeText(qs('#cntToday'), String(c.today));
    safeText(qs('#cntUpcoming'), String(c.upcoming));
    safeText(qs('#cntOverdue'), String(c.overdue));
    safeText(qs('#cntDone'), String(c.done));

    var tagsWrap = qs('#tkTags');
    if (!tagsWrap) return;

    tagsWrap.innerHTML = '';

    // Primary categories
    tagsWrap.appendChild(makeTagTile('Personal', 'personal', c.personal, 'kind'));
    tagsWrap.appendChild(makeTagTile('Study', 'study', c.study, 'kind'));

    // Extracted tags
    var keys = Object.keys(c.tags || {});
    keys.sort(function (a, b) { return (c.tags[b] || 0) - (c.tags[a] || 0); });
    keys.slice(0, 6).forEach(function (k) {
      tagsWrap.appendChild(makeTagTile(k, k, c.tags[k], 'tag'));
    });
  }

  function makeTagTile(label, value, cnt, type) {
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'tk-tag';

    var active = (type === 'kind') ? (state.kindFilter === value) : (state.tagFilter === value);
    if (active) btn.classList.add('is-active');

    btn.setAttribute('data-filter-type', type);
    btn.setAttribute('data-filter-value', value);

    var n = document.createElement('div');
    n.className = 'tk-tag__name';
    n.textContent = String(label);

    var c = document.createElement('div');
    c.className = 'tk-tag__cnt';
    c.textContent = String(cnt || 0);

    btn.appendChild(n);
    btn.appendChild(c);
    return btn;
  }

  function renderViewsActive() {
    qsa('.tk-view').forEach(function (b) {
      var v = b.getAttribute('data-view');
      var on = v === state.view;
      b.classList.toggle('is-active', on);
      b.setAttribute('aria-selected', on ? 'true' : 'false');
    });
  }

  function renderList() {
    var body = qs('#tkBody');
    var empty = qs('#tkEmpty');
    var meta = qs('#tkListMeta');
    if (!body) return;

    var rows = filteredTasks();

    safeText(meta, rows.length + ' item' + (rows.length === 1 ? '' : 's'));

    body.innerHTML = '';
    if (!rows.length) {
      if (empty) empty.hidden = false;
      return;
    }
    if (empty) empty.hidden = true;

    rows.forEach(function (t) {
      body.appendChild(renderRow(t));
    });
  }

  function kindPill(kind) {
    var p = document.createElement('span');
    p.className = 'pill pill--sm';
    if (kind === 'study') {
      p.className += ' pill--mint';
      p.textContent = 'Study';
    } else {
      p.textContent = 'Personal';
    }
    return p;
  }

  function renderRow(t) {
    var row = document.createElement('div');
    row.className = 'tk-row tk-item';
    row.setAttribute('role', 'row');
    row.setAttribute('data-task-id', String(t.id));

    if (state.activeTaskId && parseInt(String(state.activeTaskId), 10) === parseInt(String(t.id), 10)) {
      row.classList.add('is-active');
    }

    // Check
    var c1 = document.createElement('div');
    c1.className = 'tk-cell tk-cell--check';
    var chk = document.createElement('input');
    chk.type = 'checkbox';
    chk.className = 'tk-chk';
    chk.checked = (String(t.status) === 'done');
    chk.setAttribute('aria-label', 'Mark completed');
    chk.addEventListener('click', function (e) {
      e.stopPropagation();
      var next = chk.checked ? 'done' : 'todo';
      updateTask(t.id, { status: next }).catch(function () {
        chk.checked = !chk.checked;
      });
    });
    c1.appendChild(chk);

    // Title
    var c2 = document.createElement('div');
    c2.className = 'tk-cell tk-cell--title';
    var tag = extractTag(t.title || '');
    c2.textContent = tag ? (tag + ': ' + stripTag(t.title)) : String(t.title || '');

    // Due
    var c3 = document.createElement('div');
    c3.className = 'tk-cell tk-cell--due';
    c3.textContent = fmtDate(t.due_date);

    // Kind
    var c4 = document.createElement('div');
    c4.className = 'tk-cell tk-cell--kind';
    c4.appendChild(kindPill(String(t.kind || 'personal')));

    // Actions
    var c5 = document.createElement('div');
    c5.className = 'tk-cell tk-cell--actions';

    var actions = document.createElement('div');
    actions.className = 'tk-actions-mini';

    var btnEdit = document.createElement('button');
    btnEdit.type = 'button';
    btnEdit.className = 'tk-icon-btn';
    btnEdit.setAttribute('aria-label', 'Edit');
    btnEdit.innerHTML = "<svg class=\"icon icon--xs\" viewBox=\"0 0 24 24\" aria-hidden=\"true\"><path d=\"M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5Z\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linejoin=\"round\"/></svg>";
    btnEdit.addEventListener('click', function (e) {
      e.stopPropagation();
      selectTask(t.id);
      openEdit();
    });

    var btnDel = document.createElement('button');
    btnDel.type = 'button';
    btnDel.className = 'tk-icon-btn';
    btnDel.setAttribute('aria-label', 'Delete');
    btnDel.innerHTML = "<svg class=\"icon icon--xs\" viewBox=\"0 0 24 24\" aria-hidden=\"true\"><path d=\"M4 7h16\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\"/><path d=\"M10 11v7M14 11v7\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\"/><path d=\"M6 7l1-3h10l1 3\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/></svg>";
    btnDel.addEventListener('click', function (e) {
      e.stopPropagation();
      if (!confirm('Delete this task?')) return;
      deleteTask(t.id);
    });

    actions.appendChild(btnEdit);
    actions.appendChild(btnDel);
    c5.appendChild(actions);

    row.appendChild(c1);
    row.appendChild(c2);
    row.appendChild(c3);
    row.appendChild(c4);
    row.appendChild(c5);

    row.addEventListener('click', function () { selectTask(t.id); });

    return row;
  }

  function renderAll() {
    renderViewsActive();
    renderCounts();
    renderList();
  }

  function clearSelection() {
    state.activeTaskId = null;
    state.activeNoteId = null;
    state.notes = [];

    var d = qs('#tkDetail');
    var e = qs('#tkDetailEmpty');
    var list = qs('#notesList');
    var tb = qs('#noteBody');
    var btnEditNote = qs('#btnEditNote');
    if (d) d.hidden = true;
    if (e) e.hidden = true;
    if (list) list.innerHTML = '';
    if (tb) tb.value = '';
    if (btnEditNote) btnEditNote.disabled = true;

    closeEdit();
    closeTaskModal();
    renderList();
  }

  function openEdit() {
    var wrap = qs('#tkEdit');
    if (!wrap) return;
    wrap.hidden = false;
  }

  function closeEdit() {
    var wrap = qs('#tkEdit');
    if (!wrap) return;
    wrap.hidden = true;
    setHint(qs('#tkEditHint'), '', true);
  }

  function renderDetail(task) {
    var detail = qs('#tkDetail');
    var empty = qs('#tkDetailEmpty');
    if (!detail || !empty) return;

    if (!task) {
      detail.hidden = true;
      empty.hidden = true;
      closeTaskModal();
      return;
    }

    empty.hidden = true;
    detail.hidden = false;
    openTaskModal();

    var tag = extractTag(task.title || '');
    safeText(qs('#dtTitle'), 'Task Details: ' + (tag ? (tag + ': ' + stripTag(task.title)) : String(task.title || '')));
    safeText(qs('#dtSub'), tag ? ('Title Details: ' + stripTag(task.title)) : ('Title Details: ' + String(task.title || '')));

    safeText(qs('#dtDue'), fmtDate(task.due_date));
    var pri = String(task.priority || 'medium');
    var priLabel = (pri === 'high') ? 'High' : (pri === 'low' ? 'Low' : 'Medium');
    safeText(qs('#dtPri'), priLabel);
    safeText(qs('#dtKind'), (task.kind || 'personal') === 'study' ? ('Study' + (tag ? (': ' + tag) : '')) : 'Personal');

    var dm = task.duration_minutes;
    safeText(qs('#dtDur'), dm ? (Math.round(Number(dm) / 6) / 10 + 'h') : '—');
    safeText(qs('#dtCost'), task.expected_cost_cents ? fmtMoneyFromCents(task.expected_cost_cents, task.expected_cost_currency || 'TRY') : '—');
    safeText(qs('#dtStatus'), (task.status || 'todo') === 'done' ? 'Completed' : 'To Do');

    var statusSel = qs('#dtStatusSel');
    if (statusSel) statusSel.value = String(task.status || 'todo');

    // Populate edit fields
    var edTitle = qs('#edTitle');
    var edDue = qs('#edDue');
    var edPri = qs('#edPri');
    var edKind = qs('#edKind');
    var edDur = qs('#edDur');
    var edCost = qs('#edCost');
    var edCostCurrency = qs('#edCostCurrency');
    if (edTitle) edTitle.value = String(task.title || '');
    if (edDue) edDue.value = task.due_date ? String(task.due_date) : '';
    if (edPri) edPri.value = String(task.priority || 'medium');
    if (edKind) edKind.value = String(task.kind || 'personal');
    if (edDur) edDur.value = task.duration_minutes ? String(task.duration_minutes) : '';
    if (edCost) edCost.value = fmtMoneyForInput(task.expected_cost_cents || 0);
    if (edCostCurrency) edCostCurrency.value = String(task.expected_cost_currency || state.preferredCurrency || 'TRY');

    closeEdit();

    // Notes editor state
    state.activeNoteId = null;
    var btnEditNote = qs('#btnEditNote');
    if (btnEditNote) btnEditNote.disabled = true;
    var tt0 = qs('#noteTitle');
    if (tt0) tt0.value = '';
    var tb0 = qs('#noteBody');
    if (tb0) tb0.value = '';
    setHint(qs('#noteHint'), '', true);

    loadNotes(task.id);
  }

  function selectTask(id) {
    var n = parseInt(String(id), 10);
    state.activeTaskId = n;

    qsa('.tk-item').forEach(function (r) {
      var rid = parseInt(String(r.getAttribute('data-task-id') || '0'), 10);
      r.classList.toggle('is-active', rid === n);
    });

    renderDetail(findTask(n));
  }

  function loadNotes(taskId) {
    state.notes = [];
    var list = qs('#notesList');
    if (list) list.innerHTML = '';

    return api('GET', '/api/task_notes.php?task_id=' + encodeURIComponent(String(taskId)) + '&limit=30').then(function (j) {
      state.notes = j && j.notes ? j.notes : [];
      renderNotes();
    }).catch(function (e) {
      state.notes = [];
      setHint(qs('#noteHint'), (e && e.message) ? e.message : 'Failed to load notes.', false);
      renderNotes();
    });
  }

  function renderNotes() {
    var list = qs('#notesList');
    if (!list) return;

    list.innerHTML = '';

    if (!state.notes.length) {
      var empty = document.createElement('div');
      empty.className = 'tk-note';
      empty.textContent = 'No notes yet.';
      list.appendChild(empty);
      return;
    }

    state.notes.forEach(function (n) {
      list.appendChild(renderNote(n));
    });
  }

  function renderNote(n) {
    var wrap = document.createElement('div');
    wrap.className = 'tk-note';
    wrap.setAttribute('data-note-id', String(n.id));

    var meta = document.createElement('div');
    meta.className = 'tk-note__meta';

    var date = document.createElement('div');
    date.className = 'tk-note__date';
    date.textContent = n.created_at ? String(n.created_at).replace('T', ' ').slice(0, 16) : '';

    var actions = document.createElement('div');
    actions.className = 'tk-note__actions';

    var btnE = document.createElement('button');
    btnE.type = 'button';
    btnE.className = 'tk-icon-btn';
    btnE.setAttribute('aria-label', 'Edit note');
    btnE.innerHTML = "<svg class=\"icon icon--xs\" viewBox=\"0 0 24 24\" aria-hidden=\"true\"><path d=\"M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5Z\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linejoin=\"round\"/></svg>";
    btnE.addEventListener('click', function () {
      state.activeNoteId = parseInt(String(n.id), 10);
      var tt = qs('#noteTitle');
      if (tt) tt.value = String(n.title || '');
      var tb = qs('#noteBody');
      if (tb) tb.value = String(n.body || '');
      var btn = qs('#btnEditNote');
      if (btn) btn.disabled = false;
      setHint(qs('#noteHint'), 'Editing note #' + n.id, true);
    });

    var btnD = document.createElement('button');
    btnD.type = 'button';
    btnD.className = 'tk-icon-btn';
    btnD.setAttribute('aria-label', 'Delete note');
    btnD.innerHTML = "<svg class=\"icon icon--xs\" viewBox=\"0 0 24 24\" aria-hidden=\"true\"><path d=\"M4 7h16\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\"/><path d=\"M10 11v7M14 11v7\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\"/><path d=\"M6 7l1-3h10l1 3\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/></svg>";
    btnD.addEventListener('click', function () {
      if (!confirm('Delete this note?')) return;
      deleteNote(n.id);
    });

    actions.appendChild(btnE);
    actions.appendChild(btnD);

    meta.appendChild(date);
    meta.appendChild(actions);

    var title = document.createElement('div');
    title.className = 'tk-note__title';
    title.textContent = String((n.title || '').trim() || 'Untitled note');

    var body = document.createElement('div');
    body.className = 'tk-note__body';
    body.textContent = String(n.body || '');

    wrap.appendChild(meta);
    wrap.appendChild(title);
    wrap.appendChild(body);

    return wrap;
  }

  // ---- Mutations
  function createTask(payload) {
    return api('POST', '/api/tasks.php', payload).then(function () {
      return loadTasks();
    });
  }

  function updateTask(id, payload) {
    return api('PATCH', '/api/tasks.php?id=' + encodeURIComponent(String(id)), payload).then(function (j) {
      var t = j && j.task ? j.task : null;
      if (t) {
        for (var i = 0; i < state.tasks.length; i++) {
          if (parseInt(String(state.tasks[i].id), 10) === parseInt(String(id), 10)) {
            state.tasks[i] = t;
            break;
          }
        }
      }
      setSyncedNow();
      renderAll();

      if (state.activeTaskId) {
        var cur = findTask(state.activeTaskId);
        if (cur && taskMatchesFilters(cur)) renderDetail(cur);
        else clearSelection();
      }

      return t;
    }).catch(function (e) {
      alert(e && e.message ? e.message : 'Failed');
      throw e;
    });
  }

  function deleteTask(id) {
    return api('DELETE', '/api/tasks.php?id=' + encodeURIComponent(String(id)), {}).then(function () {
      if (state.activeTaskId && parseInt(String(state.activeTaskId), 10) === parseInt(String(id), 10)) {
        clearSelection();
      }
      return loadTasks();
    }).catch(function (e) {
      alert(e && e.message ? e.message : 'Failed');
      throw e;
    });
  }

  function addNote(taskId, title, body) {
    return api('POST', '/api/task_notes.php', { task_id: taskId, title: title, body: body, color: 'mint' }).then(function () {
      return loadNotes(taskId);
    });
  }

  function editNote(noteId, title, body) {
    return api('PATCH', '/api/task_notes.php?id=' + encodeURIComponent(String(noteId)), { title: title, body: body }).then(function () {
      return loadNotes(state.activeTaskId);
    });
  }

  function deleteNote(noteId) {
    return api('DELETE', '/api/task_notes.php?id=' + encodeURIComponent(String(noteId)), {}).then(function () {
      return loadNotes(state.activeTaskId);
    });
  }

  // ---- Events
  function bindEvents() {
    // Retry (re-fetch without full reload)
    var retry = qs('#tkRetry');
    if (retry) {
      retry.addEventListener('click', function () {
        setError('');
        loadTasks().catch(function (e) {
          setError(e && e.message ? e.message : 'Failed to reload.');
        });
      });
    }

    // Views
    qsa('.tk-view').forEach(function (b) {
      b.addEventListener('click', function () {
        var v = b.getAttribute('data-view') || 'today';
        state.view = v;
        clearSelection();
        renderAll();
      });
    });

    // Tag tiles
    var tags = qs('#tkTags');
    if (tags) {
      tags.addEventListener('click', function (e) {
        var btn = e.target && e.target.closest ? e.target.closest('.tk-tag') : null;
        if (!btn) return;
        var typ = btn.getAttribute('data-filter-type');
        var val = btn.getAttribute('data-filter-value') || '';

        if (typ === 'kind') {
          state.kindFilter = (state.kindFilter === val) ? '' : val;
          state.tagFilter = '';
        } else if (typ === 'tag') {
          state.tagFilter = (state.tagFilter === val) ? '' : val;
        }
        clearSelection();
        renderAll();
      });
    }

    // Search
    var s = qs('#taskSearch');
    if (s) {
      s.addEventListener('input', function () {
        state.search = String(s.value || '').trim().toLowerCase();
        renderList();

        // If the selected task is filtered out, pick the first visible item.
        if (state.activeTaskId) {
          var cur = findTask(state.activeTaskId);
          if (!cur || !taskMatchesFilters(cur)) {
            clearSelection();
          }
        }
      });
    }

    // Quick Add: Enter key
    var newTitle = qs('#tkNewTitle');
    if (newTitle) {
      newTitle.addEventListener('keydown', function (e) {
        if (e.key !== 'Enter') return;
        e.preventDefault();
        var b = qs('#tkAddBtn');
        if (b) b.click();
      });
    }

    // Add task
    var addBtn = qs('#tkAddBtn');
    if (addBtn) {
      addBtn.addEventListener('click', function () {
        var titleEl = qs('#tkNewTitle');
        var dueEl = qs('#tkNewDue');
        var kindEl = qs('#tkNewKind');
        var hint = qs('#tkQuickHint');

        var title = titleEl ? String(titleEl.value || '').trim() : '';
        var due = dueEl ? String(dueEl.value || '').trim() : '';
        var kind = kindEl ? String(kindEl.value || 'personal') : 'personal';

        if (!title) {
          setHint(hint, 'Title is required.', false);
          return;
        }

        setHint(hint, 'Saving...', true);

        createTask({ title: title, due_date: (due || null), kind: kind, priority: 'medium', status: 'todo' })
          .then(function () {
            if (titleEl) titleEl.value = '';
            if (dueEl) dueEl.value = '';
            setHint(hint, 'Added.', true);
            setTimeout(function () { setHint(hint, '', true); }, 900);
          })
          .catch(function (e) {
            setHint(hint, e && e.message ? e.message : 'Failed.', false);
          });
      });
    }

    // Detail actions
    var btnEdit = qs('#btnEditTask');
    if (btnEdit) {
      btnEdit.addEventListener('click', function () {
        if (!state.activeTaskId) return;
        openEdit();
      });
    }

    var btnCancel = qs('#btnCancelEdit');
    if (btnCancel) {
      btnCancel.addEventListener('click', function () {
        closeEdit();
      });
    }

    var btnSave = qs('#btnSaveTask');
    if (btnSave) {
      btnSave.addEventListener('click', function () {
        if (!state.activeTaskId) return;

        var hint = qs('#tkEditHint');
        var title = String((qs('#edTitle') || {}).value || '').trim();
        var due = String((qs('#edDue') || {}).value || '').trim();
        var pri = String((qs('#edPri') || {}).value || 'medium');
        var kind = String((qs('#edKind') || {}).value || 'personal');
        var durRaw = String((qs('#edDur') || {}).value || '').trim();
        var costRaw = String((qs('#edCost') || {}).value || '').trim();
        var costCurrency = String((qs('#edCostCurrency') || {}).value || 'TRY');

        if (!title) {
          setHint(hint, 'Title is required.', false);
          return;
        }

        var dur = null;
        if (durRaw) {
          var n = parseInt(durRaw, 10);
          if (!isFinite(n) || n <= 0) {
            setHint(hint, 'Invalid duration.', false);
            return;
          }
          dur = n;
        }

        var expectedCost = null;
        if (costRaw) {
          expectedCost = parseMoneyToCents(costRaw);
          if (expectedCost === null) {
            setHint(hint, 'Invalid expected cost.', false);
            return;
          }
        }

        setHint(hint, 'Saving...', true);

        updateTask(state.activeTaskId, {
          title: title,
          due_date: due ? due : null,
          priority: pri,
          kind: kind,
          duration_minutes: dur,
          expected_cost_cents: expectedCost,
          expected_cost_currency: expectedCost ? costCurrency : null
        }).then(function () {
          setHint(hint, 'Saved.', true);
          closeEdit();
        }).catch(function (e) {
          setHint(hint, e && e.message ? e.message : 'Failed.', false);
        });
      });
    }

    var btnDel = qs('#btnDeleteTask');
    if (btnDel) {
      btnDel.addEventListener('click', function () {
        if (!state.activeTaskId) return;
        if (!confirm('Delete this task?')) return;
        deleteTask(state.activeTaskId);
      });
    }

    var statusSel = qs('#dtStatusSel');
    if (statusSel) {
      statusSel.addEventListener('change', function () {
        if (!state.activeTaskId) return;
        updateTask(state.activeTaskId, { status: String(statusSel.value || 'todo') });
      });
    }

    var btnMarkDone = qs('#btnMarkDone');
    if (btnMarkDone) {
      btnMarkDone.addEventListener('click', function () {
        if (!state.activeTaskId) return;
        var t = findTask(state.activeTaskId);
        var next = (t && String(t.status) === 'done') ? 'todo' : 'done';
        updateTask(state.activeTaskId, { status: next });
      });
    }

    var btnClose = qs('#btnCloseDetails');
    if (btnClose) {
      btnClose.addEventListener('click', function () {
        clearSelection();
      });
    }

    var modal = modalEl();
    if (modal) {
      modal.addEventListener('click', function (e) {
        var shouldClose = e.target && e.target.closest ? e.target.closest('[data-close-task-modal]') : null;
        if (!shouldClose) return;
        clearSelection();
      });
    }

    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape') return;
      var modalNode = modalEl();
      if (!modalNode || modalNode.hidden) return;
      clearSelection();
    });

    // Notes
    var btnAddNote = qs('#btnAddNote');
    if (btnAddNote) {
      btnAddNote.addEventListener('click', function () {
        if (!state.activeTaskId) return;
        var tt = qs('#noteTitle');
        var tb = qs('#noteBody');
        var hint = qs('#noteHint');
        var title = tt ? String(tt.value || '').trim() : '';
        var body = tb ? String(tb.value || '').trim() : '';
        if (!body) {
          setHint(hint, 'Note is empty.', false);
          return;
        }
        setHint(hint, 'Saving...', true);
        addNote(state.activeTaskId, title, body).then(function () {
          if (tt) tt.value = '';
          if (tb) tb.value = '';
          state.activeNoteId = null;
          var b = qs('#btnEditNote');
          if (b) b.disabled = true;
          setHint(hint, 'Added.', true);
        }).catch(function (e) {
          setHint(hint, e && e.message ? e.message : 'Failed.', false);
        });
      });
    }

    var btnEditNote = qs('#btnEditNote');
    if (btnEditNote) {
      btnEditNote.addEventListener('click', function () {
        if (!state.activeTaskId || !state.activeNoteId) return;
        var tb = qs('#noteBody');
        var hint = qs('#noteHint');
        var body = tb ? String(tb.value || '').trim() : '';
        if (!body) {
          setHint(hint, 'Note is empty.', false);
          return;
        }
        setHint(hint, 'Saving...', true);
        editNote(state.activeNoteId, title, body).then(function () {
          if (tt) tt.value = '';
          if (tb) tb.value = '';
          state.activeNoteId = null;
          btnEditNote.disabled = true;
          setHint(hint, 'Updated.', true);
        }).catch(function (e) {
          setHint(hint, e && e.message ? e.message : 'Failed.', false);
        });
      });
    }

    // Logout
    var logout = qs('#btnLogout');
    if (logout) {
      logout.addEventListener('click', function () {
        api('POST', '/api/auth/logout.php', {}).then(function () {
          window.location.href = '/login.php';
        }).catch(function () {
          window.location.href = '/login.php';
        });
      });
    }

  }

  function init() {
    // Bind UI handlers first (so Retry works even if load fails)
    bindEvents();

    // If user landed on #tkQuick, focus input.
    if (window.location && window.location.hash === '#tkQuick') {
      setTimeout(focusQuickAdd, 0);
    }

    // Bottom nav quick add focuses input.
    var qLink = qs('.bottom-nav__item--ghost[href="#tkQuick"]');
    if (qLink) {
      qLink.addEventListener('click', function () {
        setTimeout(focusQuickAdd, 0);
      });
    }

    loadBootstrap()
      .then(loadTasks)
      .then(function () { applyUrlSelection(); })
      .catch(function (e) {
        setLoading(false);
        setError(e && e.message ? e.message : 'Failed to initialize.');
      });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
