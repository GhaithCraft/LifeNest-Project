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
$dashboardPanels = site_dashboard_panels();
$panelPaths = [
    'snapshot' => '/pages/dashboard/panels/snapshot.php',
    'today_plan' => '/pages/dashboard/panels/today_plan.php',
    'tasks' => '/pages/dashboard/panels/tasks.php',
    'study' => '/pages/dashboard/panels/study.php',
    'budget' => '/pages/dashboard/panels/budget.php',
    'navigation' => '/pages/dashboard/panels/navigation.php',
];

if (current_user_id() === null) {
    header('Location: /landing.php', true, 302);
    exit;
}
?>
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title><?= h($brand) ?> — Dashboard</title>
  <link rel="icon" href="<?= h(site_favicon_url()) ?>" />
  <script src="<?= h(asset_url('/assets/js/core/theme.js')) ?>"></script>
  <link rel="stylesheet" href="<?= h(asset_url('/assets/css/app.css')) ?>" />
  <link rel="stylesheet" href="/theme.php" />
  <link rel="stylesheet" href="<?= h(asset_url('/assets/css/pages/dashboard/shell.css')) ?>" />
  <link rel="stylesheet" href="<?= h(asset_url('/assets/css/pages/dashboard/panels/snapshot.css')) ?>" />
  <link rel="stylesheet" href="<?= h(asset_url('/assets/css/pages/dashboard/panels/today_plan.css')) ?>" />
  <link rel="stylesheet" href="<?= h(asset_url('/assets/css/pages/dashboard/panels/tasks.css')) ?>" />
  <link rel="stylesheet" href="<?= h(asset_url('/assets/css/pages/dashboard/panels/study.css')) ?>" />
  <link rel="stylesheet" href="<?= h(asset_url('/assets/css/pages/dashboard/panels/budget.css')) ?>" />
  <link rel="stylesheet" href="<?= h(asset_url('/assets/css/pages/dashboard/panels/navigation.css')) ?>" />
  <link rel="stylesheet" href="<?= h(asset_url('/assets/css/pages/dashboard/modals/modals.css')) ?>" />
  <link rel="stylesheet" href="<?= h(asset_url('/assets/css/pages/dashboard/modals/reports.css')) ?>" />
  <link rel="stylesheet" href="<?= h(asset_url('/assets/css/pages/dashboard/modals/focus.css')) ?>" />
