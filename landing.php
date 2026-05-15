<?php

declare(strict_types=1);

require_once __DIR__ . '/includes/security_headers.php';
require_once __DIR__ . '/includes/session.php';
require_once __DIR__ . '/includes/auth.php';
require_once __DIR__ . '/includes/assets.php';
require_once __DIR__ . '/includes/site_settings.php';

function h(string $s): string
{
    return htmlspecialchars($s, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}

function landing_icon(string $name): string
{
    $icons = [
        'leaf' => '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19.5 3.5C12.4 4 7.2 7.2 5.2 12.2c-1.1 2.8-.8 5.5.7 7.3 1.9-5.3 5.6-8.8 11.2-10.6-4.3 2.7-7.2 6.1-8.7 10.2 2.5.6 5.6-.3 7.9-2.6 3.1-3 4.2-8 3.2-13Z" fill="currentColor"/></svg>',
        'check' => '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12.4 4.2 4.2L19 6.8" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
        'arrow' => '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14m-6-6 6 6-6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
        'dashboard' => '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5.5A1.5 1.5 0 0 1 5.5 4h5A1.5 1.5 0 0 1 12 5.5v5A1.5 1.5 0 0 1 10.5 12h-5A1.5 1.5 0 0 1 4 10.5v-5Zm8 8A1.5 1.5 0 0 1 13.5 12h5A1.5 1.5 0 0 1 20 13.5v5a1.5 1.5 0 0 1-1.5 1.5h-5a1.5 1.5 0 0 1-1.5-1.5v-5ZM4 15.5A1.5 1.5 0 0 1 5.5 14h3A1.5 1.5 0 0 1 10 15.5v3A1.5 1.5 0 0 1 8.5 20h-3A1.5 1.5 0 0 1 4 18.5v-3ZM14 5.5A1.5 1.5 0 0 1 15.5 4h3A1.5 1.5 0 0 1 20 5.5v3a1.5 1.5 0 0 1-1.5 1.5h-3A1.5 1.5 0 0 1 14 8.5v-3Z" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>',
        'tasks' => '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 11.2 11 13l4-4M5 5h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></svg>',
        'study' => '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6.5 12 3l8 3.5-8 3.5-8-3.5Zm3 3.2v5.1c1.6 1.6 3.3 2.4 5 2.4s3.4-.8 5-2.4V9.7" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/><path d="M20 6.5v6" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/></svg>',
        'budget' => '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7.5A2.5 2.5 0 0 1 6.5 5H19a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H6.5A2.5 2.5 0 0 1 4 16.5v-9Z" fill="none" stroke="currentColor" stroke-width="1.9"/><path d="M17 12h3v4h-3a2 2 0 0 1 0-4Z" fill="none" stroke="currentColor" stroke-width="1.9"/><path d="M7 8h8" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/></svg>',
        'notes' => '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3h7l5 5v13H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Zm7 0v6h5" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/><path d="M8 13h8M8 17h5" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/></svg>',
        'shield' => '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 5 6v5.4c0 4.4 2.8 7.9 7 9.6 4.2-1.7 7-5.2 7-9.6V6l-7-3Z" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round"/><path d="m8.8 12.1 2.2 2.2 4.4-5" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></svg>',
        'lock' => '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 10V8a5 5 0 0 1 10 0v2m-9 0h8a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2Z" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/><path d="M12 15v2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
        'menu' => '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h14M5 12h14M5 17h14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
        'close' => '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
    ];

    return $icons[$name] ?? $icons['leaf'];
}

auth_bootstrap();

$brand = site_brand_name();
$tagline = site_tagline() !== '' ? site_tagline() : 'Personal Organizer';
$loggedIn = current_user_id() !== null;
$registrationOpen = site_registration_open();
$primaryCtaHref = $loggedIn ? '/index.php' : ($registrationOpen ? '/register.php' : '/login.php');
$primaryCtaText = $loggedIn ? 'Open Dashboard' : ($registrationOpen ? 'Create Free Account' : 'Login');
?>
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title><?= h($brand) ?> — Calm Personal Organizer</title>
  <meta name="description" content="Organize tasks, study planning, notes, expenses, and your daily dashboard in one calm LifeNest workspace." />
  <link rel="icon" href="<?= h(site_favicon_url()) ?>" />
  <link rel="stylesheet" href="/theme.php" />
  <link rel="stylesheet" href="<?= h(asset_url('/assets/css/pages/landing.css')) ?>" />
  <script src="<?= h(asset_url('/assets/js/pages/landing.js')) ?>" defer></script>
</head>
<body class="landing-page">
  <div class="landing-bg" aria-hidden="true"></div>

  <header class="landing-header" data-landing-header>
    <div class="landing-container landing-header__inner">
      <a class="landing-brand" href="/landing.php" aria-label="<?= h($brand) ?> home">
        <span class="landing-brand__mark" aria-hidden="true">
          <img src="<?= h(site_logo_url()) ?>" alt="" />
        </span>
        <span class="landing-brand__text">
          <strong><?= h($brand) ?></strong>
          <span><?= h($tagline) ?></span>
        </span>
      </a>

      <nav class="landing-nav" id="landingNav" aria-label="Main navigation" data-landing-nav>
        <a href="#features">Features</a>
        <a href="#preview">Preview</a>
        <a href="#security">Security</a>
        <a href="#faq">FAQ</a>
      </nav>

      <div class="landing-actions" data-landing-actions>
        <?php if (!$loggedIn): ?>
          <a class="landing-link" href="/login.php">Login</a>
        <?php endif; ?>
        <a class="landing-btn landing-btn--primary" href="<?= h($primaryCtaHref) ?>"><?= h($primaryCtaText) ?></a>
      </div>

      <button class="landing-menu" type="button" aria-label="Open menu" aria-controls="landingMobilePanel" aria-expanded="false" data-landing-menu>
        <?= landing_icon('menu') ?>
      </button>
    </div>

    <div class="landing-mobile" id="landingMobilePanel" aria-hidden="true" data-landing-mobile>
      <div class="landing-mobile__inner">
        <div class="landing-mobile__head">
          <span>Menu</span>
          <button type="button" aria-label="Close menu" data-landing-close><?= landing_icon('close') ?></button>
        </div>
        <a href="#features">Features</a>
        <a href="#preview">Preview</a>
        <a href="#security">Security</a>
        <a href="#faq">FAQ</a>
        <div class="landing-mobile__actions">
          <?php if (!$loggedIn): ?>
            <a class="landing-btn landing-btn--ghost" href="/login.php">Login</a>
          <?php endif; ?>
          <a class="landing-btn landing-btn--primary" href="<?= h($primaryCtaHref) ?>"><?= h($primaryCtaText) ?></a>
        </div>
      </div>
    </div>
  </header>

  <main>
    <section class="landing-hero" aria-labelledby="landingHeroTitle">
      <div class="landing-container landing-hero__grid">
        <div class="landing-hero__copy">
          <div class="landing-kicker">
            <span class="landing-kicker__icon"><?= landing_icon('check') ?></span>
            Built around your real day, not another noisy app
          </div>

          <h1 id="landingHeroTitle">Organize your day, study, notes, and budget in one calm place.</h1>
          <p class="landing-hero__lead">LifeNest gives you a clear daily command center: tasks, study planning, notes, monthly budget, and simple reports — all in a focused workspace that matches how you actually live.</p>

          <div class="landing-hero__actions">
            <a class="landing-btn landing-btn--primary landing-btn--large" href="<?= h($primaryCtaHref) ?>"><?= h($primaryCtaText) ?></a>
            <a class="landing-btn landing-btn--secondary landing-btn--large" href="#features">
              Explore Features
              <?= landing_icon('arrow') ?>
            </a>
          </div>

          <div class="landing-trust" aria-label="Product qualities">
            <span><?= landing_icon('shield') ?> Secure by design</span>
            <span><?= landing_icon('tasks') ?> Built for daily use</span>
            <span><?= landing_icon('study') ?> Student friendly</span>
          </div>
        </div>

        <div class="landing-hero__visual" aria-label="LifeNest dashboard preview">
          <div class="landing-window">
            <div class="landing-window__bar">
              <span></span><span></span><span></span>
              <strong>Today Workspace</strong>
            </div>

            <div class="landing-dashboard-card landing-dashboard-card--wide">
              <div>
                <span class="landing-card-label">Today Plan</span>
                <strong>5 focused tasks</strong>
                <small>Sorted by priority and due time</small>
              </div>
              <div class="landing-ring" aria-hidden="true"><span>72%</span></div>
            </div>

            <div class="landing-window__grid">
              <div class="landing-dashboard-card">
                <span class="landing-card-icon landing-card-icon--mint"><?= landing_icon('tasks') ?></span>
                <span class="landing-card-label">Tasks</span>
                <strong>Study report</strong>
                <small>High priority · 45 min</small>
              </div>

              <div class="landing-dashboard-card landing-dashboard-card--accent">
                <span class="landing-card-icon"><?= landing_icon('study') ?></span>
                <span class="landing-card-label">Next Study</span>
                <strong>Software Engineering</strong>
                <small>14:00 · Sprint notes</small>
              </div>

              <div class="landing-dashboard-card">
                <span class="landing-card-icon landing-card-icon--soft"><?= landing_icon('budget') ?></span>
                <span class="landing-card-label">Budget</span>
                <strong>TRY 4,250</strong>
                <small>Remaining this month</small>
              </div>

              <div class="landing-dashboard-card">
                <span class="landing-card-icon landing-card-icon--soft"><?= landing_icon('notes') ?></span>
                <span class="landing-card-label">Notes</span>
                <strong>3 fresh ideas</strong>
                <div class="landing-lines" aria-hidden="true"><i></i><i></i><i></i></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <section class="landing-section landing-problem" aria-labelledby="problemTitle">
      <div class="landing-container">
        <div class="landing-section__head landing-section__head--center">
          <span class="landing-eyebrow">The daily chaos problem</span>
          <h2 id="problemTitle">Your life is not one module, so your organizer should not be scattered.</h2>
          <p>Tasks in one place, study deadlines in another, notes somewhere else, and money tracking after everything already happened. LifeNest connects these basics in one practical system.</p>
        </div>

        <div class="landing-problem__grid">
          <article class="landing-info-card">
            <span class="landing-info-card__icon landing-info-card__icon--danger"><?= landing_icon('tasks') ?></span>
            <h3>Scattered Tasks</h3>
            <p>Personal and study tasks become harder to manage when they are separated from your daily view.</p>
          </article>
          <article class="landing-info-card">
            <span class="landing-info-card__icon landing-info-card__icon--warn"><?= landing_icon('notes') ?></span>
            <h3>Hidden Notes</h3>
            <p>Useful notes lose value when they are disconnected from the task or study context that created them.</p>
          </article>
          <article class="landing-info-card">
            <span class="landing-info-card__icon landing-info-card__icon--mint"><?= landing_icon('budget') ?></span>
            <h3>Budget Blind Spots</h3>
            <p>Small expenses and task-related costs become clearer when they are visible in the same workflow.</p>
          </article>
        </div>
      </div>
    </section>

    <section class="landing-section" id="features" aria-labelledby="featuresTitle">
      <div class="landing-container">
        <div class="landing-section__head landing-section__head--split">
          <div>
            <span class="landing-eyebrow">Core modules</span>
            <h2 id="featuresTitle">Designed like a focused dashboard, not a pile of pages.</h2>
          </div>
          <p>Each feature is intentionally simple and connected to the MVP: Dashboard, Tasks, Study, Notes, Finance, and Reports.</p>
        </div>

        <div class="landing-bento">
          <article class="landing-bento__item landing-bento__item--large">
            <div class="landing-bento__copy">
              <span class="landing-pill">Central command</span>
              <h3>Today Dashboard</h3>
              <p>Start from a clean overview of today’s tasks, priority work, study focus, and remaining monthly budget.</p>
            </div>
            <div class="landing-mini-dashboard" aria-hidden="true">
              <div class="landing-mini-dashboard__top"></div>
              <div class="landing-mini-dashboard__row"><span></span><strong></strong></div>
              <div class="landing-mini-dashboard__row"><span></span><strong></strong></div>
              <div class="landing-mini-dashboard__cards"><i></i><i></i><i></i></div>
            </div>
          </article>

          <article class="landing-bento__item landing-bento__item--mint">
            <span class="landing-bento__icon"><?= landing_icon('budget') ?></span>
            <h3>Budget & Expenses</h3>
            <p>Monthly budget, quick expenses, remaining balance, and task-linked costs without visual noise.</p>
          </article>

          <article class="landing-bento__item">
            <span class="landing-bento__icon landing-bento__icon--soft"><?= landing_icon('study') ?></span>
            <h3>Study Planning</h3>
            <p>Separate academic focus while still connected to your daily plan and task workflow.</p>
          </article>

          <article class="landing-bento__item landing-bento__item--dark">
            <div class="landing-bento__copy">
              <span class="landing-pill landing-pill--dark">Connected context</span>
              <h3>Task Notes</h3>
              <p>Notes live inside tasks, and the Notes page gathers them clearly so nothing gets buried.</p>
            </div>
            <div class="landing-note-stack" aria-hidden="true"><i></i><i></i><i></i></div>
          </article>
        </div>
      </div>
    </section>

    <section class="landing-section landing-preview-section" id="preview" aria-labelledby="previewTitle">
      <div class="landing-container">
        <div class="landing-preview">
          <div class="landing-preview__tabs" role="tablist" aria-label="LifeNest preview tabs">
            <button class="is-active" type="button" role="tab" aria-selected="true" aria-controls="preview-today" id="tab-today" data-preview-tab="preview-today">Today</button>
            <button type="button" role="tab" aria-selected="false" aria-controls="preview-tasks" id="tab-tasks" data-preview-tab="preview-tasks">Tasks</button>
            <button type="button" role="tab" aria-selected="false" aria-controls="preview-notes" id="tab-notes" data-preview-tab="preview-notes">Notes</button>
            <button type="button" role="tab" aria-selected="false" aria-controls="preview-finance" id="tab-finance" data-preview-tab="preview-finance">Finance</button>
          </div>

          <div class="landing-preview__body">
            <div class="landing-preview__copy">
              <span class="landing-eyebrow">Interactive preview</span>
              <h2 id="previewTitle">A calmer interface for the decisions you repeat every day.</h2>
              <p>Preview how LifeNest organizes your daily plan, task details, notes, and expenses using the same visual logic as the application.</p>
            </div>

            <div class="landing-preview__panels">
              <section class="landing-preview-panel is-active" id="preview-today" role="tabpanel" aria-labelledby="tab-today">
                <h3>Morning Overview</h3>
                <div class="landing-task-row landing-task-row--done"><span><?= landing_icon('check') ?></span><strong>Review graduation report</strong><em>Done</em></div>
                <div class="landing-task-row"><span></span><strong>Study Software Engineering</strong><em>High</em></div>
                <div class="landing-task-row"><span></span><strong>Log today’s expenses</strong><em>Finance</em></div>
              </section>

              <section class="landing-preview-panel" id="preview-tasks" role="tabpanel" aria-labelledby="tab-tasks" hidden>
                <h3>Task Details</h3>
                <div class="landing-detail-grid">
                  <span>Priority <strong>High</strong></span>
                  <span>Duration <strong>45 min</strong></span>
                  <span>Status <strong>In progress</strong></span>
                  <span>Cost <strong>TRY 120</strong></span>
                </div>
              </section>

              <section class="landing-preview-panel" id="preview-notes" role="tabpanel" aria-labelledby="tab-notes" hidden>
                <h3>Connected Notes</h3>
                <div class="landing-note-preview"><strong>Chapter summary</strong><p>Key points are saved directly inside the related task.</p></div>
                <div class="landing-note-preview"><strong>Budget idea</strong><p>Recurring expenses can be reviewed from Finance.</p></div>
              </section>

              <section class="landing-preview-panel" id="preview-finance" role="tabpanel" aria-labelledby="tab-finance" hidden>
                <h3>Budget Summary</h3>
                <div class="landing-money"><strong>TRY 4,250</strong><span>Remaining this month</span></div>
                <div class="landing-progress"><span></span></div>
              </section>
            </div>
          </div>
        </div>
      </div>
    </section>

    <section class="landing-section landing-steps" aria-labelledby="stepsTitle">
      <div class="landing-container">
        <h2 id="stepsTitle">Three steps to a cleaner routine.</h2>
        <div class="landing-steps__grid">
          <article><span>01</span><h3>Create your workspace</h3><p>Register and start with a secure personal dashboard.</p></article>
          <article><span>02</span><h3>Add real daily data</h3><p>Create tasks, notes, study goals, and monthly budget entries.</p></article>
          <article><span>03</span><h3>Use Today first</h3><p>Let the Dashboard show what needs attention without opening every module.</p></article>
        </div>
      </div>
    </section>

    <section class="landing-section landing-security" id="security" aria-labelledby="securityTitle">
      <div class="landing-container landing-security__grid">
        <div>
          <span class="landing-eyebrow">Production-minded security</span>
          <h2 id="securityTitle">Personal organization should stay personal.</h2>
          <p>LifeNest is built with strict server-side checks and a no-inline frontend approach, so the public page stays aligned with the same security posture as the app.</p>
        </div>
        <div class="landing-security__card">
          <div class="landing-security__item"><span><?= landing_icon('lock') ?></span><strong>Authenticated access</strong><p>Private pages and APIs are protected by session-based authentication.</p></div>
          <div class="landing-security__item"><span><?= landing_icon('shield') ?></span><strong>CSRF protection</strong><p>Every modifying request in the application is designed to require a valid token.</p></div>
          <div class="landing-security__item"><span><?= landing_icon('check') ?></span><strong>CSP-safe frontend</strong><p>No external CDN, no inline script, no inline style, and no inline event handlers.</p></div>
        </div>
      </div>
    </section>

    <section class="landing-section" id="faq" aria-labelledby="faqTitle">
      <div class="landing-container landing-faq">
        <div class="landing-section__head landing-section__head--center">
          <span class="landing-eyebrow">Questions</span>
          <h2 id="faqTitle">Common questions</h2>
        </div>

        <details class="landing-faq__item" open>
          <summary>Is LifeNest only for students?</summary>
          <p>No. It works for any person who wants tasks, notes, study or work planning, and simple finance tracking in one dashboard. The study module just makes it especially useful for students.</p>
        </details>
        <details class="landing-faq__item">
          <summary>Does it replace all productivity tools?</summary>
          <p>The MVP focuses on the essentials: daily planning, tasks, notes, finance, and reports. The goal is not feature overload, but a reliable personal system.</p>
        </details>
        <details class="landing-faq__item">
          <summary>Is the design responsive?</summary>
          <p>Yes. The landing page and application layout are built to remain clear on desktop and mobile screens.</p>
        </details>
      </div>
    </section>

    <section class="landing-final" aria-labelledby="finalTitle">
      <div class="landing-container">
        <div class="landing-final__card">
          <h2 id="finalTitle">Start with a calmer dashboard.</h2>
          <p>Bring your tasks, study work, notes, and budget into one workspace built for clarity.</p>
          <div class="landing-final__actions">
            <a class="landing-btn landing-btn--light landing-btn--large" href="<?= h($primaryCtaHref) ?>"><?= h($primaryCtaText) ?></a>
            <?php if (!$loggedIn): ?>
              <a class="landing-btn landing-btn--outline-light landing-btn--large" href="/login.php">Login</a>
            <?php endif; ?>
          </div>
        </div>
      </div>
    </section>
  </main>

  <footer class="landing-footer">
    <div class="landing-container landing-footer__inner">
      <a class="landing-brand landing-brand--footer" href="/landing.php" aria-label="<?= h($brand) ?> home">
        <span class="landing-brand__mark" aria-hidden="true"><img src="<?= h(site_logo_url()) ?>" alt="" /></span>
        <span class="landing-brand__text"><strong><?= h($brand) ?></strong><span><?= h($tagline) ?></span></span>
      </a>
      <p>© 2026 <?= h($brand) ?>. A calm personal organizer for focused daily life.</p>
      <div class="landing-footer__links">
        <a href="#features">Features</a>
        <a href="#security">Security</a>
        <a href="#faq">FAQ</a>
      </div>
    </div>
  </footer>
</body>
</html>
