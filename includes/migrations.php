<?php
declare(strict_types=1);

/**
 * migrations.php — simple file-based SQL migrations (MySQL).
 *
 * - Keeps a schema_migrations table with applied filenames.
 * - Applies *.sql files in /migrations in lexical order.
 * - DDL auto-commits in MySQL; do not wrap in transactions.
 */

function migrations_apply(PDO $pdo): void
{
    static $done = false;
    if ($done) return;
    $done = true;

    $pdo->exec(
        "CREATE TABLE IF NOT EXISTS schema_migrations ("
        . "id VARCHAR(190) NOT NULL,"
        . "applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,"
        . "PRIMARY KEY (id)"
        . ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
    );

    $applied = [];
    $st = $pdo->query("SELECT id FROM schema_migrations");
    foreach ($st->fetchAll() as $r) {
        $applied[(string)$r['id']] = true;
    }

    $dir = dirname(__DIR__) . '/migrations';
    $files = glob($dir . '/*.sql');
    if (!$files) return;

    sort($files, SORT_STRING);

    foreach ($files as $path) {
        $id = basename($path);
        if (isset($applied[$id])) {
            continue;
        }

        $sql = (string)file_get_contents($path);
        // naive split by ';' (fits our migrations style)
        $parts = array_filter(array_map('trim', explode(';', $sql)), static fn($s) => $s !== '');
        foreach ($parts as $stmt) {
            $pdo->exec($stmt);
        }

        $ins = $pdo->prepare('INSERT INTO schema_migrations (id) VALUES (?)');
        $ins->execute([$id]);
    }
}
