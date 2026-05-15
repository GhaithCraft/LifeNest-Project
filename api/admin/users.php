<?php
declare(strict_types=1);

require_once __DIR__ . '/../../includes/api_init.php';
require_once __DIR__ . '/../../includes/admin.php';
require_once __DIR__ . '/../../includes/validate.php';

$adminId = require_admin_api();
$pdo = db();
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

if ($method === 'GET') {
    $q = isset($_GET['q']) && is_string($_GET['q']) ? trim($_GET['q']) : '';
    $limit = v_int($_GET['limit'] ?? 200, 1, 500) ?? 200;

    $sql = 'SELECT id, email, status, role, created_at, last_login_at FROM users';
    $params = [];
    if ($q !== '') {
        $sql .= ' WHERE email LIKE ?';
        $params[] = '%' . $q . '%';
    }
    $sql .= ' ORDER BY created_at DESC LIMIT ' . (int)$limit;

    $st = $pdo->prepare($sql);
    $st->execute($params);
    $users = [];
    foreach ($st->fetchAll() as $row) {
        $users[] = [
            'id' => (int)$row['id'],
            'email' => (string)$row['email'],
            'status' => (string)($row['status'] ?? 'active'),
            'role' => (string)($row['role'] ?? 'user'),
            'created_at' => (string)($row['created_at'] ?? ''),
            'last_login_at' => isset($row['last_login_at']) ? (string)$row['last_login_at'] : null,
        ];
    }

    json_response(['ok' => true, 'users' => $users]);
}

if ($method === 'PATCH') {
    $body = json_body();
    $targetId = v_int($body['id'] ?? null, 1, PHP_INT_MAX);
    $status = array_key_exists('status', $body) ? v_enum($body['status'], ['active', 'disabled']) : null;
    $role = array_key_exists('role', $body) ? v_enum($body['role'], ['user', 'admin']) : null;

    if ($targetId === null) {
        json_error('Missing id', 422);
    }
    if ($status === null && $role === null) {
        json_error('No valid changes', 422);
    }
    if ($targetId === $adminId) {
        json_error('You cannot change your own role or disable your own account from this screen.', 422);
    }

    $st = $pdo->prepare('SELECT id, role, status FROM users WHERE id = ? LIMIT 1');
    $st->execute([$targetId]);
    $current = $st->fetch();
    if (!$current) {
        json_error('User not found', 404);
    }

    $nextRole = $role ?? (string)$current['role'];
    $nextStatus = $status ?? (string)$current['status'];

    if (($current['role'] ?? '') === 'admin' && ($nextRole !== 'admin' || $nextStatus !== 'active')) {
        $adminsActive = (int)$pdo->query("SELECT COUNT(*) FROM users WHERE role = 'admin' AND status = 'active'")->fetchColumn();
        if ($adminsActive <= 1) {
            json_error('The last active admin in the system cannot be removed.', 422);
        }
    }

    $pdo->prepare('UPDATE users SET role = ?, status = ? WHERE id = ?')->execute([$nextRole, $nextStatus, $targetId]);

    $st = $pdo->prepare('SELECT id, email, status, role, created_at, last_login_at FROM users WHERE id = ? LIMIT 1');
    $st->execute([$targetId]);
    $row = $st->fetch();

    json_response([
        'ok' => true,
        'user' => [
            'id' => (int)$row['id'],
            'email' => (string)$row['email'],
            'status' => (string)($row['status'] ?? 'active'),
            'role' => (string)($row['role'] ?? 'user'),
            'created_at' => (string)($row['created_at'] ?? ''),
            'last_login_at' => isset($row['last_login_at']) ? (string)$row['last_login_at'] : null,
        ],
    ]);
}

json_error('Method not allowed', 405);
