<?php
declare(strict_types=1);

require_once __DIR__ . '/../../includes/api_init.php';
require_once __DIR__ . '/../../includes/db.php';
require_once __DIR__ . '/../../includes/validate.php';
require_once __DIR__ . '/../../includes/csrf.php';
require_once __DIR__ . '/../../includes/auth.php';
require_once __DIR__ . '/../../includes/site_settings.php';

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'POST') {
    json_error('Method not allowed', 405);
}

csrf_require_or_fail();

$body = json_body();
$email = v_email($body['email'] ?? null);
$pass = v_string($body['password'] ?? null, 1, 200);
$remember = isset($body['remember']) && $body['remember'] === true;

if ($email === null || $pass === null) {
    json_error('Invalid email or password', 422);
}

if (!auth_password_ok($pass)) {
    json_error('Weak password', 422);
}

$pdo = db();

$usersCount = (int)$pdo->query('SELECT COUNT(*) FROM users')->fetchColumn();
if ($usersCount > 0 && !site_registration_open()) {
    json_error('Registration is currently disabled', 403);
}

$st = $pdo->prepare('SELECT id FROM users WHERE email = ?');
$st->execute([$email]);
if ($st->fetch()) {
    json_error('Email already registered', 409);
}

$hash = password_hash($pass, password_algo());
if (!is_string($hash) || $hash === '') {
    throw new RuntimeException('Password hashing failed');
}

$role = ($usersCount === 0) ? 'admin' : 'user';
$ins = $pdo->prepare("INSERT INTO users (email, password_hash, status, role, session_version, created_at) VALUES (?, ?, 'active', ?, 0, NOW())");
$ins->execute([$email, $hash, $role]);
$userId = (int)$pdo->lastInsertId();

auth_login($userId, $remember);

json_response([
    'ok' => true,
    'user' => fetch_user_public($userId),
]);
