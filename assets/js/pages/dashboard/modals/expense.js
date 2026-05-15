(function () {
  'use strict';

  var LN = (window.LN = window.LN || {});
  LN.modules = LN.modules || {};

  function core() { return (LN && LN.core) ? LN.core : null; }
  function qs(sel, root) { var c = core(); return (c && c.qs) ? c.qs(sel, root) : (root || document).querySelector(sel); }
  function qsa(sel, root) { var c = core(); return (c && c.qsa) ? c.qsa(sel, root) : Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  function initExpense(root) {
    if (!root) return;
    if (root.getAttribute('data-ln-bound') === '1') return;
    root.setAttribute('data-ln-bound', '1');

    var c = core();
    if (!c || !c.expense) return;

    var form = qs('#expenseForm');
    if (form) {
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        c.expense.save();
      });
    }

    var taskSel = qs('#expLinkedTask');
    if (taskSel) {
      taskSel.addEventListener('change', function () {
        if (c.expense.syncTaskLinkUI) c.expense.syncTaskLinkUI();
      });
    }

    var del = qs('#expenseDeleteBtn');
    if (del) {
      del.addEventListener('click', function (e) {
        e.preventDefault();
        var id = c.expense.currentId();
        if (!id) return;
        if (!window.confirm('Delete this expense?')) return;
        c.expense.delete(id).catch(function () {});
      });
    }

    // Ensure "New Expense" openers reset the form before open.
    qsa('[data-open="expense"]').forEach(function (b) {
      b.addEventListener('click', function () {
        Promise.resolve(c.expense.ensureTaskOptions ? c.expense.ensureTaskOptions() : null).catch(function () {}).finally(function () {
          try { c.expense.resetForCreate(); } catch (_) {}
          if (qs('#expDate2')) qs('#expDate2').value = c.todayYMD();
          if (c.expense.syncTaskLinkUI) c.expense.syncTaskLinkUI();
        });
      }, true);
    });

    window.addEventListener('lifenest:cmd', function (ev) {
      var cmd = ev && ev.detail ? String(ev.detail.cmd || '') : '';
      if (!cmd) return;
      if (cmd === 'expense:new') {
        Promise.resolve(c.expense.ensureTaskOptions ? c.expense.ensureTaskOptions() : null).catch(function () {}).finally(function () {
          c.expense.resetForCreate();
          if (qs('#expDate2')) qs('#expDate2').value = c.todayYMD();
          if (c.expense.syncTaskLinkUI) c.expense.syncTaskLinkUI();
          if (window.LifeNestUI) window.LifeNestUI.openModal('expense');
        });
      }
    });
  }

  LN.modules.modal_expense = initExpense;
})();
