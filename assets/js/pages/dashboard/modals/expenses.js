(function () {
  'use strict';

  var LN = (window.LN = window.LN || {});
  LN.modules = LN.modules || {};

  function core() { return (LN && LN.core) ? LN.core : null; }
  function qs(sel, root) { var c = core(); return (c && c.qs) ? c.qs(sel, root) : (root || document).querySelector(sel); }
  function qsa(sel, root) { var c = core(); return (c && c.qsa) ? c.qsa(sel, root) : Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  function initExpenses(root) {
    if (!root) return;
    if (root.getAttribute('data-ln-bound') === '1') return;
    root.setAttribute('data-ln-bound', '1');

    var c = core();
    if (!c || !c.expensesList || !c.expense) return;

    function openAndLoad() {
      if (window.LifeNestUI) window.LifeNestUI.openModal('expenses');
      var m = (c.state && (c.state.month || c.monthYM())) || c.monthYM();
      if (qs('#expensesMonth')) qs('#expensesMonth').value = m;
      c.expensesList.load(m).catch(function (err) {
        if (c.setText) c.setText('expensesHint', err && err.message ? err.message : 'Failed to load expenses.');
      });
    }

    qsa('[data-open="expenses"]').forEach(function (b) {
      b.addEventListener('click', function (e) {
        e.preventDefault();
        openAndLoad();
      });
    });

    var reload = qs('#btnReloadExpenses');
    if (reload) {
      reload.addEventListener('click', function (e) {
        e.preventDefault();
        c.expensesList.load(qs('#expensesMonth') ? qs('#expensesMonth').value : (c.state.month || c.monthYM())).catch(function (err) {
          if (c.setText) c.setText('expensesHint', err && err.message ? err.message : 'Failed to load expenses.');
        });
      });
    }

    var addFromList = qs('#btnAddExpenseFromList');
    if (addFromList) {
      addFromList.addEventListener('click', function (e) {
        e.preventDefault();
        c.expense.resetForCreate();
        if (qs('#expDate2')) qs('#expDate2').value = c.todayYMD();
        if (window.LifeNestUI) window.LifeNestUI.closeModal('modalExpenses');
        if (window.LifeNestUI) window.LifeNestUI.openModal('expense');
      });
    }

    var list = qs('#expensesList');
    if (list) {
      list.addEventListener('click', function (e) {
        var edit = e.target && e.target.closest ? e.target.closest('[data-action="edit-expense"]') : null;
        if (edit) {
          var rowE = edit.closest('.ln-exp-row');
          if (!rowE) return;
          var idE = rowE.getAttribute('data-expense-id');
          if (!idE) return;
          if (window.LifeNestUI) window.LifeNestUI.closeModal('modalExpenses');
          c.expense.openEditor(idE).catch(function () {});
          return;
        }

        var del = e.target && e.target.closest ? e.target.closest('[data-action="delete-expense"]') : null;
        if (!del) return;
        var rowD = del.closest('.ln-exp-row');
        if (!rowD) return;
        var idD = rowD.getAttribute('data-expense-id');
        if (!idD) return;
        if (!window.confirm('Delete this expense?')) return;
        c.expense.delete(idD).catch(function () {});
      });
    }

    window.addEventListener('lifenest:cmd', function (ev) {
      var cmd = ev && ev.detail ? String(ev.detail.cmd || '') : '';
      if (!cmd) return;
      if (cmd === 'open:expenses' || cmd === 'expenses:open') {
        openAndLoad();
      }
    });
  }

  LN.modules.modal_expenses = initExpenses;
})();
