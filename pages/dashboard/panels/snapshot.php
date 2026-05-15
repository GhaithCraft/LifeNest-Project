<section class="panel panel--snapshot dashboard-hero-card" data-module="snapshot" aria-label="Dashboard hero overview">
  <div class="hero-banner">
    <div class="hero-banner__copy">
      <div class="hero-banner__eyebrow">Dashboard</div>
      <h2 class="hero-banner__title">Welcome back, <span id="heroUserName">User</span>!</h2>
      <p class="hero-banner__subtitle">It's <span id="heroCurrentDate">—</span>, and here's your overview for today.</p>
    </div>

    <div class="hero-banner__stats" aria-label="Today overview cards">
      <article class="hero-stat hero-stat--mint">
        <div class="hero-stat__label">Tasks Today</div>
        <div class="hero-stat__value" id="snapTasksTodayCount">—</div>
        <div class="hero-stat__progress p0" id="snapTasksTodayProgress" aria-label="Tasks completed progress">
          <div class="hero-stat__track"></div>
          <div class="hero-stat__fill"></div>
        </div>
        <div class="hero-stat__meta" id="snapTasksTodayMeta">—</div>
      </article>

      <article class="hero-stat hero-stat--blue">
        <div class="hero-stat__label">Budget Remaining</div>
        <div class="hero-stat__value" id="snapBudgetRemaining">—</div>
        <div class="hero-stat__progress p0" id="snapBudgetProgress" aria-label="Budget remaining progress">
          <div class="hero-stat__track"></div>
          <div class="hero-stat__fill"></div>
        </div>
        <div class="hero-stat__meta" id="snapBudgetMeta">This month</div>
      </article>

      <article class="hero-stat hero-stat--sand hero-stat--compact">
        <div class="hero-stat__label">Weekly Progress</div>
        <div class="hero-stat__value" id="snapWeekly">—</div>
        <div class="hero-stat__meta" id="snapWeeklyMeta">—</div>
        <canvas class="hero-stat__spark" id="weeklySpark" width="140" height="44" aria-label="Weekly progress sparkline"></canvas>
      </article>
    </div>
  </div>

  <canvas class="hero-banner__pie" id="studyPie" width="72" height="72" aria-label="Study planned versus done chart"></canvas>
  <div class="hero-banner__hidden" aria-hidden="true">
    <span id="snapOverdueCount"></span>
    <span id="snapOverdueMeta"></span>
    <span id="snapStudyValue"></span>
    <span id="snapStudyMeta"></span>
    <span id="snapSpentToday"></span>
    <span id="snapSpentTodayMeta"></span>
    <span id="mSnapTasks"></span>
    <span id="mSnapTasksHint"></span>
    <span id="mSnapStudy"></span>
    <span id="mSnapStudyHint"></span>
    <div id="mSnapTasksBar"></div>
    <div id="mSnapStudyBar"></div>
  </div>
</section>
