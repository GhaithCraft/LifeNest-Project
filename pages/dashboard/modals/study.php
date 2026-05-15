  <section class="ln-modal" id="modalStudy" data-module="modal_study" role="dialog" aria-modal="true" aria-hidden="true" aria-labelledby="modalStudyTitle">
    <div class="ln-modal__backdrop" data-close="modal"></div>
    <div class="ln-modal__panel">
      <div class="ln-modal__head">
        <h3 class="ln-modal__title" id="modalStudyTitle">Add Study Task</h3>
        <button class="ln-modal__close" type="button" data-close="modal" aria-label="Close"><svg class="icon icon--xs" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></button>
      </div>
      <form class="ln-form" id="studyForm">
        <input type="hidden" id="studyId" value="" />
        <div class="ln-form__row">
          <label class="ln-label" for="studyTitle">Title</label>
          <input class="input" id="studyTitle" type="text" maxlength="255" required />
        </div>
        <div class="ln-form__grid">
          <div class="ln-form__row">
            <label class="ln-label" for="studyPlanned">Planned (min)</label>
            <input class="input" id="studyPlanned" type="number" min="0" max="100000" value="60" />
          </div>
          <div class="ln-form__row">
            <label class="ln-label" for="studyDone">Done (min)</label>
            <input class="input" id="studyDone" type="number" min="0" max="100000" value="0" />
          </div>
        </div>
        <div class="ln-form__row">
          <label class="ln-label" for="studyDue">Next due date</label>
          <input class="input input--date" id="studyDue" type="date" />
        </div>

        <div class="ln-form__actions">
          <button class="btn btn--ghost" type="button" data-close="modal">Cancel</button>
          <button class="btn btn--danger" type="button" id="studyDeleteBtn" hidden>Delete</button>
          <button class="btn btn--primary" type="submit">Save</button>
        </div>
        <div class="ln-form__hint" id="studyFormHint" aria-live="polite"></div>
      </form>
    </div>
  </section>
