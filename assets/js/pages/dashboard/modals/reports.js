(function () {
  'use strict';

  var LN = (window.LN = window.LN || {});
  LN.modules = LN.modules || {};

  function core() { return (LN && LN.core) ? LN.core : null; }
  function qs(sel, root) { var c = core(); return (c && c.qs) ? c.qs(sel, root) : (root || document).querySelector(sel); }
  function qsa(sel, root) { var c = core(); return (c && c.qsa) ? c.qsa(sel, root) : Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  function initReports(root) {
    if (!root) return;
    if (root.getAttribute('data-ln-bound') === '1') return;
    root.setAttribute('data-ln-bound', '1');

    var c = core();
    if (!c || !c.reports) return;

    // Openers
    qsa('[data-report]').forEach(function (b) {
      b.addEventListener('click', function (e) {
        e.preventDefault();
        c.reports.open();
      });
    });

    qsa('[data-open="reports"]').forEach(function (b) {
      b.addEventListener('click', function (e) {
        e.preventDefault();
        c.reports.open();
      });
    });

    var reload = qs('#btnReloadReports');
    if (reload) {
      reload.addEventListener('click', function (e) {
        e.preventDefault();
        c.reports.reload();
      });
    }

    window.addEventListener('lifenest:cmd', function (ev) {
      var cmd = ev && ev.detail ? String(ev.detail.cmd || '') : '';
      if (!cmd) return;
      if (cmd === 'open:reports' || cmd === 'reports:open') {
        c.reports.open();
      }
    });
  }

  LN.modules.modal_reports = initReports;
})();
