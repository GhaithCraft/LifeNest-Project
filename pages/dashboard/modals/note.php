  <section class="ln-modal ln-modal--note" id="modalNote" data-module="modal_note" role="dialog" aria-modal="true" aria-hidden="true" aria-labelledby="modalNoteTitle">
    <div class="ln-modal__backdrop" data-close="modal"></div>
    <div class="ln-modal__panel ln-modal__panel--note">
      <div class="ln-modal__head ln-modal__head--note">
        <h3 class="ln-modal__title ln-modal__title--note" id="modalNoteTitle">Add Note to Task: <span class="ln-note2__taskName" id="noteTaskName">—</span></h3>
        <button class="ln-modal__close ln-modal__close--note" type="button" data-close="modal" aria-label="Close"><svg class="icon icon--xs" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></button>
      </div>

      <form class="ln-note2" id="noteForm" autocomplete="off">
        <div class="ln-note2__grid" id="notesGrid" aria-live="polite">
          <div class="ln-note2__card ln-note2__composer" id="noteComposer" data-color="blue">
            <div class="ln-note2__composerHead">
              <div class="ln-note2__composerTitle" id="noteComposerTitle">Add New Note</div>
            </div>

            <input class="ln-note2__input" id="noteTitle" type="text" maxlength="160" placeholder="Note title (optional)" aria-label="Note title" />
            <textarea class="ln-note2__ta" id="noteBody" rows="5" maxlength="5000" placeholder="Type your detailed note here..." required></textarea>

            <div class="ln-note2__pickerLabel">Choose a background color:</div>
            <input type="hidden" id="noteColor" value="blue" />
            <div class="ln-note2__picker" id="noteColorPicker" role="radiogroup" aria-label="Note color">
              <button class="ln-note2__swatch is-active" type="button" data-color="blue" role="radio" aria-checked="true" aria-label="Blue"></button>
              <button class="ln-note2__swatch" type="button" data-color="mint" role="radio" aria-checked="false" aria-label="Mint"></button>
              <button class="ln-note2__swatch" type="button" data-color="yellow" role="radio" aria-checked="false" aria-label="Yellow"></button>
              <button class="ln-note2__swatch" type="button" data-color="pink" role="radio" aria-checked="false" aria-label="Pink"></button>
              <button class="ln-note2__swatch" type="button" data-color="gray" role="radio" aria-checked="false" aria-label="Gray"></button>
            </div>
          </div>
        </div>

        <div class="ln-note2__footer">
          <div class="ln-note2__saved" aria-hidden="true">
            <span class="ln-note2__savedIcon" aria-hidden="true">⟲</span>
            <span>Changes saved instantly.</span>
          </div>

          <div class="ln-note2__actions">
            <button class="btn btn--ghost" type="button" data-close="modal">Cancel</button>
            <button class="btn btn--primary" id="noteSaveBtn" type="submit">Save Note</button>
          </div>
        </div>

        <div class="ln-form__hint" id="noteFormHint" aria-live="polite"></div>
      </form>
    </div>
  </section>
