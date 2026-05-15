<?php
declare(strict_types=1);

require_once __DIR__ . '/includes/security_headers.php';
require_once __DIR__ . '/includes/session.php';
require_once __DIR__ . '/includes/csrf.php';
require_once __DIR__ . '/includes/assets.php';
require_once __DIR__ . '/includes/migrations.php';
require_once __DIR__ . '/includes/crypto.php';

function h(string $s): string
{
    return htmlspecialchars($s, ENT_QUOTES, 'UTF-8');
}

function install_lock_path(): string
{
    $candidates = [
        __DIR__ . '/cache',
        __DIR__ . '/includes',
        __DIR__,
    ];

    foreach ($candidates as $dir) {
        if (!is_dir($dir)) {
            @mkdir($dir, 0755, true);
        }
        if (is_dir($dir) && is_writable($dir)) {
            return rtrim($dir, '/') . '/.lifenest_installed.lock';
        }
    }

    // Fallback (not ideal but prevents fatal).
    return sys_get_temp_dir() . '/.lifenest_installed.lock';
}

function install_is_locked(): bool
{
    return is_file(install_lock_path());
}

function install_set_locked(): void
{
    @file_put_contents(install_lock_path(), 'installed ' . gmdate('c'));
}

function config_local_path(): string
{
    return __DIR__ . '/includes/config.local.php';
}

function write_local_config(array $cfg): bool
{
    $path = config_local_path();
    $php = "<?php\n";
    $php .= "declare(strict_types=1);\n\n";
    $php .= "return " . var_export($cfg, true) . ";\n";
    return @file_put_contents($path, $php, LOCK_EX) !== false;
}

function pdo_connect(string $host, string $port, string $db, string $user, string $pass, string $charset = 'utf8mb4'): PDO
{
    if (!extension_loaded('pdo_mysql')) {
        throw new RuntimeException('The PHP pdo_mysql extension is not enabled on the server.');
    }

    $opts = [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES => false,
    ];

    $hostNorm = strtolower(trim($host));
    $attempts = [];

    // 1) TCP with port
    $attempts[] = ["mysql:host={$host};port={$port};dbname={$db};charset={$charset}", 'tcp'];
    // 2) Let the driver decide (useful for localhost socket setups)
    $attempts[] = ["mysql:host={$host};dbname={$db};charset={$charset}", 'auto'];

    // 3) Common unix sockets when host is localhost (shared hosting often prefers sockets)
    if ($hostNorm === 'localhost') {
        foreach ([
            '/var/run/mysqld/mysqld.sock',
            '/var/lib/mysql/mysql.sock',
            '/tmp/mysql.sock',
        ] as $sock) {
            $attempts[] = ["mysql:unix_socket={$sock};dbname={$db};charset={$charset}", "socket:{$sock}"]; 
        }
        // 4) Also try 127.0.0.1 explicitly
        $attempts[] = ["mysql:host=127.0.0.1;port={$port};dbname={$db};charset={$charset}", '127.0.0.1'];
    }

    $errs = [];
    $last = null;
    foreach ($attempts as [$dsn, $label]) {
        try {
            return new PDO($dsn, $user, $pass, $opts);
        } catch (Throwable $e) {
            $last = $e;
            $msg = $e->getMessage();
            // Keep it single-line in logs.
            $msg = preg_replace('/\s+/', ' ', $msg);
            $errs[] = $label . ': ' . $msg;
        }
    }

    throw new RuntimeException("DB connection failed: " . implode(' | ', $errs), 0, $last);
}

function classify_db_error(string $msg): array
{
    $m = strtolower($msg);
    if (str_contains($m, 'access denied')) {
        return ['auth', 'Invalid database credentials or the user is not linked to the database.'];
    }
    if (str_contains($m, 'unknown mysql server host') || str_contains($m, 'php_network_getaddresses')) {
        return ['host', 'The DB Host value is invalid or cannot be resolved.'];
    }
    if (str_contains($m, 'connection refused') || str_contains($m, "can't connect") || str_contains($m, 'timed out')) {
        return ['conn', 'Could not connect to the server (Host/Port). Try localhost, then 127.0.0.1.'];
    }
    if (str_contains($m, 'could not find driver') || str_contains($m, 'pdo_mysql')) {
        return ['driver', 'The MySQL PHP driver is not enabled (pdo_mysql).'];
    }
    return ['unknown', 'Unknown reason — check the log file in cache/install_error.log.'];
}

