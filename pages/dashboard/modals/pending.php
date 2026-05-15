  <section class="ln-modal" id="modalPending" data-module="modal_pending" role="dialog" aria-modal="true" aria-hidden="true" aria-labelledby="modalPendingTitle">
    <div class="ln-modal__backdrop" data-close="modal"></div>
    <div class="ln-modal__panel ln-modal__panel--wide">
      <div class="ln-modal__head">
        <h3 class="ln-modal__title" id="modalPendingTitle">Pending Actions</h3>
        <button class="ln-modal__close" type="button" data-close="modal" aria-label="Close"><svg class="icon icon--xs" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></button>
      </div>
      <div class="ln-pending">
        <div class="ln-pending__hint" id="pendingHint" aria-live="polite"></div>
        <div class="ln-pending__list" id="pendingList" aria-label="Pending actions list"></div>
      </div>
    </div>
  </section>
