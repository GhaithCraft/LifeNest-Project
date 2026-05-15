<?php
declare(strict_types=1);

require_once __DIR__ . '/db.php';
require_once __DIR__ . '/response.php';

// -----------------------------
// Auth core (sessions + remember-me)
// -----------------------------

// -------- Config (env overrides) --------

function auth_cfg_int(string $envKey, int $default, int $min, int $max): int
{
    $raw = getenv($envKey);
    if ($raw === false || trim((string)$raw) === '') {
        return $default;
    }
    if (!preg_match('/^\d+$/', (string)$raw)) {
        return $default;
    }
    $n = (int)$raw;
    if ($n < $min) return $min;
    if ($n > $max) return $max;
    return $n;
}

function auth_session_ttl_seconds(): int
{
    // Default: 3 hours
    return auth_cfg_int('LIFENEST_AUTH_SESSION_TTL', 3 * 3600, 10 * 60, 24 * 3600);
}

function auth_remember_ttl_seconds(): int
{
    // Default: 14 days
    return auth_cfg_int('LIFENEST_AUTH_REMEMBER_TTL', 14 * 86400, 86400, 90 * 86400);
}

// -------- Helpers --------

function auth_is_https(): bool
{
    return (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
        || (isset($_SERVER['SERVER_PORT']) && (int)$_SERVER['SERVER_PORT'] === 443)
        || (isset($_SERVER['HTTP_X_FORWARDED_PROTO']) && $_SERVER['HTTP_X_FORWARDED_PROTO'] === 'https');
}

function auth_client_ip(): string
{
    // We intentionally do NOT trust X-Forwarded-For here (can be spoofed).
    $ip = isset($_SERVER['REMOTE_ADDR']) ? (string)$_SERVER['REMOTE_ADDR'] : '';
    if ($ip === '' || strlen($ip) > 45) {
        return '0.0.0.0';
    }
    return $ip;
}

function b64url_encode(string $raw): string
{
    $b64 = base64_encode($raw);
    return str_replace(['+', '/', '='], ['-', '_', ''], $b64);
}

function b64url_decode(string $b64url): ?string
{
    if ($b64url === '') return null;
    if (!preg_match('/^[A-Za-z0-9\-_]+$/', $b64url)) return null;
    $b64 = str_replace(['-', '_'], ['+', '/'], $b64url);
    $pad = strlen($b64) % 4;
    if ($pad !== 0) {
        $b64 .= str_repeat('=', 4 - $pad);
    }
    $raw = base64_decode($b64, true);
    return is_string($raw) ? $raw : null;
}

function auth_cookie_params(): array
{
    return [
        'expires' => 0,
        'path' => '/',
        'domain' => '',
        'secure' => auth_is_https(),
        'httponly' => true,
        'samesite' => 'Lax',
    ];
}

function auth_set_cookie(string $name, string $value, int $expires): void
{
    $p = auth_cookie_params();
    $p['expires'] = $expires;
    setcookie($name, $value, $p);
}

function auth_clear_cookie(string $name): void
{
    $p = auth_cookie_params();
    setcookie($name, '', time() - 42000, $p['path'], $p['domain'], $p['secure'], $p['httponly']);
}

function auth_password_ok(string $pass): bool
{
    // Policy: >= 10 chars, contains at least one letter and one number.
    if (strlen($pass) < 10) return false;
    if (strlen($pass) > 200) return false;
    if (!preg_match('/[A-Za-z]/', $pass)) return false;
    if (!preg_match('/\d/', $pass)) return false;
    return true;
}

// -------- Rate limiting (login) --------

function auth_login_rate_limited(string $ip, string $email): bool
{
    try {
        $pdo = db();
        // Block if too many failed attempts in last 15 minutes.
        $st1 = $pdo->prepare(
            'SELECT COUNT(*) FROM auth_login_attempts '
            . 'WHERE ip = ? AND success = 0 AND created_at > (NOW() - INTERVAL 15 MINUTE)'
        );
        $st1->execute([$ip]);
        $ipFails = (int)$st1->fetchColumn();

        $st2 = $pdo->prepare(
            'SELECT COUNT(*) FROM auth_login_attempts '
            . 'WHERE email = ? AND success = 0 AND created_at > (NOW() - INTERVAL 15 MINUTE)'
        );
        $st2->execute([$email]);
        $emailFails = (int)$st2->fetchColumn();

        return ($ipFails >= 10) || ($emailFails >= 10);
    } catch (Throwable) {
        // If DB is down, don't lock everyone out.
        return false;
    }
}

function auth_record_login_attempt(string $ip, string $email, bool $success): void
{
    try {
        $st = db()->prepare('INSERT INTO auth_login_attempts (ip, email, success) VALUES (?, ?, ?)');
        $st->execute([$ip, $email, $success ? 1 : 0]);
    } catch (Throwable) {
        // best-effort
    }
}

// -------- Remember-me sessions --------

const AUTH_REMEMBER_COOKIE = 'lifenest_remember';

function auth_fetch_user_status_and_version(int $userId): ?array
{
    $st = db()->prepare('SELECT id, status, session_version FROM users WHERE id = ? LIMIT 1');
    $st->execute([$userId]);
    $row = $st->fetch();
    if (!$row) return null;
    return [
        'id' => (int)$row['id'],
        'status' => (string)$row['status'],
        'session_version' => (int)$row['session_version'],
    ];
}

function auth_issue_remember_cookie(int $userId): void
{
    $info = auth_fetch_user_status_and_version($userId);
    if (!$info || ($info['status'] ?? '') !== 'active') {
        return;
    }

    $selector = bin2hex(random_bytes(12)); // 24 chars
    $validatorRaw = random_bytes(32);
    $validatorHash = hash('sha256', $validatorRaw);
    $expiresAt = time() + auth_remember_ttl_seconds();

    $ip = auth_client_ip();
    $ua = isset($_SERVER['HTTP_USER_AGENT']) ? (string)$_SERVER['HTTP_USER_AGENT'] : '';
    if (strlen($ua) > 255) $ua = substr($ua, 0, 255);

    $ins = db()->prepare(
        'INSERT INTO user_sessions (user_id, selector, validator_hash, expires_at, ip, user_agent, session_version) '
        . 'VALUES (?, ?, ?, FROM_UNIXTIME(?), ?, ?, ?)' 
    );
    $ins->execute([$userId, $selector, $validatorHash, $expiresAt, $ip, $ua, (int)$info['session_version']]);

    $cookieVal = $selector . '.' . b64url_encode($validatorRaw);
    auth_set_cookie(AUTH_REMEMBER_COOKIE, $cookieVal, $expiresAt);
}

function auth_delete_remember_selector(string $selector): void
{
    if ($selector === '' || !preg_match('/^[a-f0-9]{24}$/', $selector)) return;
    try {
        $st = db()->prepare('DELETE FROM user_sessions WHERE selector = ?');
        $st->execute([$selector]);
    } catch (Throwable) {
        // best-effort
    }
}

function auth_consume_remember_cookie(): ?int
{
    $raw = $_COOKIE[AUTH_REMEMBER_COOKIE] ?? null;
    if (!is_string($raw) || $raw === '') return null;

    $parts = explode('.', $raw, 2);
    if (count($parts) !== 2) return null;
    [$selector, $validatorB64] = $parts;

    if (!preg_match('/^[a-f0-9]{24}$/', $selector)) return null;
    $validatorRaw = b64url_decode($validatorB64);
    if (!is_string($validatorRaw) || $validatorRaw === '') return null;

    $pdo = db();
    $pdo->beginTransaction();
    try {
        $st = $pdo->prepare(
            'SELECT s.user_id, s.validator_hash, s.session_version, u.status, u.session_version AS u_sv '
            . 'FROM user_sessions s '
            . 'JOIN users u ON u.id = s.user_id '
            . 'WHERE s.selector = ? AND s.expires_at > NOW() '
            . 'LIMIT 1 FOR UPDATE'
        );
        $st->execute([$selector]);
        $row = $st->fetch();
        if (!$row) {
            $pdo->commit();
            return null;
        }

        $uid = (int)$row['user_id'];
        $status = (string)$row['status'];
        $sv = (int)$row['session_version'];
        $uSv = (int)$row['u_sv'];
        if ($status !== 'active' || $sv !== $uSv) {
            $pdo->prepare('DELETE FROM user_sessions WHERE selector = ?')->execute([$selector]);
            $pdo->commit();
            return null;
        }

        $expected = (string)$row['validator_hash'];
        $actual = hash('sha256', $validatorRaw);
        if (!hash_equals($expected, $actual)) {
            $pdo->prepare('DELETE FROM user_sessions WHERE selector = ?')->execute([$selector]);
            $pdo->commit();
            return null;
        }

        // Rotate token: delete old + create a new one.
        $pdo->prepare('DELETE FROM user_sessions WHERE selector = ?')->execute([$selector]);

        $newSelector = bin2hex(random_bytes(12));
        $newValidatorRaw = random_bytes(32);
        $newValidatorHash = hash('sha256', $newValidatorRaw);
        $expiresAt = time() + auth_remember_ttl_seconds();

        $ip = auth_client_ip();
        $ua = isset($_SERVER['HTTP_USER_AGENT']) ? (string)$_SERVER['HTTP_USER_AGENT'] : '';
        if (strlen($ua) > 255) $ua = substr($ua, 0, 255);

        $ins = $pdo->prepare(
            'INSERT INTO user_sessions (user_id, selector, validator_hash, expires_at, ip, user_agent, session_version) '
            . 'VALUES (?, ?, ?, FROM_UNIXTIME(?), ?, ?, ?)' 
        );
        $ins->execute([$uid, $newSelector, $newValidatorHash, $expiresAt, $ip, $ua, $uSv]);
        $pdo->prepare('UPDATE user_sessions SET last_used_at = NOW() WHERE selector = ?')->execute([$newSelector]);

        $pdo->commit();

        auth_set_cookie(AUTH_REMEMBER_COOKIE, $newSelector . '.' . b64url_encode($newValidatorRaw), $expiresAt);
        return $uid;
    } catch (Throwable) {
        try { $pdo->rollBack(); } catch (Throwable) {}
        return null;
    }
}

function auth_invalidate_all_remember_tokens(int $userId): void
{
    try {
        $st = db()->prepare('DELETE FROM user_sessions WHERE user_id = ?');
        $st->execute([$userId]);
    } catch (Throwable) {
        // best-effort
    }
}

// -------- Public API --------

function current_user_id(): ?int
{
    $id = $_SESSION['user_id'] ?? null;
    return is_int($id) ? $id : null;
}

function require_login(): int
{
    $uid = current_user_id();
    if ($uid === null) {
        json_error('Unauthorized', 401);
    }
    return $uid;
}

function password_algo(): string|int
{
    return defined('PASSWORD_ARGON2ID') ? PASSWORD_ARGON2ID : PASSWORD_DEFAULT;
}

function auth_login(int $userId, bool $remember = false): void
{
    session_regenerate_id(true);
    $_SESSION['user_id'] = $userId;
    $_SESSION['auth_at'] = time();

    if ($remember) {
        auth_issue_remember_cookie($userId);
    }
}

function auth_logout(): void
{
    // Clear remember-me session if present.
    $raw = $_COOKIE[AUTH_REMEMBER_COOKIE] ?? null;
    if (is_string($raw) && $raw !== '') {
        $parts = explode('.', $raw, 2);
        if (count($parts) === 2) {
            auth_delete_remember_selector((string)$parts[0]);
        }
    }
    auth_clear_cookie(AUTH_REMEMBER_COOKIE);

    $_SESSION = [];
    if (ini_get('session.use_cookies')) {
        $params = session_get_cookie_params();
        setcookie(session_name(), '', time() - 42000, $params['path'], $params['domain'], $params['secure'], $params['httponly']);
    }
    session_destroy();
}

function auth_logout_all(int $userId): void
{
    auth_invalidate_all_remember_tokens($userId);
    auth_logout();
}

function auth_bump_session_version(int $userId): void
{
    // Use this after sensitive changes (password, etc.) to invalidate old remember-me tokens.
    try {
        db()->prepare('UPDATE users SET session_version = session_version + 1 WHERE id = ?')->execute([$userId]);
    } catch (Throwable) {
        // best-effort
    }
    auth_invalidate_all_remember_tokens($userId);
    auth_clear_cookie(AUTH_REMEMBER_COOKIE);
}

function auth_bootstrap(): void
{
    $ttl = auth_session_ttl_seconds();
    $now = time();

    $uid = current_user_id();
    if ($uid !== null) {
        $authAt = $_SESSION['auth_at'] ?? null;
        if (!is_int($authAt)) {
            $_SESSION['auth_at'] = $now;
            return;
        }
        if (($now - $authAt) > $ttl) {
            auth_logout();
            return;
        }
        // Sliding refresh every ~10 minutes.
        if (($now - $authAt) > 600) {
            $_SESSION['auth_at'] = $now;
        }
        return;
    }

    if (isset($_COOKIE[AUTH_REMEMBER_COOKIE])) {
        $uid2 = null;
        try {
            $uid2 = auth_consume_remember_cookie();
        } catch (Throwable) {
            $uid2 = null;
        }
        if (is_int($uid2) && $uid2 > 0) {
            session_regenerate_id(true);
            $_SESSION['user_id'] = $uid2;
            $_SESSION['auth_at'] = $now;
        }
    }
}

function user_table_has_column(string $column, bool $refresh = false): bool
{
    if (!isset($GLOBALS['__lifenest_users_column_cache']) || !is_array($GLOBALS['__lifenest_users_column_cache'])) {
        $GLOBALS['__lifenest_users_column_cache'] = [];
    }

    if (!$refresh && array_key_exists($column, $GLOBALS['__lifenest_users_column_cache'])) {
        return (bool)$GLOBALS['__lifenest_users_column_cache'][$column];
    }

    try {
        $st = db()->prepare(
            'SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?'
        );
        $st->execute(['users', $column]);
        $exists = ((int)$st->fetchColumn()) > 0;
    } catch (Throwable) {
        $exists = false;
    }

    $GLOBALS['__lifenest_users_column_cache'][$column] = $exists;
    return $exists;
}

function user_profile_columns_available(bool $refresh = false): bool
{
    return user_table_has_column('full_name', $refresh) && user_table_has_column('avatar_path', $refresh);
}

function user_avatar_relpath(?string $path): ?string
{
    $value = trim((string)$path);
    if ($value === '') {
        return null;
    }
    if (!preg_match('#^/uploads/avatars/[A-Za-z0-9._-]+$#', $value)) {
        return null;
    }
    return $value;
}

function user_display_name_from_row(array $row): string
{
    $name = trim((string)($row['full_name'] ?? ''));
    if ($name !== '') {
        return $name;
    }
    $email = trim((string)($row['email'] ?? ''));
    if ($email !== '') {
        return $email;
    }
    return 'User';
}

function user_initials_from_display_name(string $display): string
{
    $clean = trim(preg_replace('/\s+/u', ' ', $display) ?? '');
    if ($clean === '') {
        return 'U';
    }

    $parts = preg_split('/[\s@._-]+/u', $clean, -1, PREG_SPLIT_NO_EMPTY) ?: [];
    $letters = '';
    foreach ($parts as $part) {
        if (preg_match('/^./u', $part, $m)) {
            $letters .= $m[0];
        }
        if (strlen($letters) >= 4) {
            break;
        }
    }

    if ($letters === '' && preg_match_all('/./u', $clean, $chars)) {
        $letters = implode('', array_slice($chars[0], 0, 2));
    }

    if ($letters === '') {
        return 'U';
    }

    if (function_exists('mb_strtoupper')) {
        return mb_strtoupper($letters, 'UTF-8');
    }
    return strtoupper($letters);
}

function fetch_user_public(int $userId): ?array
{
    $sql = user_profile_columns_available()
        ? 'SELECT id, email, full_name, avatar_path, status, role, created_at, last_login_at FROM users WHERE id = ?'
        : 'SELECT id, email, status, role, created_at, last_login_at FROM users WHERE id = ?';

    $st = db()->prepare($sql);
    $st->execute([$userId]);
    $row = $st->fetch();
    if (!$row) {
        return null;
    }
    $display = user_display_name_from_row($row);
    return [
        'id' => (int)$row['id'],
        'email' => (string)$row['email'],
        'full_name' => trim((string)($row['full_name'] ?? '')),
        'display_name' => $display,
        'initials' => user_initials_from_display_name($display),
        'avatar_url' => user_avatar_relpath(isset($row['avatar_path']) ? (string)$row['avatar_path'] : null),
        'status' => (string)($row['status'] ?? 'active'),
        'role' => (string)($row['role'] ?? 'user'),
        'created_at' => (string)$row['created_at'],
        'last_login_at' => isset($row['last_login_at']) ? (string)$row['last_login_at'] : null,
    ];
}
