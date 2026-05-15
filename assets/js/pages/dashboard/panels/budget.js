(function () {
  'use strict';

  var LN = (window.LN = window.LN || {});
  LN.modules = LN.modules || {};
  LN.budget = LN.budget || {};

  function clampInt(n,a,b){var x=parseInt(String(n),10);if(!isFinite(x)) x=0;if(x<a) x=a;if(x>b) x=b;return x;}

  function core() {
    return (LN && LN.core) ? LN.core : null;
  }

  function qs(sel, root) {
    var c = core();
    if (c && c.qs) return c.qs(sel, root);
    return (root || document).querySelector(sel);
  }

  function initBudget(root) {
    if (!root) return;
    if (root.getAttribute('data-ln-budget-bound') === '1') return;
    root.setAttribute('data-ln-budget-bound', '1');

    var c = core();
    if (!c || typeof c.quickAddExpense !== 'function') return;

    // Quick add expense: submit with Enter (keeps the reference UI behavior).
    var amt = qs('#expAmount', root);
    var date = qs('#expDate', root);

    function onEnter(e) {
      if (!e || e.key !== 'Enter') return;
      e.preventDefault();
      try { c.quickAddExpense(false); } catch (_) {}
    }

    if (amt) amt.addEventListener('keydown', onEnter);
    if (date) date.addEventListener('keydown', onEnter);
  }


  function applySnapshot(b) {
    if (!b) return;
    var c = core();
    if (!c) return;

    if (c.state) {
      c.state.currency = b.currency || (c.state.currency || 'TRY');
      c.state.month = b.month || (c.state.month || (c.monthYM ? c.monthYM() : ''));
    }

    var cur = (c.state && c.state.currency) ? c.state.currency : (b.currency || 'TRY');

    if (c.setText) c.setText('budgetHeadAmount', c.fmtMoneyFromCents(b.spent_cents, cur) + ' of ' + c.fmtMoneyFromCents(b.budget_cents, cur));
    if (c.setText) c.setText('budgetSpentValue', c.fmtMoneyFromCents(b.spent_cents || 0, cur));
    if (c.setText) c.setText('budgetRemainingValue', c.fmtMoneyFromCents(b.remaining_cents || 0, cur));

    var spentPct = b.budget_cents > 0 ? Math.round((b.spent_cents / b.budget_cents) * 100) : 0;
    spentPct = clampInt(spentPct, 0, 100);
    if (c.replaceProgressClass) {
      c.replaceProgressClass(qs('#budgetBar'), spentPct);
      c.replaceProgressClass(qs('#budgetRing'), spentPct);
    }

    if (c.setText) c.setText('budgetSub', 'Remaining: ' + c.fmtMoneyFromCents(b.remaining_cents, cur) + ' · ' + b.days_left + ' days left · Daily allowance: ' + c.fmtMoneyFromCents(b.daily_allowance_cents, cur));

    var mob = qs('#budgetMobileRemaining');
    if (mob) mob.innerHTML = 'Remaining: <strong>' + c.fmtMoneyFromCents(b.remaining_cents, cur) + '</strong>';

    var alert = qs('#budgetAlert');
    if (alert) {
      var show = (b.budget_cents > 0) && (spentPct >= 85 || (b.days_left <= 3 && b.remaining_cents <= b.daily_allowance_cents * 2));
      alert.classList.toggle('is-hidden', !show);
      if (show && c.setText) c.setText('budgetAlertText', 'Budget Limit Approaching');
    }
  }

  LN.modules.budget = initBudget;
  LN.budget.init = initBudget;
  LN.budget.applySnapshot = applySnapshot;
})();
