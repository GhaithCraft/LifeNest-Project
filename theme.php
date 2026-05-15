<?php
declare(strict_types=1);

require_once __DIR__ . '/includes/site_settings.php';

header('Content-Type: text/css; charset=utf-8');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
header('Pragma: no-cache');

$theme = site_theme_settings();
?>
:root{
  --mint: <?= htmlspecialchars($theme['accent_color'], ENT_QUOTES, 'UTF-8') ?>;
  --bg1: <?= htmlspecialchars($theme['bg_color_1'], ENT_QUOTES, 'UTF-8') ?>;
  --bg2: <?= htmlspecialchars($theme['bg_color_2'], ENT_QUOTES, 'UTF-8') ?>;
  --ui-scale-desktop: <?= htmlspecialchars($theme['ui_scale_desktop'], ENT_QUOTES, 'UTF-8') ?>;
}
