<?php
declare(strict_types=1);

require_once __DIR__ . '/includes/security_headers.php';
require_once __DIR__ . '/includes/session.php';
require_once __DIR__ . '/includes/csrf.php';
require_once __DIR__ . '/includes/db.php';
require_once __DIR__ . '/includes/auth.php';
require_once __DIR__ . '/includes/validate.php';
require_once __DIR__ . '/includes/assets.php';
require_once __DIR__ . '/includes/site_settings.php';

function h(string $s): string { return htmlspecialchars($s, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8'); }

function log_auth(string $msg): void
{
    $path = __DIR__ . '/cache/auth_error.log';
    $line = '[' . gmdate('c') . '] ' . $msg . "\n";
    @file_put_contents($path, $line, FILE_APPEND);
}

auth_bootstrap();

if (current_user_id() !== null) {
    header('Location: /index.php', true, 302);
    exit;
}

$brand = site_brand_name();
$tagline = site_tagline();
$err = '';
$noUsers = false;
$registrationOpen = site_registration_open();

try {
    $cnt = (int)db()->query('SELECT COUNT(*) FROM users')->fetchColumn();
    $noUsers = ($cnt === 0);
    if ($noUsers && ($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'GET') {
        header('Location: /register.php?first=1', true, 302);
        exit;
    }
} catch (Throwable $e) {
    log_auth('DB check error: ' . preg_replace('/\s+/', ' ', $e->getMessage()));
    $err = 'The database is not ready yet. Open /install.php first, then come back here.';
}

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'GET') {
    $_SESSION['login_issued_at'] = time();
}

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'POST' && $err === '') {
    $csrf = $_POST['csrf_token'] ?? null;
    if (!csrf_verify(is_string($csrf) ? $csrf : null)) {
        $err = 'Security verification failed. Refresh the page and try again.';
    } else {
        $hp = isset($_POST['website']) && is_string($_POST['website']) ? trim($_POST['website']) : '';
        $issuedAt = $_SESSION['login_issued_at'] ?? null;
        $minOk = is_int($issuedAt) ? (time() - $issuedAt >= 2) : true;
        if ($hp !== '' || !$minOk) {
            $err = 'Could not complete the request. Refresh the page and try again.';
        } else {
            $email = v_email($_POST['email'] ?? null);
            $pass  = v_string($_POST['password'] ?? null, 1, 200);
            $remember = isset($_POST['remember']) && (string)$_POST['remember'] === '1';

            if ($email === null || $pass === null) {
                $err = 'Check your email and password.';
            } else {
                $ip = auth_client_ip();
                if (auth_login_rate_limited($ip, $email)) {
                    $err = 'Too many attempts. Wait 15 minutes and try again.';
                } else {
                    try {
                        $st = db()->prepare('SELECT id, password_hash, status FROM users WHERE email = ? LIMIT 1');
                        $st->execute([$email]);
                        $row = $st->fetch();

                        $ok = false;
                        if ($row && isset($row['password_hash']) && is_string($row['password_hash']) && (string)($row['status'] ?? 'active') === 'active') {
                            $ok = password_verify($pass, (string)$row['password_hash']);
                        }

                        auth_record_login_attempt($ip, $email, $ok);

                        if (!$ok) {
                            $err = 'Incorrect login credentials.';
                        } else {
                            $userId = (int)$row['id'];
                            try {
                                db()->prepare('UPDATE users SET last_login_at = NOW() WHERE id = ?')->execute([$userId]);
                            } catch (Throwable) {
                            }

                            auth_login($userId, $remember);
                            header('Location: /index.php', true, 302);
                            exit;
                        }
                    } catch (Throwable $e) {
                        log_auth('Login error: ' . preg_replace('/\s+/', ' ', $e->getMessage()));
                        $err = 'Something went wrong. Please try again.';
                    }
                }
            }
        }
    }
}

$prefillEmail = is_string($_POST['email'] ?? null) ? (string)$_POST['email'] : '';
$token = csrf_token();
$showRegister = $noUsers || $registrationOpen;
?><!doctype html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title><?= h($brand) ?> — Sign In</title>
  <link rel="icon" href="<?= h(site_favicon_url()) ?>" />
  <script src="<?= h(asset_url('/assets/js/core/theme.js')) ?>"></script>
  <link rel="stylesheet" href="/theme.php" />
  <link rel="stylesheet" href="<?= h(asset_url('/assets/css/pages/auth.css')) ?>" />
</head>
<body class="ln-auth">

  <main class="auth-shell">
    <section class="auth-hero">
      <div>
        <div class="brand">
          <div class="brand-badge" aria-hidden="true"></div>
          <div>
            <div class="brand-title"><?= h($brand) ?></div>
            <div class="brand-sub"><?= h($tagline !== '' ? $tagline : 'Personal Organizer') ?></div>
          </div>
        </div>

        <h2 class="hero-title">Sign in</h2>
        <p class="hero-desc">Sign in to access your workspace. You can enable “Remember me” to stay signed in.</p>

        <div class="pill-row" aria-hidden="true">
          <div class="pill">Tasks</div>
          <div class="pill">Study</div>
          <div class="pill">Budget</div>
          <div class="pill">Reports</div>
        </div>
      </div>

      <div class="mini">
        <?php if ($showRegister): ?>
          Don't have an account? <a class="link" href="/register.php">Register now</a>
        <?php else: ?>
          Public registration is currently disabled from the admin panel.
        <?php endif; ?>
      </div>
    </section>

    <section class="auth-card" aria-label="Login">
      <h1>Sign in</h1>
      <p>Enter your email and password.</p>

      <?php if ($err !== ''): ?>
        <div class="alert" role="alert"><?php echo h($err); ?></div>
      <?php endif; ?>

      <form method="post" action="/login.php" autocomplete="on">
        <input type="hidden" name="csrf_token" value="<?php echo h($token); ?>" />
        <input type="text" name="website" value="" class="hp" autocomplete="off" tabindex="-1" aria-hidden="true" />

        <div class="form-row">
          <label for="email">Email address</label>
          <input id="email" name="email" type="email" value="<?php echo h($prefillEmail); ?>" required />
        </div>

        <div class="form-row">
          <label for="password">Password</label>
          <input id="password" name="password" type="password" value="" required />
        </div>

        <label class="chk">
          <input type="checkbox" name="remember" value="1" />
          <span>Remember me</span>
        </label>

        <button class="btn" type="submit">Sign in</button>
      </form>

      <div class="help">
        <?php if ($showRegister): ?>
          New here? <a class="link" href="/register.php">Create an account</a> —
        <?php endif; ?>
        <a class="link" href="/account.php">Account settings</a> after signing in.
      </div>
    </section>
  </main>

</body>
</html>
