/* notes.js — Notes page (aggregated task notes) — CSP-safe */
(function () {
  'use strict';

  function qs(sel, root) { return (root || document).querySelector(sel); }
  function qsa(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  var state = {
    csrf: '',
    user: null,
    counts: { all: 0, recent: 0, personal: 0, study: 0 },
    tasks: [],
    notes: [],
    view: 'all',     // all | recent
    kind: '',        // personal | study | ''
    taskId: '',      // task id string or ''
    q: '',
    activeNoteId: null,
    activeTaskId: null,
    lastSyncAt: 0,
    noteColor: 'blue',
    detailsOpen: false,
    modalExpanded: false,
    lastFocusEl: null,
    favoriteNoteIds: {},
    noteAutosaveTimer: null,
    noteAutosaveInFlight: false,
    noteAutosavePending: false,
    activeSavedSnapshot: null
  };

  var COLOR_LABELS = { blue: 'Blue', mint: 'Mint', yellow: 'Yellow', pink: 'Pink', gray: 'Gray' };

  var ALLOWED_COLORS = ['blue','mint','yellow','pink','gray'];

  function normColor(c) {
    c = String(c || '').toLowerCase().trim();
    return (ALLOWED_COLORS.indexOf(c) !== -1) ? c : 'blue';
  }

  function setEditorColor(c) {
    state.noteColor = normColor(c);

    var ed = qs('#noteEditor');
    if (ed) ed.setAttribute('data-color', state.noteColor);

    var current = qs('#noteColorCurrent');
    if (current) current.textContent = (COLOR_LABELS[state.noteColor] || 'Blue') + ' note';

    var pick = qs('#noteColorPicker');
    if (!pick) return;
    qsa('.nt-color-chip', pick).forEach(function (btn) {
      var v = normColor(btn.getAttribute('data-color') || '');
      var on = (v === state.noteColor);
      btn.classList.toggle('is-active', on);
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
  }

  function favoriteStorageKey() {
    var base = (state.user && (state.user.email || state.user.id)) ? String(state.user.email || state.user.id) : 'guest';
    return 'lifenest:notes:favorites:' + base;
  }

  function loadFavorites() {
    try {
      var raw = window.localStorage.getItem(favoriteStorageKey());
      var parsed = raw ? JSON.parse(raw) : {};
      state.favoriteNoteIds = (parsed && typeof parsed === 'object') ? parsed : {};
    } catch (_) {
      state.favoriteNoteIds = {};
    }
  }

  function saveFavorites() {
    try { window.localStorage.setItem(favoriteStorageKey(), JSON.stringify(state.favoriteNoteIds || {})); } catch (_) {}
  }

  function isFavoriteNote(noteId) {
    return !!state.favoriteNoteIds[String(noteId)];
  }

  function autoSizeNoteBody() {
    var ta = qs('#noteBody');
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = Math.max(320, ta.scrollHeight) + 'px';
  }

  function getActiveNote() {
    for (var i = 0; i < state.notes.length; i++) {
      if (state.notes[i].id === state.activeNoteId) return state.notes[i];
    }
    return null;
  }

  function patchActiveNoteColor(nextColor) {
    var note = getActiveNote();
    nextColor = normColor(nextColor);
    if (!note) {
      setEditorColor(nextColor);
      return;
    }
    if (normColor(note.color || 'blue') === nextColor) {
      setEditorColor(nextColor);
      return;
    }

    var previousColor = normColor(note.color || 'blue');
    note.color = nextColor;
    state.noteColor = nextColor;
    setEditorColor(nextColor);
    renderFeed();
    setHint(qs('#noteHint'), 'Saving color…', true);

    api('PATCH', '/api/task_notes.php?id=' + encodeURIComponent(String(note.id)), { color: nextColor }).then(function (j) {
      if (j && j.note && j.note.color) {
        note.color = normColor(j.note.color);
        state.noteColor = note.color;
        setEditorColor(note.color);
      }
      renderFeed();
      setHint(qs('#noteHint'), 'Color updated.', true);
    }).catch(function (e) {
      note.color = previousColor;
      state.noteColor = previousColor;
      setEditorColor(previousColor);
      renderFeed();
      setHint(qs('#noteHint'), e && e.message ? e.message : 'Failed to update color', false);
    });
  }


  function getEditorTitleValue() {
    var titleEl = qs('#noteTitle');
    return titleEl ? String(titleEl.value || '').trim() : '';
  }

  function getEditorBodyValue() {
    var bodyEl = qs('#noteBody');
    return bodyEl ? String(bodyEl.value || '').trim() : '';
  }

  function getEditorTaskId() {
    var taskEl = qs('#detailTaskSelect');
    return taskEl ? String(taskEl.value || '').trim() : '';
  }

  function hasMeaningfulEditorDraft() {
    return !!(getEditorTitleValue() || getEditorBodyValue());
  }

  function syncActiveSavedSnapshot(note, taskIdOverride) {
    var linkedTaskId = taskIdOverride || (note ? String(note.task_id || '') : getEditorTaskId());
    state.activeSavedSnapshot = {
      noteId: note ? String(note.id || '') : '',
      taskId: String(linkedTaskId || ''),
      title: note ? String(note.title || '') : '',
      body: note ? String(note.body || '') : '',
      color: normColor(note ? (note.color || state.noteColor || 'blue') : (state.noteColor || 'blue'))
    };
  }

  function restoreEditorFromSnapshot() {
    var snap = state.activeSavedSnapshot;
    if (!snap) return;
    var titleEl = qs('#noteTitle');
    var bodyEl = qs('#noteBody');
    var taskEl = qs('#detailTaskSelect');
    if (titleEl) titleEl.value = String(snap.title || '');
    if (bodyEl) bodyEl.value = String(snap.body || '');
    if (taskEl) taskEl.value = String(snap.taskId || '');
    setEditorColor(snap.color || 'blue');
    autoSizeNoteBody();
  }

  function cancelNoteAutosave() {
    if (state.noteAutosaveTimer) {
      clearTimeout(state.noteAutosaveTimer);
      state.noteAutosaveTimer = null;
    }
  }

  function renderDetailsPreservingEditorValue() {
    var titleEl = qs('#noteTitle');
    var bodyEl = qs('#noteBody');
    if (!bodyEl) {
      renderDetails();
      return;
    }

    var titleVal = titleEl ? String(titleEl.value || '') : '';
    var bodyVal = String(bodyEl.value || '');
    var focusedEl = document.activeElement;
    var titleHadFocus = !!(titleEl && focusedEl === titleEl);
    var bodyHadFocus = (focusedEl === bodyEl);
    var titleStart = 0;
    var titleEnd = 0;
    var bodyStart = 0;
    var bodyEnd = 0;

    if (titleEl) {
      try {
        titleStart = titleEl.selectionStart;
        titleEnd = titleEl.selectionEnd;
      } catch (_) {}
    }

    try {
      bodyStart = bodyEl.selectionStart;
      bodyEnd = bodyEl.selectionEnd;
    } catch (_) {}

    renderDetails();

    if (titleEl) titleEl.value = titleVal;
    bodyEl.value = bodyVal;
    autoSizeNoteBody();

    if (titleHadFocus && titleEl) {
      try {
        titleEl.focus();
        titleEl.setSelectionRange(titleStart, titleEnd);
      } catch (_) {}
      return;
    }

    if (bodyHadFocus) {
      try {
        bodyEl.focus();
        bodyEl.setSelectionRange(bodyStart, bodyEnd);
      } catch (_) {}
    }
  }

  function saveActiveNoteIfDirty(force) {
    var note = getActiveNote();
    var noteId = note ? Number(note.id) : 0;
    var taskId = getEditorTaskId();
    var title = getEditorTitleValue();
    var body = getEditorBodyValue();
    var color = normColor(state.noteColor || (note && note.color) || 'blue');

    if (!note && !hasMeaningfulEditorDraft()) {
      syncActiveSavedSnapshot(null, taskId);
      return Promise.resolve();
    }

    if (!note && !taskId) {
      if (force) setHint(qs('#noteHint'), 'Choose a linked task first.', false);
      return Promise.resolve();
    }

    var savedTitle = note ? String(note.title || '').trim() : '';
    var savedBody = note ? String(note.body || '').trim() : '';
    var savedColor = note ? normColor(note.color || 'blue') : normColor((state.activeSavedSnapshot && state.activeSavedSnapshot.color) || 'blue');

    if (note && title === savedTitle && body === savedBody && color === savedColor) {
      syncActiveSavedSnapshot(note);
      return Promise.resolve();
    }

    if (state.noteAutosaveInFlight) {
      state.noteAutosavePending = true;
      return Promise.resolve();
    }

    cancelNoteAutosave();
    state.noteAutosaveInFlight = true;

    var request;
    var hint = force ? 'Saving changes…' : 'Saving automatically…';
    setHint(qs('#noteHint'), hint, true);

    if (note) {
      request = api('PATCH', '/api/task_notes.php?id=' + encodeURIComponent(String(noteId)), { title: title, body: body, color: color });
    } else {
      request = api('POST', '/api/task_notes.php', { task_id: Number(taskId), title: title, body: body, color: color });
    }

    return request.then(function (j) {
      var saved = j && j.note ? j.note : null;
      if (!saved || !saved.id) {
        throw new Error('Failed to save note');
      }

      var savedId = Number(saved.id);
      var replaced = false;
      for (var i = 0; i < state.notes.length; i++) {
        if (Number(state.notes[i].id) === savedId) {
          state.notes[i] = saved;
          replaced = true;
          break;
        }
      }
      if (!replaced) {
        state.notes.unshift(saved);
      }

      state.activeNoteId = savedId;
      state.activeTaskId = Number(saved.task_id || taskId || 0) || null;
      state.noteColor = normColor(saved.color || color);
      syncActiveSavedSnapshot(saved);
      renderFeed();
      renderDetailsPreservingEditorValue();
      setHint(qs('#noteHint'), force ? 'Saved.' : 'Saved automatically.', true);
    }).catch(function (e) {
      setHint(qs('#noteHint'), e && e.message ? e.message : 'Failed to save note', false);
      throw e;
    }).finally(function () {
      state.noteAutosaveInFlight = false;
      if (state.noteAutosavePending) {
        state.noteAutosavePending = false;
        scheduleNoteAutosave(120);
      }
    });
  }

  function scheduleNoteAutosave(delay) {
    if (!state.detailsOpen) return;
    cancelNoteAutosave();
    state.noteAutosaveTimer = window.setTimeout(function () {
      state.noteAutosaveTimer = null;
      saveActiveNoteIfDirty(false).catch(function () {});
    }, typeof delay === 'number' ? delay : 260);
  }


  function pad2(n) { return (n < 10 ? '0' : '') + String(n); }
  function ymd(d) { return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); }

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

  function fetchJSON(url, opts) {
    return fetch(url, opts).then(function (r) {
      return r.json().catch(function () { return null; }).then(function (j) {
        if (!r.ok) {
          var m = (j && (j.error || j.message)) ? (j.error || j.message) : ('HTTP ' + r.status);
          var e = new Error(m);
          e.status = r.status;
          e.payload = j;
          throw e;
        }
        return j;
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
      loadFavorites();
      renderUser();
      renderDate();
    });
  }

  function renderDate() {
    var d = new Date();
    var dateEl = qs('#lnDate');
    var dayEl = qs('#lnDay');
    var heroEl = qs('#ntHeroDate');
    try {
      safeText(dateEl, new Intl.DateTimeFormat('en-US', { month: 'short', day: '2-digit', year: 'numeric' }).format(d));
      safeText(dayEl, new Intl.DateTimeFormat('en-US', { weekday: 'long' }).format(d));
      safeText(heroEl, new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }).format(d));
    } catch (_) {
      safeText(dateEl, ymd(d));
      safeText(dayEl, '');
      safeText(heroEl, ymd(d));
    }
  }

  function initials(email) {
    if (!email) return 'U';
    var s = String(email).split('@')[0] || 'U';
    var parts = s.replace(/[^a-zA-Z0-9]+/g, ' ').trim().split(' ').filter(Boolean);
    var a = (parts[0] || 'U').charAt(0).toUpperCase();
    var b = (parts[1] || '').charAt(0).toUpperCase();
    return (a + b) || 'U';
  }

  function renderUser() {
    var nameEl = qs('#profileName');
    var av = qs('#profileAvatar');

    var u = state.user || null;
    var name = '';

    if (u) {
      name = String(u.display_name || u.name || u.full_name || u.email || 'User');
    } else {
      name = 'User';
    }

    if (name.length > 18) name = name.slice(0, 18) + '…';
    safeText(nameEl, name);
    safeText(av, initials(name));
  }


  function syncExpandUi() {
    var panel = qs('#noteDetailsModal .nt-modal__dialog');
    var btn = qs('#btnExpandNote');
    var label = qs('#btnExpandNoteLabel');
    if (panel) panel.classList.toggle('is-expanded', !!state.modalExpanded);
    if (btn) {
      btn.classList.toggle('is-active', !!state.modalExpanded);
      btn.setAttribute('aria-pressed', state.modalExpanded ? 'true' : 'false');
    }
    if (label) safeText(label, state.modalExpanded ? 'Collapse' : 'Expand');
  }

  function syncNoteModal() {
    var modal = qs('#noteDetailsModal');
    if (!modal) return;
    var open = !!state.detailsOpen;
    modal.hidden = !open;
    modal.setAttribute('aria-hidden', open ? 'false' : 'true');
    document.body.classList.toggle('ln-modal-open', open);
    syncExpandUi();
  }

  function openNoteDetails(focusFrom) {
    if (focusFrom) state.lastFocusEl = focusFrom;
    state.modalExpanded = false;
    state.detailsOpen = true;
    syncNoteModal();
    window.requestAnimationFrame(function () {
      var target = qs('#noteTitle') || qs('#noteBody') || qs('#detailTaskSelect') || qs('#btnCloseNoteDetails');
      if (!target) return;
      try {
        target.focus();
        if (target.setSelectionRange && typeof target.value === 'string') {
          var n = target.value.length;
          target.setSelectionRange(n, n);
        }
      } catch (_) {}
    });
  }

  function closeNoteDetails() {
    state.modalExpanded = false;
    state.detailsOpen = false;
    syncNoteModal();
    var back = state.lastFocusEl;
    if (back && document.contains(back)) {
      window.requestAnimationFrame(function () {
        try { back.focus(); } catch (_) {}
      });
    }
  }


  function humanizeNoteTime(s) {
    if (!s) return '—';
    try {
      var d = new Date(String(s).replace(' ', 'T'));
      var now = new Date();
      var diff = Math.max(0, now.getTime() - d.getTime());
      var hour = 60 * 60 * 1000;
      var day = 24 * hour;
      if (diff < hour) {
        var mins = Math.max(1, Math.round(diff / 60000));
        return mins + ' min ago';
      }
      if (diff < day) {
        var hrs = Math.round(diff / hour);
        return hrs + (hrs === 1 ? ' hour ago' : ' hours ago');
      }
      if (diff < day * 2) return 'Yesterday';
      return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(d);
    } catch (_) {
      return String(s);
    }
  }

  function fmtDT(s) {
    if (!s) return '—';
    try {
      var d = new Date(String(s).replace(' ', 'T'));
      return new Intl.DateTimeFormat('en-US', { month: 'short', day: '2-digit', hour: 'numeric', minute: '2-digit' }).format(d);
    } catch (_) {
      return String(s);
    }
  }

  function fmtDateOnly(s) {
    if (!s) return '—';
    return String(s);
  }

  function syncBadges() {
    safeText(qs('#cntAll'), state.counts.all || 0);
    safeText(qs('#cntRecent'), state.counts.recent || 0);
    safeText(qs('#cntPersonal'), state.counts.personal || 0);
    safeText(qs('#cntStudy'), state.counts.study || 0);
  }

  function setActiveViewButtons() {
    qsa('.nt-view').forEach(function (b) {
      b.classList.remove('is-active');
      b.setAttribute('aria-selected', 'false');
    });

    var active = null;
    if (state.kind === 'study') active = qs('.nt-view[data-kind="study"]');
    else if (state.kind === 'personal') active = qs('.nt-view[data-kind="personal"]');
    else if (state.view === 'recent') active = qs('.nt-view[data-view="recent"]');
    else active = qs('.nt-view[data-view="all"]');

    if (active) {
      active.classList.add('is-active');
      active.setAttribute('aria-selected', 'true');
    }
  }

  function syncSearchInputs() {
    var c = qs('#noteGlobalSearch');
    if (c && c.value !== state.q) c.value = state.q;
  }

  function renderTaskSelects() {
    var s1 = qs('#filterTask');
    var s2 = qs('#detailTaskSelect');

    function fill(sel, keepValue) {
      if (!sel) return;
      var cur = keepValue ? String(sel.value || '') : '';
      sel.innerHTML = '';
      var opt0 = document.createElement('option');
      opt0.value = '';
      opt0.textContent = (sel.id === 'filterTask') ? 'All tasks' : 'Linked Task…';
      sel.appendChild(opt0);

      state.tasks.forEach(function (t) {
        var opt = document.createElement('option');
        opt.value = String(t.id);
        var k = t.kind === 'study' ? 'Study' : 'Personal';
        opt.textContent = k + ': ' + (t.title || 'Untitled') + ' (' + (t.note_count || 0) + ')';
        sel.appendChild(opt);
      });

      if (keepValue && cur) sel.value = cur;
    }

    fill(s1, true);
    fill(s2, true);

    if (s1) s1.value = state.taskId || '';
  }

  function renderCategories() {
    var wrap = qs('#catList');
    if (!wrap) return;
    wrap.innerHTML = '';

    // Left column should highlight tasks that already have notes.
    var withNotes = state.tasks.filter(function (t) { return (t && (t.note_count || 0) > 0); });
    var show = withNotes.slice(0, 10);
    show.forEach(function (t) {
      var row = document.createElement('div');
      row.className = 'nt-cat' + (String(t.id) === String(state.taskId || '') ? ' is-active' : '');
      row.setAttribute('role', 'button');
      row.setAttribute('tabindex', '0');

      var left = document.createElement('div');
      left.className = 'nt-cat__left';

      var name = document.createElement('div');
      name.className = 'nt-cat__name';
      name.textContent = (t.kind === 'study' ? 'Study: ' : 'Personal: ') + (t.title || 'Untitled');

      var meta = document.createElement('div');
      meta.className = 'nt-cat__meta';
      meta.textContent = t.last_note_at ? ('Last: ' + fmtDT(t.last_note_at)) : '';

      left.appendChild(name);
      left.appendChild(meta);

      var cnt = document.createElement('div');
      cnt.className = 'nt-cat__count';
      cnt.textContent = String(t.note_count || 0);

      row.appendChild(left);
      row.appendChild(cnt);

      function activate() {
        state.taskId = String(t.id);
        var sel = qs('#filterTask');
        if (sel) sel.value = state.taskId;
        refresh();
      }

      row.addEventListener('click', activate);
      row.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          activate();
        }
      });

      wrap.appendChild(row);
    });
  }

  function pickTitleFromBody(body) {
    var s = String(body || '').trim();
    if (!s) return 'Untitled note';
    var line = s.split(/\r?\n/)[0].trim();
    if (line.length > 70) line = line.slice(0, 70) + '…';
    return line || 'Untitled note';
  }

  function pickDisplayTitle(note) {
    var explicitTitle = note && typeof note.title === 'string' ? String(note.title).trim() : '';
    if (explicitTitle) {
      if (explicitTitle.length > 70) explicitTitle = explicitTitle.slice(0, 70) + '…';
      return explicitTitle;
    }
    return pickTitleFromBody(note && note.body ? note.body : '');
  }

  function pickSnippet(body) {
    var s = String(body || '').trim().replace(/\s+/g, ' ');
    if (s.length > 160) s = s.slice(0, 160) + '…';
    return s;
  }

  function renderFeed() {
    var wrap = qs('#noteFeed');
    var empty = qs('#ntEmpty');
    if (!wrap) return;
    wrap.innerHTML = '';

    if (!state.notes.length) {
      if (empty) empty.hidden = false;
      return;
    }
    if (empty) empty.hidden = true;

    state.notes.forEach(function (n) {
      var item = document.createElement('div');
      var ccls = ' nt-item--' + normColor(n.color || 'blue');
      item.className = 'nt-item' + (state.activeNoteId === n.id ? ' is-active' : '') + ccls;
      item.setAttribute('role', 'button');
      item.setAttribute('tabindex', '0');

      var top = document.createElement('div');
      top.className = 'nt-item__top';

      var tag = document.createElement('div');
      tag.className = 'nt-item__tag';

      var kindPill = document.createElement('span');
      kindPill.className = 'pill pill--mint';
      kindPill.textContent = (n.task && n.task.kind === 'study') ? 'Study' : 'Personal';

      tag.appendChild(kindPill);

      if (isFavoriteNote(n.id)) {
        var fav = document.createElement('span');
        fav.className = 'nt-item__fav';
        fav.textContent = '★ Favorite';
        tag.appendChild(fav);
      }

      var time = document.createElement('div');
      time.className = 'nt-item__time';
      time.textContent = humanizeNoteTime(n.created_at);

      top.appendChild(tag);
      top.appendChild(time);

      var title = document.createElement('div');
      title.className = 'nt-item__title';
      title.textContent = pickDisplayTitle(n);

      var body = document.createElement('div');
      body.className = 'nt-item__body';
      body.textContent = pickSnippet(n.body);

      var link = document.createElement('div');
      link.className = 'nt-item__link';
      var a = document.createElement('a');
      a.href = '/tasks.php?task_id=' + encodeURIComponent(String(n.task_id));
      a.textContent = 'Linked Task: ' + ((n.task && n.task.title) ? n.task.title : 'Task #' + n.task_id);
      a.addEventListener('click', function (e) { e.stopPropagation(); });
      link.appendChild(a);

      item.appendChild(top);
      item.appendChild(title);
      item.appendChild(body);
      item.appendChild(link);

      function activate() {
        saveActiveNoteIfDirty(true).catch(function () {}).then(function () {
          cancelNoteAutosave();
          state.noteAutosavePending = false;
          state.activeNoteId = n.id;
          state.activeTaskId = n.task_id;
          renderFeed();
          renderDetails();
          openNoteDetails(item);
        });
      }

      item.addEventListener('click', activate);
      item.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          activate();
        }
      });

      wrap.appendChild(item);
    });
  }

  function setPill(el, txt, show, clsAdd, clsRemove) {
    if (!el) return;
    if (!show) { el.hidden = true; return; }
    el.hidden = false;
    safeText(el, txt);
    if (clsAdd) el.classList.add(clsAdd);
    if (clsRemove) el.classList.remove(clsRemove);
  }

  function renderDetails() {
    var note = getActiveNote();

    var t = note && note.task ? note.task : null;

    safeText(qs('#dtTaskTitle'), note ? pickDisplayTitle(note) : 'New Note');
    safeText(qs('#dtPreviewLinkedTask'), t ? ('Linked Task: ' + (t.title || ('Task #' + t.id))) : 'Linked Task: —');
    safeText(qs('#dtModalMode'), note ? 'Selected note' : 'Create note');

    var kindEl = qs('#dtTaskKind');
    if (kindEl) {
      kindEl.hidden = !t;
      if (t) safeText(kindEl, t.kind === 'study' ? 'Study' : 'Personal');
    }

    // Priority
    var pr = qs('#dtPriority');
    if (pr) {
      pr.hidden = !t;
      pr.classList.remove('pill--amber', 'pill--red', 'pill--mint');
      if (t) {
        var p = t.priority || 'medium';
        if (p === 'high') pr.classList.add('pill--red');
        else if (p === 'low') pr.classList.add('pill--mint');
        else pr.classList.add('pill--amber');
        safeText(pr, p);
      }
    }

    // Status
    var st = qs('#dtStatus');
    if (st) {
      st.hidden = !t;
      st.classList.remove('pill--amber', 'pill--mint');
      if (t) {
        var s = t.status || 'todo';
        if (s === 'done') st.classList.add('pill--mint');
        else st.classList.add('pill--amber');
        safeText(st, s);
      }
    }

    safeText(qs('#dtDue'), t ? fmtDateOnly(t.due_date) : '—');
    safeText(qs('#dtDur'), t && t.duration_minutes ? (String(t.duration_minutes) + ' min') : '—');
    safeText(qs('#dtTaskCreated'), t ? fmtDT(t.created_at) : '—');
    safeText(qs('#dtTaskUpdated'), t ? fmtDT(t.updated_at || '') : '—');

    // Open Tasks deep-link (select this task if possible)
    var openBtn = qs('#btnOpenTasks');
    if (openBtn) {
      openBtn.setAttribute('href', t ? ('/tasks.php?task_id=' + encodeURIComponent(String(t.id))) : '/tasks.php');
    }

    // Linked task select
    var taskSel = qs('#detailTaskSelect');
    if (taskSel) {
      if (t) taskSel.value = String(t.id);
      else if (state.taskId) taskSel.value = String(state.taskId);
    }

    // Note editor
    var titleEl = qs('#noteTitle');
    if (titleEl) titleEl.value = note ? String(note.title || '') : '';

    var bodyEl = qs('#noteBody');
    if (bodyEl) bodyEl.value = note ? String(note.body || '') : '';

    // Color (defaults to blue for new notes)
    setEditorColor(note ? (note.color || 'blue') : (state.noteColor || 'blue'));

    if (note) syncActiveSavedSnapshot(note);
    else syncActiveSavedSnapshot(null, taskSel ? String(taskSel.value || '') : '');

    safeText(qs('#dtNoteTime'), note ? humanizeNoteTime(note.created_at) : 'Not saved yet');

    var favBadge = qs('#dtFavoriteBadge');
    if (favBadge) favBadge.hidden = !(note && isFavoriteNote(note.id));

    var btnEdit = qs('#btnEditNote');
    var btnDel = qs('#btnDeleteNote');
    var btnFav = qs('#btnFavoriteNote');
    if (btnEdit) btnEdit.disabled = !note;
    if (btnDel) btnDel.disabled = !note;
    if (btnFav) {
      var favOn = !!(note && isFavoriteNote(note.id));
      btnFav.disabled = !note;
      btnFav.classList.toggle('is-active', favOn);
      btnFav.setAttribute('aria-pressed', favOn ? 'true' : 'false');
      var favText = btnFav.querySelector('span:last-child');
      if (favText) favText.textContent = favOn ? 'Favorited' : 'Favorite';
    }

    autoSizeNoteBody();
  }

  function syncClearButton() {
    var c = qs('#btnClearFilters');
    if (!c) return;
    var any = !!(state.view !== 'all' || state.kind || state.taskId || state.q);
    c.hidden = !any;
  }

  function renderFeedHeading() {
    var title = qs('#feedTitle');
    var sort = qs('#feedSortHint');
    if (title) {
      var suffix = 'All Notes';
      if (state.kind === 'study') suffix = 'Study';
      else if (state.kind === 'personal') suffix = 'Personal';
      else if (state.view === 'recent') suffix = 'Recent';
      title.textContent = 'Note Feed - ' + suffix;
    }
    if (sort) sort.textContent = 'Sorted newest-first';
  }

  function buildQuery() {
    var parts = [];
    parts.push('view=' + encodeURIComponent(state.view || 'all'));
    if (state.kind) parts.push('kind=' + encodeURIComponent(state.kind));
    if (state.taskId) parts.push('task_id=' + encodeURIComponent(state.taskId));
    if (state.q) parts.push('q=' + encodeURIComponent(state.q));
    parts.push('limit=120');
    return parts.join('&');
  }

  function refresh() {
    setHint(qs('#noteHint'), '', true);
    setHint(qs('#leftHint'), '', true);

    syncSearchInputs();
    setActiveViewButtons();
    syncClearButton();

    return api('GET', '/api/notes.php?' + buildQuery()).then(function (j) {
      state.counts = j && j.counts ? j.counts : state.counts;
      state.tasks = j && j.tasks ? j.tasks : [];
      state.notes = j && j.notes ? j.notes : [];

      syncBadges();
      renderTaskSelects();
      renderCategories();
      renderFeedHeading();

      // If current active note isn't in list anymore, clear.
      var found = false;
      for (var i = 0; i < state.notes.length; i++) {
        if (Number(state.notes[i].id) === Number(state.activeNoteId)) { found = true; break; }
      }
      if (!found) {
        state.activeNoteId = null;
        state.activeTaskId = null;
      }
      renderFeed();
      renderDetails();
      syncNoteModal();

      state.lastSyncAt = Date.now();
      var ls = qs('#lastSynced');
      if (ls) safeText(ls, 'just now');

    }).catch(function (e) {
      setHint(qs('#leftHint'), e && e.message ? e.message : 'Failed to load notes', false);
      state.notes = [];
      renderFeed();
      renderDetails();
      syncNoteModal();
    });
  }

  function startAddMode(taskId, triggerEl) {
    return saveActiveNoteIfDirty(true).catch(function () {}).then(function () {
      cancelNoteAutosave();
      state.noteAutosavePending = false;
      state.activeNoteId = null;
      state.activeTaskId = null;
      renderFeed();
      renderDetails();
      openNoteDetails(triggerEl || document.activeElement);

      var sel = qs('#detailTaskSelect');
      if (sel) {
        sel.value = taskId ? String(taskId) : (state.taskId || '');
      }
      var titleInput = qs('#noteTitle');
      if (titleInput) {
        titleInput.value = '';
        try { titleInput.focus(); } catch (_) {}
      }
      var ta = qs('#noteBody');
      if (ta) ta.value = '';
      setEditorColor('blue');
      syncActiveSavedSnapshot(null, sel ? String(sel.value || '') : (taskId || ''));
      setHint(qs('#noteHint'), 'Write a title or note body. It will save automatically.', true);
    });
  }

  function bindEvents() {
    // Views
    qsa('.nt-view').forEach(function (b) {
      b.addEventListener('click', function () {
        var v = b.getAttribute('data-view');
        var k = b.getAttribute('data-kind');

        state.view = 'all';
        state.kind = '';

        if (v === 'recent') state.view = 'recent';
        if (k === 'study' || k === 'personal') state.kind = k;

        refresh();
      });
    });

    // Task filter select
    var taskSel = qs('#filterTask');
    if (taskSel) {
      taskSel.addEventListener('change', function () {
        state.taskId = String(taskSel.value || '');
        refresh();
      });
    }

    // Search inputs (debounced)
    var timer = null;
    function onSearch(v) {
      state.q = String(v || '').trim();
      syncSearchInputs();
      if (timer) clearTimeout(timer);
      timer = setTimeout(function () { refresh(); }, 220);
    }

    ['#noteGlobalSearch'].forEach(function (id) {
      var el = qs(id);
      if (!el) return;
      el.addEventListener('input', function () { onSearch(el.value); });
    });

    var clear = qs('#btnClearFilters');
    if (clear) {
      clear.addEventListener('click', function () {
        state.view = 'all';
        state.kind = '';
        state.taskId = '';
        state.q = '';
        state.activeNoteId = null;
        state.activeTaskId = null;
        var sel = qs('#filterTask');
        if (sel) sel.value = '';
        refresh();
      });
    }

    var btnClearNote = qs('#btnClearNote');
    if (btnClearNote) btnClearNote.addEventListener('click', function () {
      var id = state.taskId || (state.activeTaskId ? String(state.activeTaskId) : '');
      startAddMode(id, btnClearNote);
    });

    var btnCloseNoteDetails = qs('#btnCloseNoteDetails');
    if (btnCloseNoteDetails) btnCloseNoteDetails.addEventListener('click', function () {
      saveActiveNoteIfDirty(true).catch(function () {}).then(function () {
        closeNoteDetails();
      });
    });

    var noteDetailsModal = qs('#noteDetailsModal');
    if (noteDetailsModal) {
      noteDetailsModal.addEventListener('click', function (e) {
        var closeTarget = e.target && e.target.closest ? e.target.closest('[data-close="note-details"]') : null;
        if (!closeTarget) return;
        saveActiveNoteIfDirty(true).catch(function () {}).then(function () {
          closeNoteDetails();
        });
      });
    }

    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape' || !state.detailsOpen) return;
      saveActiveNoteIfDirty(true).catch(function () {}).then(function () {
        closeNoteDetails();
      });
    });

    var btnFavoriteNote = qs('#btnFavoriteNote');
    if (btnFavoriteNote) btnFavoriteNote.addEventListener('click', function () {
      if (!state.activeNoteId) {
        setHint(qs('#noteHint'), 'Select an existing note first.', false);
        return;
      }
      var key = String(state.activeNoteId);
      state.favoriteNoteIds[key] = !state.favoriteNoteIds[key];
      if (!state.favoriteNoteIds[key]) delete state.favoriteNoteIds[key];
      saveFavorites();
      renderFeed();
      renderDetails();
      setHint(qs('#noteHint'), state.favoriteNoteIds[key] ? 'Marked as favorite.' : 'Removed from favorites.', true);
    });


    // Add buttons
    var addFromFeed = qs('#btnAddFromFeed');
    if (addFromFeed) addFromFeed.addEventListener('click', function () {
      var id = state.taskId || (state.activeTaskId ? String(state.activeTaskId) : '');
      startAddMode(id, addFromFeed);
    });

    var addNav = qs('[data-action="add-note"]');
    if (addNav) addNav.addEventListener('click', function (e) {
      e.preventDefault();
      var id = state.taskId || (state.activeTaskId ? String(state.activeTaskId) : '');
      startAddMode(id, addNav);
    });

    // Start a fresh note draft
    var btnAdd = qs('#btnAddNote');
    if (btnAdd) btnAdd.addEventListener('click', function () {
      var id = getEditorTaskId() || state.taskId || (state.activeTaskId ? String(state.activeTaskId) : '');
      startAddMode(id, btnAdd);
    });

    // Note color picker
    var cp = qs('#noteColorPicker');
    if (cp) {
      cp.addEventListener('click', function (e) {
        var btn = e.target && e.target.closest ? e.target.closest('.nt-color-chip') : null;
        if (!btn) return;
        var nextColor = btn.getAttribute('data-color') || 'blue';
        if (state.activeNoteId) {
          patchActiveNoteColor(nextColor);
          return;
        }
        setEditorColor(nextColor);
      });
    }

    var noteTitle = qs('#noteTitle');
    if (noteTitle) {
      noteTitle.addEventListener('input', function () {
        scheduleNoteAutosave();
      });
      noteTitle.addEventListener('blur', function () {
        saveActiveNoteIfDirty(true).catch(function () {});
      });
    }

    var noteBody = qs('#noteBody');
    if (noteBody) {
      noteBody.addEventListener('input', function () {
        autoSizeNoteBody();
        scheduleNoteAutosave();
      });
      noteBody.addEventListener('blur', function () {
        saveActiveNoteIfDirty(true).catch(function () {});
      });
    }

    // Undo current unsaved changes
    var btnEdit = qs('#btnEditNote');
    if (btnEdit) btnEdit.addEventListener('click', function () {
      restoreEditorFromSnapshot();
      setHint(qs('#noteHint'), 'Changes reverted.', true);
    });

    // Delete note
    var btnDel = qs('#btnDeleteNote');
    if (btnDel) btnDel.addEventListener('click', function () {
      if (!state.activeNoteId) return;
      if (!window.confirm('Delete this note?')) return;

      var deletedId = String(state.activeNoteId);
      api('DELETE', '/api/task_notes.php?id=' + encodeURIComponent(String(state.activeNoteId)), {}).then(function () {
        if (state.favoriteNoteIds[deletedId]) {
          delete state.favoriteNoteIds[deletedId];
          saveFavorites();
        }
        state.activeNoteId = null;
        state.activeTaskId = null;
        closeNoteDetails();
        return refresh();
      }).catch(function (e) {
        setHint(qs('#noteHint'), e && e.message ? e.message : 'Failed to delete note', false);
      });
    });

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
    var drawerLogout = qs('#drawerLogout');
    if (drawerLogout) {
      drawerLogout.addEventListener('click', function () {
        api('POST', '/api/auth/logout.php', {}).then(function () {
          window.location.href = '/login.php';
        }).catch(function () {
          window.location.href = '/login.php';
        });
      });
    }
  }


  function flushNoteAutosave() {
    if (!state.detailsOpen) return;
    cancelNoteAutosave();
    saveActiveNoteIfDirty(true).catch(function () {});
  }

  function init() {
    bindEvents();
    window.addEventListener('pagehide', flushNoteAutosave);
    window.addEventListener('beforeunload', flushNoteAutosave);
    loadBootstrap().then(function () {
      return refresh();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