function run_migration(PDO $pdo, string $sqlPath): void
{
    $sql = @file_get_contents($sqlPath);
    if (!is_string($sql) || trim($sql) === '') {
        throw new RuntimeException('Migration file missing or empty');
    }

    // Remove line comments starting with --
    $lines = preg_split('/\R/', $sql) ?: [];
    $buf = [];
    foreach ($lines as $ln) {
        $t = ltrim($ln);
        if (str_starts_with($t, '--')) {
            continue;
        }
        $buf[] = $ln;
    }
    $sql = implode("\n", $buf);

    // Split on semicolons (OK for our simple schema file).
    $stmts = array_filter(array_map('trim', explode(';', $sql)), fn($s) => $s !== '');

    // NOTE: MySQL DDL statements (CREATE/ALTER/DROP) implicitly commit.
    // Wrapping migrations in a transaction can cause "There is no active transaction".
    foreach ($stmts as $stmt) {
        $pdo->exec($stmt);
    }
}

$locked = install_is_locked();

// Defaults based on Hostinger screenshot (safe to prefill).
$defaults = [
    'db_host' => 'localhost',
    'db_port' => '3306',
    'db_name' => 'u121487499_life',
    'db_user' => 'u121487499_life',
    'db_pass' => '',
];

$errors = [];
$success = false;

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $token = isset($_POST['csrf_token']) && is_string($_POST['csrf_token']) ? $_POST['csrf_token'] : null;
    if (!csrf_verify($token)) {
        $errors[] = 'Invalid CSRF token. Refresh the page and try again.';
    } elseif ($locked) {
        $errors[] = 'The system has already been set up. Delete install.php when you are done.';
    } else {
        $host = isset($_POST['db_host']) && is_string($_POST['db_host']) ? trim($_POST['db_host']) : '';
        $port = isset($_POST['db_port']) && is_string($_POST['db_port']) ? trim($_POST['db_port']) : '3306';
        $name = isset($_POST['db_name']) && is_string($_POST['db_name']) ? trim($_POST['db_name']) : '';
        $user = isset($_POST['db_user']) && is_string($_POST['db_user']) ? trim($_POST['db_user']) : '';
        $pass = isset($_POST['db_pass']) && is_string($_POST['db_pass']) ? (string)$_POST['db_pass'] : '';

        $defaults = [
            'db_host' => $host,
            'db_port' => $port,
            'db_name' => $name,
            'db_user' => $user,
            'db_pass' => '', // never echo it back
        ];

        if ($host === '' || $name === '' || $user === '' || $pass === '') {
            if ($host === '' || $name === '' || $user === '') {
                $errors[] = 'Make sure DB Host / DB Name / DB User are correct.';
            }
            if ($pass === '') {
                $errors[] = 'DB Password is empty (not sent). Enter the MySQL user password and try again.';
            }
        } else {
            try {
                $pdo = pdo_connect($host, $port, $name, $user, $pass);
                migrations_apply($pdo);
                // Ensure a stable encryption master key exists.
                crypto_master_key();

                $cfg = [
                    'db' => [
                        'driver' => 'mysql',
                        'host' => $host,
                        'port' => $port,
                        'name' => $name,
                        'user' => $user,
                        'pass' => $pass,
                        'charset' => 'utf8mb4',
                    ],
                    'app' => [
                        'env' => 'prod',
                    ],
                ];

                if (!write_local_config($cfg)) {
                    $errors[] = 'Could not create includes/config.local.php automatically. Make sure the includes directory is writable.';
                } else {
                    install_set_locked();
                    $success = true;
                }
            } catch (Throwable $e) {
                // Provide a helpful (non-sensitive) hint.
                [, $hint] = classify_db_error($e->getMessage());
                $errors[] = 'Failed to connect to the database or execute the schema.';
                $errors[] = $hint;
                $errors[] = 'Note: On Hostinger, DB Host is usually localhost (and sometimes 127.0.0.1). If that does not work, use the MySQL Hostname shown in hPanel → MySQL Databases.';

                // Best-effort log (if possible).
                $logDir = __DIR__ . '/cache';
                @mkdir($logDir, 0755, true);
                $raw = $e->getMessage();
                $raw = preg_replace('/\s+/', ' ', $raw);
                @file_put_contents($logDir . '/install_error.log', '[' . gmdate('c') . '] ' . $raw . ' | host=' . $host . ' port=' . $port . ' db=' . $name . ' user=' . $user . ' pass=' . (($pass !== '') ? 'YES' : 'NO') . "\n", FILE_APPEND);
            }
        }
    }
}

