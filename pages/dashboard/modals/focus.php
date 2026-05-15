  <section class="ln-modal" id="modalFocus" data-module="modal_focus" role="dialog" aria-modal="true" aria-hidden="true" aria-labelledby="modalFocusTitle">
    <div class="ln-modal__backdrop" data-close="modal"></div>
    <div class="ln-modal__panel ln-modal__panel--focus">
      <div class="ln-modal__head">
        <h3 class="ln-modal__title" id="modalFocusTitle">Focus Session</h3>
        <button class="ln-modal__close" type="button" data-close="modal" aria-label="Close"><svg class="icon icon--xs" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></button>
      </div>

      <div class="focus" aria-label="Focus session">
        <div class="focus__grid">
          <div class="ln-form__row">
            <label class="ln-label" for="focusMinutes">Duration (min)</label>
            <input class="input" id="focusMinutes" type="number" min="5" max="240" value="25" />
          </div>
          <div class="ln-form__row">
            <label class="ln-label" for="focusStudyId">Log to study (optional)</label>
            <div class="select-wrap">
              <select class="select select--native" id="focusStudyId">
                <option value="">— None —</option>
              </select>
              <svg class="select-wrap__ic" viewBox="0 0 24 24" aria-hidden="true"><path d="m7 10 5 5 5-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
            </div>
          </div>
        </div>

        <div class="focus__timer" id="focusTimer" aria-live="polite">25:00</div>

        <div class="focus__controls">
          <button class="btn btn--primary" type="button" id="focusStart">Start</button>
          <button class="btn btn--ghost" type="button" id="focusPause" hidden>Pause</button>
          <button class="btn btn--ghost" type="button" id="focusResume" hidden>Resume</button>
          <button class="btn btn--danger" type="button" id="focusStop" disabled>Stop</button>
        </div>

        <div class="ln-form__hint" id="focusHint" aria-live="polite"></div>
      </div>
    </div>
  </section>
