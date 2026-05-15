<?php
declare(strict_types=1);

require_once __DIR__ . '/security_headers.php';
require_once __DIR__ . '/session.php';
require_once __DIR__ . '/csrf.php';
require_once __DIR__ . '/response.php';
require_once __DIR__ . '/auth.php';

// Promote remember-me cookie to session (if present), and enforce session TTL.
auth_bootstrap();

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
header('Pragma: no-cache');

// Global CSRF enforcement for any state-changing request.
// This prevents accidentally forgetting csrf_require_or_fail() in a new endpoint.
$__ln_method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
if (in_array($__ln_method, ['POST', 'PUT', 'PATCH', 'DELETE'], true)) {
    csrf_require_or_fail();
}

/**
 * Best-effort server-side logging to a local file.
 * We keep responses generic (production-safe) while providing an error_id
 * that can be matched in cache/api_error.log.
 */
function lifenest_log_exception(Throwable $e): string
{
    $id = bin2hex(random_bytes(6));
    $uri = isset($_SERVER['REQUEST_URI']) ? (string)$_SERVER['REQUEST_URI'] : '';
    $method = isset($_SERVER['REQUEST_METHOD']) ? (string)$_SERVER['REQUEST_METHOD'] : '';
    $ip = isset($_SERVER['REMOTE_ADDR']) ? (string)$_SERVER['REMOTE_ADDR'] : '';
    $uid = (isset($_SESSION['user_id']) && is_int($_SESSION['user_id'])) ? (string)$_SESSION['user_id'] : '-';

    $line = '[' . gmdate('c') . '] id=' . $id
        . ' uid=' . $uid
        . ' ip=' . $ip
        . ' ' . $method . ' ' . $uri
        . ' | ' . $e::class . ': ' . preg_replace('/\s+/', ' ', $e->getMessage())
        . "\n";

    // Write to cache if possible.
    $logDir = dirname(__DIR__) . '/cache';
    @mkdir($logDir, 0755, true);
    @file_put_contents($logDir . '/api_error.log', $line, FILE_APPEND);

    // Also send to PHP error log.
    error_log('[LifeNest][' . $id . '] ' . $e->getMessage() . "\n" . $e->getTraceAsString());
    return $id;
}

function json_body(): array
{
    static $cached = null;
    if (is_array($cached)) {
        return $cached;
    }
    $raw = file_get_contents('php://input');
    if (!is_string($raw) || trim($raw) === '') {
        $cached = [];
        return $cached;
    }
    $decoded = json_decode($raw, true);
    if (!is_array($decoded)) {
        json_error('Invalid JSON body', 400);
    }
    $cached = $decoded;
    return $cached;
}

set_exception_handler(static function (Throwable $e): void {
    $id = lifenest_log_exception($e);
    json_response(['ok' => false, 'error' => 'Server error', 'error_id' => $id], 500);
});
