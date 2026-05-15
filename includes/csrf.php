<?php
declare(strict_types=1);

function csrf_token(): string
{
    if (session_status() !== PHP_SESSION_ACTIVE) {
        throw new RuntimeException('Session not started');
    }

    if (empty($_SESSION['csrf_token']) || !is_string($_SESSION['csrf_token'])) {
        $_SESSION['csrf_token'] = bin2hex(random_bytes(32));
    }

    return $_SESSION['csrf_token'];
}

function csrf_verify(?string $token): bool
{
    if (session_status() !== PHP_SESSION_ACTIVE) {
        return false;
    }
    if (!is_string($token) || $token === '') {
        return false;
    }
    $expected = $_SESSION['csrf_token'] ?? '';
    if (!is_string($expected) || $expected === '') {
        return false;
    }
    return hash_equals($expected, $token);
}

function csrf_require_or_fail(): void
{
    $token = null;

    // Prefer header (AJAX), fallback to body/query.
    $hdr = $_SERVER['HTTP_X_CSRF_TOKEN'] ?? null;
    if (is_string($hdr) && $hdr !== '') {
        $token = $hdr;
    } elseif (isset($_POST['csrf_token'])) {
        $token = is_string($_POST['csrf_token']) ? $_POST['csrf_token'] : null;
    } elseif (isset($_GET['csrf_token'])) {
        $token = is_string($_GET['csrf_token']) ? $_GET['csrf_token'] : null;
    }

    if (!csrf_verify($token)) {
        http_response_code(403);
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode(['ok' => false, 'error' => 'CSRF validation failed'], JSON_UNESCAPED_SLASHES);
        exit;
    }
}
