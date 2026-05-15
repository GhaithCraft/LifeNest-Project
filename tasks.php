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
  <title><?= h($brand) ?> — Tasks</title>
  <link rel="icon" href="<?= h(site_favicon_url()) ?>" />
  <script src="<?= h(asset_url('/assets/js/core/theme.js')) ?>"></script>
  <link rel="stylesheet" href="<?= h(asset_url('/assets/css/app.css')) ?>" />
  <link rel="stylesheet" href="/theme.php" />
  <link rel="stylesheet" href="<?= h(asset_url('/assets/css/pages/dashboard/shell.css')) ?>" />
  <link rel="stylesheet" href="<?= h(asset_url('/assets/css/pages/app_pages.css')) ?>" />
  <link rel="stylesheet" href="<?= h(asset_url('/assets/css/pages/tasks.css')) ?>" />
</head>
<body>
  <div class="bg"></div>

  <div class="dashboard-shell">

    <?php render_app_sidebar(['active' => 'tasks', 'brand' => $brand, 'logo_url' => site_logo_url(), 'can_admin' => $canAdmin]); ?>

    <div class="dashboard-main">
      <?php render_app_topbar(['title' => 'Tasks', 'eyebrow' => 'Tasks workspace', 'search_id' => 'taskSearch', 'search_placeholder' => 'Search', 'search_aria' => 'Search tasks', 'can_admin' => $canAdmin]); ?>

      <?php render_app_drawer(['active' => 'tasks', 'can_admin' => $canAdmin]); ?>

  <main class="page" role="main">

    <section class="page-hero page-hero--tasks">
      <div class="page-hero__content">
        <div class="page-hero__eyebrow">Tasks Workspace</div>
        <nav class="tk-crumb page-hero__crumb" aria-label="Breadcrumb">
          <a class="tk-crumb__link" href="/index.php">Dashboard</a>
          <span class="tk-crumb__sep" aria-hidden="true">›</span>
          <span class="tk-crumb__cur" aria-current="page">Tasks</span>
        </nav>
        <h1 class="section-title tk-title">Manage your tasks with a clearer dashboard-style workflow</h1>
        <p class="page-hero__desc">Track priorities, due dates, notes, and progress from a layout that matches the new LifeNest homepage.</p>
        <div class="page-hero__chips">
          <span class="page-hero__chip">Daily planning</span>
          <span class="page-hero__chip">Priority tracking</span>
          <span class="page-hero__chip">Task notes</span>
        </div>
      </div>
    </section>

    <section class="tk-grid" aria-label="Tasks workspace">
      <article class="card tk-panel" aria-label="Views and filters">
        <div class="card__header">
          <h2 class="card__title">Views &amp; Filters</h2>
          <button class="dots-btn" type="button" aria-label="More options" id="tkViewMenu">···</button>
        </div>

        <div class="tk-panel__body">
          <div class="tk-views" role="tablist" aria-label="Task views">
            <button class="tk-view is-active" type="button" data-view="today" role="tab" aria-selected="true">
              <span class="tk-ic" aria-hidden="true"><svg class="icon icon--sm" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3v3M17 3v3M4 8h16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M6 6h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2Z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M8 12h3v3H8z" fill="currentColor"/></svg></span>
              <span class="tk-view__label">Today</span>
              <span class="tk-badge" id="cntToday">0</span>
            </button>
            <button class="tk-view" type="button" data-view="upcoming" role="tab" aria-selected="false">
              <span class="tk-ic" aria-hidden="true"><svg class="icon icon--sm" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3v3M17 3v3M4 8h16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M6 6h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2Z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg></span>
              <span class="tk-view__label">Upcoming</span>
              <span class="tk-badge" id="cntUpcoming">0</span>
            </button>
            <button class="tk-view" type="button" data-view="overdue" role="tab" aria-selected="false">
              <span class="tk-ic" aria-hidden="true"><svg class="icon icon--sm" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.5 2.2 20.2a1.6 1.6 0 0 0 1.4 2.4h16.8a1.6 1.6 0 0 0 1.4-2.4L12 3.5Z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M12 9v5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M12 17.5h.01" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg></span>
              <span class="tk-view__label">Overdue</span>
              <span class="tk-badge tk-badge--red" id="cntOverdue">0</span>
            </button>
            <button class="tk-view" type="button" data-view="completed" role="tab" aria-selected="false">
              <span class="tk-ic" aria-hidden="true"><svg class="icon icon--sm" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 6 9 17l-5-5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg></span>
              <span class="tk-view__label">Completed</span>
              <span class="tk-badge" id="cntDone">0</span>
            </button>
          </div>

          <button class="btn btn--ghost tk-cal" type="button" id="tkCalendarBtn" disabled>
            <span class="tk-ic" aria-hidden="true"><svg class="icon icon--sm" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3v3M17 3v3M4 8h16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M6 6h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2Z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg></span>
            <span>Calendar View</span>
          </button>

          <div class="tk-subhead">Tags &amp; Categories</div>

          <div class="tk-tags" id="tkTags" aria-label="Task categories"></div>

          <div class="ln-form__hint tk-hint">Tip: Use <strong>[Course]</strong> prefix in titles (e.g. <strong>[CS50]</strong>) to enable course filtering.</div>
        </div>
      </article>
      <article class="card tk-main" aria-label="Tasks list">
        <div class="tk-banner tk-banner--error" id="tkError" hidden role="status" aria-live="polite">
          <div class="tk-banner__msg" id="tkErrorMsg"></div>
          <button class="btn btn--ghost btn--sm" type="button" id="tkRetry">Reload</button>
        </div>

        <div class="tk-loading" id="tkLoading" aria-live="polite">
          <div class="tk-loading__dot" aria-hidden="true"></div>
          <div class="tk-loading__text">Loading tasks…</div>
        </div>

        <noscript>
          <div class="tk-banner tk-banner--error tk-banner--noscript">This page requires JavaScript to run.</div>
        </noscript>

        <div class="tk-quick" id="tkQuick" aria-label="Quick add task">
          <div class="tk-quick__row">
            <input class="input tk-quick__title" id="tkNewTitle" type="text" maxlength="255" placeholder="Add a new task..." />
            <input class="input input--date tk-quick__date" id="tkNewDue" type="date" aria-label="Due date" />
            <div class="select-wrap tk-quick__kind">
              <select class="select select--native" id="tkNewKind" aria-label="Type">
                <option value="personal">Personal</option>
                <option value="study">Study</option>
              </select>
              <svg class="select-wrap__ic" viewBox="0 0 24 24" aria-hidden="true"><path d="m7 10 5 5 5-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
            </div>
            <button class="btn btn--primary tk-quick__add" type="button" id="tkAddBtn" aria-label="Add">
              <span class="tk-plus" aria-hidden="true">+</span>
            </button>
          </div>
          <div class="tk-quick__hint" id="tkQuickHint" aria-live="polite"></div>
        </div>

        <div class="tk-list">
          <div class="tk-list__head">
            <div class="tk-list__title">Tasks (Full List)</div>
            <div class="tk-list__meta" id="tkListMeta">—</div>
          </div>

          <div class="tk-table" role="table" aria-label="Tasks">
            <div class="tk-row tk-row--head" role="row">
              <div class="tk-cell tk-cell--check" role="columnheader" aria-label="Done"></div>
              <div class="tk-cell tk-cell--title" role="columnheader">Task</div>
              <div class="tk-cell tk-cell--due" role="columnheader">Due</div>
              <div class="tk-cell tk-cell--kind" role="columnheader">Type</div>
              <div class="tk-cell tk-cell--actions" role="columnheader" aria-label="Actions"></div>
            </div>
            <div class="tk-body" id="tkBody" role="rowgroup"></div>
          </div>

          <div class="tk-empty" id="tkEmpty" hidden>
            <div class="tk-empty__title">No tasks here</div>
            <div class="tk-empty__msg">Add a task or switch the view.</div>
          </div>
        </div>
      </article>

    </section>

    <div class="tk-modal" id="tkDetailModal" hidden aria-hidden="true">
      <div class="tk-modal__backdrop" data-close-task-modal="1" aria-hidden="true"></div>
      <div class="tk-modal__dialog" role="dialog" aria-modal="true" aria-labelledby="dtTitle">
        <div class="tk-modal__header">
          <div class="tk-modal__eyebrow">Task Details</div>
          <button class="tk-modal__close" type="button" id="btnModalClose" data-close-task-modal="1" aria-label="Close task details">
            <svg class="icon icon--sm" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
          </button>
        </div>

        <div class="tk-side__body tk-side__body--modal">
          <div class="tk-detail" id="tkDetail" hidden>
            <div class="tk-detail__title" id="dtTitle">Task Details</div>
            <div class="tk-detail__sub" id="dtSub">—</div>

            <div class="tk-props" aria-label="Task properties">
              <div class="tk-prop"><span class="tk-prop__k">Date</span><span class="tk-prop__v" id="dtDue">—</span></div>
              <div class="tk-prop"><span class="tk-prop__k">Priority</span><span class="tk-prop__v" id="dtPri">—</span></div>
              <div class="tk-prop"><span class="tk-prop__k">Type</span><span class="tk-prop__v" id="dtKind">—</span></div>
              <div class="tk-prop"><span class="tk-prop__k">Duration</span><span class="tk-prop__v" id="dtDur">—</span></div>
              <div class="tk-prop"><span class="tk-prop__k">Expected Cost</span><span class="tk-prop__v" id="dtCost">—</span></div>
              <div class="tk-prop"><span class="tk-prop__k">Status</span><span class="tk-prop__v" id="dtStatus">—</span></div>
            </div>

            <div class="tk-actions">
              <button class="btn btn--primary" type="button" id="btnEditTask">Edit Task</button>
              <button class="btn btn--ghost" type="button" id="btnDeleteTask">Delete Task</button>
            </div>

            <div class="tk-statusbar">
              <div class="tk-statusbar__lbl">Change Status:</div>
              <div class="select-wrap tk-statusbar__sel">
                <select class="select select--native" id="dtStatusSel" aria-label="Change status">
                  <option value="todo">To Do</option>
                  <option value="done">Completed</option>
                </select>
                <svg class="select-wrap__ic" viewBox="0 0 24 24" aria-hidden="true"><path d="m7 10 5 5 5-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
              </div>
            </div>

            <div class="tk-edit" id="tkEdit" hidden>
              <div class="tk-edit__grid">
                <div class="tk-field">
                  <label class="ln-label" for="edTitle">Title</label>
                  <input class="input" id="edTitle" type="text" maxlength="255" />
                </div>
                <div class="tk-field">
                  <label class="ln-label" for="edDue">Due Date</label>
                  <input class="input input--date" id="edDue" type="date" />
                </div>
                <div class="tk-field">
                  <label class="ln-label" for="edPri">Priority</label>
                  <div class="select-wrap">
                    <select class="select select--native" id="edPri">
                      <option value="low">Low</option>
                      <option value="medium">Medium</option>
                      <option value="high">High</option>
                    </select>
                    <svg class="select-wrap__ic" viewBox="0 0 24 24" aria-hidden="true"><path d="m7 10 5 5 5-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
                  </div>
                </div>
                <div class="tk-field">
                  <label class="ln-label" for="edKind">Type</label>
                  <div class="select-wrap">
                    <select class="select select--native" id="edKind">
                      <option value="personal">Personal</option>
                      <option value="study">Study</option>
                    </select>
                    <svg class="select-wrap__ic" viewBox="0 0 24 24" aria-hidden="true"><path d="m7 10 5 5 5-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
                  </div>
                </div>
                <div class="tk-field">
                  <label class="ln-label" for="edDur">Duration (minutes)</label>
                  <input class="input" id="edDur" inputmode="numeric" type="text" placeholder="Optional" />
                </div>
                <div class="tk-field">
                  <label class="ln-label" for="edCost">Expected Cost</label>
                  <input class="input" id="edCost" inputmode="decimal" type="text" placeholder="Optional" />
                </div>
                <div class="tk-field">
                  <label class="ln-label" for="edCostCurrency">Cost Currency</label>
                  <div class="select-wrap">
                    <select class="select select--native" id="edCostCurrency">
                      <option value="TRY" selected>TRY</option>
                    </select>
                    <svg class="select-wrap__ic" viewBox="0 0 24 24" aria-hidden="true"><path d="m7 10 5 5 5-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
                  </div>
                </div>
              </div>
              <div class="tk-actions tk-actions--edit">
                <button class="btn btn--primary" type="button" id="btnSaveTask">Save</button>
                <button class="btn btn--ghost" type="button" id="btnCancelEdit">Cancel</button>
              </div>
              <div class="tk-edit__hint" id="tkEditHint" aria-live="polite"></div>
            </div>

            <div class="tk-notes">
              <div class="tk-notes__head">
                <div class="tk-notes__title">Detailed Notes</div>
                <button class="dots-btn" type="button" aria-label="Notes options" id="noteMenuBtn">···</button>
              </div>

              <div class="tk-note-editor">
                <input class="input tk-note-title-input" id="noteTitle" type="text" maxlength="160" placeholder="Note title (optional)" aria-label="Note title" />
                <textarea class="textarea" id="noteBody" rows="5" placeholder="Write a note..." aria-label="Note body"></textarea>
                <div class="tk-note-actions">
                  <button class="btn btn--ghost" type="button" id="btnEditNote" disabled>Edit Note</button>
                  <button class="btn btn--primary" type="button" id="btnAddNote">Add New Note</button>
                </div>
                <div class="tk-note-hint" id="noteHint" aria-live="polite"></div>
              </div>

              <div class="tk-notes-list" id="notesList" aria-label="Notes list"></div>

              <div class="tk-bottom-actions">
                <button class="btn btn--primary" type="button" id="btnMarkDone">Mark as Completed</button>
                <button class="btn btn--ghost" type="button" id="btnCloseDetails">Close Details</button>
              </div>
            </div>
          </div>

          <div class="tk-detail-empty" id="tkDetailEmpty" hidden>
            <div class="tk-empty__title">Select a task</div>
            <div class="tk-empty__msg">Choose a task from the list to view details and notes.</div>
          </div>
        </div>
      </div>
    </div>

    <footer class="footer" role="contentinfo">
      <div class="footer__text">Last synced: <span id="lastSynced">—</span>.&nbsp;&nbsp; Secure Connection.&nbsp;&nbsp; Version 2.1.</div>
    </footer>
  </main>
  <nav class="bottom-nav" aria-label="Bottom navigation">
    <a class="bottom-nav__item" href="/index.php" aria-label="Dashboard">
      <svg class="nav-ic" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M3 10.5 12 3l9 7.5V21a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1V10.5Z" fill="currentColor"/>
      </svg>
      <span>Home</span>
    </a>

    <a class="bottom-nav__item is-active" href="/tasks.php" aria-label="Tasks" aria-current="page">
      <svg class="nav-ic" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M7 4h14v2H7V4Zm0 7h14v2H7v-2Zm0 7h14v2H7v-2ZM3 5.5l1.2 1.2L6.4 4.5l1.1 1.1L4.2 9 2 6.8 3 5.5Zm0 7 1.2 1.2L6.4 11.5l1.1 1.1L4.2 16 2 13.8 3 12.5Zm0 7 1.2 1.2L6.4 18.5l1.1 1.1L4.2 23 2 20.8 3 19.5Z" fill="currentColor"/>
      </svg>
      <span>Tasks</span>
    </a>

    <a class="bottom-nav__item bottom-nav__item--ghost" href="#tkQuick" aria-label="Quick add">
      <span class="nav-fab" aria-hidden="true">+</span>
    </a>

    <a class="bottom-nav__item" href="/study.php" aria-label="Study">
      <svg class="nav-ic" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 5.5 12 2l8 3.5v12L12 21l-8-3.5v-12Zm8 1.9L6 6v9.6l6 2.6 6-2.6V6l-6 1.4Z" fill="currentColor"/>
      </svg>
      <span>Study</span>
    </a>

    <a class="bottom-nav__item" href="/finance.php" aria-label="Finance">
      <svg class="nav-ic" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 2C7.6 2 4 5.6 4 10s3.6 8 8 8 8-3.6 8-8-3.6-8-8-8Zm1 13.5V17h-2v-1.5c-1.2-.2-2.2-1-2.4-2.2l2-.4c.1.6.6 1.1 1.4 1.1.8 0 1.3-.4 1.3-1 0-.7-.7-.9-1.8-1.2-1.6-.4-2.9-1-2.9-2.7 0-1.3 1-2.3 2.4-2.6V3h2v1.5c1 .2 1.9.9 2.2 2l-2 .5c-.1-.5-.5-.9-1.2-.9-.7 0-1.2.3-1.2.9 0 .6.6.8 1.8 1.1 1.8.4 2.9 1.2 2.9 2.8 0 1.4-1 2.4-2.3 2.6Z" fill="currentColor"/>
      </svg>
      <span>Finance</span>
    </a>

    <a class="bottom-nav__item bottom-nav__item--more" href="#" aria-label="More" data-action="drawer">
      <svg class="nav-ic" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M5 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4Zm7 0a2 2 0 1 0 0-4 2 2 0 0 0 0 4Zm7 0a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z" fill="currentColor"/>
      </svg>
      <span>More</span>
    </a>
  </nav>

    </div>
  </div>

  <script src="<?= h(asset_url('/assets/js/core/app.js')) ?>"></script>
  <script src="<?= h(asset_url('/assets/js/pages/dashboard/shell.js')) ?>"></script>
  <script src="<?= h(asset_url('/assets/js/pages/tasks.js')) ?>"></script>
</body>
</html>
