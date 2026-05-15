<?php
declare(strict_types=1);

/**
 * Asset helper for cache-busting.
 *
 * Usage:
 *   require_once __DIR__ . '/assets.php';
 *   <link rel="stylesheet" href="<?= h(asset_url('/assets/css/app.css')) ?>" />
 *
 * Notes:
 * - Returns the input path with ?v=<filemtime> appended when file exists.
 * - Falls back to the plain path if file is missing or unreadable.
 */

function asset_url(string $webPath): string
{
    $webPath = trim($webPath);
    if ($webPath === '') {
        return $webPath;
    }

    if ($webPath[0] !== '/') {
        $webPath = '/' . $webPath;
    }

    $docRoot = $_SERVER['DOCUMENT_ROOT'] ?? dirname(__DIR__);
    $docRoot = rtrim((string)$docRoot, '/\\');

    $fsPath = $docRoot . str_replace('/', DIRECTORY_SEPARATOR, $webPath);

    $v = null;
    if (is_file($fsPath)) {
        $mt = @filemtime($fsPath);
        if (is_int($mt) && $mt > 0) {
            $v = (string)$mt;
        }
    }

    if ($v === null) {
        return $webPath;
    }

    // Preserve any existing query string.
    return (strpos($webPath, '?') === false)
        ? ($webPath . '?v=' . rawurlencode($v))
        : ($webPath . '&v=' . rawurlencode($v));
}
