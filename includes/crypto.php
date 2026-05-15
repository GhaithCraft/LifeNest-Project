<?php
declare(strict_types=1);

/**
 * crypto.php — lightweight at-rest encryption utilities (CSP-safe / no deps).
 *
 * Storage format:
 *   enc:<base64(nonce[12] || tag[16] || ciphertext)>
 *
 * Keying:
 *   - master key: 32 random bytes stored on disk (cache/app_master.key)
 *   - per-user key: HMAC-SHA256(master, "LifeNest-user-key-v1:<uid>")
 *
 * Notes:
 *   - We keep metadata (ids, dates, enums) plaintext for filtering/sorting.
 *   - Text fields and amounts are stored encrypted.
 */

function crypto_key_path(): string
{
    return dirname(__DIR__) . '/cache/app_master.key';
}

function crypto_master_key(): string
{
    static $k = null;
    if (is_string($k) && strlen($k) === 32) {
        return $k;
    }

    $path = crypto_key_path();
    $dir = dirname($path);
    if (!is_dir($dir)) {
        @mkdir($dir, 0755, true);
    }

    if (is_file($path)) {
        $b64 = trim((string)@file_get_contents($path));
        $raw = base64_decode($b64, true);
        if (!is_string($raw) || strlen($raw) !== 32) {
            throw new RuntimeException('Invalid master key file');
        }
        $k = $raw;
        return $k;
    }

    $raw = random_bytes(32);
    $b64 = base64_encode($raw);

    // Best-effort write (production should have a stable key).
    $ok = @file_put_contents($path, $b64, LOCK_EX);
    if ($ok === false) {
        throw new RuntimeException('Failed to write master key to cache/app_master.key');
    }
    @chmod($path, 0600);

    $k = $raw;
    return $k;
}

function crypto_user_key(int $uid): string
{
    $master = crypto_master_key();
    // 32 bytes
    return hash_hmac('sha256', 'LifeNest-user-key-v1:' . (string)$uid, $master, true);
}

function crypto_is_encrypted(?string $v): bool
{
    return is_string($v) && strncmp($v, 'enc:', 4) === 0;
}

function crypto_encrypt_for_user(int $uid, string $plaintext): string
{
    $key = crypto_user_key($uid);
    $nonce = random_bytes(12);
    $tag = '';

    $ct = openssl_encrypt($plaintext, 'aes-256-gcm', $key, OPENSSL_RAW_DATA, $nonce, $tag, '', 16);
    if ($ct === false || !is_string($ct) || !is_string($tag) || strlen($tag) !== 16) {
        throw new RuntimeException('Encryption failed');
    }

    return 'enc:' . base64_encode($nonce . $tag . $ct);
}

function crypto_decrypt_for_user(int $uid, string $stored): string
{
    if (!crypto_is_encrypted($stored)) {
        // Treat as plaintext (legacy/unmigrated).
        return $stored;
    }

    $b64 = substr($stored, 4);
    $raw = base64_decode($b64, true);
    if (!is_string($raw) || strlen($raw) < 28) {
        // If malformed, return as-is to avoid breaking the app.
        return $stored;
    }

    $nonce = substr($raw, 0, 12);
    $tag = substr($raw, 12, 16);
    $ct = substr($raw, 28);

    $key = crypto_user_key($uid);
    // Compatibility: some PHP builds expose openssl_decrypt() with <= 7 params (no $tag_length).
    // Try the modern signature first, then fall back.
    try {
        $pt = openssl_decrypt($ct, 'aes-256-gcm', $key, OPENSSL_RAW_DATA, $nonce, $tag, '', 16);
    } catch (ArgumentCountError $e) {
        $pt = openssl_decrypt($ct, 'aes-256-gcm', $key, OPENSSL_RAW_DATA, $nonce, $tag, '');
    }
    if ($pt === false || !is_string($pt)) {
        // Malformed or key mismatch; keep app resilient.
        return $stored;
    }

    return $pt;
}

function crypto_encrypt_nullable(int $uid, ?string $v): ?string
{
    if ($v === null) return null;
    $t = trim($v);
    if ($t === '') return null;
    return crypto_encrypt_for_user($uid, $t);
}

function crypto_decrypt_nullable(int $uid, ?string $v): ?string
{
    if ($v === null) return null;
    $t = (string)$v;
    if ($t === '') return null;
    return crypto_decrypt_for_user($uid, $t);
}

function crypto_encrypt_int(int $uid, int $n): string
{
    return crypto_encrypt_for_user($uid, (string)$n);
}

function crypto_decrypt_int(int $uid, string $stored, int $default = 0): int
{
    $pt = crypto_decrypt_for_user($uid, $stored);
    $pt = trim((string)$pt);
    if ($pt === '') return $default;

    // Allow legacy numeric plaintext.
    if (!preg_match('/^-?\d+$/', $pt)) {
        return $default;
    }
    return (int)$pt;
}
