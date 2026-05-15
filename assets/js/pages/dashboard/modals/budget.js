(function () {
  'use strict';

  var LN = (window.LN = window.LN || {});
  LN.modules = LN.modules || {};

  function core() { return (LN && LN.core) ? LN.core : null; }
  function qs(sel, root) { var c = core(); return (c && c.qs) ? c.qs(sel, root) : (root || document).querySelector(sel); }

  function initBudgetModal(root) {
    if (!root) return;
    if (root.getAttribute('data-ln-bound') === '1') return;
    root.setAttribute('data-ln-bound', '1');

    var c = core();
    if (!c || !c.budget || typeof c.budget.submit !== 'function') return;

    var form = qs('#budgetForm');
    if (form) form.addEventListener('submit', c.budget.submit);
  }

  LN.modules.modal_budget = initBudgetModal;
})();
