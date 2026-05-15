  <section class="ln-modal" id="modalExpenses" data-module="modal_expenses" role="dialog" aria-modal="true" aria-hidden="true" aria-labelledby="modalExpensesTitle">
    <div class="ln-modal__backdrop" data-close="modal"></div>
    <div class="ln-modal__panel">
      <div class="ln-modal__head">
        <h3 class="ln-modal__title" id="modalExpensesTitle">Expenses</h3>
        <button class="ln-modal__close" type="button" data-close="modal" aria-label="Close"><svg class="icon icon--xs" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></button>
      </div>

      <div class="ln-exp" aria-label="Expenses list">
        <div class="ln-exp__filters">
          <div class="ln-exp__field">
            <label class="ln-label" for="expensesMonth">Month</label>
            <input class="input" id="expensesMonth" type="month" />
          </div>

          <button class="btn btn--ghost" type="button" id="btnReloadExpenses">Reload</button>
          <button class="btn btn--primary" type="button" id="btnAddExpenseFromList">Add Expense</button>
        </div>

        <div class="ln-exp__summary" id="expensesSummary">—</div>
        <div class="ln-exp__list" id="expensesList" aria-live="polite"></div>
        <div class="ln-form__hint" id="expensesHint" aria-live="polite"></div>
      </div>
    </div>
  </section>
