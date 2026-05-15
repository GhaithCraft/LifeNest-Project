(function () {
  'use strict';

  var LN = (window.LN = window.LN || {});
  LN.today_plan = LN.today_plan || {};
  LN.modules = LN.modules || {};

  var _bound = false;
  var _refreshTimer = 0;
  var _refreshReqId = 0;
  var _lastPlan = null;
  var _manualDraft = null;
  var _lastTasksById = {};
  var _lastActivity = { latest_by_task: {}, summary: { started: 0, completed: 0, postponed: 0 } };
  var _lastReview = null;
  var _detailItems = {};
  var _detailSeq = 0;

  var LOCK_STORAGE_KEY = 'ln_today_plan_locks_v1';

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

  function isPendingTaskId(id) {
    var c = core();
    if (!c || !c.isTaskIdPending) return false;
    return !!c.isTaskIdPending(id);
  }

  function priorityLabel(p) {
    var c = core();
    return (c && c.priorityLabel) ? c.priorityLabel(p) : String(p || '');
  }

  function pillClassForPriority(p) {
    if (p === 'high') return 'pill pill--red';
    if (p === 'medium') return 'pill pill--amber';
    return 'pill pill--mint';
  }

  function clampInt(n, a, b) {
    var x = parseInt(String(n || '0'), 10);
    if (!isFinite(x)) x = 0;
    if (x < a) x = a;
    if (x > b) x = b;
    return x;
  }

  function todayYMD() {
    var c = core();
    return c && c.todayYMD ? c.todayYMD() : (new Date()).toISOString().slice(0, 10);
  }

  function fmtDuration(mins) {
    var c = core();
    if (c && c.fmtDuration) return c.fmtDuration(mins);
    var m = clampInt(mins, 0, 24 * 60);
    if (m <= 0) return '0m';
    var h = Math.floor(m / 60);
    var r = m % 60;
    if (h > 0 && r > 0) return h + 'h ' + r + 'm';
    if (h > 0) return h + 'h';
    return r + 'm';
  }

  function fmtMoneyFromCents(cents, cur) {
    var c = core();
    return (c && c.fmtMoneyFromCents) ? c.fmtMoneyFromCents(cents, cur) : String(cents || 0);
  }

  function parseYMD(ymd) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(ymd || ''))) return null;
    var d = new Date(String(ymd) + 'T00:00:00');
    return isNaN(d.getTime()) ? null : d;
  }

  function dayDiff(fromYmd, toYmd) {
    var a = parseYMD(fromYmd);
    var b = parseYMD(toYmd);
    if (!a || !b) return 9999;
    return Math.round((b.getTime() - a.getTime()) / 86400000);
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
      if (sAp === eAp) return s.replace(' ' + sAp, '') + '-' + e;
      return s + '-' + e;
    }
    return s + '-' + e;
  }

  function minsToHHMM(mins) {
    var m = clampInt(mins, 0, 24 * 60);
    var hh = Math.floor(m / 60);
    var mm = m % 60;
    return String(hh).padStart(2, '0') + ':' + String(mm).padStart(2, '0');
  }

  function timeToMinutes(hhmm) {
    if (!/^\d{2}:\d{2}$/.test(String(hhmm || ''))) return 0;
    var hh = parseInt(hhmm.slice(0, 2), 10);
    var mm = parseInt(hhmm.slice(3, 5), 10);
    return hh * 60 + mm;
  }

  function overlaps(aStart, aEnd, bStart, bEnd) {
    return aStart < bEnd && bStart < aEnd;
  }

  function safeJsonParse(raw) {
    try {
      return JSON.parse(String(raw || ''));
    } catch (_) {
      return null;
    }
  }

  function readLockMap() {
    try {
      var raw = window.localStorage.getItem(LOCK_STORAGE_KEY);
      var parsed = raw ? safeJsonParse(raw) : {};
      return (parsed && typeof parsed === 'object') ? parsed : {};
    } catch (_) {
      return {};
    }
  }

  function writeLockMap(map) {
    try {
      window.localStorage.setItem(LOCK_STORAGE_KEY, JSON.stringify(map || {}));
    } catch (_) {}
  }

  function locksForDate(date) {
    var map = readLockMap();
    var list = map[date];
    return Array.isArray(list) ? list.slice() : [];
  }

  function saveLocksForDate(date, list) {
    var map = readLockMap();
    map[date] = Array.isArray(list) ? list.slice() : [];
    if (!map[date].length) delete map[date];
    writeLockMap(map);
  }

  function upsertLock(date, taskId, start) {
    var list = locksForDate(date);
    var next = [];
    var found = false;
    for (var i = 0; i < list.length; i++) {
      var cur = list[i] || {};
      if (String(cur.task_id || '') === String(taskId)) {
        next.push({ task_id: String(taskId), start: String(start || '') });
        found = true;
      } else {
        next.push(cur);
      }
    }
    if (!found) next.push({ task_id: String(taskId), start: String(start || '') });
    saveLocksForDate(date, next);
  }

  function removeLock(date, taskId) {
    var list = locksForDate(date).filter(function (x) {
      return String((x && x.task_id) || '') !== String(taskId || '');
    });
    saveLocksForDate(date, list);
  }


  function normalizeLatestByTask(raw) {
    var src = raw && typeof raw === 'object' ? raw : {};
    var out = {};
    Object.keys(src).forEach(function (taskId) {
      var item = src[taskId] || {};
      out[String(taskId)] = {
        action: String(item.action || ''),
        happened_at: String(item.happened_at || '')
      };
    });
    return out;
  }

  function latestActivityForTask(taskId, activity) {
    if (!activity || !activity.latest_by_task) return null;
    return activity.latest_by_task[String(taskId)] || null;
  }

  function tomorrowYMD(baseYmd) {
    var d = parseYMD(baseYmd || todayYMD());
    if (!d) d = parseYMD(todayYMD());
    return new Date(d.getTime() + 86400000).toISOString().slice(0, 10);
  }

  function refreshReportsIfAvailable() {
    try {
      if (LN.core && LN.core.reports && typeof LN.core.reports.reload === 'function') {
        LN.core.reports.reload();
      }
    } catch (_) {}
  }

  async function refreshLinkedSurfaces(options) {
    var opts = options || {};
    var c = core();
    var state = getState();
    var jobs = [];

    if (opts.refreshDashboard !== false && c && typeof c.loadDashboard === 'function') {
      jobs.push(c.loadDashboard());
    }

    if (opts.refreshTasks !== false && state && LN.tasks && typeof LN.tasks.load === 'function') {
      var search = (qs('#taskSearch') && qs('#taskSearch').value || '').trim();
      jobs.push(LN.tasks.load(state.activeTab || 'all', search));
    }

    if (jobs.length) {
      await Promise.allSettled(jobs);
    }
    refreshReportsIfAvailable();
    return scheduleRefresh({ immediate: true, announce: !!opts.announce });
  }

  function rememberTasks(tasks) {
    _lastTasksById = {};
    (tasks || []).forEach(function (t) {
      if (t && t.id !== undefined && t.id !== null) {
        _lastTasksById[String(t.id)] = t;
      }
    });
  }

  function knownTaskById(taskId) {
    var id = String(taskId || '');
    if (!id) return null;
    if (_lastTasksById[id]) return _lastTasksById[id];
    if (_lastPlan && _lastPlan.taskMap && _lastPlan.taskMap[id]) return _lastPlan.taskMap[id];
    return null;
  }

  function normalizeReview(raw) {
    var src = raw && typeof raw === 'object' ? raw : {};
    var summary = src.summary && typeof src.summary === 'object' ? src.summary : {};
    var mode = String(summary.mode || 'balanced');
    if (mode !== 'rescue' && mode !== 'caution' && mode !== 'balanced') mode = 'balanced';
    var focusKind = String(summary.recommended_focus_kind || 'mixed');
    if (focusKind !== 'study' && focusKind !== 'personal' && focusKind !== 'mixed') focusKind = 'mixed';
    return {
      week_start: String(src.week_start || ''),
      week_next: String(src.week_next || ''),
      decision: String(src.decision || '').trim(),
      insights: Array.isArray(src.insights) ? src.insights.slice(0, 4).map(function (x) { return String(x || '').trim(); }).filter(Boolean) : [],
      summary: {
        carry_over: clampInt(summary.carry_over || 0, 0, 9999),
        overdue_open: clampInt(summary.overdue_open || 0, 0, 9999),
        postponed_open: clampInt(summary.postponed_open || 0, 0, 9999),
        overdue_study: clampInt(summary.overdue_study || 0, 0, 9999),
        overdue_personal: clampInt(summary.overdue_personal || 0, 0, 9999),
        completed_study: clampInt(summary.completed_study || 0, 0, 9999),
        completed_personal: clampInt(summary.completed_personal || 0, 0, 9999),
        budget_pressure: String(summary.budget_pressure || 'safe'),
        top_spend_category: String(summary.top_spend_category || ''),
        mode: mode,
        recommended_focus_kind: focusKind,
        recommended_max_auto: clampInt(summary.recommended_max_auto || 0, 0, 8)
      }
    };
  }

  function fetchReviewForPlan() {
    var c = core();
    if (!c || !c.api) return Promise.resolve(normalizeReview({}));
    return c.api('GET', '/api/reports/review.php').then(function (d) {
      return normalizeReview(d);
    }).catch(function () {
      return normalizeReview({});
    });
  }

  function reviewModeLabel(mode) {
    if (mode === 'rescue') return 'Rescue Mode';
    if (mode === 'caution') return 'Caution Mode';
    return 'Balanced Mode';
  }

  function reviewBodyText(review) {
    var summary = review && review.summary ? review.summary : {};
    var mode = String(summary.mode || 'balanced');
    if (mode === 'rescue') return 'Today plan will stay intentionally light and push overdue work to the front before anything optional.';
    if (mode === 'caution') return 'Today plan will protect a slightly larger buffer and prefer the work area that is starting to drift.';
    return 'Today plan can stay balanced, but it still respects overdue tasks, budget pressure, and your fixed blocks.';
  }


  function startOfWeekYMD(baseYmd) {
    var d = parseYMD(baseYmd || todayYMD());
    if (!d) return todayYMD();
    var day = d.getDay();
    var shift = day === 0 ? 6 : (day - 1);
    var start = new Date(d.getTime() - shift * 86400000);
    return start.toISOString().slice(0, 10);
  }

  function normalizeExpenseContext(expenses, today, weekStart) {
    var state = getState();
    var currency = state && state.currency ? String(state.currency) : 'TRY';
    var ctx = {
      currency: currency,
      todayTotalCents: 0,
      linkedTodayCents: 0,
      weekTotalCents: 0,
      linkedWeekCents: 0,
      todayByArea: { general: 0, personal: 0, study: 0 },
      weekByArea: { general: 0, personal: 0, study: 0 },
      byTask: {},
      linkedTodayCount: 0,
      linkedWeekCount: 0
    };
    (expenses || []).forEach(function (x) {
      var amount = clampInt(x && x.amount_cents || 0, 0, 1000000000);
      var date = String(x && x.expense_date || '');
      var taskId = x && x.linked_task_id !== null && x.linked_task_id !== undefined ? String(x.linked_task_id) : '';
      var area = String(x && x.life_area || 'general');
      if (area !== 'personal' && area !== 'study') area = 'general';
      var cur = String(x && x.currency || '');
      if (cur) ctx.currency = cur;

      ctx.weekTotalCents += amount;
      ctx.weekByArea[area] += amount;
      if (taskId) {
        if (!ctx.byTask[taskId]) {
          ctx.byTask[taskId] = {
            weekCents: 0,
            todayCents: 0,
            count: 0,
            todayCount: 0,
            title: String(x && x.linked_task_title || ''),
            life_area: area
          };
        }
        ctx.byTask[taskId].weekCents += amount;
        ctx.byTask[taskId].count += 1;
        ctx.linkedWeekCents += amount;
        ctx.linkedWeekCount += 1;
      }

      if (date === today) {
        ctx.todayTotalCents += amount;
        ctx.todayByArea[area] += amount;
        if (taskId && ctx.byTask[taskId]) {
          ctx.byTask[taskId].todayCents += amount;
          ctx.byTask[taskId].todayCount += 1;
          ctx.linkedTodayCents += amount;
          ctx.linkedTodayCount += 1;
        }
      }
    });
    ctx.weekStart = weekStart;
    ctx.today = today;
    return ctx;
  }

  function fetchExpenseContextForPlan(review) {
    var c = core();
    if (!c || !c.api) return Promise.resolve(normalizeExpenseContext([], todayYMD(), startOfWeekYMD(todayYMD())));
    var today = todayYMD();
    var weekStart = review && review.week_start ? String(review.week_start) : startOfWeekYMD(today);
    var qsParts = '?from=' + encodeURIComponent(weekStart) + '&to=' + encodeURIComponent(today) + '&limit=200';
    return c.api('GET', '/api/expenses.php' + qsParts).then(function (d) {
      return normalizeExpenseContext((d && d.expenses) || [], today, weekStart);
    }).catch(function () {
      return normalizeExpenseContext([], today, weekStart);
    });
  }

  function renderDecision(review, plan) {
    var box = qs('#todayPlanDecision');
    if (!box) return;
    var data = review && review.summary ? review : null;
    if (!data) {
      box.hidden = true;
      return;
    }

    var summary = data.summary || {};
    var mode = String(summary.mode || 'balanced');
    box.hidden = false;
    box.classList.remove('today-plan__decision--rescue', 'today-plan__decision--caution', 'today-plan__decision--balanced');
    box.classList.add('today-plan__decision--' + mode);

    var title = qs('#todayPlanDecisionTitle');
    var body = qs('#todayPlanDecisionBody');
    var modeEl = qs('#todayPlanDecisionMode');
    var meta = qs('#todayPlanDecisionMeta');
    var list = qs('#todayPlanDecisionList');

    if (title) title.textContent = data.decision || 'Keep today intentionally clear.';
    if (body) body.textContent = reviewBodyText(data);
    if (modeEl) modeEl.textContent = reviewModeLabel(mode);

    if (meta) {
      meta.innerHTML = '';
      [
        'Carry-over ' + clampInt(summary.carry_over || 0, 0, 9999),
        'Overdue ' + clampInt(summary.overdue_open || 0, 0, 9999),
        'Focus ' + (summary.recommended_focus_kind === 'study' ? 'Study' : (summary.recommended_focus_kind === 'personal' ? 'Personal' : 'Mixed')),
        'Auto slots ' + clampInt(summary.recommended_max_auto || (mode === 'rescue' ? 2 : mode === 'caution' ? 3 : 4), 0, 8)
      ].forEach(function (txt) {
        var chip = document.createElement('div');
        chip.className = 'today-plan__decision-chip';
        chip.textContent = txt;
        meta.appendChild(chip);
      });
    }

    if (list) {
      list.innerHTML = '';
      var insights = Array.isArray(data.insights) ? data.insights : [];
      if (!insights.length) insights = ['No strong correction is needed right now.'];
      insights.slice(0, 3).forEach(function (txt) {
        var row = document.createElement('div');
        row.className = 'today-plan__decision-item';
        var dot = document.createElement('div');
        dot.className = 'today-plan__decision-item-dot';
        row.appendChild(dot);
        var bodyEl = document.createElement('div');
        bodyEl.className = 'today-plan__decision-item-text';
        bodyEl.textContent = String(txt || '');
        row.appendChild(bodyEl);
        list.appendChild(row);
      });
    }

    if (plan && plan.summary && plan.summary.unscheduledCount > 0 && list) {
      var note = document.createElement('div');
      note.className = 'today-plan__decision-item';
      var noteDot = document.createElement('div');
      noteDot.className = 'today-plan__decision-item-dot';
      note.appendChild(noteDot);
      var noteTxt = document.createElement('div');
      noteTxt.className = 'today-plan__decision-item-text';
      noteTxt.textContent = plan.summary.unscheduledCount + ' task' + (plan.summary.unscheduledCount > 1 ? 's were' : ' was') + ' kept outside the plan so the day stays executable.';
      note.appendChild(noteTxt);
      list.appendChild(note);
    }
  }

  function fetchActivityForDate(date) {
    var c = core();
    if (!c || !c.api) {
      return Promise.resolve({ latest_by_task: {}, summary: { started: 0, completed: 0, postponed: 0 } });
    }
    return c.api('GET', '/api/task_activity.php?date=' + encodeURIComponent(date)).then(function (d) {
      return {
        latest_by_task: normalizeLatestByTask(d && d.latest_by_task),
        summary: {
          started: clampInt(d && d.summary && d.summary.started || 0, 0, 9999),
          completed: clampInt(d && d.summary && d.summary.completed || 0, 0, 9999),
          postponed: clampInt(d && d.summary && d.summary.postponed || 0, 0, 9999)
        }
      };
    }).catch(function () {
      return { latest_by_task: {}, summary: { started: 0, completed: 0, postponed: 0 } };
    });
  }

  async function logTaskAction(taskId, action) {
    var c = core();
    if (!c || !c.api) throw new Error('API unavailable');
    return c.api('POST', '/api/task_activity.php', { task_id: String(taskId || ''), action: String(action || '') });
  }

  async function startTask(taskId) {
    await logTaskAction(taskId, 'started');
    return refreshLinkedSurfaces({ refreshDashboard: false, refreshTasks: false, announce: true });
  }

  async function completeTask(taskId) {
    var id = String(taskId || '');
    if (!id) return;
    removeLock(todayYMD(), id);
    await logTaskAction(id, 'completed');
    if (LN.tasks && typeof LN.tasks.setDone === 'function') {
      await LN.tasks.setDone(id, true);
    } else {
      var c = core();
      if (!c || !c.api) throw new Error('API unavailable');
      await c.api('PATCH', '/api/tasks.php?id=' + encodeURIComponent(id), { status: 'done' });
    }
    return refreshLinkedSurfaces({ announce: true });
  }

  async function postponeTask(taskId) {
    var id = String(taskId || '');
    if (!id) return;
    var task = knownTaskById(id) || {};
    var today = todayYMD();
    var newDue = tomorrowYMD(today);
    if (task && task.due_date && /^\d{4}-\d{2}-\d{2}$/.test(String(task.due_date)) && String(task.due_date) > today) {
      newDue = String(task.due_date);
    }

    await logTaskAction(id, 'postponed');
    removeLock(today, id);

    var c = core();
    if (!c || !c.api) throw new Error('API unavailable');
    await c.api('PATCH', '/api/tasks.php?id=' + encodeURIComponent(id), { due_date: newDue });
    return refreshLinkedSurfaces({ announce: true });
  }

  function normalizeFixedEvent(ev) {
    if (!ev || typeof ev !== 'object') return null;
    var id = String(ev.id || '').trim();
    var name = String(ev.name || '').trim();
    var type = String(ev.type || 'focus').trim();
    var start = String(ev.start || '').trim();
    var end = String(ev.end || '').trim();
    if (!name) return null;
    if (type !== 'focus' && type !== 'admin' && type !== 'low') type = 'focus';
    if (!/^\d{2}:\d{2}$/.test(start) || !/^\d{2}:\d{2}$/.test(end)) return null;
    var s = timeToMinutes(start);
    var e = timeToMinutes(end);
    if (e <= s) return null;
    return {
      id: id || ('fx_' + Math.random().toString(36).slice(2, 10)),
      name: name,
      type: type,
      start: start,
      end: end,
      startMin: s,
      endMin: e
    };
  }

  function buildDayWindow() {
    return { startMin: timeToMinutes('08:00'), endMin: timeToMinutes('23:00') };
  }

  function buildBlocks(state) {
    var windowRange = buildDayWindow();
    var list = (state.fixedEvents || []).map(normalizeFixedEvent).filter(Boolean);
    list.sort(function (a, b) { return a.startMin - b.startMin; });

    var merged = [];
    for (var i = 0; i < list.length; i++) {
      var ev = list[i];
      var s = Math.max(windowRange.startMin, ev.startMin);
      var e = Math.min(windowRange.endMin, ev.endMin);
      if (e <= s) continue;
      if (!merged.length) {
        merged.push({ id: ev.id, name: ev.name, type: ev.type, startMin: s, endMin: e, start: minsToHHMM(s), end: minsToHHMM(e) });
        continue;
      }
      var prev = merged[merged.length - 1];
      if (s <= prev.endMin) {
        prev.endMin = Math.max(prev.endMin, e);
        prev.end = minsToHHMM(prev.endMin);
        prev.name = prev.name + ' + ' + ev.name;
      } else {
        merged.push({ id: ev.id, name: ev.name, type: ev.type, startMin: s, endMin: e, start: minsToHHMM(s), end: minsToHHMM(e) });
      }
    }

    var free = [];
    var cursor = windowRange.startMin;
    for (var j = 0; j < merged.length; j++) {
      var cur = merged[j];
      if (cur.startMin > cursor) {
        free.push({ startMin: cursor, endMin: cur.startMin, start: minsToHHMM(cursor), end: minsToHHMM(cur.startMin), duration: cur.startMin - cursor });
      }
      cursor = Math.max(cursor, cur.endMin);
    }
    if (cursor < windowRange.endMin) {
      free.push({ startMin: cursor, endMin: windowRange.endMin, start: minsToHHMM(cursor), end: minsToHHMM(windowRange.endMin), duration: windowRange.endMin - cursor });
    }

    var totalAvailable = 0;
    for (var k = 0; k < free.length; k++) totalAvailable += Math.max(0, free[k].duration || 0);

    return {
      fixed: merged,
      free: free,
      totalAvailable: totalAvailable,
      dayStartMin: windowRange.startMin,
      dayEndMin: windowRange.endMin,
      dayStart: minsToHHMM(windowRange.startMin),
      dayEnd: minsToHHMM(windowRange.endMin)
    };
  }

  function renderTimeBlocks(rootEl) {
    var state = getState();
    var root = rootEl || qs('#timeBlocks');
    if (!root || !state) return;
    root.innerHTML = '';

    var list = (state.fixedEvents || []).map(normalizeFixedEvent).filter(Boolean);
    list.sort(function (a, b) { return a.startMin - b.startMin; });

    if (!list.length) {
      var empty = document.createElement('div');
      empty.className = 'muted';
      empty.textContent = 'No fixed blocks yet.';
      root.appendChild(empty);
      return;
    }

    for (var i = 0; i < list.length; i++) {
      var ev = list[i];
      var row = document.createElement('div');
      row.className = 'time-row time-row--' + String(ev.type || 'focus');
      row.setAttribute('data-fixed-id', String(ev.id));

      var name = document.createElement('div');
      name.className = 'time-row__name';
      name.textContent = String(ev.name || '');
      row.appendChild(name);

      var t = document.createElement('div');
      t.className = 'time-row__time';
      t.textContent = fmtRange(ev.start, ev.end);
      row.appendChild(t);

      root.appendChild(row);
    }
  }

  function budgetPressure() {
    var state = getState();
    var snap = state && state.dashboardSnapshot ? state.dashboardSnapshot : null;
    var budget = snap && snap.budget ? snap.budget : null;
    var spentToday = snap && snap.spent_today ? clampInt(snap.spent_today.spent_cents || 0, 0, 1000000000) : 0;
    var cur = budget && budget.currency ? String(budget.currency) : 'TRY';
    var remaining = budget ? clampInt(budget.remaining_cents || 0, 0, 1000000000) : 0;
    var allow = budget ? clampInt(budget.daily_allowance_cents || 0, 0, 1000000000) : 0;
    if (!budget || clampInt(budget.budget_cents || 0, 0, 1000000000) <= 0) {
      return { level: 'none', currency: cur, spentToday: spentToday, remaining: remaining, allowance: allow, label: 'No budget set yet.' };
    }
    if (remaining <= 0) {
      return { level: 'critical', currency: cur, spentToday: spentToday, remaining: remaining, allowance: allow, label: 'Monthly budget is fully used.' };
    }
    if (allow > 0 && spentToday > allow) {
      return { level: 'warning', currency: cur, spentToday: spentToday, remaining: remaining, allowance: allow, label: 'Today spending is above the safe daily allowance.' };
    }
    return { level: 'safe', currency: cur, spentToday: spentToday, remaining: remaining, allowance: allow, label: 'Budget is within today\'s safe range.' };
  }

  function normalizeTask(t, today, activity, expenseCtx) {
    if (!t || typeof t !== 'object') return null;
    if (String(t.status || '') !== 'todo') return null;
    var id = String(t.id || '').trim();
    if (!id) return null;
    var title = String(t.title || '').trim();
    if (!title) return null;
    var due = String(t.due_date || '').trim();
    if (due && !/^\d{4}-\d{2}-\d{2}$/.test(due)) due = '';
    var duration = clampInt(t.duration_minutes || 0, 0, 24 * 60);
    if (duration <= 0) duration = 30;
    var diff = due ? dayDiff(today, due) : 9999;
    var latest = latestActivityForTask(id, activity) || { action: '', happened_at: '' };
    var spend = expenseCtx && expenseCtx.byTask ? (expenseCtx.byTask[id] || null) : null;
    return {
      id: id,
      title: title,
      kind: String(t.kind || 'personal'),
      priority: String(t.priority || 'medium'),
      status: 'todo',
      due_date: due,
      duration_minutes: duration,
      dueDiff: diff,
      isOverdue: diff < 0,
      isToday: diff === 0,
      isSoon: diff >= 0 && diff <= 3,
      activityAction: String(latest.action || ''),
      activityAt: String(latest.happened_at || ''),
      isStartedToday: String(latest.action || '') === 'started',
      isPostponedToday: String(latest.action || '') === 'postponed',
      todaySpendCents: spend ? clampInt(spend.todayCents || 0, 0, 1000000000) : 0,
      weekSpendCents: spend ? clampInt(spend.weekCents || 0, 0, 1000000000) : 0,
      linkedExpenseCount: spend ? clampInt(spend.count || 0, 0, 999) : 0,
      expenseLifeArea: spend ? String(spend.life_area || 'general') : 'general',
      expectedCostCents: clampInt(t.expected_cost_cents || 0, 0, 1000000000),
      expectedCostCurrency: String(t.expected_cost_currency || 'TRY'),
      costFlag: '',
      score: 0
    };
  }

  function buildTaskMap(tasks) {
    var map = {};
    for (var i = 0; i < tasks.length; i++) map[String(tasks[i].id)] = tasks[i];
    return map;
  }

  function scoreTask(task, freeBlocks, pressure, review) {
    var score = 0;
    task.costFlag = '';

    if (task.priority === 'high') score += 30;
    else if (task.priority === 'medium') score += 20;
    else score += 10;

    if (task.isOverdue) score += 25 + Math.min(24, Math.abs(task.dueDiff) * 4);
    else if (task.dueDiff === 0) score += 24;
    else if (task.dueDiff === 1) score += 16;
    else if (task.dueDiff >= 2 && task.dueDiff <= 3) score += 8;
    else if (task.due_date === '') score -= 4;

    var fitsWhole = false;
    var fitsSplit = false;
    var totalFree = 0;
    for (var i = 0; i < freeBlocks.length; i++) {
      var d = clampInt(freeBlocks[i].duration || 0, 0, 24 * 60);
      totalFree += d;
      if (d >= task.duration_minutes) fitsWhole = true;
      if (d > 0) fitsSplit = true;
    }

    if (fitsWhole) score += 15;
    else if (fitsSplit && totalFree >= task.duration_minutes) score += 6;
    else score -= 15;

    if (task.kind === 'study' && task.isSoon) score += 5;
    if (task.isStartedToday) score += 7;
    if (task.isPostponedToday) score -= 40;
    if (task.todaySpendCents > 0) score += 8;
    else if (task.weekSpendCents > 0) score += 4;
    if (pressure.level === 'critical' && !task.isToday && !task.isOverdue) score -= 3;
    if (pressure.level === 'critical' && task.todaySpendCents > 0) score += 3;

    if (task.expectedCostCents > 0) {
      if (pressure.level === 'none') {
        task.costFlag = 'no_budget';
      } else if (task.expectedCostCurrency !== String(pressure.currency || 'TRY')) {
        task.costFlag = 'currency_mismatch';
      } else if (pressure.remaining <= 0) {
        task.costFlag = 'budget_blocked';
        score -= (task.isOverdue || task.isToday) ? 8 : 16;
      } else if (task.expectedCostCents > pressure.remaining) {
        task.costFlag = 'over_remaining';
        score -= (task.isOverdue || task.isToday) ? 9 : 18;
      } else if (pressure.allowance > 0 && task.expectedCostCents > pressure.allowance) {
        task.costFlag = 'over_allowance';
        score -= (task.isOverdue || task.isToday) ? 4 : 10;
      } else {
        task.costFlag = 'within_allowance';
        if (task.isOverdue || task.isToday || task.isSoon) score += 3;
      }
    }

    var reviewSummary = review && review.summary ? review.summary : {};
    var reviewMode = String(reviewSummary.mode || 'balanced');
    var focusKind = String(reviewSummary.recommended_focus_kind || 'mixed');

    if (focusKind !== 'mixed' && task.kind === focusKind) {
      score += reviewMode === 'rescue' ? 9 : 4;
    }
    if (reviewMode === 'rescue') {
      if (task.isOverdue || task.isToday) score += 18;
      if (!task.isOverdue && !task.isToday && !task.isSoon) score -= 14;
      if (task.due_date === '') score -= 10;
    } else if (reviewMode === 'caution') {
      if (task.due_date === '') score -= 4;
      if (!task.isOverdue && !task.isToday && !task.isSoon) score -= 6;
    }

    task.score = score;
    return task;
  }

  function sortTasks(tasks) {
    tasks.sort(function (a, b) {
      if (b.score !== a.score) return b.score - a.score;
      if (a.dueDiff !== b.dueDiff) return a.dueDiff - b.dueDiff;
      if (a.duration_minutes !== b.duration_minutes) return a.duration_minutes - b.duration_minutes;
      return String(a.title || '').localeCompare(String(b.title || ''));
    });
    return tasks;
  }

  function pickCandidates(tasks, review) {
    var primary = [];
    var fallback = [];
    for (var i = 0; i < tasks.length; i++) {
      var t = tasks[i];
      if (t.isOverdue || t.isToday || t.isSoon) primary.push(t);
      else fallback.push(t);
    }
    var summary = review && review.summary ? review.summary : {};
    var mode = String(summary.mode || 'balanced');
    var primaryLimit = mode === 'rescue' ? 8 : 12;
    var totalLimit = mode === 'rescue' ? 10 : (mode === 'caution' ? 14 : 20);
    if (primary.length >= primaryLimit) return primary.slice(0, primaryLimit);
    return primary.concat(fallback).slice(0, totalLimit);
  }

  function buildLockEntry(task, start) {
    if (!task || !/^\d{2}:\d{2}$/.test(String(start || ''))) return null;
    var startMin = timeToMinutes(start);
    var endMin = startMin + clampInt(task.duration_minutes || 0, 0, 24 * 60);
    return {
      task_id: String(task.id),
      start: minsToHHMM(startMin),
      end: minsToHHMM(endMin),
      startMin: startMin,
      endMin: endMin,
      duration_minutes: clampInt(task.duration_minutes || 0, 0, 24 * 60),
      title: String(task.title || ''),
      priority: String(task.priority || 'medium'),
      kind: String(task.kind || 'personal'),
      due_date: String(task.due_date || ''),
      activityAction: String(task.activityAction || ''),
      activityAt: String(task.activityAt || ''),
      expectedCostCents: clampInt(task.expectedCostCents || 0, 0, 1000000000),
      expectedCostCurrency: String(task.expectedCostCurrency || 'TRY'),
      costFlag: String(task.costFlag || ''),
      locked: true
    };
  }

  function validateLockCandidate(task, start, fixedRanges, acceptedLocks, dayStartMin, dayEndMin) {
    var lock = buildLockEntry(task, start);
    if (!lock) return { ok: false, reason: 'Choose a valid start time.' };
    if (lock.endMin > dayEndMin || lock.startMin < dayStartMin) {
      return { ok: false, reason: 'Locked slot must stay inside the planning day.' };
    }
    for (var i = 0; i < fixedRanges.length; i++) {
      if (overlaps(lock.startMin, lock.endMin, fixedRanges[i].startMin, fixedRanges[i].endMin)) {
        return { ok: false, reason: 'This time conflicts with a fixed time block.' };
      }
    }
    for (var j = 0; j < acceptedLocks.length; j++) {
      var cur = acceptedLocks[j];
      if (overlaps(lock.startMin, lock.endMin, cur.startMin, cur.endMin)) {
        return { ok: false, reason: 'This time conflicts with another locked task.' };
      }
    }
    return { ok: true, lock: lock };
  }

  function getValidatedLocks(taskMap, blocks, date) {
    var raw = locksForDate(date);
    raw.sort(function (a, b) {
      return timeToMinutes(String((a && a.start) || '00:00')) - timeToMinutes(String((b && b.start) || '00:00'));
    });

    var valid = [];
    var kept = [];
    var removedCount = 0;

    for (var i = 0; i < raw.length; i++) {
      var entry = raw[i] || {};
      var taskId = String(entry.task_id || '').trim();
      var task = taskMap[taskId];
      if (!task) { removedCount += 1; continue; }
      var out = validateLockCandidate(task, entry.start, blocks.fixed, valid, blocks.dayStartMin, blocks.dayEndMin);
      if (!out.ok) { removedCount += 1; continue; }
      valid.push(out.lock);
      kept.push({ task_id: taskId, start: out.lock.start });
    }

    if (removedCount > 0 || kept.length !== raw.length) saveLocksForDate(date, kept);
    return { locks: valid, removedCount: removedCount };
  }

  function subtractRangesFromFree(freeBlocks, ranges) {
    var result = freeBlocks.map(function (b) {
      return { startMin: b.startMin, endMin: b.endMin, duration: clampInt(b.duration, 0, 24 * 60), start: b.start, end: b.end };
    });

    for (var i = 0; i < ranges.length; i++) {
      var r = ranges[i];
      var next = [];
      for (var j = 0; j < result.length; j++) {
        var seg = result[j];
        if (!overlaps(seg.startMin, seg.endMin, r.startMin, r.endMin)) {
          next.push(seg);
          continue;
        }
        if (r.startMin > seg.startMin) {
          next.push({
            startMin: seg.startMin,
            endMin: r.startMin,
            duration: r.startMin - seg.startMin,
            start: minsToHHMM(seg.startMin),
            end: minsToHHMM(r.startMin)
          });
        }
        if (r.endMin < seg.endMin) {
          next.push({
            startMin: r.endMin,
            endMin: seg.endMin,
            duration: seg.endMin - r.endMin,
            start: minsToHHMM(r.endMin),
            end: minsToHHMM(seg.endMin)
          });
        }
      }
      result = next;
    }

    result = result.filter(function (x) { return clampInt(x.duration, 0, 24 * 60) > 0; });
    result.sort(function (a, b) { return a.startMin - b.startMin; });
    return result;
  }

  function buildTimeline(fixed, locked, scheduled) {
    var timeline = [];
    for (var i = 0; i < fixed.length; i++) {
      timeline.push({
        type: 'fixed',
        id: String(fixed[i].id),
        title: String(fixed[i].name),
        label: fixed[i].type,
        start: fixed[i].start,
        end: fixed[i].end,
        startMin: fixed[i].startMin,
        endMin: fixed[i].endMin,
        duration_minutes: Math.max(0, fixed[i].endMin - fixed[i].startMin)
      });
    }
    for (var j = 0; j < locked.length; j++) {
      var l = locked[j];
      timeline.push({
        type: 'task',
        locked: true,
        id: String(l.task_id),
        title: String(l.title),
        label: String(l.priority),
        start: l.start,
        end: l.end,
        startMin: l.startMin,
        endMin: l.endMin,
        due_date: l.due_date,
        duration_minutes: l.duration_minutes,
        kind: l.kind,
        activityAction: l.activityAction || '',
        activityAt: l.activityAt || '',
        todaySpendCents: clampInt(l.todaySpendCents || 0, 0, 1000000000),
        weekSpendCents: clampInt(l.weekSpendCents || 0, 0, 1000000000),
        linkedExpenseCount: clampInt(l.linkedExpenseCount || 0, 0, 999),
        expectedCostCents: clampInt(l.expectedCostCents || 0, 0, 1000000000),
        expectedCostCurrency: String(l.expectedCostCurrency || 'TRY'),
        costFlag: String(l.costFlag || '')
      });
    }
    for (var k = 0; k < scheduled.length; k++) {
      var s = scheduled[k];
      timeline.push({
        type: 'task',
        locked: false,
        id: String(s.task.id),
        title: String(s.task.title),
        label: s.task.priority,
        start: s.start,
        end: s.end,
        startMin: s.startMin,
        endMin: s.endMin,
        due_date: s.task.due_date,
        duration_minutes: s.task.duration_minutes,
        kind: s.task.kind,
        activityAction: s.task.activityAction || '',
        activityAt: s.task.activityAt || '',
        todaySpendCents: clampInt(s.task.todaySpendCents || 0, 0, 1000000000),
        weekSpendCents: clampInt(s.task.weekSpendCents || 0, 0, 1000000000),
        linkedExpenseCount: clampInt(s.task.linkedExpenseCount || 0, 0, 999),
        expectedCostCents: clampInt(s.task.expectedCostCents || 0, 0, 1000000000),
        expectedCostCurrency: String(s.task.expectedCostCurrency || 'TRY'),
        costFlag: String(s.task.costFlag || '')
      });
    }
    timeline.sort(function (a, b) {
      if (a.startMin !== b.startMin) return a.startMin - b.startMin;
      if (a.type !== b.type) return a.type === 'fixed' ? -1 : 1;
      if (!!a.locked !== !!b.locked) return a.locked ? -1 : 1;
      return 0;
    });
    return timeline;
  }

  function computePlan(rawTasks, activity, review, expenseCtx) {
    var state = getState();
    var today = todayYMD();
    var blocks = buildBlocks(state || {});
    var pressure = budgetPressure();

    var tasks = [];
    for (var i = 0; i < rawTasks.length; i++) {
      var nt = normalizeTask(rawTasks[i], today, activity, expenseCtx);
      if (nt) tasks.push(nt);
    }

    var taskMap = buildTaskMap(tasks);
    var lockState = getValidatedLocks(taskMap, blocks, today);
    var locked = lockState.locks || [];
    var lockedIdMap = {};
    var lockedMinutes = 0;
    for (var j = 0; j < locked.length; j++) {
      lockedIdMap[String(locked[j].task_id)] = true;
      lockedMinutes += clampInt(locked[j].duration_minutes || 0, 0, 24 * 60);
    }

    var freeAfterLocks = subtractRangesFromFree(blocks.free, locked);

    var scoredAll = [];
    for (var k = 0; k < tasks.length; k++) scoredAll.push(scoreTask(tasks[k], freeAfterLocks, pressure, review));
    sortTasks(scoredAll);

    var unlockedPool = scoredAll.filter(function (t) { return !lockedIdMap[String(t.id)]; });
    var postponedToday = unlockedPool.filter(function (t) { return !!t.isPostponedToday; });
    var candidates = pickCandidates(unlockedPool.filter(function (t) { return !t.isPostponedToday; }), review);

    var totalAvailable = clampInt(blocks.totalAvailable, 0, 24 * 60);
    var reviewSummary = review && review.summary ? review.summary : {};
    var reviewMode = String(reviewSummary.mode || 'balanced');
    var reserveRatio = reviewMode === 'rescue' ? 0.25 : (reviewMode === 'caution' ? 0.20 : 0.15);
    var reserveFloor = reviewMode === 'rescue' ? 45 : 30;
    var reserve = totalAvailable <= 90 ? 15 : Math.max(reserveFloor, Math.round(totalAvailable * reserveRatio));
    var capacityForAuto = Math.max(0, totalAvailable - reserve - lockedMinutes);
    var maxAutoTasks = clampInt(reviewSummary.recommended_max_auto || (reviewMode === 'rescue' ? 2 : reviewMode === 'caution' ? 3 : 4), 0, 8);
    var free = freeAfterLocks.map(function (b) {
      return { startMin: b.startMin, endMin: b.endMin, duration: clampInt(b.duration, 0, 24 * 60) };
    });

    var scheduled = [];
    var unscheduled = [];
    var usedAuto = 0;

    for (var x = 0; x < candidates.length; x++) {
      var task = candidates[x];
      var reason = '';
      if (maxAutoTasks > 0 && scheduled.length >= maxAutoTasks && !(task.isOverdue || task.isToday)) reason = reviewMode === 'rescue' ? 'Review mode is intentionally keeping today lighter so carry-over can shrink first.' : 'Today is intentionally capped so the plan stays executable.';
      if (usedAuto + task.duration_minutes > capacityForAuto) reason = 'No safe capacity left after respecting today\'s buffer.';

      var fitIndex = -1;
      if (!reason) {
        for (var b = 0; b < free.length; b++) {
          var block = free[b];
          if (block.duration >= task.duration_minutes) {
            fitIndex = b;
            break;
          }
        }
        if (fitIndex < 0) reason = 'No free time block fits this task.';
      }

      if (reason) {
        unscheduled.push({ task: task, reason: reason });
        continue;
      }

      var slot = free[fitIndex];
      var startMin = slot.startMin;
      var endMin = startMin + task.duration_minutes;
      scheduled.push({ task: task, startMin: startMin, endMin: endMin, start: minsToHHMM(startMin), end: minsToHHMM(endMin) });
      slot.startMin = endMin;
      slot.duration = Math.max(0, slot.endMin - slot.startMin);
      usedAuto += task.duration_minutes;
    }

    postponedToday.forEach(function (task) {
      unscheduled.push({ task: task, reason: 'Postponed for today. It will come back in the next planning cycle.' });
    });

    var planCurrency = String((pressure && pressure.currency) || ((expenseCtx && expenseCtx.currency) || 'TRY'));
    var expectedSummary = {
      currency: planCurrency,
      taskCount: 0,
      plannedCents: 0,
      unscheduledCents: 0,
      overAllowanceCount: 0,
      overRemainingCount: 0,
      blockedCount: 0,
      mismatchCount: 0,
      dueSoonCents: 0
    };

    tasks.forEach(function (task) {
      if ((task.expectedCostCents || 0) <= 0) return;
      expectedSummary.taskCount += 1;
      if (String(task.expectedCostCurrency || 'TRY') !== planCurrency) {
        expectedSummary.mismatchCount += 1;
        return;
      }
      if (task.isOverdue || task.isToday || task.isSoon) {
        expectedSummary.dueSoonCents += clampInt(task.expectedCostCents || 0, 0, 1000000000);
      }
      if (task.costFlag === 'over_remaining') expectedSummary.overRemainingCount += 1;
      else if (task.costFlag === 'over_allowance') expectedSummary.overAllowanceCount += 1;
      else if (task.costFlag === 'budget_blocked') expectedSummary.blockedCount += 1;
    });

    locked.forEach(function (entry) {
      if ((entry.expectedCostCents || 0) > 0 && String(entry.expectedCostCurrency || 'TRY') === planCurrency) {
        expectedSummary.plannedCents += clampInt(entry.expectedCostCents || 0, 0, 1000000000);
      }
    });
    scheduled.forEach(function (entry) {
      if ((entry.task.expectedCostCents || 0) > 0 && String(entry.task.expectedCostCurrency || 'TRY') === planCurrency) {
        expectedSummary.plannedCents += clampInt(entry.task.expectedCostCents || 0, 0, 1000000000);
      }
    });
    unscheduled.forEach(function (entry) {
      if ((entry.task.expectedCostCents || 0) > 0 && String(entry.task.expectedCostCurrency || 'TRY') === planCurrency) {
        expectedSummary.unscheduledCents += clampInt(entry.task.expectedCostCents || 0, 0, 1000000000);
      }
    });

    var warnings = [];
    if (review && review.decision) {
      warnings.push({ level: reviewMode === 'rescue' ? 'danger' : (reviewMode === 'caution' ? 'warn' : 'info'), text: review.decision });
    }
    if (!blocks.fixed.length) warnings.push({ level: 'info', text: 'Add fixed time blocks to make the daily plan more realistic.' });
    if (lockState.removedCount > 0) warnings.push({ level: 'warn', text: lockState.removedCount + ' invalid manual lock' + (lockState.removedCount > 1 ? 's were' : ' was') + ' removed because it no longer fit today.' });
    if (locked.length > 0) warnings.push({ level: 'lock', text: locked.length + ' task' + (locked.length > 1 ? 's are' : ' is') + ' manually locked and protected from replanning.' });

    var overdueCount = 0;
    for (var y = 0; y < tasks.length; y++) if (tasks[y].isOverdue) overdueCount += 1;
    if (overdueCount > 0) warnings.push({ level: 'danger', text: overdueCount + ' overdue task' + (overdueCount > 1 ? 's need' : ' needs') + ' attention.' });
    if (unscheduled.length > 0) warnings.push({ level: 'warn', text: unscheduled.length + ' task' + (unscheduled.length > 1 ? 's were' : ' was') + ' left outside today\'s safe schedule.' });
    if (pressure.level === 'warning' || pressure.level === 'critical') {
      warnings.push({ level: pressure.level === 'critical' ? 'danger' : 'warn', text: pressure.label + (pressure.allowance > 0 ? ' Safe daily allowance: ' + fmtMoneyFromCents(pressure.allowance, pressure.currency) + '.' : '') });
    }
    if (expenseCtx && expenseCtx.linkedTodayCents > 0) {
      warnings.push({ level: 'info', text: 'Today already has ' + fmtMoneyFromCents(expenseCtx.linkedTodayCents, expenseCtx.currency) + ' linked to tasks. Finish the work you already spent on first.' });
    } else if (expenseCtx && expenseCtx.todayTotalCents > 0) {
      warnings.push({ level: 'info', text: 'You have spending today, but none of it is linked to a task yet. Link important expenses so planning reflects real effort.' });
    }
    if (expectedSummary.overRemainingCount > 0) {
      warnings.push({ level: 'warn', text: expectedSummary.overRemainingCount + ' task' + (expectedSummary.overRemainingCount > 1 ? 's need' : ' needs') + ' more money than the remaining monthly budget.' });
    } else if (expectedSummary.overAllowanceCount > 0) {
      warnings.push({ level: 'warn', text: expectedSummary.overAllowanceCount + ' task' + (expectedSummary.overAllowanceCount > 1 ? 's cost' : ' costs') + ' more than today\'s safe allowance.' });
    } else if (expectedSummary.blockedCount > 0) {
      warnings.push({ level: 'warn', text: 'Budget is exhausted, so cost-heavy tasks are being deprioritized unless they are urgent.' });
    }
    if (expectedSummary.mismatchCount > 0) {
      warnings.push({ level: 'info', text: expectedSummary.mismatchCount + ' task' + (expectedSummary.mismatchCount > 1 ? 's use a different currency' : ' uses a different currency') + ' and was excluded from budget-aware scoring.' });
    }
    var actSummary = activity && activity.summary ? activity.summary : { started: 0, completed: 0, postponed: 0 };
    if ((actSummary.started || actSummary.completed || actSummary.postponed)) {
      warnings.push({ level: 'info', text: 'Today execution: Started ' + clampInt(actSummary.started || 0, 0, 9999) + ' • Completed ' + clampInt(actSummary.completed || 0, 0, 9999) + ' • Postponed ' + clampInt(actSummary.postponed || 0, 0, 9999) + '.' });
    }
    if (!warnings.length) warnings.push({ level: 'info', text: 'Today plan is balanced. Keep the remaining buffer for interruptions.' });

    var totalPlanned = lockedMinutes + usedAuto;

    return {
      date: today,
      taskMap: taskMap,
      topPriorities: scoredAll.slice(0, 3),
      fixed: blocks.fixed,
      locked: locked,
      scheduled: scheduled,
      timeline: buildTimeline(blocks.fixed, locked, scheduled),
      unscheduled: unscheduled,
      warnings: warnings,
      summary: {
        available: totalAvailable,
        locked: lockedMinutes,
        auto: usedAuto,
        totalPlanned: totalPlanned,
        expectedPlannedCostCents: expectedSummary.plannedCents,
        buffer: Math.max(0, totalAvailable - totalPlanned),
        unscheduledCount: unscheduled.length,
        dayStart: blocks.dayStart,
        dayEnd: blocks.dayEnd,
        lockCount: locked.length,
        startedToday: clampInt(actSummary.started || 0, 0, 9999),
        completedToday: clampInt(actSummary.completed || 0, 0, 9999),
        postponedToday: clampInt(actSummary.postponed || 0, 0, 9999)
      },
      pressure: pressure,
      activity: actSummary,
      review: review || normalizeReview({}),
      expenses: expenseCtx || normalizeExpenseContext([], today, startOfWeekYMD(today)),
      expectedCosts: expectedSummary
    };
  }

  function renderPriorities(list, rootEl) {
    var state = getState();
    var c = core();
    var root = rootEl || qs('#prioList');
    if (!root || !state) return;
    root.innerHTML = '';

    if (!list || !list.length) {
      var empty = document.createElement('div');
      empty.className = 'muted';
      empty.textContent = 'No priorities yet.';
      root.appendChild(empty);
      return;
    }

    for (var i = 0; i < list.length; i++) {
      var t = list[i];
      var row = document.createElement('div');
      row.className = 'prio-row' + (isPendingTaskId(t.id) ? ' is-pending' : '');
      row.setAttribute('data-task-id', String(t.id));

      var chk = (c && c.buildCheck) ? c.buildCheck(t.status === 'done', isPendingTaskId(t.id)) : null;
      if (chk) row.appendChild(chk);

      var txt = document.createElement('div');
      txt.className = 'prio-row__text';
      txt.textContent = String(t.title || '');
      row.appendChild(txt);

      var pill = document.createElement('span');
      pill.className = pillClassForPriority(t.priority);
      pill.textContent = priorityLabel(t.priority);
      row.appendChild(pill);

      root.appendChild(row);
    }

    if (c && c.markPendingInDom) c.markPendingInDom();
  }

  function renderStats(plan) {
    var root = qs('#todayPlanStats');
    if (!root) return;
    root.innerHTML = '';

    var stats = [
      { label: 'Available', value: fmtDuration(plan.summary.available) || '0m', tone: '' },
      { label: 'Locked', value: fmtDuration(plan.summary.locked) || '0m', tone: plan.summary.locked > 0 ? 'lock' : '' },
      { label: 'Auto Planned', value: fmtDuration(plan.summary.auto) || '0m', tone: '' },
      { label: 'Expected Cost', value: fmtMoneyFromCents(plan.expectedCosts && plan.expectedCosts.plannedCents || 0, plan.expectedCosts && plan.expectedCosts.currency || 'TRY'), tone: plan.expectedCosts && plan.expectedCosts.plannedCents > 0 ? 'expense' : '' },
      { label: 'Linked Spend', value: fmtMoneyFromCents(plan.expenses && plan.expenses.linkedTodayCents || 0, plan.expenses && plan.expenses.currency || 'TRY'), tone: plan.expenses && plan.expenses.linkedTodayCents > 0 ? 'expense' : '' },
      { label: 'Buffer', value: fmtDuration(plan.summary.buffer) || '0m', tone: plan.summary.buffer <= 30 ? 'warn' : '' },
      { label: 'Unscheduled', value: String(plan.summary.unscheduledCount), tone: plan.summary.unscheduledCount > 0 ? 'danger' : '' }
    ];

    for (var i = 0; i < stats.length; i++) {
      var s = stats[i];
      var card = document.createElement('div');
      card.className = 'tp-stat' + (s.tone ? (' tp-stat--' + s.tone) : '');

      var lab = document.createElement('div');
      lab.className = 'tp-stat__label';
      lab.textContent = s.label;
      card.appendChild(lab);

      var val = document.createElement('div');
      val.className = 'tp-stat__value';
      val.textContent = s.value;
      card.appendChild(val);

      root.appendChild(card);
    }
  }

  function renderWarnings(plan) {
    var root = qs('#todayPlanWarnings');
    if (!root) return;
    root.innerHTML = '';

    (plan.warnings || []).forEach(function (w) {
      var row = document.createElement('div');
      row.className = 'tp-warning tp-warning--' + String(w.level || 'info');

      var dot = document.createElement('div');
      dot.className = 'tp-warning__dot';
      row.appendChild(dot);

      var txt = document.createElement('div');
      txt.className = 'tp-warning__text';
      txt.textContent = String(w.text || '');
      row.appendChild(txt);

      root.appendChild(row);
    });
  }

  function appendChip(side, label, cls) {
    var chip = document.createElement('span');
    chip.className = 'tp-chip tp-chip--' + String(cls || 'light');
    chip.textContent = String(label || '');
    side.appendChild(chip);
  }

  function appendActionButton(side, label, action, taskId, start, detailKey) {
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'tp-action tp-action--' + String(action || 'manual');
    btn.textContent = String(label || 'Action');
    btn.setAttribute('data-tp-action', String(action || 'manual'));
    btn.setAttribute('data-task-id', String(taskId || ''));
    if (start) btn.setAttribute('data-start', String(start));
    if (detailKey) btn.setAttribute('data-detail-key', String(detailKey));
    side.appendChild(btn);
  }

  function resetDetailItems() {
    _detailItems = {};
    _detailSeq = 0;
  }

  function registerDetailItem(kind, item) {
    _detailSeq += 1;
    var key = String(kind || 'item') + '_' + String(_detailSeq);
    _detailItems[key] = { kind: String(kind || 'item'), item: item || {} };
    return key;
  }

  function detailItemByKey(key) {
    return key ? (_detailItems[String(key)] || null) : null;
  }

  function openTaskEditor(taskId) {
    if (!taskId || isPendingTaskId(taskId)) return;
    if (LN.tasks && typeof LN.tasks.openEditor === 'function') {
      LN.tasks.openEditor(taskId).catch(function () {});
    }
  }

  function detailMetaItem(label, value) {
    if (!value) return '';
    return '<div class="today-plan-detail__meta-item"><span class="today-plan-detail__meta-label">' + String(label) + '</span><strong class="today-plan-detail__meta-value">' + String(value) + '</strong></div>';
  }

  function detailActionButton(label, action, taskId, start) {
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'tp-action tp-action--' + String(action || 'manual');
    btn.textContent = String(label || 'Action');
    btn.setAttribute('data-tp-detail-action', String(action || 'manual'));
    btn.setAttribute('data-task-id', String(taskId || ''));
    if (start) btn.setAttribute('data-start', String(start || ''));
    return btn;
  }

  function closeDetailModal() {
    if (window.LifeNestUI && typeof window.LifeNestUI.closeModal === 'function') {
      window.LifeNestUI.closeModal('modalTodayPlanDetails');
      return;
    }
    var modal = qs('#modalTodayPlanDetails');
    if (modal) modal.setAttribute('aria-hidden', 'true');
  }

  function renderDetailModal(entry) {
    var modal = qs('#modalTodayPlanDetails');
    if (!modal || !entry) return;
    var item = entry.item || {};
    var isTask = entry.kind === 'timeline-task' || entry.kind === 'queue-task';
    var title = qs('#todayPlanDetailTitle', modal);
    var eyebrow = qs('#todayPlanDetailEyebrow', modal);
    var summary = qs('#todayPlanDetailSummary', modal);
    var meta = qs('#todayPlanDetailMeta', modal);
    var chips = qs('#todayPlanDetailChips', modal);
    var actions = qs('#todayPlanDetailActions', modal);
    if (!title || !eyebrow || !summary || !meta || !chips || !actions) return;

    title.textContent = isTask ? 'Task details' : 'Block details';
    eyebrow.textContent = entry.kind === 'queue-task' ? 'Needs attention' : 'Today timeline';
    summary.textContent = String(item.title || item.reason || 'Plan item');

    var metaParts = [];
    if (item.start && item.end) metaParts.push(detailMetaItem('Time', fmtRange(item.start, item.end)));
    else metaParts.push(detailMetaItem('Time', 'Not scheduled'));
    if (item.duration_minutes) metaParts.push(detailMetaItem('Duration', fmtDuration(item.duration_minutes)));
    if (item.kind) metaParts.push(detailMetaItem('Type', item.kind === 'study' ? 'Study' : 'Personal'));
    if (item.due_date) metaParts.push(detailMetaItem('Due', String(item.due_date)));
    if (item.locked) metaParts.push(detailMetaItem('Lock', 'Manual lock active'));
    if (item.activityAction === 'started') metaParts.push(detailMetaItem('Progress', 'Started today'));
    if (item.activityAction === 'postponed') metaParts.push(detailMetaItem('Progress', 'Postponed today'));
    if (item.expectedCostCents > 0) metaParts.push(detailMetaItem('Expected cost', fmtMoneyFromCents(item.expectedCostCents, item.expectedCostCurrency || ((getState() && getState().currency) || 'TRY'))));
    if (item.todaySpendCents > 0) metaParts.push(detailMetaItem('Spent today', fmtMoneyFromCents(item.todaySpendCents, (getState() && getState().currency) || 'TRY')));
    else if (item.weekSpendCents > 0) metaParts.push(detailMetaItem('Spent this week', fmtMoneyFromCents(item.weekSpendCents, (getState() && getState().currency) || 'TRY')));
    if (entry.kind === 'queue-task' && item.reason) metaParts.push(detailMetaItem('Why here', String(item.reason)));
    meta.innerHTML = metaParts.join('');

    chips.innerHTML = '';
    if (entry.kind === 'timeline-fixed') {
      appendChip(chips, item.label === 'admin' ? 'Admin' : (item.label === 'low' ? 'Low' : 'Focus'), item.label || 'light');
    } else {
      if (item.activityAction === 'started') appendChip(chips, 'Started', 'started');
      if (item.locked) appendChip(chips, 'Locked', 'lock');
      if (item.expectedCostCents > 0) appendChip(chips, 'Expected ' + fmtMoneyFromCents(item.expectedCostCents, item.expectedCostCurrency || ((getState() && getState().currency) || 'TRY')), (item.costFlag === 'over_remaining' || item.costFlag === 'budget_blocked') ? 'warn' : 'expense');
      appendChip(chips, priorityLabel(item.label || item.priority), item.label || item.priority || 'light');
    }

    actions.innerHTML = '';
    if (!isTask) {
      actions.appendChild(detailActionButton('Close', 'close', '', ''));
      return;
    }

    actions.appendChild(detailActionButton('Open task', 'open-task', item.id, ''));
    if (item.locked) {
      actions.appendChild(detailActionButton('Unlock', 'unlock', item.id, ''));
      actions.appendChild(detailActionButton('Move', 'manual', item.id, item.start || ''));
    } else {
      actions.appendChild(detailActionButton('Lock slot', 'lock', item.id, item.start || ''));
      actions.appendChild(detailActionButton('Set time', 'manual', item.id, item.start || ''));
    }
    if (item.activityAction !== 'started') actions.appendChild(detailActionButton('Start', 'start', item.id, ''));
    actions.appendChild(detailActionButton('Expense', 'expense', item.id, ''));
    actions.appendChild(detailActionButton('Done', 'complete', item.id, ''));
    actions.appendChild(detailActionButton('Postpone', 'postpone', item.id, ''));
  }

  function openDetailModalByKey(key) {
    var entry = detailItemByKey(key);
    if (!entry) return false;
    renderDetailModal(entry);
    var opened = false;
    if (window.LifeNestUI && typeof window.LifeNestUI.openModal === 'function') {
      opened = window.LifeNestUI.openModal('todayPlanDetails') === true;
    }
    if (opened) return true;
    var modal = qs('#modalTodayPlanDetails');
    if (!modal) return false;
    modal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('ln-modal-open');
    return true;
  }

  function runDetailAction(action, taskId, start) {
    if (action === 'close') {
      closeDetailModal();
      return true;
    }
    if (action === 'open-task') {
      closeDetailModal();
      openTaskEditor(taskId);
      return true;
    }
    closeDetailModal();
    return handlePlanAction(action, taskId, start || '');
  }

  function buildScheduleRow(item) {
    var row = document.createElement('div');
    row.className = 'tp-row tp-row--' + item.type + (item.type === 'task' ? ' tp-row--task' : '') + (item.locked ? ' tp-row--locked' : '');
    if (item.type === 'task') {
      row.setAttribute('data-task-id', String(item.id));
      row.setAttribute('data-activity', String(item.activityAction || ''));
      row.setAttribute('tabindex', '0');
      row.setAttribute('role', 'button');
      row.setAttribute('aria-label', 'Open task details ' + String(item.title || ''));
    }

    var time = document.createElement('div');
    time.className = 'tp-row__time';
    time.textContent = fmtRange(item.start, item.end);
    row.appendChild(time);

    var main = document.createElement('div');
    main.className = 'tp-row__main';

    var title = document.createElement('div');
    title.className = 'tp-row__title';
    title.textContent = String(item.title || '');
    main.appendChild(title);

    var meta = document.createElement('div');
    meta.className = 'tp-row__meta';
    var duration = document.createElement('span');
    duration.textContent = fmtDuration(item.duration_minutes);
    meta.appendChild(duration);
    if (item.type === 'task' && item.due_date) {
      var due = document.createElement('span');
      due.textContent = 'Due ' + item.due_date;
      meta.appendChild(due);
    }
    if (item.type === 'task') {
      var kind = document.createElement('span');
      kind.textContent = item.kind === 'study' ? 'Study' : 'Personal';
      meta.appendChild(kind);
    }
    if (item.locked) {
      var lockedMeta = document.createElement('span');
      lockedMeta.textContent = 'Manual lock';
      meta.appendChild(lockedMeta);
    }
    if (item.activityAction === 'started') {
      var startedMeta = document.createElement('span');
      startedMeta.textContent = 'Started today';
      meta.appendChild(startedMeta);
    }
    if (item.activityAction === 'postponed') {
      var postponedMeta = document.createElement('span');
      postponedMeta.textContent = 'Postponed today';
      meta.appendChild(postponedMeta);
    }
    if (item.expectedCostCents > 0) {
      var expectedMeta = document.createElement('span');
      expectedMeta.textContent = 'Expected ' + fmtMoneyFromCents(item.expectedCostCents, item.expectedCostCurrency || ((getState() && getState().currency) || 'TRY'));
      meta.appendChild(expectedMeta);
    }
    if (item.todaySpendCents > 0) {
      var spendToday = document.createElement('span');
      spendToday.textContent = 'Spent today ' + fmtMoneyFromCents(item.todaySpendCents, (getState() && getState().currency) || 'TRY');
      meta.appendChild(spendToday);
    } else if (item.weekSpendCents > 0) {
      var spendWeek = document.createElement('span');
      spendWeek.textContent = 'Spent this week ' + fmtMoneyFromCents(item.weekSpendCents, (getState() && getState().currency) || 'TRY');
      meta.appendChild(spendWeek);
    }
    main.appendChild(meta);
    row.appendChild(main);

    var side = document.createElement('div');
    side.className = 'tp-row__side';
    if (item.type === 'fixed') {
      appendChip(side, item.label === 'admin' ? 'Admin' : (item.label === 'low' ? 'Low' : 'Focus'), item.label);
      var fixedDetailKey = registerDetailItem('timeline-fixed', item);
      row.setAttribute('data-detail-key', fixedDetailKey);
      appendActionButton(side, 'View details', 'details', '', item.start, fixedDetailKey);
    } else {
      if (item.activityAction === 'started') appendChip(side, 'Started', 'started');
      if (item.locked) appendChip(side, 'Locked', 'lock');
      if (item.expectedCostCents > 0) appendChip(side, 'Expected ' + fmtMoneyFromCents(item.expectedCostCents, item.expectedCostCurrency || ((getState() && getState().currency) || 'TRY')), (item.costFlag === 'over_remaining' || item.costFlag === 'budget_blocked') ? 'warn' : 'expense');
      if (item.todaySpendCents > 0) appendChip(side, fmtMoneyFromCents(item.todaySpendCents, (getState() && getState().currency) || 'TRY'), 'expense');
      appendChip(side, priorityLabel(item.label), item.label || 'light');
      var taskDetailKey = registerDetailItem('timeline-task', item);
      row.setAttribute('data-detail-key', taskDetailKey);
      appendActionButton(side, 'View details', 'details', item.id, item.start, taskDetailKey);
    }
    row.appendChild(side);
    return row;
  }

  function renderSchedule(plan) {
    var root = qs('#todayPlanSchedule');
    if (!root) return;
    root.innerHTML = '';

    if (!plan.timeline || !plan.timeline.length) {
      var empty = document.createElement('div');
      empty.className = 'tp-row tp-row--empty';
      empty.textContent = 'No schedule yet. Add tasks or fixed blocks.';
      root.appendChild(empty);
      return;
    }

    plan.timeline.forEach(function (item) {
      root.appendChild(buildScheduleRow(item));
    });
  }

  function buildQueueRow(entry) {
    var row = document.createElement('div');
    row.className = 'tp-row tp-row--task';
    row.setAttribute('data-task-id', String(entry.task.id));
    row.setAttribute('tabindex', '0');
    row.setAttribute('role', 'button');
    row.setAttribute('aria-label', 'Open task details ' + String(entry.task.title || ''));

    var time = document.createElement('div');
    time.className = 'tp-row__time';
    time.textContent = 'Not scheduled';
    row.appendChild(time);

    var main = document.createElement('div');
    main.className = 'tp-row__main';

    var title = document.createElement('div');
    title.className = 'tp-row__title';
    title.textContent = String(entry.task.title || '');
    main.appendChild(title);

    var meta = document.createElement('div');
    meta.className = 'tp-row__meta';
    var reason = document.createElement('span');
    reason.textContent = String(entry.reason || 'Needs manual planning.');
    meta.appendChild(reason);
    var duration = document.createElement('span');
    duration.textContent = fmtDuration(entry.task.duration_minutes);
    meta.appendChild(duration);
    if (entry.task.due_date) {
      var due = document.createElement('span');
      due.textContent = 'Due ' + entry.task.due_date;
      meta.appendChild(due);
    }
    if (entry.task.expectedCostCents > 0) {
      var expectedCostMeta = document.createElement('span');
      expectedCostMeta.textContent = 'Expected ' + fmtMoneyFromCents(entry.task.expectedCostCents, entry.task.expectedCostCurrency || ((getState() && getState().currency) || 'TRY'));
      meta.appendChild(expectedCostMeta);
    }
    if (entry.task.todaySpendCents > 0) {
      var spendMeta = document.createElement('span');
      spendMeta.textContent = 'Spent today ' + fmtMoneyFromCents(entry.task.todaySpendCents, (getState() && getState().currency) || 'TRY');
      meta.appendChild(spendMeta);
    } else if (entry.task.weekSpendCents > 0) {
      var spendWeekMeta = document.createElement('span');
      spendWeekMeta.textContent = 'Spent this week ' + fmtMoneyFromCents(entry.task.weekSpendCents, (getState() && getState().currency) || 'TRY');
      meta.appendChild(spendWeekMeta);
    }
    main.appendChild(meta);
    row.appendChild(main);

    var side = document.createElement('div');
    side.className = 'tp-row__side';
    if (entry.task.expectedCostCents > 0) appendChip(side, 'Expected ' + fmtMoneyFromCents(entry.task.expectedCostCents, entry.task.expectedCostCurrency || ((getState() && getState().currency) || 'TRY')), (entry.task.costFlag === 'over_remaining' || entry.task.costFlag === 'budget_blocked') ? 'warn' : 'expense');
    appendChip(side, priorityLabel(entry.task.priority), entry.task.priority);
    var queueDetailKey = registerDetailItem('queue-task', {
      id: entry.task.id,
      title: entry.task.title,
      duration_minutes: entry.task.duration_minutes,
      due_date: entry.task.due_date,
      priority: entry.task.priority,
      label: entry.task.priority,
      kind: entry.task.kind,
      expectedCostCents: entry.task.expectedCostCents,
      expectedCostCurrency: entry.task.expectedCostCurrency,
      todaySpendCents: entry.task.todaySpendCents,
      weekSpendCents: entry.task.weekSpendCents,
      costFlag: entry.task.costFlag,
      reason: entry.reason,
      start: entry.suggestedStart || ''
    });
    row.setAttribute('data-detail-key', queueDetailKey);
    appendActionButton(side, 'View details', 'details', entry.task.id, entry.suggestedStart || '', queueDetailKey);
    row.appendChild(side);

    return row;
  }

  function renderQueue(plan) {
    var root = qs('#todayPlanQueue');
    if (!root) return;
    root.innerHTML = '';

    if (!plan.unscheduled || !plan.unscheduled.length) {
      var ok = document.createElement('div');
      ok.className = 'tp-row tp-row--muted';
      ok.textContent = 'Nothing urgent is waiting outside the plan.';
      root.appendChild(ok);
      return;
    }

    plan.unscheduled.forEach(function (entry) {
      root.appendChild(buildQueueRow(entry));
    });
  }

  function fetchPlannerTasks() {
    var c = core();
    if (!c || !c.api) return Promise.resolve([]);
    return c.api('GET', '/api/tasks.php?tab=all&status=todo&limit=200').then(function (d) {
      var list = (d && Array.isArray(d.tasks)) ? d.tasks : [];
      rememberTasks(list);
      return list;
    }).catch(function () {
      rememberTasks([]);
      return [];
    });
  }

  function fetchPlannerContext() {
    var date = todayYMD();
    return Promise.all([fetchPlannerTasks(), fetchActivityForDate(date), fetchReviewForPlan()]).then(function (parts) {
      var review = parts[2] || normalizeReview({});
      return fetchExpenseContextForPlan(review).then(function (expenses) {
        return {
          tasks: parts[0] || [],
          activity: parts[1] || { latest_by_task: {}, summary: { started: 0, completed: 0, postponed: 0 } },
          review: review,
          expenses: expenses
        };
      });
    });
  }

  function setManualHint(text, tone) {
    var el = qs('#todayPlanManualHint');
    if (!el) return;
    el.textContent = String(text || '');
    el.classList.remove('is-error', 'is-info');
    if (tone === 'error') el.classList.add('is-error');
    if (tone === 'info') el.classList.add('is-info');
  }

  function hideManualEditor() {
    var box = qs('#todayPlanManual');
    if (!box) return;
    _manualDraft = null;
    box.hidden = true;
    setManualHint('', '');
  }

  function syncManualEditor() {
    var box = qs('#todayPlanManual');
    if (!box || !_manualDraft || !_lastPlan) {
      if (box) box.hidden = true;
      return;
    }

    var task = _lastPlan.taskMap ? _lastPlan.taskMap[String(_manualDraft.taskId || '')] : null;
    if (!task) {
      hideManualEditor();
      return;
    }

    box.hidden = false;
    var taskEl = qs('#todayPlanManualTask');
    var durEl = qs('#todayPlanManualDuration');
    var titleEl = qs('#todayPlanManualTitle');
    var startEl = qs('#todayPlanManualStart');

    if (taskEl) taskEl.textContent = String(task.title || '');
    if (durEl) durEl.textContent = fmtDuration(task.duration_minutes);
    if (titleEl) titleEl.textContent = 'Lock a fixed start for “' + String(task.title || '') + '”';
    if (startEl) {
      startEl.value = String(_manualDraft.start || '');
      startEl.min = _lastPlan.summary.dayStart || '08:00';
      startEl.max = _lastPlan.summary.dayEnd || '23:00';
    }

    var isLocked = false;
    for (var i = 0; i < (_lastPlan.locked || []).length; i++) {
      if (String(_lastPlan.locked[i].task_id || '') === String(task.id)) {
        isLocked = true;
        if (!_manualDraft.start) _manualDraft.start = _lastPlan.locked[i].start;
        break;
      }
    }

    setManualHint(isLocked ? 'This task is already manually locked. Change the start time and save to move it.' : 'Locked tasks stay in place even after replanning.', 'info');
  }

  function openManualEditor(taskId, suggestedStart) {
    if (!_lastPlan || !_lastPlan.taskMap) return;
    var task = _lastPlan.taskMap[String(taskId || '')];
    if (!task) return;
    _manualDraft = {
      taskId: String(task.id),
      start: String(suggestedStart || '') || (_lastPlan.summary.dayStart || '08:00')
    };
    syncManualEditor();
    try {
      var input = qs('#todayPlanManualStart');
      if (input) input.focus();
    } catch (_) {}
  }

  function saveManualFromForm() {
    if (!_lastPlan || !_manualDraft) return;
    var task = _lastPlan.taskMap ? _lastPlan.taskMap[String(_manualDraft.taskId || '')] : null;
    if (!task) {
      setManualHint('This task is no longer available for today.', 'error');
      return;
    }
    if (isPendingTaskId(task.id)) {
      setManualHint('Please wait until the pending action on this task finishes.', 'error');
      return;
    }
    var input = qs('#todayPlanManualStart');
    var start = input ? String(input.value || '').trim() : '';
    var others = (_lastPlan.locked || []).filter(function (x) { return String(x.task_id || '') !== String(task.id); });
    var out = validateLockCandidate(task, start, _lastPlan.fixed || [], others, timeToMinutes(_lastPlan.summary.dayStart || '08:00'), timeToMinutes(_lastPlan.summary.dayEnd || '23:00'));
    if (!out.ok) {
      setManualHint(out.reason, 'error');
      return;
    }
    upsertLock(_lastPlan.date || todayYMD(), task.id, out.lock.start);
    setManualHint('Locked. Rebuilding today plan…', 'info');
    hideManualEditor();
    scheduleRefresh({ immediate: true, announce: true });
  }

  function lockTaskAtStart(taskId, start) {
    if (!_lastPlan || !_lastPlan.taskMap) return;
    var task = _lastPlan.taskMap[String(taskId || '')];
    if (!task) return;
    if (isPendingTaskId(task.id)) return;
    var others = (_lastPlan.locked || []).filter(function (x) { return String(x.task_id || '') !== String(task.id); });
    var out = validateLockCandidate(task, start, _lastPlan.fixed || [], others, timeToMinutes(_lastPlan.summary.dayStart || '08:00'), timeToMinutes(_lastPlan.summary.dayEnd || '23:00'));
    if (!out.ok) {
      openManualEditor(task.id, start || _lastPlan.summary.dayStart || '08:00');
      setManualHint(out.reason, 'error');
      return;
    }
    upsertLock(_lastPlan.date || todayYMD(), task.id, out.lock.start);
    scheduleRefresh({ immediate: true, announce: true });
  }

  function unlockTask(taskId) {
    if (!_lastPlan) return;
    removeLock(_lastPlan.date || todayYMD(), taskId);
    if (_manualDraft && String(_manualDraft.taskId || '') === String(taskId || '')) hideManualEditor();
    scheduleRefresh({ immediate: true, announce: true });
  }


  function renderExpenseBridge(plan) {
    var box = qs('#todayPlanExpenseBridge');
    var statsRoot = qs('#todayPlanExpenseStats');
    var badge = qs('#todayPlanExpenseBadge');
    var hint = qs('#todayPlanExpenseHint');
    if (!box || !statsRoot || !badge || !hint) return;

    var exp = plan && plan.expenses ? plan.expenses : null;
    if (!exp) {
      box.hidden = true;
      return;
    }

    box.hidden = false;
    statsRoot.innerHTML = '';

    var cards = [
      { label: 'Today Spent', value: fmtMoneyFromCents(exp.todayTotalCents || 0, exp.currency || 'TRY') },
      { label: 'Linked to Tasks', value: fmtMoneyFromCents(exp.linkedTodayCents || 0, exp.currency || 'TRY') },
      { label: 'Study', value: fmtMoneyFromCents((exp.todayByArea && exp.todayByArea.study) || 0, exp.currency || 'TRY') },
      { label: 'Personal', value: fmtMoneyFromCents((exp.todayByArea && exp.todayByArea.personal) || 0, exp.currency || 'TRY') }
    ];

    cards.forEach(function (card) {
      var el = document.createElement('div');
      el.className = 'today-plan__expense-card';
      var label = document.createElement('div');
      label.className = 'today-plan__expense-card-label';
      label.textContent = card.label;
      var value = document.createElement('div');
      value.className = 'today-plan__expense-card-value';
      value.textContent = card.value;
      el.appendChild(label);
      el.appendChild(value);
      statsRoot.appendChild(el);
    });

    badge.textContent = exp.linkedTodayCents > 0 ? 'Linked spending is now affecting planning' : 'No task-linked spending yet today';

    var topTaskId = '';
    var topTask = null;
    Object.keys(exp.byTask || {}).forEach(function (taskId) {
      var cur = exp.byTask[taskId];
      if (!topTask || clampInt(cur.todayCents || 0, 0, 1000000000) > clampInt(topTask.todayCents || 0, 0, 1000000000)) {
        topTask = cur;
        topTaskId = taskId;
      }
    });

    if (exp.linkedTodayCents > 0 && topTask && topTask.todayCents > 0) {
      hint.textContent = 'Highest linked spend today is on “' + String(topTask.title || 'this task') + '”. Prefer finishing it before adding new optional work.';
    } else if (exp.todayTotalCents > 0) {
      hint.textContent = 'You already spent money today, but none of it is tied to a task yet. Link meaningful expenses so Today Plan can learn from them.';
    } else {
      hint.textContent = 'Use “Expense” from any task row when a purchase belongs to that work. Then Today Plan and weekly review can connect time with money.';
    }
  }

  function applyPlan(plan) {
    _lastPlan = plan;
    resetDetailItems();
    renderPriorities(plan.topPriorities || []);
    renderTimeBlocks();
    renderDecision(_lastReview, plan);
    renderStats(plan);
    renderExpenseBridge(plan);
    renderWarnings(plan);
    renderSchedule(plan);
    renderQueue(plan);
    if (_manualDraft) syncManualEditor();
  }

  function refresh(options) {
    var opts = options || {};
    var reqId = ++_refreshReqId;
    return fetchPlannerContext().then(function (ctx) {
      if (reqId !== _refreshReqId) return null;
      _lastActivity = ctx && ctx.activity ? ctx.activity : { latest_by_task: {}, summary: { started: 0, completed: 0, postponed: 0 } };
      _lastReview = ctx && ctx.review ? ctx.review : normalizeReview({});
      var plan = computePlan((ctx && ctx.tasks) || [], _lastActivity, _lastReview, ctx && ctx.expenses ? ctx.expenses : normalizeExpenseContext([], todayYMD(), startOfWeekYMD(todayYMD())));
      applyPlan(plan);
      if (opts && opts.announce) {
        var root = qs('#todayPlanWarnings');
        if (root) root.setAttribute('data-refreshed-at', String(Date.now()));
      }
      return plan;
    });
  }

  function scheduleRefresh(options) {
    var opts = options || {};
    if (_refreshTimer) {
      try { window.clearTimeout(_refreshTimer); } catch (_) {}
    }
    _refreshTimer = window.setTimeout(function () {
      _refreshTimer = 0;
      refresh(opts).catch(function () {});
    }, opts.immediate ? 0 : 80);
  }


  function openExpenseForTask(taskId) {
    var c = core();
    var task = knownTaskById(taskId);
    if (!task || !c || !c.expense || typeof c.expense.openCreateForTask !== 'function') return;
    c.expense.openCreateForTask(task.id, task.title, task.kind === 'study' ? 'study' : 'personal').catch(function () {});
  }

  function handlePlanAction(action, taskId, start) {
    if (action === 'lock') {
      lockTaskAtStart(taskId, start || '');
      return true;
    }
    if (action === 'manual') {
      openManualEditor(taskId, start || '');
      return true;
    }
    if (action === 'unlock') {
      unlockTask(taskId);
      return true;
    }
    if (action === 'expense') {
      openExpenseForTask(taskId);
      return true;
    }
    if (action === 'start') {
      startTask(taskId).catch(function () {});
      return true;
    }
    if (action === 'complete') {
      completeTask(taskId).catch(function () {});
      return true;
    }
    if (action === 'postpone') {
      postponeTask(taskId).catch(function () {});
      return true;
    }
    return false;
  }

  function maybeOpenDetailFromRow(e) {
    var row = e.target && e.target.closest ? e.target.closest('[data-task-id], [data-detail-key]') : null;
    if (!row) return;
    var detailKey = row.getAttribute('data-detail-key') || '';
    if (detailKey) {
      openDetailModalByKey(detailKey);
      return;
    }
    var id = row.getAttribute('data-task-id');
    if (!id || isPendingTaskId(id)) return;
    openTaskEditor(id);
  }

  function bind(root) {
    if (_bound) return;
    _bound = true;

    var pr = qs('#prioList', root);
    if (pr) {
      pr.addEventListener('change', function (e) {
        var inp = e.target;
        if (!inp || inp.tagName !== 'INPUT' || inp.type !== 'checkbox') return;
        var row = inp.closest('.prio-row');
        if (!row) return;
        var id = row.getAttribute('data-task-id');
        if (!id || isPendingTaskId(id)) return;
        if (LN.tasks && typeof LN.tasks.setDone === 'function') {
          LN.tasks.setDone(id, inp.checked).catch(function () {});
        }
      });

      pr.addEventListener('click', function (e) {
        var t = e.target;
        if (t && t.tagName === 'INPUT') return;
        var row = e.target && e.target.closest ? e.target.closest('.prio-row') : null;
        if (!row) return;
        var id = row.getAttribute('data-task-id');
        if (!id || isPendingTaskId(id)) return;
        if (LN.tasks && typeof LN.tasks.openEditor === 'function') {
          LN.tasks.openEditor(id).catch(function () {});
        }
      });
    }

    [qs('#btnReplan', root), qs('#btnReplanMobile', root)].forEach(function (btn) {
      if (!btn) return;
      btn.addEventListener('click', function (e) {
        e.preventDefault();
        scheduleRefresh({ immediate: true, announce: true });
      });
    });

    [qs('#todayPlanSchedule', root), qs('#todayPlanQueue', root)].forEach(function (wrap) {
      if (!wrap) return;

      wrap.addEventListener('click', function (e) {
        var act = e.target && e.target.closest ? e.target.closest('[data-tp-action]') : null;
        if (act) {
          e.preventDefault();
          e.stopPropagation();
          if (act.getAttribute('data-tp-action') === 'details') {
            openDetailModalByKey(act.getAttribute('data-detail-key') || '');
            return;
          }
          handlePlanAction(act.getAttribute('data-tp-action'), act.getAttribute('data-task-id'), act.getAttribute('data-start') || '');
          return;
        }
        maybeOpenDetailFromRow(e);
      });

      wrap.addEventListener('keydown', function (e) {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        var row = e.target && e.target.closest ? e.target.closest('[data-task-id]') : null;
        if (!row) return;
        if (e.target && e.target.closest && e.target.closest('[data-tp-action]')) return;
        e.preventDefault();
        maybeOpenDetailFromRow(e);
      });
    });

    var detailActions = qs('#todayPlanDetailActions', root) || qs('#todayPlanDetailActions');
    if (detailActions) {
      detailActions.addEventListener('click', function (e) {
        var btn = e.target && e.target.closest ? e.target.closest('[data-tp-detail-action]') : null;
        if (!btn) return;
        e.preventDefault();
        runDetailAction(btn.getAttribute('data-tp-detail-action'), btn.getAttribute('data-task-id') || '', btn.getAttribute('data-start') || '');
      });
    }

    [qs('#btnTodayPlanManualCancel', root), qs('#btnTodayPlanManualCancelTop', root)].forEach(function (btn) {
      if (!btn) return;
      btn.addEventListener('click', function (e) {
        e.preventDefault();
        hideManualEditor();
      });
    });

    var saveBtn = qs('#btnTodayPlanManualSave', root);
    if (saveBtn) {
      saveBtn.addEventListener('click', function (e) {
        e.preventDefault();
        saveManualFromForm();
      });
    }
  }

  LN.today_plan.renderPriorities = renderPriorities;
  LN.today_plan.renderTimeBlocks = renderTimeBlocks;
  LN.today_plan.refresh = refresh;
  LN.today_plan.scheduleRefresh = scheduleRefresh;
  LN.today_plan.openManualEditor = openManualEditor;
  LN.today_plan.unlockTask = unlockTask;
  LN.today_plan.startTask = startTask;
  LN.today_plan.completeTask = completeTask;
  LN.today_plan.postponeTask = postponeTask;

  LN.modules.today_plan = function (root) {
    bind(root);
    scheduleRefresh({ immediate: true });
  };
})();
