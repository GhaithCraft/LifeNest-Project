<?php
declare(strict_types=1);

require_once __DIR__ . '/db.php';
require_once __DIR__ . '/assets.php';

function site_default_settings(): array
{
    return [
        'site_name' => 'LifeNest',
        'site_tagline' => 'Personal Organizer',
        'support_email' => '',
        'registration_open' => '1',
        'accent_color' => '#2f6f55',
        'bg_color_1' => '#eaf0ef',
        'bg_color_2' => '#e6eceb',
        'ui_scale_desktop' => '0.95',
        'site_logo_path' => '/assets/img/leaf.svg',
        'site_favicon_path' => '/assets/img/leaf.svg',
        'dashboard_panels' => json_encode([
            ['id' => 'snapshot', 'enabled' => true, 'order' => 1],
            ['id' => 'tasks', 'enabled' => true, 'order' => 2],
            ['id' => 'today_plan', 'enabled' => true, 'order' => 3],
            ['id' => 'study', 'enabled' => true, 'order' => 4],
            ['id' => 'budget', 'enabled' => true, 'order' => 5],
            ['id' => 'navigation', 'enabled' => true, 'order' => 6],
        ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
    ];
}

function site_settings_all(): array
{
    static $cache = null;
    if (is_array($cache)) {
        return $cache;
    }

    $settings = site_default_settings();
    try {
        $st = db()->query('SELECT setting_key, setting_value FROM site_settings');
        foreach ($st->fetchAll() as $row) {
            $k = isset($row['setting_key']) && is_string($row['setting_key']) ? (string)$row['setting_key'] : '';
            if ($k === '') {
                continue;
            }
            $settings[$k] = isset($row['setting_value']) ? (string)$row['setting_value'] : '';
        }
    } catch (Throwable) {
        // Fall back to defaults when DB/settings table is not ready.
    }

    $cache = $settings;
    return $cache;
}

function site_setting(string $key, mixed $default = null): mixed
{
    $settings = site_settings_all();
    return array_key_exists($key, $settings) ? $settings[$key] : $default;
}

function site_bool_setting(string $key, bool $default = false): bool
{
    $raw = site_setting($key, $default ? '1' : '0');
    if (is_bool($raw)) {
        return $raw;
    }
    $v = strtolower(trim((string)$raw));
    return in_array($v, ['1', 'true', 'yes', 'on'], true);
}

function site_clean_hex(string $value, string $fallback): string
{
    $v = trim($value);
    if (preg_match('/^#[0-9a-fA-F]{6}$/', $v)) {
        return strtolower($v);
    }
    return strtolower($fallback);
}

function site_clean_scale(string|float|int $value, string $fallback = '0.95'): string
{
    $n = is_numeric($value) ? (float)$value : (float)$fallback;
    if ($n < 0.85) $n = 0.85;
    if ($n > 1.10) $n = 1.10;
    return number_format($n, 2, '.', '');
}

function site_brand_name(): string
{
    $v = trim((string)site_setting('site_name', 'LifeNest'));
    return $v !== '' ? $v : 'LifeNest';
}

function site_tagline(): string
{
    return trim((string)site_setting('site_tagline', 'Personal Organizer'));
}


function site_brand_asset_path(string $key, string $fallback): string
{
    $fallback = trim($fallback) !== '' ? trim($fallback) : '/assets/img/leaf.svg';
    $raw = trim((string)site_setting($key, $fallback));
    if ($raw === '' || $raw[0] !== '/') {
        $raw = $fallback;
    }

    $docRoot = $_SERVER['DOCUMENT_ROOT'] ?? dirname(__DIR__);
    $docRoot = rtrim((string)$docRoot, '/\\');
    $candidate = $docRoot . str_replace('/', DIRECTORY_SEPARATOR, $raw);
    if (!is_file($candidate)) {
        return $fallback;
    }

    return $raw;
}

function site_logo_path(): string
{
    return site_brand_asset_path('site_logo_path', '/assets/img/leaf.svg');
}

function site_logo_url(): string
{
    return asset_url(site_logo_path());
}

function site_favicon_path(): string
{
    return site_brand_asset_path('site_favicon_path', site_logo_path());
}

function site_favicon_url(): string
{
    return asset_url(site_favicon_path());
}

function site_registration_open(): bool
{
    return site_bool_setting('registration_open', true);
}

function site_theme_settings(): array
{
    return [
        'accent_color' => site_clean_hex((string)site_setting('accent_color', '#2f6f55'), '#2f6f55'),
        'bg_color_1' => site_clean_hex((string)site_setting('bg_color_1', '#eaf0ef'), '#eaf0ef'),
        'bg_color_2' => site_clean_hex((string)site_setting('bg_color_2', '#e6eceb'), '#e6eceb'),
        'ui_scale_desktop' => site_clean_scale((string)site_setting('ui_scale_desktop', '0.95'), '0.95'),
    ];
}

function site_dashboard_panel_defaults(): array
{
    return [
        'snapshot' => ['id' => 'snapshot', 'label' => 'Quick Snapshot', 'enabled' => true, 'order' => 1],
        'tasks' => ['id' => 'tasks', 'label' => 'Tasks', 'enabled' => true, 'order' => 2],
        'today_plan' => ['id' => 'today_plan', 'label' => 'Today Plan', 'enabled' => true, 'order' => 3],
        'study' => ['id' => 'study', 'label' => 'Study', 'enabled' => true, 'order' => 4],
        'budget' => ['id' => 'budget', 'label' => 'Budget', 'enabled' => true, 'order' => 5],
        'navigation' => ['id' => 'navigation', 'label' => 'Quick Navigation', 'enabled' => true, 'order' => 6],
    ];
}

function site_dashboard_panels(): array
{
    $defaults = site_dashboard_panel_defaults();
    $raw = (string)site_setting('dashboard_panels', '');
    if ($raw === '') {
        return array_values($defaults);
    }

    $decoded = json_decode($raw, true);
    if (!is_array($decoded)) {
        return array_values($defaults);
    }

    $normalized = [];
    foreach ($decoded as $item) {
        if (!is_array($item)) continue;
        $id = isset($item['id']) && is_string($item['id']) ? $item['id'] : '';
        if (!isset($defaults[$id])) continue;
        $normalized[$id] = [
            'id' => $id,
            'label' => $defaults[$id]['label'],
            'enabled' => isset($item['enabled']) ? (bool)$item['enabled'] : (bool)$defaults[$id]['enabled'],
            'order' => isset($item['order']) && is_numeric($item['order']) ? (int)$item['order'] : (int)$defaults[$id]['order'],
        ];
    }

    foreach ($defaults as $id => $cfg) {
        if (!isset($normalized[$id])) {
            $normalized[$id] = $cfg;
        }
    }

    uasort($normalized, static function (array $a, array $b): int {
        return [$a['order'], $a['id']] <=> [$b['order'], $b['id']];
    });

    return array_values($normalized);
}

function site_dashboard_panel_ids_enabled(): array
{
    $out = [];
    foreach (site_dashboard_panels() as $panel) {
        if (!empty($panel['enabled']) && isset($panel['id']) && is_string($panel['id'])) {
            $out[] = $panel['id'];
        }
    }
    return $out;
}

function site_setting_save_many(array $settings, ?int $updatedBy = null): void
{
    if (!$settings) {
        return;
    }

    $pdo = db();
    $st = $pdo->prepare(
        'INSERT INTO site_settings (setting_key, setting_value, updated_by) VALUES (?, ?, ?) '
        . 'ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value), updated_by = VALUES(updated_by), updated_at = CURRENT_TIMESTAMP'
    );

    foreach ($settings as $key => $value) {
        if (!is_string($key) || trim($key) === '') {
            continue;
        }

        if (is_array($value)) {
            $value = json_encode($value, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        } elseif (is_bool($value)) {
            $value = $value ? '1' : '0';
        } elseif ($value === null) {
            $value = '';
        } else {
            $value = (string)$value;
        }

        $st->execute([$key, $value, $updatedBy]);
    }

    // Reset in-request cache.
    $ref = new ReflectionFunction('site_settings_all');
    $staticVars = $ref->getStaticVariables();
    if (array_key_exists('cache', $staticVars)) {
        // no-op; cache is per request, next request will reload.
    }
}
