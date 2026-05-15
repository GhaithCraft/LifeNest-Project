<?php
declare(strict_types=1);

require_once __DIR__ . '/includes/security_headers.php';
require_once __DIR__ . '/includes/session.php';
require_once __DIR__ . '/includes/auth.php';
require_once __DIR__ . '/includes/assets.php';
require_once __DIR__ . '/includes/site_settings.php';
require_once __DIR__ . '/includes/admin.php';
require_once __DIR__ . '/includes/page_chrome.php';

function h(string $s): string { return htmlspecialchars($s, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8'); }

auth_bootstrap();

$brand = site_brand_name();
$canAdmin = is_admin_user();

if (current_user_id() === null) {
    header('Location: /login.php', true, 302);
    exit;
}
?>
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title><?= h($brand) ?> — Study</title>
  <link rel="icon" href="<?= h(site_favicon_url()) ?>" />
  <script src="<?= h(asset_url('/assets/js/core/theme.js')) ?>"></script>
  <link rel="stylesheet" href="<?= h(asset_url('/assets/css/app.css')) ?>" />
  <link rel="stylesheet" href="/theme.php" />
  <link rel="stylesheet" href="<?= h(asset_url('/assets/css/pages/dashboard/shell.css')) ?>" />
  <link rel="stylesheet" href="<?= h(asset_url('/assets/css/pages/app_pages.css')) ?>" />
  <link rel="stylesheet" href="<?= h(asset_url('/assets/css/pages/study/study.css')) ?>" />
</head>
<body>
  <div class="bg"></div>

  <div class="dashboard-shell">

    <?php render_app_sidebar(['active' => 'study', 'brand' => $brand, 'logo_url' => site_logo_url(), 'can_admin' => $canAdmin]); ?>

    <div class="dashboard-main">
      <?php render_app_topbar(['title' => 'Study', 'eyebrow' => 'Study planner', 'search_id' => 'studySearch', 'search_placeholder' => 'Search', 'search_aria' => 'Search study tasks', 'can_admin' => $canAdmin]); ?>

      <?php render_app_drawer(['active' => 'study', 'can_admin' => $canAdmin]); ?>

  <main class="page" role="main">

    <section class="page-hero page-hero--study">
      <div class="page-hero__content">
        <div class="page-hero__eyebrow">Study Control Panel</div>
        <nav class="st-crumb page-hero__crumb" aria-label="Breadcrumb">
          <a class="st-crumb__link" href="/index.php">Dashboard</a>
          <span class="st-crumb__sep" aria-hidden="true">›</span>
          <span class="st-crumb__cur" aria-current="page">Study</span>
        </nav>
        <h1 class="section-title st-title">Organize courses, deadlines, and study tasks with the same homepage design logic</h1>
        <p class="page-hero__desc">The study page now follows the same shell, spacing, and hero treatment so the whole app feels like one product.</p>
        <div class="page-hero__chips">
          <span class="page-hero__chip">Course tracking</span>
          <span class="page-hero__chip">Study tasks</span>
          <span class="page-hero__chip">Deadline visibility</span>
        </div>
      </div>
    </section>

    <section class="st-top" aria-label="Study summary">
      <article class="card st-card st-card--today" aria-label="Study time today">
        <div class="st-card__main">
          <div class="st-kicker">Study Time Today<br/><span class="st-kicker__sub">(Planned vs. Done)</span></div>
          <div class="st-sub" id="stTodayRemain">Remaining Today: —</div>
        </div>
        <div class="st-card__aside">
          <div class="st-donut" aria-hidden="true">
            <canvas id="studyPie" width="110" height="110"></canvas>
            <div class="st-donut__txt">
              <div class="st-donut__big" id="stTodayHours">—</div>
              <div class="st-donut__hint">Done</div>
            </div>
          </div>
        </div>
      </article>

      <article class="card st-card st-card--week" aria-label="Weekly study load">
        <div class="st-kicker">Weekly Study Load</div>
        <div class="st-week__spark">
          <canvas id="weeklySpark" width="360" height="86" aria-label="Weekly load"></canvas>
        </div>
        <div class="st-sub" id="stWeekTotal">Total for Week: —</div>
      </article>

      <article class="card st-card st-card--dead" aria-label="Key deadlines">
        <div class="st-kicker">Key Deadlines &amp; Exams</div>
        <div class="st-alert" id="stDeadlines">
          <div class="st-alert__row">
            <div class="st-alert__ic" aria-hidden="true"><svg class="icon icon--sm" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.5 2.2 20.2a1.6 1.6 0 0 0 1.4 2.4h16.8a1.6 1.6 0 0 0 1.4-2.4L12 3.5Z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M12 9v5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M12 17.5h.01" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg></div>
            <div class="st-alert__txt">
              <div class="st-alert__title" id="stDeadTitle">—</div>
              <div class="st-alert__msg" id="stDeadMsg">—</div>
            </div>
          </div>
        </div>
      </article>

      <article class="card st-card st-card--prog" aria-label="Overall progress">
        <div class="st-kicker">Overall Course Progress</div>
        <div class="st-prog__row">
          <div class="st-prog__name">Semesters</div>
          <div class="st-prog__pct" id="stOverallPct">—%</div>
        </div>
        <div class="st-bar p0" id="stOverallBar" aria-label="Overall progress bar">
          <div class="st-bar__track"></div>
          <div class="st-bar__fill"></div>
        </div>
        <div class="st-sub" id="stOverallMsg">—</div>
      </article>
    </section>

    <section class="st-grid" aria-label="Study tools">
      <article class="card st-panel" aria-label="Active courses">
        <div class="card__header">
          <h2 class="card__title">Active Courses/Subjects</h2>
          <button class="dots-btn" type="button" aria-label="More options" id="stCoursesMenu">···</button>
        </div>
        <div class="st-panel__body" id="stCourses"></div>
        <div class="st-empty" id="stCoursesEmpty" hidden>
          <div class="st-empty__title">No courses yet</div>
          <div class="st-empty__msg">Add a course name when creating a study task.</div>
        </div>
      </article>

      <article class="card st-panel" aria-label="Quick add study task">
        <div class="card__header">
          <h2 class="card__title">Quick Add Study Goal</h2>
          <button class="dots-btn" type="button" aria-label="More options" id="stQuickMenu">···</button>
        </div>

        <form class="st-panel__body" id="stAddForm" autocomplete="off">
          <div class="st-field">
            <label class="ln-label" for="stCourse">Category</label>
            <input class="input" id="stCourse" type="text" maxlength="60" list="stCoursesDL" placeholder="Define a Target" />
            <div class="ln-form__hint">Optional. Example: CS50, Math 101.</div>
          </div>

          <div class="st-field">
            <label class="ln-label" for="stTitle">Task Description</label>
            <input class="input" id="stTitle" type="text" maxlength="255" placeholder="e.g. Complete Chapter 4" required />
          </div>

          <div class="st-field">
            <label class="ln-label" for="stDue">Date</label>
            <div class="st-field__row">
              <div class="date-wrap">
                <input class="input input--date" id="stDue" type="date" />
                <svg class="date-wrap__ic" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M7 2v3M17 2v3M3.5 9h17M5 5h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                </svg>
              </div>
            </div>
          </div>

          <div class="st-field">
            <label class="ln-label" for="stDur">Est. Duration (min)</label>
            <input class="input" id="stDur" inputmode="numeric" type="number" min="1" max="1440" placeholder="Amount" />
          </div>

          <button class="btn btn--primary btn--full st-cta" type="submit" id="stAddBtn">Add Study Task</button>
          <div class="ln-form__hint" id="stAddHint" aria-live="polite"></div>

          <a class="btn btn--ghost btn--full st-ghost" href="/index.php">Start Pomodoro/Focus Session</a>
        </form>
      </article>

      <article class="card st-ledger" aria-label="Study task manager">
        <div class="card__header">
          <h2 class="card__title">Study Task Manager</h2>
          <div class="st-tabs" role="tablist" aria-label="Study filters">
            <button class="tab is-active" type="button" role="tab" aria-selected="true" data-tab="all">All Study Tasks</button>
            <button class="tab" type="button" role="tab" aria-selected="false" data-tab="week">This Week</button>
            <button class="tab" type="button" role="tab" aria-selected="false" data-tab="overdue">Overdue</button>
            <button class="tab" type="button" role="tab" aria-selected="false" data-tab="upcoming">Upcoming</button>
          </div>
        </div>

        <div class="st-ledger__body">
          <div class="st-ledger__head">
            <div class="st-ledger__title">Filter Bar List</div>
            <div class="select-wrap st-ledger__filter">
              <select class="select select--native" id="stFilterCourse" aria-label="Filter by course">
                <option value="">Filter by Course</option>
              </select>
              <svg class="select-wrap__ic" viewBox="0 0 24 24" aria-hidden="true"><path d="m7 10 5 5 5-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
            </div>
          </div>

          <div class="st-tablewrap" role="region" aria-label="Study tasks table" tabindex="0">
            <table class="st-table" aria-label="Study tasks">
              <thead>
                <tr>
                  <th class="st-ic" aria-label="Done"></th>
                  <th>Date</th>
                  <th>Subject</th>
                  <th>Task Description</th>
                  <th>Est Dur.</th>
                  <th>Status</th>
                  <th class="st-act" aria-label="Actions"></th>
                </tr>
              </thead>
              <tbody id="stTbody"></tbody>
            </table>

            <div class="st-empty" id="stEmpty" hidden>
              <div class="st-empty__title">No study tasks</div>
              <div class="st-empty__msg">Add your first study task to start tracking.</div>
            </div>
          </div>

          <div class="st-timeline">
            <div class="st-timeline__title">Exam &amp; Assignment Timeline (This Month)</div>
            <canvas class="st-timeline__canvas" id="stTimeline" width="720" height="160" aria-label="Timeline"></canvas>
          </div>
        </div>
      </article>
    </section>

    <footer class="footer" role="contentinfo">
      <div class="footer__text">Last synced: <span id="lastSynced">—</span>.&nbsp;&nbsp; Secure Connection.&nbsp;&nbsp; Version 2.1.</div>
    </footer>
  </main>

  <datalist id="stCoursesDL"></datalist>

  <script src="<?= h(asset_url('/assets/js/lib/charts.js')) ?>"></script>
    </div>
  </div>

  <script src="<?= h(asset_url('/assets/js/core/app.js')) ?>"></script>
  <script src="<?= h(asset_url('/assets/js/pages/dashboard/shell.js')) ?>"></script>
  <script src="<?= h(asset_url('/assets/js/pages/study.js')) ?>"></script>
</body>
</html>
