<?php
declare(strict_types=1);

/**
 * Config precedence:
 * 1) includes/config.local.php (created by /install.php)
 * 2) .env file at project root (key=value)
 * 3) process environment variables
 */

function lifenest_load_env_file(): void
{
    static $loaded = false;
    if ($loaded) {
        return;
    }
    $loaded = true;

    $envPath = dirname(__DIR__) . '/.env';
    if (!is_file($envPath) || !is_readable($envPath)) {
        return;
    }

    $lines = file($envPath, FILE_IGNORE_NEW_LINES);
    if (!is_array($lines)) {
        return;
    }

    foreach ($lines as $line) {
        $line = trim($line);
        if ($line === '' || str_starts_with($line, '#')) {
            continue;
        }
        $pos = strpos($line, '=');
        if ($pos === false) {
            continue;
        }
        $key = trim(substr($line, 0, $pos));
        $val = trim(substr($line, $pos + 1));
        if ($key === '') {
            continue;
        }

        // Strip optional surrounding quotes.
        if ((str_starts_with($val, '"') && str_ends_with($val, '"')) || (str_starts_with($val, "'") && str_ends_with($val, "'"))) {
            $val = substr($val, 1, -1);
        }

        // Do not overwrite existing env vars.
        if (getenv($key) === false) {
            putenv($key . '=' . $val);
            $_ENV[$key] = $val;
        }
    }
}

function lifenest_load_local_config(): ?array
{
    $localPath = __DIR__ . '/config.local.php';
    if (!is_file($localPath)) {
        return null;
    }

    $data = require $localPath;
    if (!is_array($data)) {
        return null;
    }

    return $data;
}

function app_config(): array
{
    static $cfg = null;
    if (is_array($cfg)) {
        return $cfg;
    }

    $local = lifenest_load_local_config();
    if (!is_array($local)) {
        lifenest_load_env_file();
    }

    $base = [
        'db' => [
            'driver' => getenv('LIFENEST_DB_DRIVER') ?: 'mysql',
            'host' => getenv('LIFENEST_DB_HOST') ?: '127.0.0.1',
            'port' => getenv('LIFENEST_DB_PORT') ?: '3306',
            'name' => getenv('LIFENEST_DB_NAME') ?: '',
            'user' => getenv('LIFENEST_DB_USER') ?: '',
            'pass' => getenv('LIFENEST_DB_PASS') ?: '',
            'charset' => getenv('LIFENEST_DB_CHARSET') ?: 'utf8mb4',
        ],
        'app' => [
            'env' => getenv('LIFENEST_ENV') ?: 'prod',
        ],
    ];

    if (is_array($local)) {
        // Shallow merge for known top-level keys.
        foreach (['db', 'app'] as $k) {
            if (isset($local[$k]) && is_array($local[$k])) {
                $base[$k] = array_merge($base[$k], $local[$k]);
            }
        }
    }

    $cfg = $base;
    return $cfg;
}
