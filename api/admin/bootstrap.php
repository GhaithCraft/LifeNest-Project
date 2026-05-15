<?php
declare(strict_types=1);

require_once __DIR__ . '/../../includes/api_init.php';
require_once __DIR__ . '/../../includes/admin.php';
require_once __DIR__ . '/../../includes/site_settings.php';
require_once __DIR__ . '/../../includes/crypto.php';

$uid = require_admin_api();
$pdo = db();

$stats = [
    'users_total' => 0,
    'users_active' => 0,
    'users_disabled' => 0,
    'admins_total' => 0,
    'tasks_total' => 0,
    'tasks_done' => 0,
    'tasks_due_today' => 0,
    'tasks_overdue' => 0,
    'study_items_total' => 0,
    'notes_total' => 0,
    'active_sessions' => 0,
    'expenses_month_count' => 0,
    'expenses_month_total_cents' => 0,
];

$today = (new DateTimeImmutable('now'))->format('Y-m-d');
$monthStart = (new DateTimeImmutable('first day of this month midnight'))->format('Y-m-d');
$nextMonth = (new DateTimeImmutable('first day of next month midnight'))->format('Y-m-d');

try {
    $row = $pdo->query("SELECT COUNT(*) AS total, SUM(status='active') AS active_count, SUM(status='disabled') AS disabled_count, SUM(role='admin') AS admin_count FROM users")->fetch();
    if (is_array($row)) {
        $stats['users_total'] = (int)($row['total'] ?? 0);
        $stats['users_active'] = (int)($row['active_count'] ?? 0);
        $stats['users_disabled'] = (int)($row['disabled_count'] ?? 0);
        $stats['admins_total'] = (int)($row['admin_count'] ?? 0);
    }

    $row = $pdo->query("SELECT COUNT(*) AS total, SUM(status='done') AS done_count, SUM(due_date = CURDATE()) AS due_today, SUM(due_date < CURDATE() AND status <> 'done') AS overdue_count FROM tasks")->fetch();
    if (is_array($row)) {
        $stats['tasks_total'] = (int)($row['total'] ?? 0);
        $stats['tasks_done'] = (int)($row['done_count'] ?? 0);
        $stats['tasks_due_today'] = (int)($row['due_today'] ?? 0);
        $stats['tasks_overdue'] = (int)($row['overdue_count'] ?? 0);
    }

    $stats['study_items_total'] = (int)$pdo->query('SELECT COUNT(*) FROM study_items')->fetchColumn();
    $stats['notes_total'] = (int)$pdo->query('SELECT COUNT(*) FROM task_notes')->fetchColumn();
    $stats['active_sessions'] = (int)$pdo->query('SELECT COUNT(*) FROM user_sessions WHERE expires_at > NOW()')->fetchColumn();

    $stExp = $pdo->prepare('SELECT user_id, amount_cents FROM expenses WHERE expense_date >= ? AND expense_date < ?');
    $stExp->execute([$monthStart, $nextMonth]);
    $sum = 0;
    $count = 0;
    foreach ($stExp->fetchAll() as $rowExp) {
        $expUid = isset($rowExp['user_id']) ? (int)$rowExp['user_id'] : 0;
        $raw = isset($rowExp['amount_cents']) ? (string)$rowExp['amount_cents'] : '0';
        if ($expUid > 0) {
            $sum += crypto_decrypt_int($expUid, $raw, 0);
            $count++;
        }
    }
    $stats['expenses_month_count'] = $count;
    $stats['expenses_month_total_cents'] = $sum;
} catch (Throwable $e) {
    $id = lifenest_log_exception($e);
    json_response(['ok' => false, 'error' => 'Stats failed', 'error_id' => $id], 500);
}

$stUsers = $pdo->query('SELECT id, email, status, role, created_at, last_login_at FROM users ORDER BY created_at DESC LIMIT 12');
$recentUsers = [];
foreach ($stUsers->fetchAll() as $row) {
    $recentUsers[] = [
        'id' => (int)$row['id'],
        'email' => (string)$row['email'],
        'status' => (string)($row['status'] ?? 'active'),
        'role' => (string)($row['role'] ?? 'user'),
        'created_at' => (string)($row['created_at'] ?? ''),
        'last_login_at' => isset($row['last_login_at']) ? (string)$row['last_login_at'] : null,
    ];
}

$settings = [
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
];

$runtime = [
    'php_version' => PHP_VERSION,
    'app_env' => (string)((app_config()['app']['env'] ?? 'prod')),
    'install_locked' => is_file(dirname(__DIR__, 2) . '/cache/.lifenest_installed.lock'),
    'db_host' => (string)((app_config()['db']['host'] ?? '')),
    'current_admin_id' => $uid,
];

json_response([
    'ok' => true,
    'stats' => $stats,
    'recent_users' => $recentUsers,
    'settings' => $settings,
    'runtime' => $runtime,
]);
