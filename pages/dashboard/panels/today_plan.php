<?php
// Dashboard Panel: Today Plan (Stage 4B)
?>

<article class="card card--today-plan panel panel--today-plan" data-module="today_plan">
  <div class="card__header">
    <h3 class="card__title">Smart Schedule</h3>
    <button class="dots-btn" type="button" aria-label="More options">···</button>
  </div>

  <div class="today-plan">
    <div class="today-plan__layout">
      <section class="today-plan__main">

        <section class="today-plan__block today-plan__block--stats" aria-labelledby="todayPlanStatsTitle">
          <div class="today-plan__block-head">
            <div class="today-plan__block-title" id="todayPlanStatsTitle">Today Metrics</div>
          </div>
          <div class="today-plan__stats" id="todayPlanStats" aria-label="Today plan summary"></div>
        </section>

        <section class="today-plan__manual" id="todayPlanManual" hidden aria-labelledby="todayPlanManualTitle">
          <div class="today-plan__manual-top">
            <div>
              <div class="today-plan__manual-title" id="todayPlanManualTitle">Lock Time Slot</div>
            </div>
            <button class="today-plan__manual-close" type="button" id="btnTodayPlanManualCancelTop" aria-label="Close manual override">×</button>
          </div>

          <div class="today-plan__manual-grid">
            <div class="today-plan__manual-card">
              <div class="today-plan__manual-card-label">Task</div>
              <div class="today-plan__manual-task" id="todayPlanManualTask">—</div>
            </div>

            <label class="today-plan__manual-card today-plan__manual-card--field" for="todayPlanManualStart">
              <span class="today-plan__manual-card-label">Start</span>
              <input class="input" type="time" id="todayPlanManualStart" min="08:00" max="23:00" step="300">
            </label>

            <div class="today-plan__manual-card">
              <div class="today-plan__manual-card-label">Duration</div>
              <div class="today-plan__manual-duration" id="todayPlanManualDuration">—</div>
            </div>
          </div>

          <div class="today-plan__manual-hint" id="todayPlanManualHint"></div>

          <div class="today-plan__manual-actions">
            <button class="btn btn--ghost" type="button" id="btnTodayPlanManualCancel">Cancel</button>
            <button class="btn btn--primary" type="button" id="btnTodayPlanManualSave">Lock Slot</button>
          </div>
        </section>

        <div class="today-plan__actions today-plan__actions--desktop">
          <button class="btn btn--ghost btn--full" type="button" id="btnReplan" data-action="replan">Rebuild Today Plan</button>
          <button class="btn btn--primary btn--full" type="button" data-open="focus">
            <span class="btn__icon" aria-hidden="true">▶</span>
            Start Focus Session
          </button>
        </div>

        <div class="today-plan__actions today-plan__actions--mobile">
          <button class="btn btn--ghost btn--full" type="button" id="btnReplanMobile" data-action="replan">Rebuild Today Plan</button>
          <button class="btn btn--primary btn--full" type="button" data-open="focus">
            <span class="btn__icon" aria-hidden="true">▶</span>
            Start Focus Session
          </button>
        </div>
      </section>

      <aside class="today-plan__side">
        <section class="today-plan__block" aria-labelledby="todayPlanPrioritiesTitle">
          <div class="today-plan__block-head">
            <div class="today-plan__block-title" id="todayPlanPrioritiesTitle">Top Priorities</div>
          </div>
          <div class="prio-list" id="prioList" aria-label="Top priorities"></div>
        </section>

        <section class="today-plan__block" aria-labelledby="todayPlanFixedBlocksTitle">
          <div class="today-plan__block-head">
            <div class="today-plan__block-title" id="todayPlanFixedBlocksTitle">Fixed Blocks</div>
          </div>
          <div class="time-blocks" id="timeBlocks" aria-label="Fixed time blocks"></div>
        </section>
      </aside>
    </div>
  </div>
</article>
