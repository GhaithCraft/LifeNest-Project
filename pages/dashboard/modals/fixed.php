  <section class="ln-modal" id="modalFixed" data-module="modal_fixed" role="dialog" aria-modal="true" aria-hidden="true" aria-labelledby="modalFixedTitle">
    <div class="ln-modal__backdrop" data-close="modal"></div>
    <div class="ln-modal__panel ln-modal__panel--fixed">
      <div class="ln-modal__head">
        <h3 class="ln-modal__title" id="modalFixedTitle">Fixed Events</h3>
        <button class="ln-modal__close" type="button" data-close="modal" aria-label="Close"><svg class="icon icon--xs" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></button>
      </div>

      <div class="ln-exp">
        <div class="ln-exp__summary">Manage your daily time blocks (used in “Today Plan”).</div>

        <div class="ln-fixed__list" id="fixedList" aria-label="Fixed events list"></div>

        <form class="ln-form ln-fixed__form" id="fixedForm">
          <input type="hidden" id="fixedId" value="" />
          <div class="ln-form__grid">
            <div class="ln-form__row">
              <label class="ln-label" for="fixedName">Name</label>
              <input class="input" id="fixedName" type="text" maxlength="40" required />
            </div>
            <div class="ln-form__row">
              <label class="ln-label" for="fixedType">Label</label>
              <div class="select-wrap">
                <select class="select select--native" id="fixedType">
                  <option value="focus">Focus</option>
                  <option value="admin">Admin</option>
                  <option value="low">Low</option>
                </select>
                <svg class="select-wrap__ic" viewBox="0 0 24 24" aria-hidden="true"><path d="m7 10 5 5 5-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
              </div>
            </div>
          </div>

          <div class="ln-form__grid">
            <div class="ln-form__row">
              <label class="ln-label" for="fixedStart">Start</label>
              <input class="input" id="fixedStart" type="time" required />
            </div>
            <div class="ln-form__row">
              <label class="ln-label" for="fixedEnd">End</label>
              <input class="input" id="fixedEnd" type="time" required />
            </div>
          </div>

          <div class="ln-form__actions">
            <button class="btn btn--ghost" type="button" id="fixedCancel">Cancel</button>
            <button class="btn btn--danger" type="button" id="fixedDelete" hidden>Delete</button>
            <button class="btn btn--primary" type="submit" id="fixedSave">Save</button>
          </div>
          <div class="ln-form__hint" id="fixedHint" aria-live="polite"></div>
        </form>
      </div>
    </div>
  </section>
