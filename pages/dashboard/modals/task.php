  <section class="ln-modal" id="modalTask" data-module="modal_task" role="dialog" aria-modal="true" aria-hidden="true" aria-labelledby="modalTaskTitle">
    <div class="ln-modal__backdrop" data-close="modal"></div>
    <div class="ln-modal__panel">
      <div class="ln-modal__head">
        <h3 class="ln-modal__title" id="modalTaskTitle">Add Task</h3>
        <button class="ln-modal__close" type="button" data-close="modal" aria-label="Close"><svg class="icon icon--xs" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></button>
      </div>
      <form class="ln-form" id="taskForm">
        <input type="hidden" id="taskId" value="" />
        <div class="ln-form__row">
          <label class="ln-label" for="taskTitle">Title</label>
          <input class="input" id="taskTitle" name="title" type="text" maxlength="255" required />
        </div>
        <div class="ln-form__grid">
          <div class="ln-form__row">
            <label class="ln-label" for="taskKind">Type</label>
            <div class="select-wrap">
              <select class="select select--native" id="taskKind" name="kind">
                <option value="personal">Personal</option>
                <option value="study">Study</option>
              </select>
              <svg class="select-wrap__ic" viewBox="0 0 24 24" aria-hidden="true"><path d="m7 10 5 5 5-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
            </div>
          </div>
          <div class="ln-form__row">
            <label class="ln-label" for="taskPriority">Priority</label>
            <div class="select-wrap">
              <select class="select select--native" id="taskPriority" name="priority">
                <option value="low">Low</option>
                <option value="medium" selected>Medium</option>
                <option value="high">High</option>
              </select>
              <svg class="select-wrap__ic" viewBox="0 0 24 24" aria-hidden="true"><path d="m7 10 5 5 5-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
            </div>
          </div>
        </div>
        <div class="ln-form__grid">
          <div class="ln-form__row">
            <label class="ln-label" for="taskDue">Due date</label>
            <input class="input input--date" id="taskDue" name="due_date" type="date" />
          </div>
          <div class="ln-form__row">
            <label class="ln-label" for="taskDur">Duration (min)</label>
            <input class="input" id="taskDur" name="duration_minutes" type="number" min="1" max="1440" placeholder="e.g. 90" />
          </div>
        </div>
        <div class="ln-form__grid">
          <div class="ln-form__row">
            <label class="ln-label" for="taskCost">Expected cost (optional)</label>
            <input class="input" id="taskCost" name="expected_cost" inputmode="decimal" type="text" placeholder="e.g. 12.50" />
          </div>
          <div class="ln-form__row">
            <label class="ln-label" for="taskCostCurrency">Cost currency</label>
            <div class="select-wrap">
              <select class="select select--native" id="taskCostCurrency" name="expected_cost_currency">
                <option value="TRY" selected>TRY</option>
              </select>
              <svg class="select-wrap__ic" viewBox="0 0 24 24" aria-hidden="true"><path d="m7 10 5 5 5-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
            </div>
          </div>
        </div>

        <div class="ln-form__actions">
          <button class="btn btn--ghost" type="button" data-close="modal">Cancel</button>
          <button class="btn btn--danger" type="button" id="taskDeleteBtn" hidden>Delete</button>
          <button class="btn btn--primary" type="submit">Save</button>
        </div>
        <div class="ln-form__hint" id="taskFormHint" aria-live="polite"></div>
      </form>
    </div>
  </section>
