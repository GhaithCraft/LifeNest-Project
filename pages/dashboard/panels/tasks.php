<article class="card card--tasks panel panel--tasks" data-module="tasks">
  <div class="card__header">
    <div>
      <h3 class="card__title">Today Plan</h3>
      <p class="card__subtitle">Your most relevant tasks for today, with unfinished work shown first.</p>
    </div>
    <button class="dots-btn" type="button" aria-label="More options" data-menu="tasks">···</button>
  </div>

  <div class="tasks-overview">
    <div class="tasks-overview__bar p0" id="todayPlanTaskProgress" aria-label="Today plan completion progress">
      <div class="tasks-overview__track"></div>
      <div class="tasks-overview__fill"></div>
    </div>
    <div class="tasks-overview__meta">
      <span class="tasks-overview__text" id="todayPlanTaskProgressText">Showing 0 tasks</span>
      <a class="tasks-overview__link" href="/tasks.php">Open full tasks</a>
    </div>
  </div>

  <div class="task-list-tools" aria-label="Today plan tools">
    <div class="task-list-tools__group">
      <label class="task-sort" for="todayPlanSort">
        <span class="task-sort__label">Sort by</span>
        <span class="task-sort__wrap">
          <select class="task-sort__select" id="todayPlanSort" aria-label="Sort today plan tasks">
            <option value="smart" selected>Smart order</option>
            <option value="priority">Priority</option>
            <option value="due">Due date</option>
            <option value="newest">Newest</option>
          </select>
          <svg class="task-sort__ic" viewBox="0 0 24 24" aria-hidden="true"><path d="m7 10 5 5 5-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </span>
      </label>

      <label class="task-toggle" for="todayPlanIncludeCompleted">
        <input class="task-toggle__input" type="checkbox" id="todayPlanIncludeCompleted">
        <span class="task-toggle__ui" aria-hidden="true"></span>
        <span class="task-toggle__text">Show completed</span>
      </label>
    </div>
  </div>

  <div class="task-table-head" aria-hidden="true">
    <span class="task-table-head__task">Task</span>
    <span class="task-table-head__priority">Priority</span>
    <span class="task-table-head__status">Status</span>
  </div>

  <div class="task-list" id="tasksList" data-panel="today" aria-label="Tasks list"></div>

  <div class="task-list-more" id="todayPlanMoreWrap" hidden>
    <button class="btn btn--ghost" type="button" id="todayPlanLoadMore">Load more</button>
  </div>
</article>
