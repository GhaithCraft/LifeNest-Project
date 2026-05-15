<?php
declare(strict_types=1);

require_once __DIR__ . '/../includes/api_init.php';
require_once __DIR__ . '/../includes/db.php';
require_once __DIR__ . '/../includes/auth.php';
require_once __DIR__ . '/../includes/validate.php';
require_once __DIR__ . '/../includes/csrf.php';
require_once __DIR__ . '/../includes/crypto.php';

$uid = require_login();
$pdo = db();
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

if ($method === 'GET') {
    $st = $pdo->prepare('SELECT id, title, planned_minutes, done_minutes, next_due_date, created_at, updated_at FROM study_items WHERE user_id = ? ORDER BY id DESC LIMIT 50');
    $st->execute([$uid]);
    $rows = $st->fetchAll();
    $needUpd = [];
    foreach ($rows as &$r) {
        $raw = is_string($r['title'] ?? null) ? (string)$r['title'] : '';
        $plain = crypto_decrypt_for_user($uid, $raw);
        $r['title'] = $plain;
        if ($raw !== '' && !crypto_is_encrypted($raw)) {
            $needUpd[(int)$r['id']] = $plain;
        }
    }
    unset($r);
    if ($needUpd) {
        $up = $pdo->prepare('UPDATE study_items SET title = ? WHERE id = ? AND user_id = ?');
        foreach ($needUpd as $id => $plain) {
            // Best-effort; never break the list endpoint.
            try {
                $up->execute([crypto_encrypt_for_user($uid, (string)$plain), $id, $uid]);
            } catch (Throwable $ignore) {
                // ignore
            }
        }
    }
    json_response(['ok' => true, 'items' => $rows]);
}

if ($method === 'POST') {
    csrf_require_or_fail();
    $b = json_body();

    $title = v_string($b['title'] ?? null, 1, 120);
    $planned = v_int($b['planned_minutes'] ?? 0, 0, 10_000) ?? 0;
    $done = v_int($b['done_minutes'] ?? 0, 0, 10_000) ?? 0;
    $next = v_date_ymd($b['next_due_date'] ?? null);

    if ($title === null) {
        json_error('Invalid title', 422);
    }

    $st = $pdo->prepare('INSERT INTO study_items (user_id, title, planned_minutes, done_minutes, next_due_date) VALUES (?, ?, ?, ?, ?)');
    $st->execute([$uid, crypto_encrypt_for_user($uid, $title), $planned, $done, $next]);

    json_response(['ok' => true], 201);
}

if ($method === 'PATCH') {
    csrf_require_or_fail();

    $id = v_int($_GET['id'] ?? null, 1, PHP_INT_MAX);
    if ($id === null) {
        json_error('Missing id', 422);
    }

    $b = json_body();

    $fields = [];
    $params = [];

    if (array_key_exists('title', $b)) {
        $title = v_string($b['title'], 1, 120);
        if ($title === null) {
            json_error('Invalid title', 422);
        }
        $fields[] = 'title = ?';
        $params[] = crypto_encrypt_for_user($uid, $title);
    }

    if (array_key_exists('planned_minutes', $b)) {
        $planned = v_int($b['planned_minutes'], 0, 10_000);
        if ($planned === null) {
            json_error('Invalid planned_minutes', 422);
        }
        $fields[] = 'planned_minutes = ?';
        $params[] = $planned;
    }

    if (array_key_exists('done_minutes', $b)) {
        $done = v_int($b['done_minutes'], 0, 10_000);
        if ($done === null) {
            json_error('Invalid done_minutes', 422);
        }
        $fields[] = 'done_minutes = ?';
        $params[] = $done;
    }

    if (array_key_exists('next_due_date', $b)) {
        $next = v_date_ymd($b['next_due_date']);
        if ($b['next_due_date'] !== null && $b['next_due_date'] !== '' && $next === null) {
            json_error('Invalid next_due_date', 422);
        }
        $fields[] = 'next_due_date = ?';
        $params[] = $next;
    }

    if (!$fields) {
        json_error('No fields to update', 422);
    }

    $params[] = $id;
    $params[] = $uid;

    $sql = 'UPDATE study_items SET ' . implode(', ', $fields) . ' WHERE id = ? AND user_id = ?';
    $st = $pdo->prepare($sql);
    $st->execute($params);

    json_response(['ok' => true]);
}

if ($method === 'DELETE') {
    csrf_require_or_fail();

    $id = v_int($_GET['id'] ?? null, 1, PHP_INT_MAX);
    if ($id === null) {
        json_error('Missing id', 422);
    }

    $st = $pdo->prepare('DELETE FROM study_items WHERE id = ? AND user_id = ?');
    $st->execute([$id, $uid]);

    json_response(['ok' => true]);
}

json_error('Method not allowed', 405);
