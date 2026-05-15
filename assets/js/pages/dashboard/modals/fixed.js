(function () {
  'use strict';

  var LN = (window.LN = window.LN || {});
  LN.modules = LN.modules || {};

  function core() { return (LN && LN.core) ? LN.core : null; }
  function qs(sel, root) { var c = core(); return (c && c.qs) ? c.qs(sel, root) : (root || document).querySelector(sel); }
  function qsa(sel, root) { var c = core(); return (c && c.qsa) ? c.qsa(sel, root) : Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  function initFixed(root) {
    if (!root) return;
    if (root.getAttribute('data-ln-bound') === '1') return;
    root.setAttribute('data-ln-bound', '1');

    var c = core();
    if (!c || !c.fixed || !c.state) return;

    var fixedForm = qs('#fixedForm');
    if (fixedForm) {
      fixedForm.addEventListener('submit', function (e) {
        e.preventDefault();

        var id = qs('#fixedId') ? qs('#fixedId').value.trim() : '';
        var name = qs('#fixedName') ? qs('#fixedName').value.trim() : '';
        var type = qs('#fixedType') ? qs('#fixedType').value.trim() : 'focus';
        var start = qs('#fixedStart') ? qs('#fixedStart').value.trim() : '09:00';
        var end = qs('#fixedEnd') ? qs('#fixedEnd').value.trim() : '10:00';

        var rawEv = { id: id, name: name, type: type, start: start, end: end };
        var ev = c.fixed.normalize(rawEv);
        if (!ev) {
          c.fixed.setHint('Please provide a valid name.');
          return;
        }

        var updated = false;
        var next = [];
        for (var i = 0; i < (c.state.fixedEvents || []).length; i++) {
          var cur = c.state.fixedEvents[i];
          if (String(cur.id) === String(ev.id)) {
            next.push(ev);
            updated = true;
          } else {
            next.push(cur);
          }
        }
        if (!updated) next.push(ev);

        c.state.fixedEvents = next;
        c.fixed.persist();
        c.fixed.renderTimeBlocks();
        c.fixed.renderList();
        c.fixed.resetForm();
        c.fixed.setHint(updated ? 'Updated.' : 'Saved.');
        if (LN.today_plan && typeof LN.today_plan.scheduleRefresh === 'function') {
          LN.today_plan.scheduleRefresh({ immediate: true });
        }
      });
    }

    var cancel = qs('#fixedCancel');
    if (cancel) cancel.addEventListener('click', function (e) { e.preventDefault(); c.fixed.resetForm(); });

    var del = qs('#fixedDelete');
    if (del) {
      del.addEventListener('click', function (e) {
        e.preventDefault();
        var idEl = qs('#fixedId');
        var fid = idEl ? String(idEl.value || '').trim() : '';
        if (!fid) return;
        if (!window.confirm('Delete this fixed event?')) return;

        c.state.fixedEvents = (c.state.fixedEvents || []).filter(function (x) { return String(x.id) !== String(fid); });
        c.fixed.persist();
        c.fixed.renderTimeBlocks();
        c.fixed.renderList();
        c.fixed.resetForm();
        c.fixed.setHint('Deleted.');
        if (LN.today_plan && typeof LN.today_plan.scheduleRefresh === 'function') {
          LN.today_plan.scheduleRefresh({ immediate: true });
        }
      });
    }

    var list = qs('#fixedList');
    if (list) {
      list.addEventListener('click', function (e) {
        var row = e.target && e.target.closest ? e.target.closest('.ln-fixed__row') : null;
        if (!row) return;
        e.preventDefault();
        var fid = row.getAttribute('data-fixed-id');
        if (!fid) return;
        c.fixed.openEditor(fid);
      });
    }

    // Refresh list when opened.
    qsa('[data-open="fixed"]').forEach(function (b) {
      b.addEventListener('click', function () {
        try { c.fixed.renderList(); c.fixed.resetForm(); } catch (_) {}
      }, true);
    });

    // Context menu command
    window.addEventListener('lifenest:cmd', function (ev) {
      var cmd = ev && ev.detail ? String(ev.detail.cmd || '') : '';
      if (!cmd) return;
      if (cmd === 'fixed:open' || cmd === 'open:fixed') {
        try { c.fixed.renderList(); c.fixed.resetForm(); } catch (_) {}
        if (window.LifeNestUI) window.LifeNestUI.openModal('fixed');
      }
    });
  }

  LN.modules.modal_fixed = initFixed;
})();
