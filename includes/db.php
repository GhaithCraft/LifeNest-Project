<?php
declare(strict_types=1);

require_once __DIR__ . '/config.php';
require_once __DIR__ . '/migrations.php';

function db(): PDO
{
    static $pdo = null;
    if ($pdo instanceof PDO) {
        return $pdo;
    }

    $cfg = app_config()['db'] ?? [];
    $driver = (string)($cfg['driver'] ?? 'mysql');

    if ($driver !== 'mysql') {
        throw new RuntimeException('Only mysql driver is supported in this scaffold');
    }

    $dbName = (string)($cfg['name'] ?? '');
    $dbUser = (string)($cfg['user'] ?? '');
    $dbPass = (string)($cfg['pass'] ?? '');

    if ($dbName === '' || $dbUser === '') {
        throw new RuntimeException('DB config missing. Run /install.php or create includes/config.local.php.');
    }

    if (!extension_loaded('pdo_mysql')) {
        throw new RuntimeException('The pdo_mysql extension is not enabled on the server.');
    }

    $host = (string)($cfg['host'] ?? '127.0.0.1');
    $port = (string)($cfg['port'] ?? '3306');
    $charset = (string)($cfg['charset'] ?? 'utf8mb4');

    $opts = [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES => false,
    ];

    $hostNorm = strtolower(trim($host));
    $attempts = [];
    $attempts[] = ["mysql:host={$host};port={$port};dbname={$dbName};charset={$charset}", 'tcp'];
    $attempts[] = ["mysql:host={$host};dbname={$dbName};charset={$charset}", 'auto'];

    if ($hostNorm === 'localhost') {
        foreach ([
            '/var/run/mysqld/mysqld.sock',
            '/var/lib/mysql/mysql.sock',
            '/tmp/mysql.sock',
        ] as $sock) {
            $attempts[] = ["mysql:unix_socket={$sock};dbname={$dbName};charset={$charset}", "socket:{$sock}"]; 
        }
        $attempts[] = ["mysql:host=127.0.0.1;port={$port};dbname={$dbName};charset={$charset}", '127.0.0.1'];
    }

    $last = null;
    $errs = [];
    foreach ($attempts as [$dsn, $label]) {
        try {
            $pdo = new PDO($dsn, $dbUser, $dbPass, $opts);
            // Apply DB migrations once per request.
            migrations_apply($pdo);
            return $pdo;
        } catch (Throwable $e) {
            $last = $e;
            $msg = preg_replace('/\s+/', ' ', $e->getMessage());
            $errs[] = $label . ': ' . $msg;
        }
    }

    throw new RuntimeException('DB connection failed. ' . implode(' | ', $errs), 0, $last);

    return $pdo;
}
