<article class="card card--budget panel panel--budget" data-module="budget">
  <div class="card__header">
    <h3 class="card__title">Financial Summary</h3>
    <button class="dots-btn" type="button" aria-label="More options" data-menu="budget">···</button>
  </div>

  <div class="budget-head">
    <div class="budget-head__title">Monthly Budget Status</div>
    <div class="budget-head__amount" id="budgetHeadAmount">—</div>
  </div>

  <div class="budget-visual">
    <div class="budget-ring p0" id="budgetRing" aria-hidden="true">
      <div class="budget-ring__inner"></div>
    </div>

    <div class="budget-visual__details">
      <div class="budget-bar p0" id="budgetBar" aria-label="Spent vs budget progress">
        <div class="budget-bar__track"></div>
        <div class="budget-bar__fill"></div>
      </div>

      <div class="budget-legend" aria-label="Budget legend">
        <span><i class="budget-legend__dot budget-legend__dot--spent"></i>Spent</span>
        <span><i class="budget-legend__dot budget-legend__dot--remaining"></i>Remaining</span>
        <span><i class="budget-legend__dot budget-legend__dot--total"></i>Total Budget</span>
      </div>
    </div>
  </div>

  <div class="budget-sub" id="budgetSub">—</div>

  <div class="budget-stats">
    <article class="budget-stat">
      <div class="budget-stat__label">Total Spending</div>
      <div class="budget-stat__value" id="budgetSpentValue">—</div>
      <div class="budget-stat__meta">So far this month</div>
    </article>

    <article class="budget-stat">
      <div class="budget-stat__label">Remaining Balance</div>
      <div class="budget-stat__value" id="budgetRemainingValue">—</div>
      <div class="budget-stat__meta">Available to spend</div>
    </article>
  </div>

  <div class="budget-activity">
    <div class="budget-activity__head">
      <div class="budget-activity__title">Recent Expense Activity</div>
      <div class="budget-activity__total" id="last5Total">—</div>
    </div>

    <div class="budget-activity__list" id="budgetRecentList" aria-label="Recent expenses list">
      <div class="budget-activity__empty">No expenses yet.</div>
    </div>
  </div>

  <div class="alert is-hidden" id="budgetAlert" role="status">
    <span class="alert__icon" aria-hidden="true">
      <svg class="icon icon--sm" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 9v4m0 4h.01M10.3 4.6c.8-1.4 2.6-1.4 3.4 0l8.1 14.1c.8 1.4-.2 3.2-1.7 3.2H3.9c-1.6 0-2.6-1.8-1.7-3.2L10.3 4.6Z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    </span>
    <span id="budgetAlertText">Budget Limit Approaching</span>
  </div>

  <div class="budget-actions">
    <button class="btn btn--primary btn--full" type="button" data-open="expense">Log New Expense</button>
  </div>

  <div class="budget-mobile" id="budgetMobileRemaining" aria-hidden="true"></div>
</article>
