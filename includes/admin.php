<?php
declare(strict_types=1);

require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/db.php';
require_once __DIR__ . '/response.php';

function current_user_role(): string
{
    static $cache = null;
    if (is_string($cache) && $cache !== '') {
        return $cache;
    }

    $uid = current_user_id();
    if ($uid === null) {
        $cache = 'guest';
        return $cache;
    }

    try {
        $st = db()->prepare('SELECT role FROM users WHERE id = ? LIMIT 1');
        $st->execute([$uid]);
        $role = $st->fetchColumn();
        $cache = (is_string($role) && $role !== '') ? $role : 'user';
    } catch (Throwable) {
        $cache = ($uid === 1) ? 'admin' : 'user';
    }

    return $cache;
}

function is_admin_user(): bool
{
    return current_user_role() === 'admin';
}

function require_admin_api(): int
{
    $uid = require_login();
    if (!is_admin_user()) {
        json_error('Forbidden', 403);
    }
    return $uid;
}

function require_admin_page(): int
{
    $uid = current_user_id();
    if ($uid === null) {
        header('Location: /login.php', true, 302);
        exit;
    }
    if (!is_admin_user()) {
        http_response_code(403);
        header('Content-Type: text/html; charset=utf-8');
        echo '<!doctype html><html lang="en" dir="ltr"><meta charset="utf-8"><title>403</title><body style="font-family:system-ui;padding:32px">You do not have permission to access this page.</body></html>';
        exit;
    }
    return $uid;
}
