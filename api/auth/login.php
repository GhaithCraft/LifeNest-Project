<?php
declare(strict_types=1);

require_once __DIR__ . '/../../includes/api_init.php';
require_once __DIR__ . '/../../includes/db.php';
require_once __DIR__ . '/../../includes/validate.php';
require_once __DIR__ . '/../../includes/csrf.php';
require_once __DIR__ . '/../../includes/auth.php';

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'POST') {
    json_error('Method not allowed', 405);
}

csrf_require_or_fail();

$body = json_body();
$email = v_email($body['email'] ?? null);
$pass = v_string($body['password'] ?? null, 1, 200);
$remember = isset($body['remember']) && $body['remember'] === true;

if ($email === null || $pass === null) {
    json_error('Invalid credentials', 422);
}

$ip = auth_client_ip();
if (auth_login_rate_limited($ip, $email)) {
    json_error('Too many attempts. Try again later.', 429);
}

$st = db()->prepare('SELECT id, password_hash, status FROM users WHERE email = ?');
$st->execute([$email]);
$row = $st->fetch();

if (!$row || !isset($row['password_hash']) || !is_string($row['password_hash']) || (string)($row['status'] ?? 'active') !== 'active') {
    auth_record_login_attempt($ip, $email, false);
    json_error('Invalid credentials', 401);
}

if (!password_verify($pass, (string)$row['password_hash'])) {
    auth_record_login_attempt($ip, $email, false);
    json_error('Invalid credentials', 401);
}

$userId = (int)$row['id'];
auth_record_login_attempt($ip, $email, true);
try { db()->prepare('UPDATE users SET last_login_at = NOW() WHERE id = ?')->execute([$userId]); } catch (Throwable) {}

auth_login($userId, $remember);

json_response([
    'ok' => true,
    'user' => fetch_user_public($userId),
]);
