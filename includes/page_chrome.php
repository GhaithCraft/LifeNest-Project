<?php
declare(strict_types=1);

if (!function_exists('ln_h')) {
    function ln_h(string $s): string
    {
        return htmlspecialchars($s, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
    }
}

if (!function_exists('lifenest_nav_items')) {
    function lifenest_nav_items(bool $canAdmin = false): array
    {
        $items = [
            [
                'href' => '/index.php',
                'label' => 'Dashboard',
                'key' => 'dashboard',
                'icon' => '<svg viewBox="0 0 24 24"><path d="M3 10.5 12 3l9 7.5V21a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1V10.5Z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>',
            ],
            [
                'href' => '/tasks.php',
                'label' => 'Tasks',
                'key' => 'tasks',
                'icon' => '<svg viewBox="0 0 24 24"><path d="M9 11 11 13 15 9M5 4h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
            ],
            [
                'href' => '/study.php',
                'label' => 'Study',
                'key' => 'study',
                'icon' => '<svg viewBox="0 0 24 24"><path d="M4 5.5 12 2l8 3.5v12L12 21l-8-3.5v-12Zm8 1.9L6 6v9.6l6 2.6 6-2.6V6l-6 1.4Z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>',
            ],
            [
                'href' => '/notes.php',
                'label' => 'Notes',
                'key' => 'notes',
                'icon' => '<svg viewBox="0 0 24 24"><path d="M7 3h7l5 5v13a1 1 0 0 1-1 1H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Zm7 1.5V9h4.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
            ],
            [
                'href' => '/finance.php',
                'label' => 'Finance',
                'key' => 'finance',
                'icon' => '<svg viewBox="0 0 24 24"><path d="M12 2C7.6 2 4 5.6 4 10s3.6 8 8 8 8-3.6 8-8-3.6-8-8-8Zm1 13.5V17h-2v-1.5c-1.2-.2-2.2-1-2.4-2.2l2-.4c.1.6.6 1.1 1.4 1.1.8 0 1.3-.4 1.3-1 0-.7-.7-.9-1.8-1.2-1.6-.4-2.9-1-2.9-2.7 0-1.3 1-2.3 2.4-2.6V3h2v1.5c1 .2 1.9.9 2.2 2l-2 .5c-.1-.5-.5-.9-1.2-.9-.7 0-1.2.3-1.2.9 0 .6.6.8 1.8 1.1 1.8.4 2.9 1.2 2.9 2.8 0 1.4-1 2.4-2.3 2.6Z" fill="currentColor"/></svg>',
            ],
        ];

        if ($canAdmin) {
            $items[] = [
                'href' => '/admin/',
                'label' => 'Admin',
                'key' => 'admin',
                'icon' => '<svg viewBox="0 0 24 24"><path d="M12 3 4 7v5c0 5.2 3.5 8.7 8 9.9 4.5-1.2 8-4.7 8-9.9V7l-8-4Zm0 5v10" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M8.5 12H15.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
            ];
        }

        return $items;
    }
}

if (!function_exists('render_app_topbar')) {
    function render_app_topbar(array $options = []): void
    {
        $pageTitle = trim((string)($options['title'] ?? 'Dashboard'));
        $eyebrow = trim((string)($options['eyebrow'] ?? 'Workspace'));
        $searchId = trim((string)($options['search_id'] ?? 'pageSearch'));
        $searchPlaceholder = trim((string)($options['search_placeholder'] ?? 'Search'));
        $searchAria = trim((string)($options['search_aria'] ?? $searchPlaceholder));
        $searchScope = trim((string)($options['search_scope'] ?? ''));
        $showNotifications = array_key_exists('show_notifications', $options) ? (bool)$options['show_notifications'] : true;
        $showSearch = array_key_exists('show_search', $options) ? (bool)$options['show_search'] : true;
        $showDashboardLink = array_key_exists('show_dashboard_link', $options) ? (bool)$options['show_dashboard_link'] : true;
        $profileName = trim((string)($options['profile_name'] ?? 'User'));
        $profileInitial = trim((string)($options['profile_initial'] ?? ($profileName !== '' ? strtoupper(substr($profileName, 0, 1)) : 'U')));
        ?>
<header class="topbar" role="banner">
  <div class="topbar__inner">
    <div class="topbar__left">
      <button class="menu-btn" type="button" aria-label="Open menu" aria-controls="drawer" aria-expanded="false">
        <span class="menu-btn__bar" aria-hidden="true"></span>
        <span class="menu-btn__bar" aria-hidden="true"></span>
        <span class="menu-btn__bar" aria-hidden="true"></span>
      </button>

      <div class="topbar__page">
        <div class="topbar__eyebrow"><?= ln_h($eyebrow) ?></div>
        <div class="topbar__title"><?= ln_h($pageTitle) ?></div>
      </div>
    </div>

    <div class="topbar__right">
      <?php if ($showNotifications): ?>
        <div class="topbar-menu-wrap topbar-menu-wrap--notifications">
          <button class="icon-btn icon-btn--alert" id="topbarNotificationsBtn" type="button" aria-label="Notifications" aria-haspopup="menu" aria-expanded="false">
            <svg class="icon" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M15 17H5.5c.9-.9 1.5-2.7 1.5-5V10a5 5 0 0 1 10 0v2c0 2.3.6 4.1 1.5 5H15Zm0 0a3 3 0 0 1-6 0" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            <span class="icon-btn__dot" id="topbarNotificationsDot" aria-hidden="true" hidden></span>
          </button>
          <div class="profile-menu topbar-menu topbar-menu--notifications" id="topbarNotificationsMenu" role="menu" aria-label="Notifications" aria-hidden="true">
            <div class="topbar-menu__head">Notifications</div>
            <div class="topbar-menu__body" id="topbarNotificationsBody">
              <div class="topbar-menu__empty">Loading…</div>
            </div>
          </div>
        </div>
      <?php endif; ?>

      <?php if ($showDashboardLink): ?>
        <a class="icon-btn" href="/index.php" aria-label="Dashboard">
          <svg class="icon" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M3 11 12 3l9 8v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1V11Z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>
          </svg>
        </a>
      <?php endif; ?>

      <div class="profile-wrap">
        <button class="profile" id="profileBtn" type="button" aria-label="Profile" aria-haspopup="menu" aria-expanded="false">
          <span class="avatar" id="profileAvatar" aria-hidden="true"><?= ln_h($profileInitial !== '' ? $profileInitial : 'U') ?></span>
          <span class="profile__name" id="profileName"><?= ln_h($profileName !== '' ? $profileName : 'User') ?></span>
          <svg class="icon icon--sm" viewBox="0 0 24 24" aria-hidden="true">
            <path d="m7 10 5 5 5-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </button>

        <div class="profile-menu" id="profileMenu" role="menu" aria-label="Profile menu" aria-hidden="true">
          <a class="profile-menu__item" role="menuitem" href="/account.php">Account</a>
          <?php if (!empty($options['can_admin'])): ?><a class="profile-menu__item" role="menuitem" href="/admin/">Admin</a><?php endif; ?>
          <button class="profile-menu__item" role="menuitem" type="button" id="btnLogout">Logout</button>
        </div>
      </div>

      <?php if ($showSearch): ?>
        <div class="search" role="search">
          <svg class="icon icon--muted" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M10 18a8 8 0 1 1 0-16 8 8 0 0 1 0 16Zm11 3-6.2-6.2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
          </svg>
          <input class="search__input"<?= $searchId !== '' ? ' id="' . ln_h($searchId) . '"' : '' ?><?= $searchScope !== '' ? ' data-search-scope="' . ln_h($searchScope) . '"' : '' ?> type="search" placeholder="<?= ln_h($searchPlaceholder) ?>" aria-label="<?= ln_h($searchAria) ?>" autocomplete="off" />
        </div>
      <?php endif; ?>
    </div>
  </div>
</header>
        <?php
    }
}

if (!function_exists('render_app_sidebar')) {
    function render_app_sidebar(array $options = []): void
    {
        $active = trim((string)($options['active'] ?? ''));
        $brand = trim((string)($options['brand'] ?? 'LifeNest'));
        $brandHref = trim((string)($options['brand_href'] ?? '/index.php'));
        $logoUrl = trim((string)($options['logo_url'] ?? '/assets/img/leaf.svg'));
        $canAdmin = !empty($options['can_admin']);
        $items = lifenest_nav_items($canAdmin);
        ?>
<aside class="dashboard-sidebar" aria-label="Primary navigation">
  <a class="dashboard-sidebar__brand" href="<?= ln_h($brandHref) ?>" aria-label="<?= ln_h($brand) ?> home">
    <img class="dashboard-sidebar__logo" src="<?= ln_h($logoUrl) ?>" alt="" aria-hidden="true" />
    <span class="dashboard-sidebar__brand-text"><?= ln_h($brand) ?></span>
  </a>

  <nav class="dashboard-sidebar__nav" aria-label="Main navigation">
    <?php foreach ($items as $item): ?>
      <a class="dashboard-nav__item<?= $active === (string)$item['key'] ? ' is-active' : '' ?>" href="<?= ln_h((string)$item['href']) ?>"<?= $active === (string)$item['key'] ? ' aria-current="page"' : '' ?>>
        <span class="dashboard-nav__icon" aria-hidden="true"><?= $item['icon'] ?></span>
        <span><?= ln_h((string)$item['label']) ?></span>
      </a>
    <?php endforeach; ?>
  </nav>
</aside>
        <?php
    }
}

if (!function_exists('render_app_drawer')) {
    function render_app_drawer(array $options = []): void
    {
        $active = trim((string)($options['active'] ?? ''));
        $canAdmin = !empty($options['can_admin']);
        $items = lifenest_nav_items($canAdmin);
        ?>
<aside class="ln-drawer" id="drawer" aria-hidden="true" aria-label="Main menu">
  <div class="ln-drawer__backdrop" data-close="drawer" aria-hidden="true"></div>
  <div class="ln-drawer__panel" role="navigation" aria-label="Navigation">
    <div class="ln-drawer__head">
      <div class="ln-drawer__title">Menu</div>
      <button class="ln-drawer__close" type="button" data-close="drawer" aria-label="Close"><svg class="icon icon--xs" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></button>
    </div>
    <div class="ln-drawer__nav">
      <?php foreach ($items as $item): ?>
        <a class="ln-drawer__item ln-drawer__item--link" href="<?= ln_h((string)$item['href']) ?>"<?= $active === (string)$item['key'] ? ' aria-current="page"' : '' ?>><?= ln_h((string)$item['label']) ?></a>
      <?php endforeach; ?>
      <button class="ln-drawer__item ln-drawer__item--danger" type="button" id="drawerLogout">Logout</button>
    </div>
  </div>
</aside>
        <?php
    }
}
