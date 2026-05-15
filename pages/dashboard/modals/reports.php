  <section class="ln-modal" id="modalReports" data-module="modal_reports" role="dialog" aria-modal="true" aria-hidden="true" aria-labelledby="modalReportsTitle">
    <div class="ln-modal__backdrop" data-close="modal"></div>
    <div class="ln-modal__panel">
      <div class="ln-modal__head">
        <h3 class="ln-modal__title" id="modalReportsTitle">Reports</h3>
        <button class="ln-modal__close" type="button" data-close="modal" aria-label="Close"><svg class="icon icon--xs" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></button>
      </div>

      <div class="ln-rep" aria-label="Reports">
        <div class="ln-rep__grid">
          <div class="ln-rep__card">
            <div class="ln-rep__head">
              <div class="ln-rep__title">This Week</div>
              <div class="ln-rep__sub" id="repWeekRange">—</div>
            </div>

            <div class="ln-rep__kpis ln-rep__kpis--wide">
              <div class="ln-kpi">
                <div class="ln-kpi__label">Done</div>
                <div class="ln-kpi__value" id="repWeekDone">—</div>
              </div>
              <div class="ln-kpi">
                <div class="ln-kpi__label">Total</div>
                <div class="ln-kpi__value" id="repWeekTotal">—</div>
              </div>
              <div class="ln-kpi">
                <div class="ln-kpi__label">Completion</div>
                <div class="ln-kpi__value" id="repWeekPct">—</div>
              </div>
              <div class="ln-kpi">
                <div class="ln-kpi__label">Started</div>
                <div class="ln-kpi__value" id="repWeekStarted">—</div>
              </div>
              <div class="ln-kpi">
                <div class="ln-kpi__label">Postponed</div>
                <div class="ln-kpi__value" id="repWeekPostponed">—</div>
              </div>
            </div>

            <div class="budget-bar p0 rep-bar" id="repWeekBar" aria-label="Weekly completion progress">
              <div class="budget-bar__track"></div>
              <div class="budget-bar__fill"></div>
            </div>

            <div class="ln-rep__mini" id="repWeekSpend">—</div>
            <div class="ln-rep__cats" id="repWeekCats" aria-live="polite"></div>
          </div>

          <div class="ln-rep__card">
            <div class="ln-rep__head ln-rep__head--row">
              <div>
                <div class="ln-rep__title">This Month</div>
                <div class="ln-rep__sub" id="repMonthRange">—</div>
              </div>

              <div class="ln-rep__controls">
                <label class="ln-label" for="reportsMonth">Month</label>
                <input class="input input--sm" id="reportsMonth" type="month" />
                <button class="btn btn--ghost btn--sm" type="button" id="btnReloadReports">Reload</button>
              </div>
            </div>

            <div class="ln-rep__kpis ln-rep__kpis--wide">
              <div class="ln-kpi">
                <div class="ln-kpi__label">Budget</div>
                <div class="ln-kpi__value" id="repMonthBudget">—</div>
              </div>
              <div class="ln-kpi">
                <div class="ln-kpi__label">Spent</div>
                <div class="ln-kpi__value" id="repMonthSpent">—</div>
              </div>
              <div class="ln-kpi">
                <div class="ln-kpi__label">Remaining</div>
                <div class="ln-kpi__value" id="repMonthRemaining">—</div>
              </div>
              <div class="ln-kpi">
                <div class="ln-kpi__label">Completed</div>
                <div class="ln-kpi__value" id="repMonthCompleted">—</div>
              </div>
              <div class="ln-kpi">
                <div class="ln-kpi__label">Postponed</div>
                <div class="ln-kpi__value" id="repMonthPostponed">—</div>
              </div>
            </div>

            <div class="budget-bar p0 rep-bar" id="repMonthBar" aria-label="Monthly spent vs budget progress">
              <div class="budget-bar__track"></div>
              <div class="budget-bar__fill"></div>
            </div>

            <div class="ln-rep__cats" id="repMonthCats" aria-live="polite"></div>
            <div class="ln-form__hint" id="reportsHint" aria-live="polite"></div>
          </div>
        </div>

        <div class="ln-rep__review">
          <div class="ln-rep__review-head">
            <div>
              <div class="ln-rep__title">Weekly Review &amp; Decision Hints</div>
              <div class="ln-rep__sub" id="repReviewRange">Based on your current week</div>
            </div>
            <div class="ln-rep__decision" id="repReviewDecision">—</div>
          </div>

          <div class="ln-rep__review-kpis">
            <div class="ln-kpi">
              <div class="ln-kpi__label">Carry-over</div>
              <div class="ln-kpi__value" id="repReviewCarry">—</div>
            </div>
            <div class="ln-kpi">
              <div class="ln-kpi__label">Overdue Open</div>
              <div class="ln-kpi__value" id="repReviewOverdue">—</div>
            </div>
            <div class="ln-kpi">
              <div class="ln-kpi__label">Study Completed</div>
              <div class="ln-kpi__value" id="repReviewStudyDone">—</div>
            </div>
            <div class="ln-kpi">
              <div class="ln-kpi__label">Top Spend</div>
              <div class="ln-kpi__value" id="repReviewTopSpend">—</div>
            </div>
          </div>

          <div class="ln-rep__insights" id="repReviewInsights" aria-live="polite"></div>
        </div>
      </div>
    </div>
  </section>
