(function () {
  'use strict';

  var LN = (window.LN = window.LN || {});
  LN.modules = LN.modules || {};

  function core() { return (LN && LN.core) ? LN.core : null; }
  function qs(sel, root) { var c = core(); return (c && c.qs) ? c.qs(sel, root) : (root || document).querySelector(sel); }
  function qsa(sel, root) { var c = core(); return (c && c.qsa) ? c.qsa(sel, root) : Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  function initPending(root) {
    if (!root) return;
    if (root.getAttribute('data-ln-bound') === '1') return;
    root.setAttribute('data-ln-bound', '1');

    var c = core();
    if (!c || !c.pending) return;

    // Snackbar buttons
    var snUndo = qs('#lnSnackAction');
    if (snUndo) {
      snUndo.addEventListener('click', function (e) {
        e.preventDefault();
        try { c.pending.undoSnack(); } catch (_) {}
      });
    }

    var snClose = qs('#lnSnackClose');
    if (snClose) {
      snClose.addEventListener('click', function (e) {
        e.preventDefault();
        try { c.pending.hideSnack(); } catch (_) {}
      });
    }

    var snPend = qs('#lnSnackPending');
    if (snPend) {
      snPend.addEventListener('click', function (e) {
        e.preventDefault();
        try { c.pending.render(); c.pending.tick(); } catch (_) {}
        if (window.LifeNestUI) window.LifeNestUI.openModal('pending');
      });
    }

    // Pending modal click actions
    var list = qs('#pendingList');
    if (list) {
      list.addEventListener('click', function (e) {
        var row = e.target && e.target.closest ? e.target.closest('.pending-row') : null;
        if (!row) return;
        var opId = row.getAttribute('data-op-id');
        if (!opId) return;

        var undo = e.target && e.target.closest ? e.target.closest('[data-action="pending-undo"]') : null;
        if (undo) { e.preventDefault(); try { c.pending.undo(opId); } catch (_) {} return; }

        var retry = e.target && e.target.closest ? e.target.closest('[data-action="pending-retry"]') : null;
        if (retry) { e.preventDefault(); try { c.pending.retry(opId); } catch (_) {} return; }
      });
    }

    // Ensure modal refresh when opened from anywhere.
    qsa('[data-open="pending"]').forEach(function (b) {
      b.addEventListener('click', function () {
        try { c.pending.render(); c.pending.tick(); } catch (_) {}
      }, true);
    });
  }

  LN.modules.modal_pending = initPending;
})();
