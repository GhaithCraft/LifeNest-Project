(function () {
  'use strict';

  var LN = (window.LN = window.LN || {});
  LN.modules = LN.modules || {};
  LN.snapshot = LN.snapshot || {};

  function core() {
    return (LN && LN.core) ? LN.core : null;
  }

  function qs(sel, root) {
    var c = core();
    if (c && c.qs) return c.qs(sel, root);
    return (root || document).querySelector(sel);
  }

  function setText(id, txt) {
    var c = core();
    if (c && c.setText) return c.setText(id, txt);
    var el = (typeof id === 'string') ? qs('#' + id) : id;
    if (!el) return;
    el.textContent = (txt === null || typeof txt === 'undefined') ? '' : String(txt);
  }

  function replaceProgress(el, pct) {
    var c = core();
    if (c && c.replaceProgressClass) return c.replaceProgressClass(el, pct);
    // best-effort fallback: noop
  }

  function clampInt(v, min, max) {
    var n = parseInt(v, 10);
    if (!isFinite(n)) n = 0;
    if (n < min) n = min;
    if (n > max) n = max;
    return n;
  }

  function fmtMoney(cents, currency) {
    var c = core();
    if (c && c.fmtMoneyFromCents) return c.fmtMoneyFromCents(cents, currency);
    return String(cents);
  }

  function monthYM() {
    var c = core();
    if (c && c.monthYM) return c.monthYM();
    return '';
  }

  function render(snapshot, fullData) {
    if (!snapshot) return;

    var c = core();
    var state = c ? c.state : null;

    // ===== Tasks today =====
    var tt = snapshot.tasks_today || {};
    setText('snapTasksTodayCount', tt.count);
    setText('snapTasksTodayMeta', String(clampInt(tt.completed_pct, 0, 100)) + '% Completed');
    replaceProgress(qs('#snapTasksTodayProgress'), clampInt(tt.completed_pct, 0, 100));

    setText('mSnapTasks', tt.count);
    replaceProgress(qs('#mSnapTasksBar'), clampInt(tt.completed_pct, 0, 100));
    setText('mSnapTasksHint', '(' + String(clampInt(tt.completed_pct, 0, 100)) + '% Done)');

    // ===== Overdue =====
    var od = snapshot.overdue || {};
    setText('snapOverdueCount', od.count);
    setText('snapOverdueMeta', od.critical_title ? ('Critical: ' + od.critical_title) : '—');

    // ===== Study =====
    var st = snapshot.study_time || {};
    var plannedMin = clampInt(st.planned_minutes || 0, 0, 1000000);
    var doneMin = clampInt(st.done_minutes || 0, 0, 1000000);
    var plannedH = Math.round(plannedMin / 60);
    var doneH = Math.round(doneMin / 60);
    setText('snapStudyValue', doneH + '/' + plannedH + 'h');

    var studyPct = plannedMin > 0 ? Math.round((doneMin / plannedMin) * 100) : 0;
    studyPct = clampInt(studyPct, 0, 100);
    setText('mSnapStudy', doneH + '/' + plannedH + 'h');
    replaceProgress(qs('#mSnapStudyBar'), studyPct);
    setText('mSnapStudyHint', '(On Track)');

    if (window.LifeNestCharts && qs('#studyPie')) {
      var ratio = plannedMin > 0 ? (doneMin / plannedMin) : 0;
      try { window.LifeNestCharts.drawPie(qs('#studyPie'), ratio); } catch (_) {}
    }

    // ===== Budget (Snapshot mini-card only) =====
    var b = snapshot.budget || {};
    var currency = String(b.currency || (state && state.currency) || 'TRY');

    if (state) {
      state.currency = currency;
      state.month = String(b.month || state.month || monthYM());
    }

    setText('snapBudgetRemaining', fmtMoney(b.remaining_cents || 0, currency));
    var remPct = (b.budget_cents > 0) ? Math.round(((b.remaining_cents || 0) / b.budget_cents) * 100) : 0;
    remPct = clampInt(remPct, 0, 100);
    replaceProgress(qs('#snapBudgetProgress'), remPct);

    // ===== Spent today =====
    var sp = snapshot.spent_today || {};
    setText('snapSpentToday', fmtMoney(sp.spent_cents || 0, currency));
    setText('snapSpentTodayMeta', (sp.top_categories && sp.top_categories.length) ? sp.top_categories.join(', ') : '—');

    // ===== Weekly =====
    var wk = snapshot.weekly_progress || {};
    setText('snapWeekly', String(clampInt(wk.percent || 0, 0, 100)) + '%');
    setText('snapWeeklyMeta', clampInt(wk.percent || 0, 0, 100) >= 60 ? 'Goal on track' : 'Needs attention');

    // Sparkline is fetched separately (loadWeeklySpark), called from dashboard.js.
  }

  async function loadWeeklySpark(weekStart) {
    var c = core();
    if (!c || typeof c.api !== 'function') return;

    var url = '/api/reports/weekly.php';
    if (weekStart) url += '?week_start=' + encodeURIComponent(String(weekStart));

    var r = await c.api('GET', url);
    var series = null;

    if (r && r.tasks && r.tasks.daily_series && r.tasks.daily_series.length) {
      series = r.tasks.daily_series.map(function (x) { return clampInt(x, 0, 100); });
    }

    if (!series) {
      // fallback synthetic
      var p = (r && r.tasks) ? clampInt(r.tasks.percent, 0, 100) : 0;
      series = [Math.max(0, p - 30), Math.max(0, p - 25), Math.max(0, p - 18), Math.max(0, p - 12), Math.max(0, p - 7), Math.max(0, p - 3), p];
    }

    var canvas = qs('#weeklySpark');
    if (window.LifeNestCharts && canvas) {
      try { window.LifeNestCharts.drawSpark(canvas, series); } catch (_) {}
    }
  }

  function initSnapshot(root) {
    if (!root) return;
    if (root.getAttribute('data-ln-snapshot-bound') === '1') return;
    root.setAttribute('data-ln-snapshot-bound', '1');
  }

  LN.modules.snapshot = initSnapshot;
  LN.snapshot.init = initSnapshot;
  LN.snapshot.render = render;
  LN.snapshot.loadWeeklySpark = loadWeeklySpark;
})();
