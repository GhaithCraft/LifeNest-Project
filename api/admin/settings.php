<?php
declare(strict_types=1);

require_once __DIR__ . '/../../includes/api_init.php';
require_once __DIR__ . '/../../includes/admin.php';
require_once __DIR__ . '/../../includes/site_settings.php';
require_once __DIR__ . '/../../includes/validate.php';

$adminId = require_admin_api();
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

if ($method === 'GET') {
    json_response([
        'ok' => true,
        'settings' => [
            'site_name' => site_brand_name(),
            'site_tagline' => site_tagline(),
            'support_email' => (string)site_setting('support_email', ''),
            'registration_open' => site_registration_open(),
            'theme' => site_theme_settings(),
            'dashboard_panels' => site_dashboard_panels(),
            'branding' => [
                'logo_path' => site_logo_path(),
                'logo_url' => site_logo_url(),
                'favicon_path' => site_favicon_path(),
                'favicon_url' => site_favicon_url(),
            ],
        ],
    ]);
}

if ($method === 'POST') {
    $body = json_body();
    $save = [];

    if (array_key_exists('site_name', $body)) {
        $siteName = v_string($body['site_name'], 1, 80);
        if ($siteName === null) json_error('Invalid site name', 422);
        $save['site_name'] = $siteName;
    }

    if (array_key_exists('site_tagline', $body)) {
        $tagline = v_string($body['site_tagline'], 0, 160);
        if ($tagline === null) json_error('Invalid tagline', 422);
        $save['site_tagline'] = $tagline;
    }

    if (array_key_exists('support_email', $body)) {
        $support = trim((string)($body['support_email'] ?? ''));
        if ($support !== '' && v_email($support) === null) {
            json_error('Invalid support email', 422);
        }
        $save['support_email'] = $support;
    }

    if (array_key_exists('registration_open', $body)) {
        $save['registration_open'] = !empty($body['registration_open']) ? '1' : '0';
    }

    if (array_key_exists('accent_color', $body)) {
        $save['accent_color'] = site_clean_hex((string)$body['accent_color'], '#2f6f55');
    }
    if (array_key_exists('bg_color_1', $body)) {
        $save['bg_color_1'] = site_clean_hex((string)$body['bg_color_1'], '#eaf0ef');
    }
    if (array_key_exists('bg_color_2', $body)) {
        $save['bg_color_2'] = site_clean_hex((string)$body['bg_color_2'], '#e6eceb');
    }
    if (array_key_exists('ui_scale_desktop', $body)) {
        $save['ui_scale_desktop'] = site_clean_scale((string)$body['ui_scale_desktop'], '0.95');
    }

    if (array_key_exists('dashboard_panels', $body)) {
        $panels = is_array($body['dashboard_panels']) ? $body['dashboard_panels'] : null;
        if ($panels === null) {
            json_error('Invalid dashboard layout', 422);
        }
        $defaults = site_dashboard_panel_defaults();
        $normalized = [];
        foreach ($panels as $idx => $panel) {
            if (!is_array($panel)) continue;
            $id = isset($panel['id']) && is_string($panel['id']) ? $panel['id'] : '';
            if (!isset($defaults[$id])) continue;
            $normalized[] = [
                'id' => $id,
                'enabled' => !empty($panel['enabled']),
                'order' => $idx + 1,
            ];
        }
        foreach ($defaults as $id => $cfg) {
            $exists = false;
            foreach ($normalized as $item) {
                if ($item['id'] === $id) {
                    $exists = true;
                    break;
                }
            }
            if (!$exists) {
                $normalized[] = [
                    'id' => $id,
                    'enabled' => (bool)$cfg['enabled'],
                    'order' => count($normalized) + 1,
                ];
            }
        }
        $save['dashboard_panels'] = $normalized;
    }

    if (!$save) {
        json_error('Nothing to save', 422);
    }

    site_setting_save_many($save, $adminId);

    json_response([
        'ok' => true,
        'saved' => array_keys($save),
        'settings' => [
            'site_name' => array_key_exists('site_name', $save) ? (string)$save['site_name'] : site_brand_name(),
            'site_tagline' => array_key_exists('site_tagline', $save) ? (string)$save['site_tagline'] : site_tagline(),
            'support_email' => array_key_exists('support_email', $save) ? (string)$save['support_email'] : (string)site_setting('support_email', ''),
            'registration_open' => array_key_exists('registration_open', $save) ? ((string)$save['registration_open'] === '1') : site_registration_open(),
            'theme' => [
                'accent_color' => array_key_exists('accent_color', $save) ? (string)$save['accent_color'] : site_theme_settings()['accent_color'],
                'bg_color_1' => array_key_exists('bg_color_1', $save) ? (string)$save['bg_color_1'] : site_theme_settings()['bg_color_1'],
                'bg_color_2' => array_key_exists('bg_color_2', $save) ? (string)$save['bg_color_2'] : site_theme_settings()['bg_color_2'],
                'ui_scale_desktop' => array_key_exists('ui_scale_desktop', $save) ? (string)$save['ui_scale_desktop'] : site_theme_settings()['ui_scale_desktop'],
            ],
            'dashboard_panels' => array_key_exists('dashboard_panels', $save) ? $save['dashboard_panels'] : site_dashboard_panels(),
            'branding' => [
                'logo_path' => site_logo_path(),
                'logo_url' => site_logo_url(),
                'favicon_path' => site_favicon_path(),
                'favicon_url' => site_favicon_url(),
            ],
        ],
    ]);
}

json_error('Method not allowed', 405);
