  <section class="ln-modal" id="modalBudget" data-module="modal_budget" role="dialog" aria-modal="true" aria-hidden="true" aria-labelledby="modalBudgetTitle">
    <div class="ln-modal__backdrop" data-close="modal"></div>
    <div class="ln-modal__panel">
      <div class="ln-modal__head">
        <h3 class="ln-modal__title" id="modalBudgetTitle">Set Monthly Budget</h3>
        <button class="ln-modal__close" type="button" data-close="modal" aria-label="Close"><svg class="icon icon--xs" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></button>
      </div>
      <form class="ln-form" id="budgetForm">
        <div class="ln-form__grid">
          <div class="ln-form__row">
            <label class="ln-label" for="budgetMonth">Month</label>
            <input class="input" id="budgetMonth" type="month" required />
          </div>
          <div class="ln-form__row">
            <label class="ln-label" for="budgetCurrency">Currency</label>
            <div class="select-wrap">
              <select class="select select--native" id="budgetCurrency">
                <option value="TRY" selected>TRY</option>
              </select>
              <svg class="select-wrap__ic" viewBox="0 0 24 24" aria-hidden="true"><path d="m7 10 5 5 5-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
            </div>
          </div>
        </div>
        <div class="ln-form__row">
          <label class="ln-label" for="budgetAmount">Budget amount</label>
          <input class="input" id="budgetAmount" inputmode="decimal" type="text" placeholder="e.g. 1150" required />
        </div>

        <div class="ln-form__actions">
          <button class="btn btn--ghost" type="button" data-close="modal">Cancel</button>
          <button class="btn btn--primary" type="submit">Save</button>
        </div>
        <div class="ln-form__hint" id="budgetFormHint" aria-live="polite"></div>
      </form>
    </div>
  </section>
