<?php
$canAdminPanel = function_exists('is_admin_user') && is_admin_user();
$navItems = [
    [
        'href' => '/tasks.php',
        'title' => 'Tasks',
        'meta' => 'Open your task board',
    ],
    [
        'href' => '/study.php',
        'title' => 'Study',
        'meta' => 'Go to study tasks',
    ],
    [
        'href' => '/finance.php',
        'title' => 'Finance',
        'meta' => 'Budget and expenses',
    ],
    [
        'href' => '/notes.php',
        'title' => 'Notes',
        'meta' => 'View your notes',
    ],
    [
        'href' => '/account.php',
        'title' => 'Account',
        'meta' => 'Profile and sessions',
    ],
];

if ($canAdminPanel) {
    $navItems[] = [
        'href' => '/admin/',
        'title' => 'Admin',
        'meta' => 'Site settings and users',
    ];
}
?>

<article class="card card--navigation panel panel--navigation" aria-label="Quick navigation">
  <div class="card__header">
    <h3 class="card__title">Quick Navigation</h3>
    <button class="dots-btn" type="button" aria-label="Navigation shortcuts">···</button>
  </div>

  <div class="nav-panel">
    <p class="nav-panel__lead">Move between the main pages of the site without opening the side menu.</p>

    <div class="nav-panel__grid">
      <?php foreach ($navItems as $item): ?>
        <a class="nav-shortcut" href="<?= h($item['href']) ?>" aria-label="Open <?= h($item['title']) ?> page">
          <span class="nav-shortcut__content">
            <span class="nav-shortcut__title"><?= h($item['title']) ?></span>
            <span class="nav-shortcut__meta"><?= h($item['meta']) ?></span>
          </span>
          <span class="nav-shortcut__arrow" aria-hidden="true">→</span>
        </a>
      <?php endforeach; ?>
    </div>
  </div>
</article>
