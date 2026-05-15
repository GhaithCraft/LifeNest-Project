(function () {
  'use strict';

  var LN = (window.LN = window.LN || {});
  LN.modules = LN.modules || {};

  function core() { return (LN && LN.core) ? LN.core : null; }
  function qs(sel, root) { var c = core(); return (c && c.qs) ? c.qs(sel, root) : (root || document).querySelector(sel); }
  function qsa(sel, root) { var c = core(); return (c && c.qsa) ? c.qsa(sel, root) : Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  function initFocus(root) {
    if (!root) return;
    if (root.getAttribute('data-ln-bound') === '1') return;
    root.setAttribute('data-ln-bound', '1');

    var c = core();
    if (!c || !c.focus) return;

    var fStart = qs('#focusStart');
    if (fStart) fStart.addEventListener('click', function (e) { e.preventDefault(); c.focus.start(); });

    var fPause = qs('#focusPause');
    if (fPause) fPause.addEventListener('click', function (e) { e.preventDefault(); c.focus.pause(); });

    var fResume = qs('#focusResume');
    if (fResume) fResume.addEventListener('click', function (e) { e.preventDefault(); c.focus.resume(); });

    var fStop = qs('#focusStop');
    if (fStop) fStop.addEventListener('click', function (e) { e.preventDefault(); c.focus.stop(); });

    var fMin = qs('#focusMinutes');
    if (fMin) {
      fMin.addEventListener('input', function () {
        if (c.focus.isRunning()) return;
        c.focus.setMinutes(fMin.value);
      });
    }

    var fSel = qs('#focusStudyId');
    if (fSel) {
      fSel.addEventListener('change', function () {
        c.focus.setStudyId(fSel.value ? String(fSel.value) : '');
      });
    }

    // Prevent accidental close while running (click close/backdrop)
    qsa('#modalFocus [data-close="modal"]').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        if (!c.focus.isRunning()) return;
        e.preventDefault();
        e.stopPropagation();
        if (window.confirm('Focus session is running. Stop it and close?')) {
          c.focus.stop();
          if (window.LifeNestUI) window.LifeNestUI.closeModal('modalFocus');
        }
      }, true);
    });

    // Prevent accidental close via Escape
    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape') return;
      var mf = qs('#modalFocus');
      if (!mf || mf.getAttribute('aria-hidden') !== 'false') return;
      if (!c.focus.isRunning()) return;
      e.preventDefault();
      e.stopPropagation();
      if (window.confirm('Focus session is running. Stop it and close?')) {
        c.focus.stop();
        if (window.LifeNestUI) window.LifeNestUI.closeModal('modalFocus');
      }
    }, true);

    // Prepare focus UI when opening
    qsa('[data-open="focus"]').forEach(function (b) {
      b.addEventListener('click', function () {
        try { c.focus.prepare(); } catch (_) {}
      }, true);
    });

    window.addEventListener('lifenest:cmd', function (ev) {
      var cmd = ev && ev.detail ? String(ev.detail.cmd || '') : '';
      if (!cmd) return;
      if (cmd === 'focus:open' || cmd === 'open:focus') {
        try { c.focus.prepare(); } catch (_) {}
        if (window.LifeNestUI) window.LifeNestUI.openModal('focus');
      }
    });
  }

  LN.modules.modal_focus = initFocus;
})();
