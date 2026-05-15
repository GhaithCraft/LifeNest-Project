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
require_once __DIR__ . '/includes/admin.php';
require_once __DIR__ . '/includes/page_chrome.php';

function h(string $s): string { return htmlspecialchars($s, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8'); }

function log_account(string $msg): void
{
    $path = __DIR__ . '/cache/account_error.log';
    $line = '[' . gmdate('c') . '] ' . $msg . "\n";
    @file_put_contents($path, $line, FILE_APPEND);
}

function account_avatar_dir(): string
{
    return __DIR__ . '/uploads/avatars';
}

function account_delete_avatar_file(?string $publicPath): void
{
    $safe = user_avatar_relpath($publicPath);
    if ($safe === null) {
        return;
    }
    $absolute = __DIR__ . $safe;
    if (is_file($absolute)) {
        @unlink($absolute);
    }
}

function account_store_avatar(int $userId, array $file, ?string $oldPath): string
{
    $error = isset($file['error']) ? (int)$file['error'] : UPLOAD_ERR_NO_FILE;
    if ($error === UPLOAD_ERR_NO_FILE) {
        throw new RuntimeException('No avatar file uploaded.');
    }
    if ($error !== UPLOAD_ERR_OK) {
        throw new RuntimeException('Avatar upload failed with code ' . $error);
    }

    $tmp = isset($file['tmp_name']) && is_string($file['tmp_name']) ? $file['tmp_name'] : '';
    if ($tmp === '' || !is_uploaded_file($tmp)) {
        throw new RuntimeException('Invalid uploaded avatar file.');
    }

    $size = isset($file['size']) ? (int)$file['size'] : 0;
    if ($size <= 0 || $size > 2 * 1024 * 1024) {
        throw new RuntimeException('Avatar exceeds the allowed 2 MB limit.');
    }

    $finfo = new finfo(FILEINFO_MIME_TYPE);
    $mime = (string)$finfo->file($tmp);
    $allowed = [
        'image/png' => 'png',
        'image/jpeg' => 'jpg',
        'image/webp' => 'webp',
    ];
    if (!isset($allowed[$mime])) {
        throw new RuntimeException('Unsupported avatar image type: ' . $mime);
    }

    $dir = account_avatar_dir();
    if (!is_dir($dir) && !@mkdir($dir, 0755, true) && !is_dir($dir)) {
        throw new RuntimeException('Unable to create avatar upload directory.');
    }

    $ext = $allowed[$mime];
    $name = 'u' . $userId . '_' . gmdate('YmdHis') . '_' . bin2hex(random_bytes(5)) . '.' . $ext;
    $dest = $dir . '/' . $name;
    if (!move_uploaded_file($tmp, $dest)) {
        throw new RuntimeException('Unable to move uploaded avatar file.');
    }

    account_delete_avatar_file($oldPath);
    return '/uploads/avatars/' . $name;
}

function account_mark_profile_migration_applied(): void
{
    try {
        $st = db()->prepare('INSERT IGNORE INTO schema_migrations (id) VALUES (?)');
        $st->execute(['009_user_profile.sql']);
    } catch (Throwable) {
        // best-effort
    }
}

function account_ensure_profile_schema(): bool
{
    if (user_profile_columns_available()) {
        return true;
    }

    $clauses = [];
    if (!user_table_has_column('full_name', true)) {
        $clauses[] = 'ADD COLUMN full_name VARCHAR(120) NULL AFTER email';
    }
    if (!user_table_has_column('avatar_path', true)) {
        $clauses[] = 'ADD COLUMN avatar_path VARCHAR(255) NULL AFTER full_name';
    }

    if ($clauses === []) {
        return user_profile_columns_available(true);
    }

    try {
        db()->exec('ALTER TABLE users ' . implode(', ', $clauses));
        account_mark_profile_migration_applied();
    } catch (Throwable $e) {
        log_account('Profile schema ensure failed: ' . preg_replace('/\s+/', ' ', $e->getMessage()));
    }

    return user_profile_columns_available(true);
}

auth_bootstrap();

$uid = current_user_id();
if ($uid === null) {
    header('Location: /login.php', true, 302);
    exit;
}

$ok = '';
$err = '';

$profileSchemaReady = account_ensure_profile_schema();

try {
    $sql = $profileSchemaReady
        ? 'SELECT id, email, full_name, avatar_path, last_login_at FROM users WHERE id = ? LIMIT 1'
        : 'SELECT id, email, last_login_at FROM users WHERE id = ? LIMIT 1';
    $st = db()->prepare($sql);
    $st->execute([$uid]);
    $me = $st->fetch();
    if (!$me) {
        auth_logout();
        header('Location: /login.php', true, 302);
        exit;
    }
} catch (Throwable $e) {
    log_account('Fetch error: ' . preg_replace('/\s+/', ' ', $e->getMessage()));
    $err = 'An error occurred while loading the account.';
    $me = ['email' => '', 'full_name' => '', 'avatar_path' => null, 'last_login_at' => null];
}

$sessionsCount = 0;
try {
    $st = db()->prepare('SELECT COUNT(*) FROM user_sessions WHERE user_id = ? AND expires_at > NOW()');
    $st->execute([$uid]);
    $sessionsCount = (int)$st->fetchColumn();
} catch (Throwable) {
    $sessionsCount = 0;
}

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'POST') {
    $csrf = $_POST['csrf_token'] ?? null;
    if (!csrf_verify(is_string($csrf) ? $csrf : null)) {
        $err = 'Security verification failed. Refresh the page and try again.';
    } else {
        $action = v_enum($_POST['action'] ?? null, ['profile', 'email', 'password', 'logout', 'logout_all']);
        if ($action === null) {
            $err = 'Invalid request.';
        } else {
            try {
                if ($action === 'logout') {
                    auth_logout();
                    header('Location: /login.php', true, 302);
                    exit;
                }

                if ($action === 'logout_all') {
                    auth_logout_all($uid);
                    header('Location: /login.php', true, 302);
                    exit;
                }

                if ($action === 'profile') {
                    if (!$profileSchemaReady) {
                        $profileSchemaReady = account_ensure_profile_schema();
                    }

                    if (!$profileSchemaReady) {
                        $err = 'Profile settings are temporarily unavailable. Please refresh the page and try again.';
                    }

                    $fullNameRaw = isset($_POST['full_name']) && is_string($_POST['full_name']) ? trim($_POST['full_name']) : '';
                    if ($err === '' && $fullNameRaw !== '') {
                        $len = function_exists('mb_strlen') ? mb_strlen($fullNameRaw, 'UTF-8') : strlen($fullNameRaw);
                        if ($len < 2 || $len > 120) {
                            $err = 'Name must be between 2 and 120 characters.';
                        }
                    }

                    if ($err === '') {
                        $removeAvatar = isset($_POST['remove_avatar']) && (string)$_POST['remove_avatar'] === '1';
                        $currentAvatar = user_avatar_relpath(isset($me['avatar_path']) ? (string)$me['avatar_path'] : null);
                        $nextAvatar = $currentAvatar;
                        $hasUpload = isset($_FILES['avatar']) && is_array($_FILES['avatar'])
                            && ((int)($_FILES['avatar']['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_NO_FILE);

                        if ($removeAvatar && !$hasUpload) {
                            account_delete_avatar_file($currentAvatar);
                            $nextAvatar = null;
                        }
                        if ($hasUpload) {
                            $nextAvatar = account_store_avatar($uid, $_FILES['avatar'], $currentAvatar);
                        }

                        $st = db()->prepare('UPDATE users SET full_name = ?, avatar_path = ? WHERE id = ?');
                        $st->execute([$fullNameRaw !== '' ? $fullNameRaw : null, $nextAvatar, $uid]);

                        $me['full_name'] = $fullNameRaw;
                        $me['avatar_path'] = $nextAvatar;
                        $ok = 'Profile updated successfully.';
                    }
                }

                if ($action === 'email' && $err === '') {
                    $newEmail = v_email($_POST['new_email'] ?? null);
                    if ($newEmail === null) {
                        $err = 'Enter a valid email address.';
                    } else {
                        $st = db()->prepare('UPDATE users SET email = ? WHERE id = ?');
                        $st->execute([$newEmail, $uid]);
                        $ok = 'Email updated successfully.';
                        $me['email'] = $newEmail;
                    }
                }

                if ($action === 'password' && $err === '') {
                    $p1 = v_string($_POST['new_password'] ?? null, 10, 300);
                    $p2 = v_string($_POST['confirm_password'] ?? null, 10, 300);
                    if ($p1 === null || $p2 === null) {
                        $err = 'Password must be at least 10 characters long.';
                    } elseif (!auth_password_ok($p1)) {
                        $err = 'Password must include letters and numbers.';
                    } elseif (!hash_equals($p1, $p2)) {
                        $err = 'Passwords do not match.';
                    } else {
                        $hash = password_hash($p1, password_algo());
                        $st = db()->prepare('UPDATE users SET password_hash = ? WHERE id = ?');
                        $st->execute([$hash, $uid]);
                        auth_bump_session_version($uid);
                        auth_login($uid, false);
                        $ok = 'Password updated successfully. Other devices were signed out.';
                    }
                }
            } catch (PDOException $e) {
                if ((int)($e->errorInfo[1] ?? 0) === 1062) {
                    $err = 'This email address is already in use.';
                } else {
                    log_account('PDO: ' . preg_replace('/\s+/', ' ', $e->getMessage()));
                    $err = 'An error occurred. Please try again.';
                }
            } catch (Throwable $e) {
                log_account('Error: ' . preg_replace('/\s+/', ' ', $e->getMessage()));
                $err = 'An error occurred. Please try again.';
            }
        }
    }
}

$meDisplay = user_display_name_from_row($me);
$meInitials = user_initials_from_display_name($meDisplay);
$meAvatarUrl = user_avatar_relpath(isset($me['avatar_path']) ? (string)$me['avatar_path'] : null);
$token = csrf_token();
$brand = site_brand_name();
$canAdmin = is_admin_user();
?><!doctype html>
<html lang="en" dir="ltr">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title><?= h($brand) ?> — Settings</title>
  <link rel="icon" href="<?= h(site_favicon_url()) ?>" />
  <script src="<?= h(asset_url('/assets/js/core/theme.js')) ?>"></script>
  <link rel="stylesheet" href="<?= h(asset_url('/assets/css/app.css')) ?>" />
  <link rel="stylesheet" href="/theme.php" />
  <link rel="stylesheet" href="<?= h(asset_url('/assets/css/pages/dashboard/shell.css')) ?>" />
  <link rel="stylesheet" href="<?= h(asset_url('/assets/css/pages/app_pages.css')) ?>" />
  <link rel="stylesheet" href="<?= h(asset_url('/assets/css/pages/auth.css')) ?>" />
</head>
<body class="ln-account-page">
  <div class="bg"></div>

  <div class="dashboard-shell">

    <?php render_app_sidebar(['active' => 'settings', 'brand' => $brand, 'logo_url' => site_logo_url(), 'can_admin' => $canAdmin]); ?>

    <div class="dashboard-main">
      <?php render_app_topbar([
        'title' => 'Settings',
        'eyebrow' => 'Profile & security',
        'search_id' => 'accountSearch',
        'search_placeholder' => 'Search settings',
        'search_aria' => 'Search settings',
        'search_scope' => 'account',
        'can_admin' => $canAdmin,
        'profile_name' => $meDisplay,
        'profile_initial' => $meInitials,
      ]); ?>

      <?php render_app_drawer(['active' => 'settings', 'can_admin' => $canAdmin]); ?>

      <main class="page" role="main">
        <section class="page-hero page-hero--settings">
          <div class="page-hero__content">
            <div class="page-hero__eyebrow">Profile &amp; Security</div>
            <div class="page-hero__crumb">Dashboard <span aria-hidden="true">›</span> Settings</div>
            <h1 class="section-title">Manage your personal profile, login credentials, and active sessions from one place.</h1>
            <p class="page-hero__desc">This page is now focused on the normal user experience: update your display name, change your profile photo, manage email and password, and sign out of all devices when needed.</p>
            <div class="page-hero__chips">
              <span class="page-hero__chip">Profile name</span>
              <span class="page-hero__chip">Profile photo</span>
              <span class="page-hero__chip">Email</span>
              <span class="page-hero__chip">Password</span>
              <span class="page-hero__chip">Sessions</span>
            </div>
          </div>
        </section>

        <section class="auth-shell account-settings-shell">
          <section class="auth-hero">
            <div>
              <div class="brand">
                <div class="brand-badge" aria-hidden="true"></div>
                <div>
                  <div class="brand-title"><?= h($brand) ?></div>
                  <div class="brand-sub">Personal account settings<?php if ($canAdmin): ?> · Admin access enabled<?php endif; ?></div>
                </div>
              </div>

              <div class="account-identity-card">
                <div class="account-identity-card__avatar<?= $meAvatarUrl !== null ? ' is-image' : '' ?>" aria-hidden="true">
                  <?php if ($meAvatarUrl !== null): ?>
                    <img src="<?= h($meAvatarUrl) ?>" alt="" class="account-identity-card__img" />
                  <?php else: ?>
                    <span><?= h($meInitials) ?></span>
                  <?php endif; ?>
                </div>
                <div class="account-identity-card__body">
                  <div class="account-identity-card__name"><?= h($meDisplay) ?></div>
                  <div class="account-identity-card__meta"><?= h((string)($me['email'] ?? '')) ?></div>
                  <?php if (!empty($me['last_login_at'])): ?>
                    <div class="account-identity-card__meta">Last sign-in: <span dir="ltr"><?= h((string)$me['last_login_at']) ?></span></div>
                  <?php endif; ?>
                </div>
              </div>

              <h2 class="hero-title">Your account</h2>
              <p class="hero-desc">Keep the public-facing identity of your account up to date without going through the admin dashboard.</p>

              <div class="pill-row">
                <a class="pill link" href="/index.php">Back to App</a>
                <?php if ($canAdmin): ?><a class="pill link" href="/admin/">Open Admin</a><?php endif; ?>
              </div>
            </div>

            <div class="mini">
              Current account: <b><?= h((string)($me['email'] ?? '')) ?></b>
              <div>Display name: <b><?= h($meDisplay) ?></b></div>
              <div>Active remember-me sessions: <b><?= (string)$sessionsCount ?></b></div>
              <div>Supported avatar types: <b>PNG / JPG / WebP</b></div>
            </div>
          </section>

          <section class="auth-card">
            <h1>Manage Account</h1>
            <p>All actions are protected with CSRF and remain compatible with the current site security policy.</p>

            <?php if ($err !== ''): ?>
              <div class="alert" role="alert"><?= h($err) ?></div>
            <?php elseif ($ok !== ''): ?>
              <div class="alert ok" role="status"><?= h($ok) ?></div>
            <?php endif; ?>

            <div class="section-title">Profile Details</div>
            <form method="post" action="/account.php" enctype="multipart/form-data">
              <input type="hidden" name="csrf_token" value="<?= h($token) ?>" />
              <input type="hidden" name="action" value="profile" />

              <div class="account-profile-grid">
                <div class="account-profile-avatar<?= $meAvatarUrl !== null ? ' is-image' : '' ?>">
                  <?php if ($meAvatarUrl !== null): ?>
                    <img src="<?= h($meAvatarUrl) ?>" alt="Current profile photo" class="account-profile-avatar__img" />
                  <?php else: ?>
                    <span class="account-profile-avatar__initials"><?= h($meInitials) ?></span>
                  <?php endif; ?>
                </div>

                <div class="account-profile-fields">
                  <div class="form-row">
                    <label for="full_name">Display Name</label>
                    <input id="full_name" name="full_name" type="text" maxlength="120" value="<?= h((string)($me['full_name'] ?? '')) ?>" placeholder="How your name should appear in the app" />
                  </div>

                  <div class="form-row">
                    <label for="avatar">Profile Photo</label>
                    <input id="avatar" class="account-file-input" name="avatar" type="file" accept="image/png,image/jpeg,image/webp" />
                    <div class="account-input-help">Upload a square-looking image for the cleanest result. Maximum size: 2 MB.</div>
                  </div>

                  <?php if ($meAvatarUrl !== null): ?>
                    <label class="account-inline-check"><input type="checkbox" name="remove_avatar" value="1" /> <span>Remove current photo</span></label>
                  <?php endif; ?>
                </div>
              </div>

              <button class="btn btn--primary" type="submit">Save Profile</button>
            </form>

            <div class="section-title">Change Email</div>
            <form method="post" action="/account.php">
              <input type="hidden" name="csrf_token" value="<?= h($token) ?>" />
              <input type="hidden" name="action" value="email" />
              <div class="form-row">
                <label for="new_email">New Email</label>
                <input id="new_email" name="new_email" type="email" value="<?= h((string)($me['email'] ?? '')) ?>" required />
              </div>
              <button class="btn" type="submit">Save Email</button>
            </form>

            <div class="section-title">Change Password</div>
            <form method="post" action="/account.php">
              <input type="hidden" name="csrf_token" value="<?= h($token) ?>" />
              <input type="hidden" name="action" value="password" />

              <div class="two-col">
                <div class="form-row">
                  <label for="new_password">New Password</label>
                  <input id="new_password" name="new_password" type="password" minlength="10" required />
                </div>
                <div class="form-row">
                  <label for="confirm_password">Confirm Password</label>
                  <input id="confirm_password" name="confirm_password" type="password" minlength="10" required />
                </div>
              </div>
              <div class="account-input-help">Use at least 10 characters and include both letters and numbers.</div>
              <button class="btn" type="submit">Save Password</button>
            </form>

            <div class="section-title">Sign Out</div>
            <form method="post" action="/account.php">
              <input type="hidden" name="csrf_token" value="<?= h($token) ?>" />
              <input type="hidden" name="action" value="logout" />
              <button class="btn btn-ghost" type="submit">Sign Out</button>
            </form>

            <div class="section-title">Sign Out of All Devices</div>
            <form method="post" action="/account.php">
              <input type="hidden" name="csrf_token" value="<?= h($token) ?>" />
              <input type="hidden" name="action" value="logout_all" />
              <button class="btn btn-ghost" type="submit">Sign Out Everywhere</button>
            </form>

            <div class="help">You can revisit this page anytime at <span dir="ltr">/account.php</span>.</div>
          </section>
        </section>
      </main>
    </div>
  </div>

  <script src="<?= h(asset_url('/assets/js/core/app.js')) ?>"></script>
  <script src="<?= h(asset_url('/assets/js/pages/account.js')) ?>"></script>
</body>
</html>
