  <section class="ln-modal" id="modalExpense" data-module="modal_expense" role="dialog" aria-modal="true" aria-hidden="true" aria-labelledby="modalExpenseTitle">
    <div class="ln-modal__backdrop" data-close="modal"></div>
    <div class="ln-modal__panel">
      <div class="ln-modal__head">
        <h3 class="ln-modal__title" id="modalExpenseTitle">Add Expense</h3>
        <button class="ln-modal__close" type="button" data-close="modal" aria-label="Close"><svg class="icon icon--xs" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></button>
      </div>
      <form class="ln-form" id="expenseForm">
        <input type="hidden" id="expenseId" value="" />
        <div class="ln-form__grid">
          <div class="ln-form__row">
            <label class="ln-label" for="expAmount2">Amount</label>
            <input class="input" id="expAmount2" inputmode="decimal" type="text" required />
          </div>
          <div class="ln-form__row">
            <label class="ln-label" for="expCurrency2">Currency</label>
            <div class="select-wrap">
              <select class="select select--native" id="expCurrency2">
                <option value="TRY" selected>TRY</option>
              </select>
              <svg class="select-wrap__ic" viewBox="0 0 24 24" aria-hidden="true"><path d="m7 10 5 5 5-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
            </div>
          </div>
        </div>
        <div class="ln-form__grid">
          <div class="ln-form__row">
            <label class="ln-label" for="expCategory2">Category</label>
            <div class="select-wrap">
              <input class="input input--selectlike" id="expCategory2" list="expenseCats" type="text" placeholder="Category" aria-label="Category" />
              <svg class="select-wrap__ic" viewBox="0 0 24 24" aria-hidden="true"><path d="m7 10 5 5 5-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
            </div>
          </div>
          <div class="ln-form__row">
            <label class="ln-label" for="expDate2">Date</label>
            <input class="input input--date" id="expDate2" type="date" required />
          </div>
        </div>
        <div class="ln-form__grid">
          <div class="ln-form__row">
            <label class="ln-label" for="expLinkedTask">Linked Task (optional)</label>
            <div class="select-wrap">
              <select class="select select--native" id="expLinkedTask">
                <option value="">Not linked</option>
              </select>
              <svg class="select-wrap__ic" viewBox="0 0 24 24" aria-hidden="true"><path d="m7 10 5 5 5-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
            </div>
          </div>
          <div class="ln-form__row">
            <label class="ln-label" for="expLifeArea">Life Area</label>
            <div class="select-wrap">
              <select class="select select--native" id="expLifeArea">
                <option value="general">General</option>
                <option value="personal">Personal</option>
                <option value="study">Study</option>
              </select>
              <svg class="select-wrap__ic" viewBox="0 0 24 24" aria-hidden="true"><path d="m7 10 5 5 5-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
            </div>
          </div>
        </div>
        <div class="ln-form__hint" id="expenseTaskHint" aria-live="polite"></div>
        <div class="ln-form__row">
          <label class="ln-label" for="expNote2">Note (optional)</label>
          <input class="input" id="expNote2" type="text" maxlength="255" placeholder="e.g. Coffee & snack" />
        </div>

        <div class="ln-form__actions">
          <button class="btn btn--ghost" type="button" data-close="modal">Cancel</button>
          <button class="btn btn--danger" type="button" id="expenseDeleteBtn" hidden>Delete</button>
          <button class="btn btn--primary" type="submit">Save</button>
        </div>
        <div class="ln-form__hint" id="expenseFormHint" aria-live="polite"></div>
      </form>
    </div>
  </section>