</head>
<body>
  <div class="bg"></div>

  <div class="dashboard-shell">

    <?php render_app_sidebar(['active' => 'dashboard', 'brand' => $brand, 'logo_url' => site_logo_url(), 'can_admin' => $canAdmin]); ?>

    <div class="dashboard-main">
      <?php render_app_topbar(['title' => 'Dashboard', 'eyebrow' => 'Workspace', 'search_id' => 'taskSearch', 'search_placeholder' => 'Search', 'search_aria' => 'Search tasks', 'can_admin' => $canAdmin]); ?>

      <?php render_app_drawer(['active' => 'dashboard', 'can_admin' => $canAdmin]); ?>

      <main class="page" role="main" id="dashboardHome">
        <?php
          $enabledPanels = [];
          foreach ($dashboardPanels as $panel) {
              if (empty($panel['enabled']) || empty($panel['id']) || !isset($panelPaths[$panel['id']])) {
                  continue;
              }
              $enabledPanels[(string)$panel['id']] = $panel;
          }

          $topRowPanels = ['tasks', 'budget'];
          $secondaryPanels = ['today_plan', 'study'];
          $handledIds = ['snapshot' => true, 'navigation' => true];
          foreach (array_merge($topRowPanels, $secondaryPanels) as $handledId) {
              $handledIds[$handledId] = true;
          }
        ?>

        <section class="dashboard-home" aria-label="Dashboard modules">
          <?php if (isset($enabledPanels['snapshot'])): ?>
            <div class="dashboard-home__hero" id="dashboard-hero">
              <div class="dashboard-slot dashboard-slot--snapshot">
                <?php require __DIR__ . $panelPaths['snapshot']; ?>
              </div>
            </div>
          <?php endif; ?>

          <section class="dashboard-columns" aria-label="Dashboard widgets">
            <div class="dashboard-column dashboard-column--primary">
              <?php if (isset($enabledPanels['tasks'])): ?>
                <div class="dashboard-slot dashboard-slot--tasks" id="today-plan-panel">
                  <?php require __DIR__ . $panelPaths['tasks']; ?>
                </div>
              <?php endif; ?>

              <?php if (isset($enabledPanels['today_plan'])): ?>
                <div class="dashboard-slot dashboard-slot--today-plan" id="smart-schedule-panel">
                  <?php require __DIR__ . $panelPaths['today_plan']; ?>
                </div>
              <?php endif; ?>

              <?php $extraPanelIndex = 0; ?>
              <?php foreach ($dashboardPanels as $panel): ?>
                <?php
                  $panelId = (string)($panel['id'] ?? '');
                  if (empty($panel['enabled']) || $panelId === '' || !isset($panelPaths[$panelId]) || isset($handledIds[$panelId])) {
                      continue;
                  }
                  if (($extraPanelIndex % 2) !== 0) {
                      $extraPanelIndex++;
                      continue;
                  }
                ?>
                <div class="dashboard-slot dashboard-slot--<?= h($panelId) ?>">
                  <?php require __DIR__ . $panelPaths[$panelId]; ?>
                </div>
                <?php $extraPanelIndex++; ?>
              <?php endforeach; ?>
            </div>

            <div class="dashboard-column dashboard-column--secondary">
              <?php if (isset($enabledPanels['budget'])): ?>
                <div class="dashboard-slot dashboard-slot--budget" id="budget-summary-panel">
                  <?php require __DIR__ . $panelPaths['budget']; ?>
                </div>
              <?php endif; ?>

              <?php if (isset($enabledPanels['study'])): ?>
                <div class="dashboard-slot dashboard-slot--study" id="study-panel">
                  <?php require __DIR__ . $panelPaths['study']; ?>
                </div>
              <?php endif; ?>

              <?php $extraPanelIndex = 0; ?>
              <?php foreach ($dashboardPanels as $panel): ?>
                <?php
                  $panelId = (string)($panel['id'] ?? '');
                  if (empty($panel['enabled']) || $panelId === '' || !isset($panelPaths[$panelId]) || isset($handledIds[$panelId])) {
                      continue;
                  }
                  if (($extraPanelIndex % 2) === 0) {
                      $extraPanelIndex++;
                      continue;
                  }
                ?>
                <div class="dashboard-slot dashboard-slot--<?= h($panelId) ?>">
                  <?php require __DIR__ . $panelPaths[$panelId]; ?>
                </div>
                <?php $extraPanelIndex++; ?>
              <?php endforeach; ?>
            </div>
          </section>

          <footer class="footer" role="contentinfo">
            <div class="footer__text">Last synced: <span id="lastSynced">—</span>.&nbsp;&nbsp; Secure Connection.&nbsp;&nbsp; Version 2.1.</div>
          </footer>
        </section>
      </main>
    </div>
  </div>

  <div class="fab-wrap" aria-label="Quick actions">
    <div class="speed-dial" id="quickDial" role="menu" aria-label="Actions menu" aria-hidden="true">
      <div class="speed-dial__grid">
        <button class="speed-item" type="button" role="menuitem" data-open="task">
          <span class="speed-item__icon" aria-hidden="true">
            <svg class="speed-ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>
          </span>
          <span class="speed-item__label">Add Task</span>
        </button>
        <button class="speed-item" type="button" role="menuitem" data-open="expense">
          <span class="speed-item__icon" aria-hidden="true">
            <svg class="speed-ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2v20M16 6.5c0-1.4-1.8-2.5-4-2.5s-4 1.1-4 2.5 1.8 2.5 4 2.5 4 1.1 4 2.5S14.2 16 12 16s-4-1.1-4-2.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </span>
          <span class="speed-item__label">Add Expense</span>
        </button>
        <button class="speed-item" type="button" role="menuitem" data-open="note">
          <span class="speed-item__icon" aria-hidden="true">
            <svg class="speed-ic" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 20h9" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
            <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5Z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>
          </svg>
          </span>
          <span class="speed-item__label">Add Note</span>
        </button>

        <button class="speed-item" type="button" role="menuitem" data-open="budget">
          <span class="speed-item__icon" aria-hidden="true">
            <svg class="speed-ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Zm0-12v6l4 2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </span>
          <span class="speed-item__label">Set Monthly Budget</span>
        </button>
        <button class="speed-item" type="button" role="menuitem" data-open="fixed">
          <span class="speed-item__icon" aria-hidden="true">
            <svg class="speed-ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 2v3m10-3v3M4 8h16M6 6h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2Z" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
              <path d="M8 12h8M8 16h6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
            </svg>
          </span>
          <span class="speed-item__label">Import Fixed Events</span>
        </button>
        <button class="speed-item" type="button" role="menuitem" data-open="reports">
          <span class="speed-item__icon" aria-hidden="true">
            <svg class="speed-ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3h10l4 4v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z" fill="none" stroke="currentColor" stroke-width="2"/>
              <path d="M17 3v6h6" fill="none" stroke="currentColor" stroke-width="2"/>
              <path d="M9 13h6M9 17h8" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
            </svg>
          </span>
          <span class="speed-item__label">Open Reports</span>
        </button>
      </div>

      <div class="speed-dial__reports">
        <button class="speed-report" type="button" data-report="weekly">Weekly Report</button>
        <button class="speed-report" type="button" data-report="monthly">Monthly Report</button>
      </div>
    </div>

    <button class="fab" type="button" aria-label="Open quick actions" aria-controls="quickDial" aria-expanded="false">
      <span class="fab__icon fab__icon--plus" aria-hidden="true">+</span>
      <span class="fab__icon fab__icon--min" aria-hidden="true">–</span>
    </button>
  </div>


  <nav class="bottom-nav" aria-label="Bottom navigation">
    <a class="bottom-nav__item is-active" href="#" aria-label="Home" data-nav="home">
      <svg class="nav-ic" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M3 10.5 12 3l9 7.5V21a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1V10.5Z" fill="currentColor"/>
      </svg>
      <span>Home</span>
    </a>

    <a class="bottom-nav__item" href="/tasks.php" aria-label="Tasks">
      <svg class="nav-ic" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M7 4h14v2H7V4Zm0 7h14v2H7v-2Zm0 7h14v2H7v-2ZM3 5.5l1.2 1.2L6.4 4.5l1.1 1.1L4.2 9 2 6.8 3 5.5Zm0 7 1.2 1.2L6.4 11.5l1.1 1.1L4.2 16 2 13.8 3 12.5Zm0 7 1.2 1.2L6.4 18.5l1.1 1.1L4.2 23 2 20.8 3 19.5Z" fill="currentColor"/>
      </svg>
      <span>Tasks</span>
    </a>

    <a class="bottom-nav__item bottom-nav__item--ghost" href="#" aria-label="Add" data-action="quick">
      <span class="nav-fab" aria-hidden="true">+</span>
    </a>

    <a class="bottom-nav__item" href="/study.php" aria-label="Study">
      <svg class="nav-ic" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 5.5 12 2l8 3.5v12L12 21l-8-3.5v-12Zm8 1.9L6 6v9.6l6 2.6 6-2.6V6l-6 1.4Z" fill="currentColor"/>
      </svg>
      <span>Study</span>
    </a>

    <a class="bottom-nav__item" href="#" aria-label="Budget" data-nav="budget">
      <svg class="nav-ic" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 2C7.6 2 4 5.6 4 10s3.6 8 8 8 8-3.6 8-8-3.6-8-8-8Zm1 13.5V17h-2v-1.5c-1.2-.2-2.2-1-2.4-2.2l2-.4c.1.6.6 1.1 1.4 1.1.8 0 1.3-.4 1.3-1 0-.7-.7-.9-1.8-1.2-1.6-.4-2.9-1-2.9-2.7 0-1.3 1-2.3 2.4-2.6V3h2v1.5c1 .2 1.9.9 2.2 2l-2 .5c-.1-.5-.5-.9-1.2-.9-.7 0-1.2.3-1.2.9 0 .6.6.8 1.8 1.1 1.8.4 2.9 1.2 2.9 2.8 0 1.4-1 2.4-2.3 2.6Z" fill="currentColor"/>
      </svg>
      <span>Budget</span>
    </a>

    <a class="bottom-nav__item bottom-nav__item--more" href="#" aria-label="More" data-action="drawer">
      <svg class="nav-ic" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M5 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4Zm7 0a2 2 0 1 0 0-4 2 2 0 0 0 0 4Zm7 0a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z" fill="currentColor"/>
      </svg>
      <span>More</span>
    </a>
  </nav>

  <div class="ln-bulkbar" id="taskBulkBar" aria-hidden="true" aria-label="Bulk task actions">
    <div class="ln-bulkbar__left">
      <strong id="taskBulkCount">0</strong> selected
    </div>
    <div class="ln-bulkbar__actions">
      <button class="btn btn--ghost btn--sm" type="button" id="taskBulkDone">Mark Done</button>
      <button class="btn btn--ghost btn--sm" type="button" id="taskBulkTodo">Mark Todo</button>
      <button class="btn btn--ghost btn--sm" type="button" id="taskBulkPriority">Priority</button>
      <button class="btn btn--danger btn--sm" type="button" id="taskBulkDelete">Delete</button>
      <button class="btn btn--ghost btn--sm" type="button" id="taskBulkClear">Clear</button>
    </div>
  </div>

  <div class="ln-snack" id="lnSnack" aria-hidden="true" role="status" aria-live="polite">
    <div class="ln-snack__msg" id="lnSnackMsg">—</div>
    <div class="ln-snack__actions">
      <button class="btn btn--ghost btn--sm" type="button" id="lnSnackPending">Pending</button>
      <button class="btn btn--ghost btn--sm" type="button" id="lnSnackAction">Undo</button>
      <button class="ln-snack__close" type="button" id="lnSnackClose" aria-label="Close"><svg class="icon icon--xs" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></button>
    </div>
  </div>

  <datalist id="expenseCats"></datalist>
  <div class="ctx-backdrop" id="ctxBackdrop" aria-hidden="true"></div>
  <div class="ctx-menu" id="ctxMenu" role="menu" aria-hidden="true" aria-label="Context menu"></div>

  <?php require __DIR__ . "/pages/dashboard/modals/pending.php"; ?>
  <?php require __DIR__ . "/pages/dashboard/modals/task.php"; ?>
  <?php require __DIR__ . "/pages/dashboard/modals/expense.php"; ?>
  <?php require __DIR__ . "/pages/dashboard/modals/study.php"; ?>
  <?php require __DIR__ . "/pages/dashboard/modals/budget.php"; ?>
  <?php require __DIR__ . "/pages/dashboard/modals/note.php"; ?>
  <?php require __DIR__ . "/pages/dashboard/modals/expenses.php"; ?>
  <?php require __DIR__ . "/pages/dashboard/modals/reports.php"; ?>
  <?php require __DIR__ . "/pages/dashboard/modals/focus.php"; ?>
  <?php require __DIR__ . "/pages/dashboard/modals/fixed.php"; ?>

  <script src="<?= h(asset_url('/assets/js/lib/charts.js')) ?>"></script>
  <script src="<?= h(asset_url('/assets/js/core/app.js')) ?>"></script>
  <script src="<?= h(asset_url('/assets/js/pages/dashboard/shell.js')) ?>"></script>
  <script src="<?= h(asset_url('/assets/js/pages/dashboard.js')) ?>"></script>
  <script src="<?= h(asset_url('/assets/js/pages/dashboard/panels/snapshot.js')) ?>"></script>
  <script src="<?= h(asset_url('/assets/js/pages/dashboard/panels/today_plan.js')) ?>"></script>
  <script src="<?= h(asset_url('/assets/js/pages/dashboard/panels/tasks.js')) ?>"></script>
  <script src="<?= h(asset_url('/assets/js/pages/dashboard/panels/study.js')) ?>"></script>
  <script src="<?= h(asset_url('/assets/js/pages/dashboard/panels/budget.js')) ?>"></script>
  <script src="<?= h(asset_url('/assets/js/pages/dashboard/modals/pending.js')) ?>"></script>
  <script src="<?= h(asset_url('/assets/js/pages/dashboard/modals/fixed.js')) ?>"></script>
  <script src="<?= h(asset_url('/assets/js/pages/dashboard/modals/focus.js')) ?>"></script>
  <script src="<?= h(asset_url('/assets/js/pages/dashboard/modals/budget.js')) ?>"></script>
  <script src="<?= h(asset_url('/assets/js/pages/dashboard/modals/expense.js')) ?>"></script>
  <script src="<?= h(asset_url('/assets/js/pages/dashboard/modals/expenses.js')) ?>"></script>
  <script src="<?= h(asset_url('/assets/js/pages/dashboard/modals/reports.js')) ?>"></script>
</body>
</html>
