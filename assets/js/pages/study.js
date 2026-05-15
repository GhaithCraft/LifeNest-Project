/* study.js — Study page (Study Tasks via /api/tasks.php?kind=study) — CSP-safe */
(function () {
  'use strict';

  function qs(sel, root) { return (root || document).querySelector(sel); }
  function qsa(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  var state = {
    csrf: '',
    user: null,
    tasks: [],
    tab: 'all',
    courseFilter: '',
    search: ''
  };

  function pad2(n) { return (n < 10 ? '0' : '') + String(n); }
  function ymd(d) { return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); }

  function today() { return new Date(); }

  function weekRange(now) {
    // Week starts Monday.
    var d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    var dow = d.getDay();
    var offset = (dow + 6) % 7;
    var start = new Date(d);
    start.setDate(d.getDate() - offset);
    var end = new Date(start);
    end.setDate(start.getDate() + 6);
    return { start: start, end: end };
  }

  function monthRange(now) {
    var start = new Date(now.getFullYear(), now.getMonth(), 1);
    var end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    return { start: start, end: end };
  }

  function clampInt(n, a, b) {
    var x = parseInt(String(n), 10);
    if (!isFinite(x)) x = 0;
    if (x < a) x = a;
    if (x > b) x = b;
    return x;
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

    // snap to nearest 10 for CSS classes
    var snap = Math.round(p / 10) * 10;
    snap = clampInt(snap, 0, 100);
    el.classList.add('p' + snap);
  }

  function fmtDate(ymdStr) {
    if (!ymdStr) return '—';
    try {
      var d = new Date(String(ymdStr) + 'T00:00:00');
      return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(d);
    } catch (_) {
      return String(ymdStr);
    }
  }

  function fmtHours(mins) {
    var m = parseInt(String(mins || 0), 10);
    if (!isFinite(m) || m <= 0) return '0h';
    var h = Math.floor(m / 60);
    var r = m % 60;
    if (h <= 0) return r + 'm';
    if (r <= 0) return h + 'h';
    return h + 'h ' + r + 'm';
  }

  function titleParts(rawTitle) {
    var t = String(rawTitle || '').trim();
    if (!t) return { course: '', title: '' };

    // Preferred: [Course] Title
    if (t.charAt(0) === '[') {
      var end = t.indexOf(']');
      if (end > 1) {
        var c = t.slice(1, end).trim();
        var rest = t.slice(end + 1).trim();
        if (c) return { course: c, title: rest || c };
      }
    }

    return { course: '', title: t };
  }

  function apiFetch(url, opts) {
    var o = opts || {};
    var headers = o.headers || {};
    headers['Accept'] = 'application/json';
    if (o.json) headers['Content-Type'] = 'application/json';
    if (o.csrf) headers['X-CSRF-Token'] = state.csrf;

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

  function loadStudyTasks() {
    return apiFetch('/api/tasks.php?kind=study&limit=200').then(function (b) {
      state.tasks = Array.isArray(b.tasks) ? b.tasks : [];
    });
  }

  function uniqueCourses(tasks) {
    var seen = {};
    var out = [];
    (tasks || []).forEach(function (t) {
      var p = titleParts(t && t.title);
      var c = String(p.course || '').trim();
      if (!c) return;
      var k = c.toLowerCase();
      if (seen[k]) return;
      seen[k] = true;
      out.push(c);
    });
    out.sort(function (a, b) { return a.localeCompare(b); });
    return out;
  }

  function setCourseFilterOptions(courses) {
    var sel = qs('#stFilterCourse');
    if (!sel) return;
    var cur = String(sel.value || '');
    sel.innerHTML = '<option value="">Filter by Course</option>';
    courses.forEach(function (c) {
      var opt = document.createElement('option');
      opt.value = c;
      opt.textContent = c;
      sel.appendChild(opt);
    });
    sel.value = cur;

    // datalist for quick add
    var dl = qs('#stCoursesDL');
    if (dl) {
      dl.innerHTML = '';
      courses.forEach(function (c2) {
        var o = document.createElement('option');
        o.value = c2;
        dl.appendChild(o);
      });
    }
  }

  function computeSummary(tasks) {
    var now = today();
    var tY = ymd(now);
    var wr = weekRange(now);
    var wStart = ymd(wr.start);
    var wEnd = ymd(wr.end);

    var plannedToday = 0;
    var doneToday = 0;

    var plannedWeek = 0;
    var doneWeek = 0;

    var total = 0;
    var doneTotal = 0;

    var perDay = [0, 0, 0, 0, 0, 0, 0];

    (tasks || []).forEach(function (t) {
      if (!t) return;
      total++;
      if (t.status === 'done') doneTotal++;

      var due = t.due_date ? String(t.due_date) : '';
      var dur = clampInt(t.duration_minutes || 0, 0, 24 * 60);

      if (due === tY) {
        plannedToday += dur;
        if (t.status === 'done') doneToday += dur;
      }

      if (due && due >= wStart && due <= wEnd) {
        plannedWeek += dur;
        if (t.status === 'done') doneWeek += dur;

        // day index Mon..Sun => 0..6
        try {
          var dd = new Date(due + 'T00:00:00');
          var dow = dd.getDay();
          var idx = (dow + 6) % 7;
          perDay[idx] += dur;
        } catch (_) {}
      }
    });

    var remainToday = Math.max(0, plannedToday - doneToday);

    // today card
    setText('stTodayHours', (Math.floor(doneToday / 60) + '/' + Math.max(1, Math.floor(plannedToday / 60)) + 'h'));
    setText('stTodayRemain', 'Remaining Today: ' + fmtHours(remainToday));

    // pie
    var ratio = plannedToday > 0 ? (doneToday / plannedToday) : 0;
    var pie = qs('#studyPie');
    if (pie && window.LifeNestCharts && window.LifeNestCharts.drawPie) {
      window.LifeNestCharts.drawPie(pie, ratio);
    }

    // week card
    setText('stWeekTotal', 'Total for Week: ' + fmtHours(doneWeek) + ' / ' + fmtHours(plannedWeek) + ' Planned');
    var spark = qs('#weeklySpark');
    if (spark && window.LifeNestCharts && window.LifeNestCharts.drawSpark) {
      // draw in hours (smaller numbers)
      var vals = perDay.map(function (m) { return Math.round(m / 15); });
      window.LifeNestCharts.drawSpark(spark, vals);
    }

    // deadlines
    renderDeadlines(tasks);

    // overall
    var pct = total > 0 ? Math.round((doneTotal / total) * 100) : 0;
    setText('stOverallPct', pct + '%');
    replaceProgressClass(qs('#stOverallBar'), pct);
    setText('stOverallMsg', total > 0 ? (doneTotal + ' of ' + total + ' completed') : 'No study tasks yet');
  }

  function renderDeadlines(tasks) {
    var now = today();
    var tY = ymd(now);

    var list = (tasks || []).filter(function (t) {
      return t && t.status === 'todo' && t.due_date && String(t.due_date) >= tY;
    }).slice();

    list.sort(function (a, b) {
      return String(a.due_date || '').localeCompare(String(b.due_date || ''));
    });

    if (!list.length) {
      setText('stDeadTitle', 'No upcoming deadlines');
      setText('stDeadMsg', 'You are clear for now.');
      return;
    }

    var first = list[0];
    var p1 = titleParts(first.title);
    setText('stDeadTitle', 'Next: ' + (p1.course ? (p1.course + ' — ') : '') + p1.title + ' · ' + fmtDate(first.due_date));

    if (list.length > 1) {
      var second = list[1];
      var p2 = titleParts(second.title);
      setText('stDeadMsg', 'Then: ' + (p2.course ? (p2.course + ' — ') : '') + p2.title + ' · ' + fmtDate(second.due_date));
    } else {
      setText('stDeadMsg', 'Add more tasks to build your plan.');
    }
  }

  function renderCourses(tasks) {
    var box = qs('#stCourses');
    var empty = qs('#stCoursesEmpty');
    if (!box) return;

    box.innerHTML = '';

    // group by course
    var g = {};
    (tasks || []).forEach(function (t) {
      if (!t) return;
      var p = titleParts(t.title);
      var c = String(p.course || '').trim();
      if (!c) return;
      if (!g[c]) g[c] = { total: 0, done: 0 };
      g[c].total++;
      if (t.status === 'done') g[c].done++;
    });

    var courses = Object.keys(g);
    courses.sort(function (a, b) { return a.localeCompare(b); });

    if (!courses.length) {
      if (empty) empty.hidden = false;
      return;
    }
    if (empty) empty.hidden = true;

    courses.slice(0, 6).forEach(function (c) {
      var total = g[c].total;
      var done = g[c].done;
      var pct = total > 0 ? Math.round((done / total) * 100) : 0;

      var row = document.createElement('div');
      row.className = 'st-course';

      var ic = document.createElement('div');
      ic.className = 'st-course__ic';
      ic.textContent = c.trim().charAt(0).toUpperCase() || 'C';
      row.appendChild(ic);

      var main = document.createElement('div');
      main.className = 'st-course__main';

      var name = document.createElement('div');
      name.className = 'st-course__name';
      name.textContent = c;
      main.appendChild(name);

      var sub = document.createElement('div');
      sub.className = 'st-course__sub';
      sub.textContent = done + '/' + total + ' Done';
      main.appendChild(sub);

      var bar = document.createElement('div');
      bar.className = 'st-course__bar';
      var fill = document.createElement('span');
      fill.style.width = clampInt(pct, 0, 100) + '%';
      bar.appendChild(fill);
      main.appendChild(bar);

      row.appendChild(main);

      var pctEl = document.createElement('div');
      pctEl.className = 'st-course__pct';
      pctEl.textContent = pct + '%';
      row.appendChild(pctEl);

      box.appendChild(row);
    });
  }

  function matchSearch(title, q) {
    if (!q) return true;
    var t = String(title || '');
    var a = (function () {
      try { return t.toLowerCase(); } catch (_) { return t; }
    })();
    var b = (function () {
      try { return q.toLowerCase(); } catch (_) { return q; }
    })();
    return a.indexOf(b) !== -1;
  }

  function filterTasks() {
    var now = today();
    var tY = ymd(now);
    var wr = weekRange(now);
    var wStart = ymd(wr.start);
    var wEnd = ymd(wr.end);

    var out = (state.tasks || []).filter(function (t) {
      if (!t) return false;

      var p = titleParts(t.title);
      var course = String(p.course || '');

      if (state.courseFilter && course !== state.courseFilter) return false;
      if (state.search && !matchSearch(t.title, state.search)) return false;

      var due = t.due_date ? String(t.due_date) : '';

      if (state.tab === 'week') {
        if (!due) return false;
        return due >= wStart && due <= wEnd;
      }
      if (state.tab === 'overdue') {
        if (!due) return false;
        return t.status === 'todo' && due < tY;
      }
      if (state.tab === 'upcoming') {
        if (!due) return false;
        return t.status === 'todo' && due > tY;
      }

      return true;
    });

    out.sort(function (a, b) {
      var da = a.due_date ? String(a.due_date) : '9999-12-31';
      var db = b.due_date ? String(b.due_date) : '9999-12-31';
      if (da !== db) return da.localeCompare(db);
      return (parseInt(String(b.id || 0), 10) - parseInt(String(a.id || 0), 10));
    });

    return out;
  }

  function buildStatusBadge(task, nowYMD) {
    var due = task.due_date ? String(task.due_date) : '';
    if (task.status === 'done') {
      var b = document.createElement('span');
      b.className = 'badge badge--mint';
      b.textContent = 'Done';
      return b;
    }

    if (due && due < nowYMD) {
      var p = document.createElement('span');
      p.className = 'pill pill--red pill--sm';
      p.textContent = 'Overdue';
      return p;
    }

    var t = document.createElement('span');
    t.className = 'badge badge--blue';
    t.textContent = 'To Do';
    return t;
  }

  function renderTable() {
    var tbody = qs('#stTbody');
    var empty = qs('#stEmpty');
    if (!tbody) return;

    tbody.innerHTML = '';
    var now = today();
    var nowY = ymd(now);

    var rows = filterTasks();

    if (!rows.length) {
      if (empty) empty.hidden = false;
      return;
    }
    if (empty) empty.hidden = true;

    rows.slice(0, 80).forEach(function (t) {
      var p = titleParts(t.title);
      var tr = document.createElement('tr');
      tr.setAttribute('data-task-id', String(t.id));

      // done checkbox
      var td0 = document.createElement('td');
      td0.className = 'st-ic';
      var chk = document.createElement('label');
      chk.className = 'check' + (t.status === 'done' ? ' is-checked' : '');
      var inp = document.createElement('input');
      inp.type = 'checkbox';
      inp.checked = (t.status === 'done');
      inp.setAttribute('aria-label', 'Mark done');
      var mark = document.createElement('svg');
      mark.className = 'check__mark';
      mark.setAttribute('viewBox', '0 0 24 24');
      mark.innerHTML = '<path d="M20 6 9 17l-5-5" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>';
      chk.appendChild(inp);
      chk.appendChild(mark);
      td0.appendChild(chk);
      tr.appendChild(td0);

      // date
      var td1 = document.createElement('td');
      td1.textContent = t.due_date ? fmtDate(t.due_date) : '—';
      tr.appendChild(td1);

      // course
      var td2 = document.createElement('td');
      td2.textContent = p.course || '—';
      tr.appendChild(td2);

      // title
      var td3 = document.createElement('td');
      var title = document.createElement('div');
      title.className = 'st-rowtitle';
      title.textContent = p.title || '';
      td3.appendChild(title);
      tr.appendChild(td3);

      // duration
      var td4 = document.createElement('td');
      var d = clampInt(t.duration_minutes || 0, 0, 1440);
      td4.textContent = d ? fmtHours(d) : '—';
      tr.appendChild(td4);

      // status
      var td5 = document.createElement('td');
      td5.appendChild(buildStatusBadge(t, nowY));
      tr.appendChild(td5);

      // actions
      var td6 = document.createElement('td');
      td6.className = 'st-act';
      var del = document.createElement('button');
      del.type = 'button';
      del.className = 'st-actionbtn';
      del.setAttribute('aria-label', 'Delete');
      del.innerHTML = "<svg class=\"icon icon--xs\" viewBox=\"0 0 24 24\" aria-hidden=\"true\"><path d=\"M6 6l12 12M18 6 6 18\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\"/></svg>";
      td6.appendChild(del);
      tr.appendChild(td6);

      // events
      inp.addEventListener('change', function () {
        var next = inp.checked ? 'done' : 'todo';
        // optimistic
        t.status = next;
        chk.classList.toggle('is-checked', inp.checked);
        renderAll();
        apiFetch('/api/tasks.php?id=' + encodeURIComponent(String(t.id)), { method: 'PATCH', json: { status: next }, csrf: true })
          .then(function () { return loadStudyTasks().then(renderAll); })
          .catch(function () {
            // revert
            t.status = inp.checked ? 'todo' : 'done';
            inp.checked = (t.status === 'done');
            chk.classList.toggle('is-checked', inp.checked);
            renderAll();
          });
      });

      del.addEventListener('click', function () {
        if (!window.confirm('Delete this study task?')) return;
        apiFetch('/api/tasks.php?id=' + encodeURIComponent(String(t.id)), { method: 'DELETE', csrf: true })
          .then(function () { return loadStudyTasks().then(renderAll); })
          .catch(function () {});
      });

      tbody.appendChild(tr);
    });
  }

  function renderTimeline(tasks) {
    var canvas = qs('#stTimeline');
    if (!canvas || !window.LifeNestCharts || !window.LifeNestCharts.drawSpark) return;

    var now = today();
    var mr = monthRange(now);
    var start = mr.start;
    var end = mr.end;
    var days = end.getDate();

    var vals = [];
    for (var i = 1; i <= days; i++) vals.push(0);

    (tasks || []).forEach(function (t) {
      if (!t || !t.due_date) return;
      var due = String(t.due_date);
      try {
        var d = new Date(due + 'T00:00:00');
        if (d < start || d > end) return;
        var idx = d.getDate() - 1;
        var dur = clampInt(t.duration_minutes || 0, 0, 1440);
        vals[idx] += dur;
      } catch (_) {}
    });

    // compress minutes to small scale
    var scaled = vals.map(function (m) { return Math.round(m / 30); });
    window.LifeNestCharts.drawSpark(canvas, scaled);
  }

  function renderAll() {
    computeSummary(state.tasks);
    renderCourses(state.tasks);
    setCourseFilterOptions(uniqueCourses(state.tasks));
    renderTable();
    renderTimeline(state.tasks);
  }

  function bindTabs() {
    qsa('[data-tab]').forEach(function (b) {
      b.addEventListener('click', function (e) {
        e.preventDefault();
        qsa('[data-tab]').forEach(function (x) {
          x.classList.remove('is-active');
          x.setAttribute('aria-selected', 'false');
        });
        b.classList.add('is-active');
        b.setAttribute('aria-selected', 'true');
        state.tab = String(b.getAttribute('data-tab') || 'all');
        renderTable();
      });
    });
  }

  function bindFilters() {
    var sel = qs('#stFilterCourse');
    if (sel) {
      sel.addEventListener('change', function () {
        state.courseFilter = String(sel.value || '');
        renderTable();
      });
    }

    var s = qs('#studySearch');
    if (s) {
      s.addEventListener('input', function () {
        state.search = String(s.value || '').trim();
        renderTable();
      });
    }
  }

  function bindAddForm() {
    var form = qs('#stAddForm');
    if (!form) return;

    var dueEl = qs('#stDue');
    if (dueEl) dueEl.value = ymd(today());

    form.addEventListener('submit', function (e) {
      e.preventDefault();

      var course = (qs('#stCourse') && qs('#stCourse').value || '').trim();
      var title = (qs('#stTitle') && qs('#stTitle').value || '').trim();
      var due = (qs('#stDue') && qs('#stDue').value || '').trim();
      var dur = (qs('#stDur') && qs('#stDur').value || '').trim();

      if (!title) {
        setText('stAddHint', 'Write a task description.');
        return;
      }

      var payload = {
        title: course ? ('[' + course + '] ' + title) : title,
        kind: 'study',
        priority: 'medium',
        status: 'todo',
        due_date: due || null,
        duration_minutes: dur ? clampInt(dur, 1, 1440) : null
      };

      var btn = qs('#stAddBtn');
      if (btn) btn.disabled = true;
      setText('stAddHint', '');

      apiFetch('/api/tasks.php', { method: 'POST', json: payload, csrf: true })
        .then(function () {
          if (qs('#stTitle')) qs('#stTitle').value = '';
          if (qs('#stDur')) qs('#stDur').value = '';
          setText('stAddHint', 'Added.');
          return loadStudyTasks().then(renderAll);
        })
        .catch(function () {
          setText('stAddHint', 'Could not add task. Please try again.');
        })
        .finally(function () {
          if (btn) btn.disabled = false;
        });
    });
  }

  function bindLogout() {
    var btn = qs('#btnLogout');
    var btn2 = qs('#drawerLogout');

    function run() {
      apiFetch('/api/auth/logout.php', { method: 'POST', json: {}, csrf: true })
        .finally(function () { window.location.href = '/login.php'; });
    }

    if (btn) btn.addEventListener('click', function (e) { e.preventDefault(); run(); });
    if (btn2) btn2.addEventListener('click', function (e) { e.preventDefault(); run(); });
  }

  function init() {
    renderTopDate();
    renderLastSynced();

    bindLogout();
    bindTabs();
    bindFilters();
    bindAddForm();

    loadBootstrap()
      .then(loadStudyTasks)
      .then(renderAll)
      .catch(function () {
        setText('stDeadTitle', 'Could not load study data.');
        setText('stDeadMsg', 'Please refresh and try again.');
      });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
