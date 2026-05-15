(function () {
  'use strict';

  var LN = (window.LN = window.LN || {});
  LN.tasks = LN.tasks || {};
  LN.modules = LN.modules || {};

  var _bound = false;
  var _currentList = [];
  var _taskMeta = { total: 0, has_more: false };
  var TASK_SORT_STORAGE_KEY = 'ln_dashboard_today_plan_sort_v2';
  var TASK_INCLUDE_DONE_STORAGE_KEY = 'ln_dashboard_today_plan_include_done_v1';
  var TASK_PAGE_SIZE = 5;
  var _taskSortMode = readTaskSortMode();
  var _taskIncludeCompleted = readIncludeCompleted();

  function core() {
    return (LN && LN.core) ? LN.core : null;
  }

  function qs(sel, root) {
    var c = core();
    if (c && c.qs) return c.qs(sel, root);
    return (root || document).querySelector(sel);
  }

  function qsa(sel, root) {
    var c = core();
    if (c && c.qsa) return c.qsa(sel, root);
    return Array.prototype.slice.call((root || document).querySelectorAll(sel));
  }

  function getState() {
    var c = core();
    return c ? c.state : null;
  }

  function setText(id, txt) {
    var c = core();
    if (c && c.setText) return c.setText(id, txt);
    var el = (typeof id === 'string') ? qs('#' + id) : id;
    if (!el) return;
    el.textContent = (txt === null || typeof txt === 'undefined') ? '' : String(txt);
  }

  function readTaskSortMode() {
    try {
      var raw = window.localStorage.getItem(TASK_SORT_STORAGE_KEY) || '';
      raw = String(raw || '').trim();
      if (raw === 'smart' || raw === 'priority' || raw === 'due' || raw === 'newest') return raw;
    } catch (_) {}
    return 'smart';
  }

  function writeTaskSortMode(mode) {
    try {
      window.localStorage.setItem(TASK_SORT_STORAGE_KEY, String(mode || 'smart'));
    } catch (_) {}
  }

  function readIncludeCompleted() {
    try {
      return String(window.localStorage.getItem(TASK_INCLUDE_DONE_STORAGE_KEY) || '0') === '1';
    } catch (_) {}
    return false;
  }

  function writeIncludeCompleted(on) {
    try {
      window.localStorage.setItem(TASK_INCLUDE_DONE_STORAGE_KEY, on ? '1' : '0');
    } catch (_) {}
  }

  function syncTaskControls() {
    var sortEl = qs('#todayPlanSort');
    if (sortEl) sortEl.value = _taskSortMode || 'smart';
    var toggleEl = qs('#todayPlanIncludeCompleted');
    if (toggleEl) toggleEl.checked = !!_taskIncludeCompleted;
  }

  function syncLoadMoreButton() {
    var wrap = qs('#todayPlanMoreWrap');
    var btn = qs('#todayPlanLoadMore');
    var total = parseInt(String(_taskMeta.total || 0), 10);
    if (!isFinite(total)) total = 0;
    var shown = Array.isArray(_currentList) ? _currentList.length : 0;
    var hasMore = !!(_taskMeta && _taskMeta.has_more) && shown < total;
    if (wrap) wrap.hidden = !hasMore;
    if (btn) {
      btn.disabled = !hasMore;
      if (hasMore) {
        btn.textContent = 'Load more (' + Math.max(0, total - shown) + ' left)';
      } else {
        btn.textContent = 'All tasks loaded';
      }
    }
  }

  function updateTodayPlanHeader() {
    var c = core();
    var shown = Array.isArray(_currentList) ? _currentList.length : 0;
    var total = parseInt(String(_taskMeta.total || 0), 10);
    if (!isFinite(total)) total = shown;
    var done = 0;
    for (var i = 0; i < _currentList.length; i++) {
      if (_currentList[i] && _currentList[i].status === 'done') done += 1;
    }

    if (_taskIncludeCompleted) {
      setText('todayPlanTaskProgressText', done + ' of ' + shown + ' completed · showing ' + shown + ' of ' + total + ' tasks');
    } else {
      setText('todayPlanTaskProgressText', 'Showing ' + shown + ' of ' + total + ' active tasks');
    }

    var pct = _taskIncludeCompleted && shown > 0 ? Math.round((done / shown) * 100) : 0;
    if (c && c.replaceProgressClass) c.replaceProgressClass(qs('#todayPlanTaskProgress'), pct);
  }

  function taskStatusLabel(status) {
    return status === 'done' ? 'Completed' : 'Pending';
  }

  function taskStatusClass(status) {
    return 'task-status ' + (status === 'done' ? 'task-status--done' : 'task-status--todo');
  }

  function buildPriorityFlag(priority) {
    var wrap = document.createElement('span');
    wrap.className = 'task-priority task-priority--' + String(priority || 'low');
    wrap.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4v16M9 5h7l-2.7 4L16 13H9" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    return wrap;
  }

  function buildTaskMenuButton() {
    var btn = document.createElement('button');
    btn.className = 'task-menu-btn';
    btn.type = 'button';
    btn.setAttribute('data-action', 'note');
    btn.setAttribute('aria-label', 'Task options');
    btn.textContent = '⋮';
    return btn;
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

  function fmtMoneyFromTask(cents, currency) {
    var c = core();
    if (c && c.fmtMoneyFromCents) return c.fmtMoneyFromCents(cents, currency || 'TRY');
    return String(cents || 0);
  }

  function syncTaskFilterSelects() {
    var state = getState();
    if (!state) return;

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
    var state = getState();
    if (!state) return;
    state.taskFilters.kind = '';
    state.taskFilters.priority = '';
    state.taskFilters.status = '';
    syncTaskFilterSelects();
  }

  function setTaskTabUI(active) {
    qsa('.card--tasks .tab').forEach(function (t) {
      var tab = t.getAttribute('data-tab') || 'today';
      var on = String(tab) === String(active);
      t.classList.toggle('is-active', on);
      t.setAttribute('aria-selected', on ? 'true' : 'false');
    });
  }

  function renderTasks(list) {
    var c = core();
    var state = getState();
    var root = qs('#tasksList');
    if (!c || !state || !root) return;

    root.innerHTML = '';
    updateTodayPlanHeader();
    syncTaskControls();
    syncLoadMoreButton();

    if (!list || !list.length) {
      var e = document.createElement('div');
      e.className = 'task task--empty';
      e.textContent = _taskIncludeCompleted ? 'No tasks found for this view.' : 'No active tasks right now.';
      root.appendChild(e);
      return;
    }

    list.forEach(function (t) {
      var task = document.createElement('div');
      task.className = 'task' + ((state.selectMode && state.selectedTaskIds[String(t.id)]) ? ' is-selected' : '') + (c.isTaskIdPending && c.isTaskIdPending(t.id) ? ' is-pending' : '');
      task.setAttribute('data-task-id', String(t.id));

      var chk = c.buildCheck ? c.buildCheck(t.status === 'done', c.isTaskIdPending && c.isTaskIdPending(t.id)) : null;
      if (chk) task.appendChild(chk);

      var main = document.createElement('div');
      main.className = 'task__main';

      var title = document.createElement('div');
      title.className = 'task__title';
      title.textContent = String(t.title || 'Untitled task');
      main.appendChild(title);

      var meta = document.createElement('div');
      meta.className = 'task__meta';
      if (c.buildDueMeta) meta.appendChild(c.buildDueMeta(t.due_date));
      if ((t.expected_cost_cents || 0) > 0) {
        var cost = document.createElement('span');
        cost.className = 'meta-item';
        cost.textContent = fmtMoneyFromTask(t.expected_cost_cents, t.expected_cost_currency || 'TRY');
        meta.appendChild(cost);
      }
      main.appendChild(meta);
      task.appendChild(main);

      var side = document.createElement('div');
      side.className = 'task__side';
      side.appendChild(buildPriorityFlag(t.priority));

      var status = document.createElement('span');
      status.className = taskStatusClass(t.status);
      status.textContent = taskStatusLabel(t.status);
      side.appendChild(status);

      side.appendChild(buildTaskMenuButton());

      task.appendChild(side);
      root.appendChild(task);
    });

    if (c.markPendingInDom) c.markPendingInDom();
  }

  async function loadTasks(tab, q, opts) {
    var c = core();
    var state = getState();
    if (!c || !state || !c.api) return;

    var options = opts || {};
    var append = !!options.append;
    state.activeTab = 'all';

    if (state.selectMode) clearTaskSelection();

    var offset = append ? _currentList.length : 0;
    var url = '/api/tasks.php?panel=today_plan'
      + '&limit=' + encodeURIComponent(String(TASK_PAGE_SIZE))
      + '&offset=' + encodeURIComponent(String(offset))
      + '&sort=' + encodeURIComponent(_taskSortMode || 'smart')
      + '&include_done=' + (_taskIncludeCompleted ? '1' : '0');

    var d = await c.api('GET', url);
    var list = Array.isArray(d.tasks) ? d.tasks : [];
    var meta = d.meta && typeof d.meta === 'object' ? d.meta : {};

    _taskMeta = {
      total: parseInt(String(meta.total || 0), 10) || 0,
      has_more: !!meta.has_more
    };

    _currentList = append ? _currentList.concat(list) : list.slice();

    state.tasksById = append ? (state.tasksById || {}) : {};
    for (var i = 0; i < list.length; i++) {
      state.tasksById[String(list[i].id)] = list[i];
    }

    renderTasks(_currentList);
  }

  async function setTaskDone(taskId, done) {
    var c = core();
    var state = getState();
    if (!c || !state || !c.api) return;
    await c.api('PATCH', '/api/tasks.php?id=' + encodeURIComponent(taskId), { status: done ? 'done' : 'todo' });
    await Promise.all([
      c.loadDashboard ? c.loadDashboard() : Promise.resolve(),
      loadTasks(state.activeTab, (qs('#taskSearch') ? qs('#taskSearch').value.trim() : ''))
    ]);
  }

  // ===== v4: Task selection + bulk actions =====
  function selectedTaskIdList() {
    var c = core();
    var state = getState();
    if (!c || !state) return [];
    var ids = [];
    for (var k in state.selectedTaskIds) {
      if (Object.prototype.hasOwnProperty.call(state.selectedTaskIds, k) && state.selectedTaskIds[k]) {
        ids.push(String(k));
      }
    }
    return c.normalizeIdList ? c.normalizeIdList(ids, 200) : ids;
  }

  function updateTaskBulkBar() {
    var state = getState();
    var bar = qs('#taskBulkBar');
    var cnt = qs('#taskBulkCount');
    if (!state || !bar || !cnt) return;
    var n = selectedTaskIdList().length;
    cnt.textContent = String(n);
    var show = state.selectMode && n > 0;
    bar.setAttribute('aria-hidden', show ? 'false' : 'true');
  }

  function clearTaskSelection() {
    var state = getState();
    if (!state) return;
    state.selectedTaskIds = {};
    qsa('.task.is-selected').forEach(function (el) { el.classList.remove('is-selected'); });
    updateTaskBulkBar();
  }

  function setSelectMode(on) {
    var state = getState();
    if (!state) return;
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
    var c = core();
    var state = getState();
    var id = String(taskId || '');
    if (!c || !state || !id) return;
    if (c.isTaskIdPending && c.isTaskIdPending(id)) return;

    state.selectedTaskIds[id] = !state.selectedTaskIds[id];
    var row = qs('.task[data-task-id="' + id + '"]');
    if (row) row.classList.toggle('is-selected', !!state.selectedTaskIds[id]);
    updateTaskBulkBar();
  }

  async function bulkUpdateTasks(action, extra) {
    var c = core();
    var state = getState();
    if (!c || !state || !c.api) return;

    var ids = selectedTaskIdList();
    if (!ids.length) return;

    for (var i = 0; i < ids.length; i++) {
      if (c.isTaskIdPending && c.isTaskIdPending(ids[i])) {
        window.alert('Some selected tasks are pending deletion. Undo or wait, then try again.');
        return;
      }
    }

    qsa('#taskBulkBar button').forEach(function (b) { b.disabled = true; });
    try {
      var payload = { action: String(action || ''), ids: ids };
      if (extra && typeof extra === 'object') {
        for (var k in extra) {
          if (Object.prototype.hasOwnProperty.call(extra, k)) payload[k] = extra[k];
        }
      }
      await c.api('POST', '/api/tasks_bulk.php', payload);
      clearTaskSelection();
      await Promise.all([
        c.loadDashboard ? c.loadDashboard() : Promise.resolve(),
        loadTasks(state.activeTab, (qs('#taskSearch') && qs('#taskSearch').value || '').trim())
      ]);
    } catch (err) {
      window.alert(err && err.message ? err.message : 'Failed.');
    } finally {
      qsa('#taskBulkBar button').forEach(function (b2) { b2.disabled = false; });
      updateTaskBulkBar();
    }
  }

  function openBulkPriorityMenu() {
    if (!window.LifeNestUI || !window.LifeNestUI.openContextMenu) return;
    var ids = selectedTaskIdList();
    if (!ids.length) return;
    window.LifeNestUI.openContextMenu('Set priority', [
      { label: 'High', cmd: 'bulk:priority:high' },
      { label: 'Medium', cmd: 'bulk:priority:medium' },
      { label: 'Low', cmd: 'bulk:priority:low' }
    ]);
  }

  function scheduleDeleteTasks(ids) {
    var c = core();
    var state = getState();
    if (!c || !state || !c.normalizeIdList) return;
    var list = c.normalizeIdList(ids || [], 200);
    if (!list.length) return;
    if (!window.confirm('Delete selected task(s)?')) return;

    var op = c.addPendingOp ? c.addPendingOp((list.length === 1) ? 'task_delete' : 'tasks_bulk_delete', list) : null;
    if (!op) return;

    list.forEach(function (id) {
      if (state.selectedTaskIds[id]) delete state.selectedTaskIds[id];
      var row = qs('.task[data-task-id="' + id + '"]');
      if (row) row.classList.remove('is-selected');
    });
    updateTaskBulkBar();
    if (c.renderPendingModal) c.renderPendingModal();
  }

  // ===== Task modal =====
  function resetTaskFormForCreate() {
    var state = getState();
    if (!state) return;
    state.editTaskId = null;
    if (qs('#taskId')) qs('#taskId').value = '';
    setText('modalTaskTitle', 'Add Task');
    setText('taskFormHint', '');
    if (qs('#taskDeleteBtn')) qs('#taskDeleteBtn').hidden = true;
    if (qs('#taskTitle')) qs('#taskTitle').value = '';
    if (qs('#taskKind')) qs('#taskKind').value = 'personal';
    if (qs('#taskPriority')) qs('#taskPriority').value = 'medium';
    if (qs('#taskDur')) qs('#taskDur').value = '';
    if (qs('#taskCost')) qs('#taskCost').value = '';
    if (qs('#taskCostCurrency')) qs('#taskCostCurrency').value = ((getState() && getState().currency) || 'TRY');
  }

  async function fetchTaskById(taskId) {
    var c = core();
    var state = getState();
    if (!c || !state || !c.api) return null;

    var t = state.tasksById[String(taskId)] || null;
    if (t) return t;

    var d = await c.api('GET', '/api/tasks.php?tab=all&limit=200');
    var list = d.tasks || [];
    for (var i = 0; i < list.length; i++) {
      state.tasksById[String(list[i].id)] = list[i];
    }
    return state.tasksById[String(taskId)] || null;
  }

  async function openTaskEditor(taskId) {
    var c = core();
    var state = getState();
    if (!c || !state) return;
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
    if (qs('#taskCost')) qs('#taskCost').value = fmtMoneyForInput(t.expected_cost_cents || 0);
    if (qs('#taskCostCurrency')) qs('#taskCostCurrency').value = String(t.expected_cost_currency || (getState() && getState().currency) || 'TRY');

    if (window.LifeNestUI) window.LifeNestUI.openModal('task');
  }

  async function deleteTask(taskId) {
    var c = core();
    var state = getState();
    var id = String(taskId || '');
    if (!c || !state || !id) return;

    var op = c.addPendingOp ? c.addPendingOp('task_delete', [id]) : null;
    if (!op) return;

    if (String(state.editTaskId || '') === id) {
      resetTaskFormForCreate();
      if (window.LifeNestUI) window.LifeNestUI.closeModal('modalTask');
    }

    clearTaskSelection();
    if (c.renderPendingModal) c.renderPendingModal();
  }

  async function submitTaskForm(e) {
    var c = core();
    var state = getState();
    if (!c || !state || !c.api) return;

    if (e && e.preventDefault) e.preventDefault();
    setText('taskFormHint', '');

    var title = (qs('#taskTitle') && qs('#taskTitle').value || '').trim();
    var kind = (qs('#taskKind') && qs('#taskKind').value) || 'personal';
    var priority = (qs('#taskPriority') && qs('#taskPriority').value) || 'medium';
    var due = (qs('#taskDue') && qs('#taskDue').value) || null;
    var dur = (qs('#taskDur') && qs('#taskDur').value) || '';
    var costRaw = (qs('#taskCost') && qs('#taskCost').value) || '';
    var costCurrency = (qs('#taskCostCurrency') && qs('#taskCostCurrency').value) || ((getState() && getState().currency) || 'TRY');

    if (!title) {
      setText('taskFormHint', 'Write a title.');
      return;
    }

    var payload = { title: title, kind: kind, priority: priority, due_date: due || null };
    if (dur !== '') payload.duration_minutes = dur;
    var expectedCostCents = null;
    if (String(costRaw || '').trim() !== '') {
      expectedCostCents = parseMoneyToCents(costRaw);
      if (expectedCostCents === null) {
        setText('taskFormHint', 'Write a valid expected cost.');
        return;
      }
      payload.expected_cost_cents = expectedCostCents;
      payload.expected_cost_currency = costCurrency;
    } else if (state.editTaskId) {
      payload.expected_cost_cents = null;
      payload.expected_cost_currency = null;
    }

    try {
      if (state.editTaskId) {
        await c.api('PATCH', '/api/tasks.php?id=' + encodeURIComponent(state.editTaskId), payload);
      } else {
        await c.api('POST', '/api/tasks.php', payload);
      }
      setText('taskFormHint', 'Saved.');
      if (window.LifeNestUI) window.LifeNestUI.closeModal('modalTask');
      resetTaskFormForCreate();
      await Promise.all([
        c.loadDashboard ? c.loadDashboard() : Promise.resolve(),
        loadTasks(state.activeTab)
      ]);
    } catch (err) {
      setText('taskFormHint', err && err.message ? err.message : 'Failed.');
    }
  }

  // ===== Notes modal =====
  function setNoteColor(c) {
    var state = getState();
    if (!state) return;
    var allowed = { blue: 1, mint: 1, yellow: 1, pink: 1, gray: 1 };
    if (!allowed[c]) c = 'blue';
    state.noteColor = c;

    var inp = qs('#noteColor');
    if (inp) inp.value = c;

    var comp = qs('#noteComposer');
    if (comp) comp.setAttribute('data-color', c);

    var picker = qs('#noteColorPicker');
    if (picker) {
      qsa('.ln-note2__swatch', picker).forEach(function (b) {
        var bc = b.getAttribute('data-color') || '';
        var on = (bc === c);
        b.classList.toggle('is-active', on);
        b.setAttribute('aria-checked', on ? 'true' : 'false');
      });
    }
  }

  function setComposerMode(mode) {
    var t = qs('#noteComposerTitle');
    if (t) t.textContent = (mode === 'edit') ? 'Edit Note' : 'Add New Note';

    var b = qs('#noteSaveBtn');
    if (b) b.textContent = (mode === 'edit') ? 'Save Changes' : 'Save Note';
  }

  function resetComposer() {
    var state = getState();
    if (!state) return;
    state.editNoteId = null;
    setComposerMode('add');

    var titleEl = qs('#noteTitle');
    if (titleEl) titleEl.value = '';

    var bodyEl = qs('#noteBody');
    if (bodyEl) bodyEl.value = '';

    setNoteColor('blue');
  }

  function clearNoteCards() {
    var grid = qs('#notesGrid');
    if (!grid) return;
    var comp = qs('#noteComposer');

    Array.prototype.slice.call(grid.children).forEach(function (ch) {
      if (comp && ch === comp) return;
      try { grid.removeChild(ch); } catch (_) {}
    });
  }

  function fmtNoteTime(s) {
    if (!s) return '';
    if (typeof s !== 'string') return String(s);
    var m = s.trim().match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/);
    if (!m) return s;
    var y = parseInt(m[1], 10);
    var mo = parseInt(m[2], 10) - 1;
    var d = parseInt(m[3], 10);
    var h = parseInt(m[4], 10);
    var mi = parseInt(m[5], 10);
    var se = m[6] ? parseInt(m[6], 10) : 0;
    var dt = new Date(y, mo, d, h, mi, se);
    try {
      var date = dt.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
      var time = dt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
      return date + ' - ' + time;
    } catch (_) {
      return s;
    }
  }

  function renderNotes(notes) {
    var state = getState();
    var grid = qs('#notesGrid');
    if (!state || !grid) return;

    clearNoteCards();
    state.notesById = {};

    if (!notes || !notes.length) {
      var empty = document.createElement('div');
      empty.className = 'ln-note2__card ln-note2__note ln-note2__empty';
      empty.setAttribute('data-note-id', '');
      empty.setAttribute('data-color', 'gray');

      var topE = document.createElement('div');
      topE.className = 'ln-note2__noteTop';
      var timeE = document.createElement('div');
      timeE.className = 'ln-note2__time';
      timeE.textContent = '';
      topE.appendChild(timeE);
      empty.appendChild(topE);

      var bodyE = document.createElement('div');
      bodyE.className = 'ln-note2__body';
      bodyE.textContent = 'No notes yet.';
      empty.appendChild(bodyE);

      grid.appendChild(empty);
      return;
    }

    notes.forEach(function (n) {
      state.notesById[String(n.id)] = n;

      var card = document.createElement('div');
      card.className = 'ln-note2__card ln-note2__note';
      card.setAttribute('data-note-id', String(n.id));
      card.setAttribute('data-color', String(n.color || 'mint'));

      var top = document.createElement('div');
      top.className = 'ln-note2__noteTop';

      var time = document.createElement('div');
      time.className = 'ln-note2__time';
      time.textContent = fmtNoteTime(n.created_at || '');
      top.appendChild(time);

      var actions = document.createElement('div');
      actions.className = 'ln-note2__noteActions';

      var edit = document.createElement('button');
      edit.className = 'ln-note2__iconBtn';
      edit.type = 'button';
      edit.setAttribute('data-action', 'edit-note');
      edit.setAttribute('aria-label', 'Edit note');
      edit.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20h9" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
      actions.appendChild(edit);

      var del = document.createElement('button');
      del.className = 'ln-note2__iconBtn';
      del.type = 'button';
      del.setAttribute('data-action', 'delete-note');
      del.setAttribute('aria-label', 'Delete note');
      del.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M8 6V4h8v2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M19 6l-1 14H6L5 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M10 11v6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M14 11v6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
      actions.appendChild(del);

      top.appendChild(actions);
      card.appendChild(top);

      var title = document.createElement('div');
      title.className = 'ln-note2__title';
      title.textContent = String((n.title || '').trim() || 'Untitled note');
      card.appendChild(title);

      var body = document.createElement('div');
      body.className = 'ln-note2__body';
      body.textContent = String(n.body || '');
      card.appendChild(body);

      grid.appendChild(card);
    });
  }

  async function openNotesForTask(taskId, title) {
    var c = core();
    var state = getState();
    if (!c || !state || !c.api) return;

    state.activeTaskForNotes = taskId;
    resetComposer();

    setText('noteTaskName', title || '—');
    setText('noteFormHint', '');

    clearNoteCards();

    try {
      var d = await c.api('GET', '/api/task_notes.php?task_id=' + encodeURIComponent(taskId) + '&limit=50');
      renderNotes(d.notes || []);
      if (window.LifeNestUI) window.LifeNestUI.openModal('note');
    } catch (err) {
      renderNotes([]);
      setText('noteFormHint', 'Failed to load notes.');
      if (window.LifeNestUI) window.LifeNestUI.openModal('note');
    }
  }

  async function submitNoteForm(e) {
    var c = core();
    var state = getState();
    if (!c || !state || !c.api) return;

    if (e && e.preventDefault) e.preventDefault();
    setText('noteFormHint', '');

    var taskId = state.activeTaskForNotes;
    var titleEl = qs('#noteTitle');
    var title = (titleEl && titleEl.value || '').trim();
    var bodyEl = qs('#noteBody');
    var body = (bodyEl && bodyEl.value || '').trim();

    var colorEl = qs('#noteColor');
    var color = (colorEl && colorEl.value) ? String(colorEl.value) : (state.noteColor || 'blue');

    if (!taskId) {
      setText('noteFormHint', 'Open notes from a task first.');
      return;
    }
    if (!body) {
      setText('noteFormHint', 'Write a note.');
      return;
    }

    try {
      if (state.editNoteId) {
        await c.api('PATCH', '/api/task_notes.php?id=' + encodeURIComponent(state.editNoteId), { title: title, body: body, color: color });
      } else {
        await c.api('POST', '/api/task_notes.php', { task_id: taskId, title: title, body: body, color: color });
      }

      resetComposer();

      var d = await c.api('GET', '/api/task_notes.php?task_id=' + encodeURIComponent(taskId) + '&limit=50');
      renderNotes(d.notes || []);
      setText('noteFormHint', 'Saved.');
    } catch (err) {
      setText('noteFormHint', err && err.message ? err.message : 'Failed.');
    }
  }

  async function deleteNote(noteId) {
    var c = core();
    var state = getState();
    if (!c || !state || !c.api) return;

    await c.api('DELETE', '/api/task_notes.php?id=' + encodeURIComponent(noteId), {});

    if (state.editNoteId && String(state.editNoteId) === String(noteId)) {
      resetComposer();
    }

    var taskId = state.activeTaskForNotes;
    if (taskId) {
      var d = await c.api('GET', '/api/task_notes.php?task_id=' + encodeURIComponent(taskId) + '&limit=50');
      renderNotes(d.notes || []);
    }
  }

  function bind() {
    if (_bound) return;
    _bound = true;

    var state = getState();

    syncTaskControls();
    syncLoadMoreButton();

    var sortSel = qs('#todayPlanSort');
    if (sortSel) {
      sortSel.addEventListener('change', function () {
        _taskSortMode = sortSel.value || 'smart';
        writeTaskSortMode(_taskSortMode);
        syncTaskControls();
        loadTasks('all', '', { append: false }).catch(function () {});
      });
    }

    var includeDone = qs('#todayPlanIncludeCompleted');
    if (includeDone) {
      includeDone.addEventListener('change', function () {
        _taskIncludeCompleted = !!includeDone.checked;
        writeIncludeCompleted(_taskIncludeCompleted);
        syncTaskControls();
        loadTasks('all', '', { append: false }).catch(function () {});
      });
    }

    var loadMore = qs('#todayPlanLoadMore');
    if (loadMore) {
      loadMore.addEventListener('click', function (e) {
        e.preventDefault();
        if (loadMore.disabled) return;
        loadTasks('all', '', { append: true }).catch(function () {});
      });
    }

    // Selection mode + bulk actions
    var selBtn = qs('#btnTaskSelect');
    if (selBtn) {
      selBtn.addEventListener('click', function (e) {
        e.preventDefault();
        var st4 = getState();
        setSelectMode(!(st4 && st4.selectMode));
      });
    }

    var bDone = qs('#taskBulkDone');
    if (bDone) bDone.addEventListener('click', function (e) { e.preventDefault(); bulkUpdateTasks('done').catch(function () {}); });

    var bTodo = qs('#taskBulkTodo');
    if (bTodo) bTodo.addEventListener('click', function (e) { e.preventDefault(); bulkUpdateTasks('todo').catch(function () {}); });

    var bPr = qs('#taskBulkPriority');
    if (bPr) bPr.addEventListener('click', function (e) { e.preventDefault(); openBulkPriorityMenu(); });

    var bDel = qs('#taskBulkDelete');
    if (bDel) bDel.addEventListener('click', function (e) { e.preventDefault(); scheduleDeleteTasks(selectedTaskIdList()); });

    var bClr = qs('#taskBulkClear');
    if (bClr) bClr.addEventListener('click', function (e) { e.preventDefault(); clearTaskSelection(); });

    updateTaskBulkBar();

    // Tasks list delegation (checkbox + row click + note)
    var tl = qs('#tasksList');
    if (tl) {
      tl.addEventListener('change', function (e) {
        var inp = e.target;
        if (!inp || inp.tagName !== 'INPUT' || inp.type !== 'checkbox') return;
        var row = inp.closest('.task');
        if (!row) return;
        var id = row.getAttribute('data-task-id');
        if (!id) return;
        setTaskDone(id, inp.checked).catch(function () {});
      });

      tl.addEventListener('click', function (e) {
        var st5 = getState();

        // selection mode: click row toggles selection
        if (st5 && st5.selectMode) {
          var rSel = e.target && e.target.closest ? e.target.closest('.task') : null;
          if (rSel) {
            var idSel = rSel.getAttribute('data-task-id');
            if (idSel) {
              var interactive = e.target && e.target.closest ? e.target.closest('button, a, input, label') : null;
              if (!interactive) {
                e.preventDefault();
                toggleTaskSelection(idSel);
                return;
              }
            }
          }
        }

        var btn = e.target && e.target.closest ? e.target.closest('[data-action="note"]') : null;
        if (btn) {
          var rowN = btn.closest('.task');
          if (!rowN) return;
          var idN = rowN.getAttribute('data-task-id');
          if (!idN) return;
          var titleN = qs('.task__title', rowN) ? qs('.task__title', rowN).textContent : '';
          openNotesForTask(idN, titleN).catch(function () {});
          return;
        }

        // ignore checkbox clicks
        var inCheck = e.target && e.target.closest ? e.target.closest('input[type="checkbox"], label.check') : null;
        if (inCheck) return;

        var row2 = e.target && e.target.closest ? e.target.closest('.task') : null;
        if (!row2) return;
        var id2 = row2.getAttribute('data-task-id');
        if (!id2) return;

        var interactive2 = e.target && e.target.closest ? e.target.closest('button, a, select, textarea') : null;
        if (interactive2) return;

        openTaskEditor(id2).catch(function () {});
      });
    }

    // Task modal events
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
        var st6 = getState();
        if (!st6 || !st6.editTaskId) return;
        if (!window.confirm('Delete this task?')) return;
        deleteTask(st6.editTaskId).catch(function () {});
      });
    }

    // Notes modal events
    var noteForm = qs('#noteForm');
    if (noteForm) noteForm.addEventListener('submit', submitNoteForm);

    var picker = qs('#noteColorPicker');
    if (picker) {
      picker.addEventListener('click', function (e) {
        var b2 = e.target && e.target.closest ? e.target.closest('.ln-note2__swatch') : null;
        if (!b2) return;
        var c2 = b2.getAttribute('data-color') || 'blue';
        setNoteColor(c2);
      });
    }

    var notesGrid = qs('#notesGrid');
    if (notesGrid) {
      notesGrid.addEventListener('click', function (e) {
        var st7 = getState();
        if (!st7) return;

        var edit = e.target && e.target.closest ? e.target.closest('[data-action="edit-note"]') : null;
        if (edit) {
          var it2 = edit.closest('.ln-note2__note');
          if (!it2) return;
          var nid2 = it2.getAttribute('data-note-id');
          if (!nid2) return;
          var note = st7.notesById[String(nid2)] || null;
          if (!note) return;
          st7.editNoteId = String(nid2);
          if (qs('#noteTitle')) qs('#noteTitle').value = String(note.title || '');
          if (qs('#noteBody')) qs('#noteBody').value = String(note.body || '');
          setNoteColor(String(note.color || 'blue'));
          setComposerMode('edit');
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

    // Notes modal openers (speed-dial)
    qsa('[data-open="note"]').forEach(function (b3) {
      b3.addEventListener('click', function (e) {
        e.preventDefault();
        var st8 = getState();
        if (st8 && st8.activeTaskForNotes) {
          if (window.LifeNestUI) window.LifeNestUI.openModal('note');
          return;
        }
        resetComposer();
        setText('noteTaskName', '—');
        renderNotes([]);
        setText('noteFormHint', 'Open notes from a task ("Add note") button.');
        if (window.LifeNestUI) window.LifeNestUI.openModal('note');
      });
    });

    // bulkbar should be hidden initially
    updateTaskBulkBar();
  }

  // Public API used by core adapter and context-menu commands.
  LN.tasks.syncFilters = syncTaskFilterSelects;
  LN.tasks.clearFilters = clearTaskFilters;
  LN.tasks.load = loadTasks;
  LN.tasks.setDone = setTaskDone;
  LN.tasks.resetForm = resetTaskFormForCreate;
  LN.tasks.openEditor = openTaskEditor;
  LN.tasks.bulkUpdate = bulkUpdateTasks;
  LN.tasks.scheduleDelete = scheduleDeleteTasks;
  LN.tasks.openNotesForTask = openNotesForTask;
  LN.tasks.submitTaskForm = submitTaskForm;
  LN.tasks.deleteTask = deleteTask;
  LN.tasks.submitNoteForm = submitNoteForm;

  // Panel init hook
  LN.modules.tasks = function () {
    bind();
    loadTasks('all', '', { append: false }).catch(function () {});
  };

  // Ensure init runs even if this file loads after DOMContentLoaded.
  try {
    if (LN.initModules) LN.initModules();
  } catch (_) {}
})();
