<?php
declare(strict_types=1);

require_once __DIR__ . '/../includes/security_headers.php';
require_once __DIR__ . '/../includes/session.php';
require_once __DIR__ . '/../includes/auth.php';
require_once __DIR__ . '/../includes/admin.php';
require_once __DIR__ . '/../includes/csrf.php';
require_once __DIR__ . '/../includes/assets.php';
require_once __DIR__ . '/../includes/site_settings.php';
require_once __DIR__ . '/../includes/page_chrome.php';

function h(string $s): string { return htmlspecialchars($s, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8'); }

auth_bootstrap();
$uid = require_admin_page();
$me = fetch_user_public($uid);
$brand = site_brand_name();
$token = csrf_token();
$todayDate = date('M j, Y');
$todayDay = date('l');
?>
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title><?= h($brand) ?> — Administration</title>
  <link rel="icon" href="<?= h(site_favicon_url()) ?>" />
  <script src="<?= h(asset_url('/assets/js/core/theme.js')) ?>"></script>
  <link rel="stylesheet" href="<?= h(asset_url('/assets/css/app.css')) ?>" />
  <link rel="stylesheet" href="/theme.php" />
  <link rel="stylesheet" href="<?= h(asset_url('/assets/css/pages/dashboard/shell.css')) ?>" />
  <link rel="stylesheet" href="<?= h(asset_url('/assets/css/pages/app_pages.css')) ?>" />
  <link rel="stylesheet" href="<?= h(asset_url('/assets/css/pages/admin/admin.css')) ?>" />
</head>
<body class="admin-body" data-csrf="<?= h($token) ?>">
  <div class="bg"></div>

  <div class="dashboard-shell">

    <?php render_app_sidebar(['active' => 'admin', 'brand' => $brand, 'logo_url' => site_logo_url(), 'can_admin' => true]); ?>

    <div class="dashboard-main">
      <?php render_app_topbar([
        'title' => 'Administration',
        'eyebrow' => 'Site control',
        'search_id' => 'adminSearch',
        'search_placeholder' => 'Search admin',
        'search_aria' => 'Search admin',
        'profile_name' => (string)($me['email'] ?? 'admin'),
        'profile_initial' => strtoupper(substr((string)($me['email'] ?? 'A'), 0, 1)),
        'can_admin' => true,
      ]); ?>

      <?php render_app_drawer(['active' => 'admin', 'can_admin' => true]); ?>

      <main class="page admin-page" role="main">
        <section class="page-hero page-hero--admin">
          <div class="page-hero__content">
            <div class="page-hero__eyebrow">Site administration</div>
            <div class="page-hero__crumb" aria-label="Breadcrumb">
              <a class="page-hero__crumb-link" href="/index.php">Dashboard</a>
              <span aria-hidden="true">›</span>
              <span>Admin</span>
            </div>
            <h1 class="section-title admin-title">Control users, site identity, and dashboard structure from one place</h1>
            <p class="page-hero__desc">The administration workspace now follows the same shell, spacing, and navigation language used across the rest of LifeNest.</p>
            <div class="page-hero__chips" aria-label="Highlights">
              <span class="page-hero__chip">User management</span>
              <span class="page-hero__chip">Site settings</span>
              <span class="page-hero__chip">Interface layout</span>
              <span class="page-hero__chip">System status</span>
            </div>
          </div>
          <div class="admin-hero__actions">
            <a class="btn btn--ghost" href="/index.php">Open app</a>
            <button class="btn btn--primary" type="button" id="adminRefreshBtn">Refresh data</button>
          </div>
        </section>

        <section class="admin-shell" aria-label="Administration workspace">
          <aside class="admin-side card" aria-label="Administration sections">
            <div class="admin-side__heading">Admin sections</div>
            <button class="admin-side__item is-active" type="button" data-target="overview">Overview</button>
            <button class="admin-side__item" type="button" data-target="users">Users</button>
            <button class="admin-side__item" type="button" data-target="site">Site settings</button>
            <button class="admin-side__item" type="button" data-target="appearance">Appearance</button>
            <button class="admin-side__item" type="button" data-target="layout">Dashboard layout</button>
            <button class="admin-side__item" type="button" data-target="system">System</button>
          </aside>

          <section class="admin-main">
            <section class="admin-section is-active" id="section-overview">
              <div class="admin-grid-cards" id="adminStatsGrid"></div>
              <div class="admin-split">
                <article class="card admin-card">
                  <div class="card__header"><h2 class="card__title">Recent users</h2></div>
                  <div class="admin-list" id="recentUsersList"></div>
                </article>
                <article class="card admin-card">
                  <div class="card__header"><h2 class="card__title">Quick summary</h2></div>
                  <div class="admin-summary" id="adminSummaryBox"></div>
                </article>
              </div>
            </section>

            <section class="admin-section" id="section-users">
              <article class="card admin-card">
                <div class="card__header admin-card__header--stack">
                  <div>
                    <h2 class="card__title">User accounts</h2>
                    <div class="admin-hint">Promote a user to admin or disable an account. The final active admin account cannot be demoted.</div>
                  </div>
                  <div class="search admin-search">
                    <svg class="icon icon--muted" viewBox="0 0 24 24" aria-hidden="true"><path d="M10 18a8 8 0 1 1 0-16 8 8 0 0 1 0 16Zm11 3-6.2-6.2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
                    <input class="search__input" id="adminUserSearch" type="search" placeholder="Search by email" aria-label="Search users" />
                  </div>
                </div>
                <div class="admin-users" id="adminUsersTable"></div>
              </article>
            </section>

            <section class="admin-section" id="section-site">
              <article class="card admin-card">
                <div class="card__header"><h2 class="card__title">Core site settings</h2></div>
                <form class="admin-form" id="siteSettingsForm">
                  <label class="admin-field">
                    <span>Site name</span>
                    <input class="input" type="text" id="siteName" maxlength="80" />
                  </label>
                  <label class="admin-field">
                    <span>Short tagline</span>
                    <input class="input" type="text" id="siteTagline" maxlength="160" />
                  </label>
                  <label class="admin-field">
                    <span>Support email</span>
                    <input class="input" type="email" id="supportEmail" maxlength="190" />
                  </label>
                  <label class="admin-check">
                    <input type="checkbox" id="registrationOpen" />
                    <span>Allow new account registration</span>
                  </label>
                  <div class="admin-actions">
                    <button class="btn btn--primary" type="submit">Save settings</button>
                    <div class="admin-save-msg" id="siteSaveMsg" aria-live="polite"></div>
                  </div>
                </form>
              </article>
            </section>

            <section class="admin-section" id="section-appearance">
              <article class="card admin-card">
                <div class="card__header"><h2 class="card__title">Visual identity</h2></div>
                <form class="admin-form admin-form--cols" id="appearanceForm">
                  <div class="admin-branding-card">
                    <div class="admin-branding-card__head">
                      <div>
                        <div class="admin-branding-card__title">Site logo</div>
                        <div class="admin-branding-card__hint">PNG, JPG, or WebP. Transparent background is recommended.</div>
                      </div>
                      <div class="admin-branding-preview admin-branding-preview--logo">
                        <img id="appearanceLogoPreview" src="<?= h(site_logo_url()) ?>" alt="Current site logo" />
                      </div>
                    </div>
                    <label class="admin-field">
                      <span>Upload logo</span>
                      <input class="input" type="file" id="siteLogoInput" accept="image/png,image/jpeg,image/webp" />
                    </label>
                  </div>
                  <div class="admin-branding-card">
                    <div class="admin-branding-card__head">
                      <div>
                        <div class="admin-branding-card__title">Favicon</div>
                        <div class="admin-branding-card__hint">PNG, JPG, or WebP. Use a square image for best results.</div>
                      </div>
                      <div class="admin-branding-preview admin-branding-preview--favicon">
                        <img id="appearanceFaviconPreview" src="<?= h(site_favicon_url()) ?>" alt="Current favicon" />
                      </div>
                    </div>
                    <label class="admin-field">
                      <span>Upload favicon</span>
                      <input class="input" type="file" id="siteFaviconInput" accept="image/png,image/jpeg,image/webp" />
                    </label>
                  </div>
                  <label class="admin-field">
                    <span>Primary accent color</span>
                    <input class="input input--colorlike" type="color" id="accentColor" />
                  </label>
                  <label class="admin-field">
                    <span>Background color one</span>
                    <input class="input input--colorlike" type="color" id="bgColor1" />
                  </label>
                  <label class="admin-field">
                    <span>Background color two</span>
                    <input class="input input--colorlike" type="color" id="bgColor2" />
                  </label>
                  <label class="admin-field">
                    <span>Desktop UI scale</span>
                    <input class="input" type="number" id="uiScaleDesktop" step="0.01" min="0.85" max="1.10" />
                  </label>
                  <div class="admin-actions admin-actions--full">
                    <button class="btn btn--primary" type="submit">Save appearance</button>
                    <div class="admin-save-msg" id="appearanceSaveMsg" aria-live="polite"></div>
                  </div>
                </form>
              </article>
            </section>

            <section class="admin-section" id="section-layout">
              <article class="card admin-card">
                <div class="card__header">
                  <div>
                    <h2 class="card__title">Dashboard layout order</h2>
                    <div class="admin-hint">Reorder the main dashboard panels and disable any section you do not want to show.</div>
                  </div>
                </div>
                <form class="admin-form" id="layoutForm">
                  <div class="admin-layout-list" id="dashboardPanelsList"></div>
                  <div class="admin-actions">
                    <button class="btn btn--primary" type="submit">Save layout</button>
                    <div class="admin-save-msg" id="layoutSaveMsg" aria-live="polite"></div>
                  </div>
                </form>
              </article>
            </section>

            <section class="admin-section" id="section-system">
              <article class="card admin-card">
                <div class="card__header"><h2 class="card__title">System information</h2></div>
                <div class="admin-system" id="systemInfoBox"></div>
              </article>
            </section>
          </section>
        </section>
      </main>
    </div>
  </div>

  <script src="<?= h(asset_url('/assets/js/app.js')) ?>"></script>
  <script src="<?= h(asset_url('/assets/js/pages/admin.js')) ?>"></script>
</body>
</html>
