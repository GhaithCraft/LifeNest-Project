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

function log_register(string $msg): void
{
    $path = __DIR__ . '/cache/register_error.log';
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
$first = isset($_GET['first']) && (string)$_GET['first'] === '1';
$registrationBlocked = (!$first && !site_registration_open());
$err = $registrationBlocked ? 'Registration is currently disabled from the admin panel.' : '';

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'GET') {
    $_SESSION['reg_issued_at'] = time();
}

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'POST' && !$registrationBlocked) {
    $csrf = $_POST['csrf_token'] ?? null;
    if (!csrf_verify(is_string($csrf) ? $csrf : null)) {
        $err = 'Security verification failed. Refresh the page and try again.';
    } else {
        $hp = isset($_POST['website']) && is_string($_POST['website']) ? trim($_POST['website']) : '';
        $issuedAt = $_SESSION['reg_issued_at'] ?? null;
        $minOk = is_int($issuedAt) ? (time() - $issuedAt >= 2) : true;
        if ($hp !== '' || !$minOk) {
            $err = 'Could not complete the request. Refresh the page and try again.';
        } else {
            $email = v_email($_POST['email'] ?? null);
            $p1 = v_string($_POST['password'] ?? null, 1, 200);
            $p2 = v_string($_POST['confirm_password'] ?? null, 1, 200);
            $remember = isset($_POST['remember']) && (string)$_POST['remember'] === '1';

            if ($email === null || $p1 === null || $p2 === null) {
                $err = 'Check your email and password.';
            } elseif (!hash_equals($p1, $p2)) {
                $err = 'The password confirmation does not match.';
            } elseif (!auth_password_ok($p1)) {
                $err = 'Password is too weak. Use at least 10 characters including letters and numbers.';
            } else {
                try {
                    $pdo = db();
                    $st = $pdo->prepare('SELECT id FROM users WHERE email = ? LIMIT 1');
                    $st->execute([$email]);
                    if ($st->fetch()) {
                        $err = 'This email address is already in use.';
                    } else {
                        $hash = password_hash($p1, password_algo());
                        if (!is_string($hash) || $hash === '') {
                            throw new RuntimeException('Password hashing failed');
                        }

                        $usersCount = (int)$pdo->query('SELECT COUNT(*) FROM users')->fetchColumn();
                        $role = ($usersCount === 0) ? 'admin' : 'user';
                        $ins = $pdo->prepare("INSERT INTO users (email, password_hash, status, role, session_version, created_at) VALUES (?, ?, 'active', ?, 0, NOW())");
                        $ins->execute([$email, $hash, $role]);
                        $userId = (int)$pdo->lastInsertId();

                        auth_login($userId, $remember);
                        header('Location: /index.php', true, 302);
                        exit;
                    }
                } catch (PDOException $e) {
                    if ((int)($e->errorInfo[1] ?? 0) === 1062) {
                        $err = 'This email address is already in use.';
                    } else {
                        log_register('PDO: ' . preg_replace('/\s+/', ' ', $e->getMessage()));
                        $err = 'Something went wrong. Please try again.';
                    }
                } catch (Throwable $e) {
                    log_register('Error: ' . preg_replace('/\s+/', ' ', $e->getMessage()));
                    $err = 'Something went wrong. Please try again.';
                }
            }
        }
    }
}

$prefillEmail = is_string($_POST['email'] ?? null) ? (string)$_POST['email'] : '';
$token = csrf_token();
?><!doctype html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title><?= h($brand) ?> — Create Account</title>
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
            <div class="brand-sub"><?= h($tagline !== '' ? $tagline : 'Create Account') ?></div>
          </div>
        </div>

        <h2 class="hero-title"><?php echo $first ? 'Create the first account' : 'Create a new account'; ?></h2>
        <p class="hero-desc">A new account will be created and stored independently from other users.</p>

        <div class="pill-row" aria-hidden="true">
          <div class="pill">Secure Sessions</div>
          <div class="pill">CSRF</div>
          <div class="pill">Rate Limit</div>
          <div class="pill">Remember Me</div>
        </div>
      </div>

      <div class="mini">Already have an account? <a class="link" href="/login.php">Sign in</a></div>
    </section>

    <section class="auth-card" aria-label="Register">
      <h1>Create account</h1>
      <p>Password must be at least 10 characters and include letters and numbers.</p>

      <?php if ($err !== ''): ?>
        <div class="alert" role="alert"><?php echo h($err); ?></div>
      <?php endif; ?>

      <?php if (!$registrationBlocked): ?>
      <form method="post" action="/register.php<?php echo $first ? '?first=1' : ''; ?>" autocomplete="on">
        <input type="hidden" name="csrf_token" value="<?php echo h($token); ?>" />
        <input type="text" name="website" value="" class="hp" autocomplete="off" tabindex="-1" aria-hidden="true" />

        <div class="form-row">
          <label for="email">Email address</label>
          <input id="email" name="email" type="email" value="<?php echo h($prefillEmail); ?>" required />
        </div>

        <div class="two-col">
          <div class="form-row">
            <label for="password">Password</label>
            <input id="password" name="password" type="password" minlength="10" required />
          </div>
          <div class="form-row">
            <label for="confirm_password">Confirm password</label>
            <input id="confirm_password" name="confirm_password" type="password" minlength="10" required />
          </div>
        </div>

        <label class="chk">
          <input type="checkbox" name="remember" value="1" />
          <span>Remember me</span>
        </label>

        <button class="btn" type="submit">Create account</button>
      </form>

      <div class="help">Clicking “Create account” will sign you in immediately.</div>
      <?php endif; ?>
    </section>
  </main>

</body>
</html>
