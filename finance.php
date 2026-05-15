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
  <title><?= h($brand) ?> — Finance</title>
  <link rel="icon" href="<?= h(site_favicon_url()) ?>" />
  <script src="<?= h(asset_url('/assets/js/core/theme.js')) ?>"></script>
  <link rel="stylesheet" href="<?= h(asset_url('/assets/css/app.css')) ?>" />
  <link rel="stylesheet" href="/theme.php" />
  <link rel="stylesheet" href="<?= h(asset_url('/assets/css/pages/dashboard/shell.css')) ?>" />
  <link rel="stylesheet" href="<?= h(asset_url('/assets/css/pages/app_pages.css')) ?>" />
  <link rel="stylesheet" href="<?= h(asset_url('/assets/css/pages/finance/finance.css')) ?>" />
</head>
<body>
  <div class="bg"></div>

  <div class="dashboard-shell">

    <?php render_app_sidebar(['active' => 'budget', 'brand' => $brand, 'logo_url' => site_logo_url(), 'can_admin' => $canAdmin]); ?>

    <div class="dashboard-main">
      <?php render_app_topbar(['title' => 'Finance', 'eyebrow' => 'Budget & expenses', 'search_id' => 'financeSearch', 'search_placeholder' => 'Search', 'search_aria' => 'Search expenses', 'can_admin' => $canAdmin]); ?>

      <?php render_app_drawer(['active' => 'budget', 'can_admin' => $canAdmin]); ?>

  <main class="page" role="main">

    <section class="page-hero page-hero--finance">
      <div class="page-hero__content">
        <div class="page-hero__eyebrow">Budget &amp; Expenses</div>
        <nav class="fin-crumb page-hero__crumb" aria-label="Breadcrumb">
          <a class="fin-crumb__link" href="/index.php">Dashboard</a>
          <span class="fin-crumb__sep" aria-hidden="true">›</span>
          <span class="fin-crumb__cur" aria-current="page">Finance</span>
        </nav>
        <h1 class="section-title fin-title">Handle planning, logging, and review in a cleaner financial workspace</h1>
        <p class="page-hero__desc">Set monthly limits, add expenses fast, and inspect your ledger in a page that now shares the dashboard visual language.</p>
        <div class="page-hero__chips">
          <span class="page-hero__chip">Monthly budget</span>
          <span class="page-hero__chip">Quick expense logging</span>
          <span class="page-hero__chip">Ledger review</span>
        </div>
      </div>
    </section>

    <section class="fin-top" aria-label="Finance summary">
      <article class="card fin-card fin-card--remain" aria-label="Remaining month budget">
        <div class="fin-card__main">
          <div class="fin-kicker">Remaining Month Budget</div>
          <div class="fin-big" id="finRemainingMonth">—</div>
          <div class="fin-sub" id="finMonthDelta">—</div>
        </div>
        <div class="fin-card__aside">
          <div class="fin-donut" aria-hidden="true">
            <canvas id="finDonut" width="110" height="110"></canvas>
            <div class="fin-donut__txt">
              <div class="fin-donut__pct" id="finRemainPct">—%</div>
              <div class="fin-donut__hint">Remaining</div>
            </div>
          </div>
          <div class="fin-buffer" id="finBuffer">Buffer 10%</div>
        </div>
      </article>

      <article class="card fin-card fin-card--allow" aria-label="Daily allowance">
        <div class="fin-kicker">Daily Allowance (Remaining Today)</div>
        <div class="fin-allow__row">
          <div class="fin-allow__val" id="finRemainingToday">—</div>
          <div class="fin-allow__plan" id="finPlannedToday">—</div>
        </div>
        <div class="fin-bar p0" id="finTodayBar" aria-label="Today allowance progress">
          <div class="fin-bar__track"></div>
          <div class="fin-bar__fill"></div>
        </div>
        <div class="fin-sub" id="finTodayHint">—</div>
      </article>

      <article class="card fin-card fin-card--warn" aria-label="Overspent warnings">
        <div class="fin-kicker">Overspent / Warnings</div>
        <div class="fin-alert" id="finWarnBox">
          <div class="fin-alert__icon" aria-hidden="true"><svg class="icon icon--sm" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.5 2.2 20.2a1.6 1.6 0 0 0 1.4 2.4h16.8a1.6 1.6 0 0 0 1.4-2.4L12 3.5Z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M12 9v5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M12 17.5h.01" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg></div>
          <div class="fin-alert__body">
            <div class="fin-alert__title" id="finWarnTitle">—</div>
            <div class="fin-alert__msg" id="finWarnMsg">—</div>
          </div>
        </div>
      </article>

      <article class="card fin-card fin-card--goal" aria-label="Savings goal">
        <div class="fin-kicker">Savings Goal</div>
        <div class="fin-goal__row">
          <div class="fin-goal__name" id="finGoalName">Emergency Fund</div>
          <div class="fin-goal__pct" id="finGoalPct">—%</div>
        </div>
        <div class="fin-bar p0" id="finGoalBar" aria-label="Savings goal progress">
          <div class="fin-bar__track"></div>
          <div class="fin-bar__fill"></div>
        </div>
      </article>
    </section>

    <section class="fin-grid" aria-label="Finance tools">
      <article class="card fin-panel fin-panel--budget" id="budget-panel" aria-label="Monthly budget setup">
        <div class="card__header">
          <h2 class="card__title">Monthly Budget Setup</h2>
          <button class="dots-btn" type="button" aria-label="More options" id="budgetMenuBtn">···</button>
        </div>

        <div class="fin-panel__body">
          <div class="fin-subhead">Setup &amp; Configure</div>

          <div class="fin-field">
            <label class="ln-label" for="finBudgetAmount">Set Monthly Budget</label>
            <div class="fin-field__row">
              <input class="input" id="finBudgetAmount" inputmode="decimal" type="text" placeholder="Number" />
              <div class="select-wrap fin-field__cur">
                <select class="select select--native" id="finBudgetCurrency" aria-label="Currency">
                  <option value="TRY" selected>TRY</option>
                </select>
                <svg class="select-wrap__ic" viewBox="0 0 24 24" aria-hidden="true"><path d="m7 10 5 5 5-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
              </div>
            </div>
            <div class="ln-form__hint">Budget is per month. You can update anytime.</div>
          </div>

          <div class="fin-subhead fin-subhead--mt">Edit Budget Categories</div>
          <div class="fin-cats" id="finCats" aria-label="Budget categories"></div>

          <div class="fin-catadd" aria-label="Add category">
            <input class="input" id="finNewCat" type="text" maxlength="60" placeholder="Add category (e.g. Rent)" />
            <button class="btn btn--ghost" type="button" id="finAddCatBtn">Add</button>
          </div>

          <button class="btn btn--primary btn--full fin-cta" type="button" id="finSaveBudget">Update/Create Budget</button>
          <div class="ln-form__hint" id="finBudgetHint" aria-live="polite"></div>
        </div>
      </article>

      <article class="card fin-panel fin-panel--expense" aria-label="Quick add expense">
        <div class="card__header">
          <h2 class="card__title">Quick Add Expense</h2>
          <button class="dots-btn" type="button" aria-label="More options" id="expenseMenuBtn">···</button>
        </div>

        <form class="fin-panel__body" id="finExpenseForm">
          <div class="fin-field">
            <label class="ln-label" for="finExpCategory">Category</label>
            <div class="select-wrap">
              <select class="select select--native" id="finExpCategory" required></select>
              <svg class="select-wrap__ic" viewBox="0 0 24 24" aria-hidden="true"><path d="m7 10 5 5 5-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
            </div>
          </div>

          <div class="fin-field">
            <label class="ln-label" for="finExpDate">Date</label>
            <input class="input input--date" id="finExpDate" type="date" required />
          </div>

          <div class="fin-field">
            <label class="ln-label" for="finExpAmount">Amount</label>
            <input class="input" id="finExpAmount" inputmode="decimal" type="text" placeholder="Amount" required />
          </div>

          <div class="fin-field fin-field--linked">
            <label class="ln-label" for="finExpLinkedTask">Link to Task (optional)</label>
            <div class="select-wrap">
              <select class="select select--native" id="finExpLinkedTask" aria-label="Link expense to task">
                <option value="">Not linked</option>
              </select>
              <svg class="select-wrap__ic" viewBox="0 0 24 24" aria-hidden="true"><path d="m7 10 5 5 5-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
            </div>
            <div class="ln-form__hint fin-linkhint" id="finExpLinkedHint">Use this when the expense belongs to a specific task so reports and planning stay aligned.</div>
          </div>

          <div class="fin-field fin-field--area">
            <label class="ln-label" for="finExpLifeArea">Life Area</label>
            <div class="select-wrap">
              <select class="select select--native" id="finExpLifeArea" aria-label="Expense life area">
                <option value="general">General</option>
                <option value="personal">Personal</option>
                <option value="study">Study</option>
              </select>
              <svg class="select-wrap__ic" viewBox="0 0 24 24" aria-hidden="true"><path d="m7 10 5 5 5-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
            </div>
          </div>

          <div class="fin-field fin-field--note">
            <label class="ln-label" for="finExpNote">Note (optional)</label>
            <input class="input" id="finExpNote" type="text" maxlength="255" placeholder="e.g. Printed handout for tomorrow" />
          </div>

          <div class="fin-form-actions">
            <button class="btn btn--primary fin-cta fin-cta--expense" type="submit" id="finAddExpense">Add Expense</button>
            <button class="btn btn--ghost" type="button" id="finCancelExpenseEdit" hidden>Cancel Edit</button>
            <button class="btn btn--danger" type="button" id="finDeleteExpense" hidden>Delete Expense</button>
          </div>
          <div class="ln-form__hint" id="finExpenseHint" aria-live="polite"></div>
        </form>
      </article>

      <article class="card fin-ledger" id="expenses-ledger" aria-label="Expenses ledger">
        <div class="card__header">
          <h2 class="card__title">Expenses Ledger</h2>
          <div class="ledger-tabs" role="tablist" aria-label="Expense period tabs">
            <button class="tab is-active" type="button" role="tab" aria-selected="true" data-period="today">Today</button>
            <button class="tab" type="button" role="tab" aria-selected="false" data-period="week">This Week</button>
            <button class="tab" type="button" role="tab" aria-selected="false" data-period="month">This Month</button>
          </div>
        </div>

        <div class="fin-ledger__body">
          <div class="ledger-head">
            <div class="ledger-title">Expense List</div>
            <div class="select-wrap ledger-filter">
              <select class="select select--native" id="finFilterCat" aria-label="Filter by category">
                <option value="">Filter by Category</option>
              </select>
              <svg class="select-wrap__ic" viewBox="0 0 24 24" aria-hidden="true"><path d="m7 10 5 5 5-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
            </div>
          </div>

          <div class="ledger-tablewrap" role="region" aria-label="Expenses table" tabindex="0">
            <table class="ledger" aria-label="Expenses">
              <thead>
                <tr>
                  <th class="ledger__ic" aria-label="Icon"></th>
                  <th>Date/Time</th>
                  <th>Category</th>
                  <th>Description</th>
                  <th>Context</th>
                  <th class="ledger__amt">Amount</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody id="finExpensesBody"></tbody>
            </table>
            <div class="fin-empty" id="finEmpty" hidden>
              <div class="fin-empty__title">No expenses yet</div>
              <div class="fin-empty__msg">Add your first expense to start tracking.</div>
            </div>
          </div>

          <div class="ledger-trend">
            <div class="ledger-trend__title">Spending Trend (This Month)</div>
            <canvas class="ledger-trend__canvas" id="finTrend" width="720" height="170" aria-label="Spending trend"></canvas>
          </div>

          <div class="ledger-foot">
            <a class="btn btn--ghost" href="/index.php">Open Full Reports</a>
          </div>
        </div>
      </article>
    </section>

    <footer class="footer" role="contentinfo">
      <div class="footer__text">Last synced: <span id="lastSynced">—</span>.&nbsp;&nbsp; Secure Connection.&nbsp;&nbsp; Version 2.1.</div>
    </footer>
  </main>

  <!-- Shared suggestions (populated by JS) -->
  <datalist id="expenseCats"></datalist>

    </div>
  </div>

  <script src="<?= h(asset_url('/assets/js/core/app.js')) ?>"></script>
  <script src="<?= h(asset_url('/assets/js/pages/dashboard/shell.js')) ?>"></script>
  <script src="<?= h(asset_url('/assets/js/pages/finance.js')) ?>"></script>
</body>
</html>