if ($locked && !$success) {
    http_response_code(403);
}

?><!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>LifeNest Setup</title>
  <link rel="stylesheet" href="<?= h(asset_url('/assets/css/app.css')) ?>" />
  <link rel="stylesheet" href="<?= h(asset_url('/assets/css/pages/install.css')) ?>" />
</head>
<body class="install-page">
  <main class="install-shell">
    <section class="install-card">
      <header class="install-head">
        <div class="install-logo" aria-hidden="true"></div>
        <div>
          <h1>LifeNest Setup</h1>
          <p class="install-sub">Prepare the database and create the tables automatically.</p>
        </div>
      </header>

      <?php if ($success): ?>
        <div class="install-alert install-alert--ok">
          <strong>Setup completed successfully.</strong>
          <div>You can open the homepage now. It is recommended to delete <code>install.php</code>.</div>
        </div>
        <div class="install-actions">
          <a class="install-btn install-btn--primary" href="index.php">Open app</a>
        </div>
      <?php else: ?>

        <?php if (!empty($errors)): ?>
          <div class="install-alert install-alert--err">
            <strong>Could not complete setup</strong>
            <ul>
              <?php foreach ($errors as $e): ?>
                <li><?= h($e) ?></li>
              <?php endforeach; ?>
            </ul>
          </div>
        <?php endif; ?>

        <?php if ($locked): ?>
          <div class="install-alert install-alert--warn">
            The system is already configured. Delete <code>install.php</code> to avoid unnecessary risk.
          </div>
        <?php else: ?>
          <form class="install-form" method="post" action="install.php" autocomplete="off" novalidate>
            <input type="hidden" name="csrf_token" value="<?= h(csrf_token()) ?>" />

            <div class="install-grid">
              <label class="install-field">
                <span>DB Host</span>
                <input name="db_host" type="text" value="<?= h($defaults['db_host']) ?>" required />
              </label>

              <label class="install-field">
                <span>DB Port</span>
                <input name="db_port" type="text" value="<?= h($defaults['db_port']) ?>" required />
              </label>

              <label class="install-field">
                <span>DB Name</span>
                <input name="db_name" type="text" value="<?= h($defaults['db_name']) ?>" required />
              </label>

              <label class="install-field">
                <span>DB User</span>
                <input name="db_user" type="text" value="<?= h($defaults['db_user']) ?>" required />
              </label>

              <label class="install-field install-field--full">
                <span>DB Password</span>
                <input name="db_pass" type="password" value="" placeholder="Enter password" required />
              </label>
            </div>

            <div class="install-actions">
              <button class="install-btn install-btn--primary" type="submit">Run setup</button>
              <a class="install-btn" href="index.php">Cancel</a>
            </div>

            <p class="install-footnote">Note: <code>includes/config.local.php</code> and a lock file inside <code>/cache</code> will be created.</p>
          </form>
        <?php endif; ?>

      <?php endif; ?>
    </section>
  </main>
</body>
</html>
