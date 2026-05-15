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

$allowedColors = ['blue','mint','yellow','pink','gray'];

function normalize_note_title(mixed $value): ?string
{
    if (!is_string($value)) {
        return null;
    }
    $title = trim($value);
    if (function_exists('mb_strlen')) {
        if (mb_strlen($title, 'UTF-8') > 160) {
            return null;
        }
    } else {
        if (strlen($title) > 160) {
            return null;
        }
    }
    return $title;
}


function task_notes_supports_title(PDO $pdo): bool
{
    static $supported = null;
    if ($supported !== null) {
        return $supported;
    }
    try {
        $pdo->query('SELECT title FROM task_notes LIMIT 1');
        $supported = true;
        return true;
    } catch (Throwable $e) {
        try {
            $pdo->exec('ALTER TABLE task_notes ADD COLUMN title TEXT NULL AFTER user_id');
            $pdo->query('SELECT title FROM task_notes LIMIT 1');
            $supported = true;
            return true;
        } catch (Throwable $e2) {
            $supported = false;
            return false;
        }
    }
}

function assert_task_owned(PDO $pdo, int $uid, int $taskId): void
{
    $st = $pdo->prepare('SELECT id FROM tasks WHERE id = ? AND user_id = ?');
    $st->execute([$taskId, $uid]);
    if (!$st->fetch()) {
        json_error('Task not found', 404);
    }
}

if ($method === 'GET') {
    $taskId = v_int($_GET['task_id'] ?? null, 1, PHP_INT_MAX);
    if ($taskId === null) {
        json_error('Missing task_id', 422);
    }

    assert_task_owned($pdo, $uid, $taskId);

    $limit = v_int($_GET['limit'] ?? 20, 1, 100) ?? 20;
    $hasTitle = task_notes_supports_title($pdo);
    $selectTitle = $hasTitle ? 'title' : "'' AS title";
    $st = $pdo->prepare('SELECT id, task_id, ' . $selectTitle . ', body, color, created_at FROM task_notes WHERE user_id = ? AND task_id = ? ORDER BY id DESC LIMIT ' . (int)$limit);
    $st->execute([$uid, $taskId]);
    $rows = $st->fetchAll();

    $needUpd = [];
    $needTitleUpd = [];
    foreach ($rows as &$r) {
        $rawTitle = is_string($r['title'] ?? null) ? (string)$r['title'] : '';
        $plainTitle = $rawTitle === '' ? '' : crypto_decrypt_for_user($uid, $rawTitle);
        $r['title'] = $plainTitle;
        if ($rawTitle !== '' && !crypto_is_encrypted($rawTitle)) {
            $needTitleUpd[(int)$r['id']] = $plainTitle;
        }

        $raw = is_string($r['body'] ?? null) ? (string)$r['body'] : '';
        $plain = crypto_decrypt_for_user($uid, $raw);
        $r['body'] = $plain;
        if ($raw !== '' && !crypto_is_encrypted($raw)) {
            $needUpd[(int)$r['id']] = $plain;
        }
    }
    unset($r);

    if ($hasTitle && $needTitleUpd) {
        $upTitle = $pdo->prepare('UPDATE task_notes SET title = ? WHERE id = ? AND user_id = ?');
        foreach ($needTitleUpd as $id => $plainTitle) {
            $upTitle->execute([$plainTitle === '' ? '' : crypto_encrypt_for_user($uid, (string)$plainTitle), $id, $uid]);
        }
    }

    if ($needUpd) {
        $up = $pdo->prepare('UPDATE task_notes SET body = ? WHERE id = ? AND user_id = ?');
        foreach ($needUpd as $id => $plain) {
            $up->execute([crypto_encrypt_for_user($uid, (string)$plain), $id, $uid]);
        }
    }

    json_response(['ok' => true, 'notes' => $rows]);
}

if ($method === 'POST') {
    csrf_require_or_fail();
    $b = json_body();

    $taskId = v_int($b['task_id'] ?? null, 1, PHP_INT_MAX);
    $title = array_key_exists('title', $b) ? normalize_note_title($b['title']) : '';
    $bodyRaw = array_key_exists('body', $b) && is_string($b['body']) ? trim((string)$b['body']) : '';
    if ($taskId === null || $title === null) {
        json_error('Invalid payload', 422);
    }
    if ($bodyRaw !== '') {
        $body = v_string($bodyRaw, 1, 5000);
        if ($body === null) {
            json_error('Invalid body', 422);
        }
    } else {
        $body = '';
    }
    if ($title === '' && $body === '') {
        json_error('Write a title or note body first.', 422);
    }

    assert_task_owned($pdo, $uid, $taskId);

    $color = v_enum($b['color'] ?? 'blue', $allowedColors) ?? 'blue';
    $hasTitle = task_notes_supports_title($pdo);
    if ($title !== '' && !$hasTitle) {
        json_error('Note title support is not ready on the server schema.', 500);
    }

    if ($hasTitle) {
        $st = $pdo->prepare('INSERT INTO task_notes (task_id, user_id, title, body, color) VALUES (?, ?, ?, ?, ?)');
        $st->execute([$taskId, $uid, $title === '' ? '' : crypto_encrypt_for_user($uid, $title), crypto_encrypt_for_user($uid, $body), $color]);
    } else {
        $st = $pdo->prepare('INSERT INTO task_notes (task_id, user_id, body, color) VALUES (?, ?, ?, ?)');
        $st->execute([$taskId, $uid, crypto_encrypt_for_user($uid, $body), $color]);
    }

    $id = (int)$pdo->lastInsertId();
    $selectTitle = $hasTitle ? 'title' : "'' AS title";
    $get = $pdo->prepare('SELECT id, task_id, ' . $selectTitle . ', body, color, created_at FROM task_notes WHERE id = ? AND user_id = ?');
    $get->execute([$id, $uid]);
    $note = $get->fetch();
    if ($note) {
        if (isset($note['title']) && is_string($note['title'])) {
            $note['title'] = $note['title'] === '' ? '' : crypto_decrypt_for_user($uid, $note['title']);
        }
        if (isset($note['body']) && is_string($note['body'])) {
            $note['body'] = crypto_decrypt_for_user($uid, $note['body']);
        }
    }

    json_response(['ok' => true, 'note' => $note], 201);
}

if ($method === 'PATCH') {
    csrf_require_or_fail();

    $id = v_int($_GET['id'] ?? null, 1, PHP_INT_MAX);
    if ($id === null) {
        json_error('Missing id', 422);
    }

    $b = json_body();

    $hasTitle = array_key_exists('title', $b);
    $hasBody = array_key_exists('body', $b);
    $hasColor = array_key_exists('color', $b);

    $title = null;
    if ($hasTitle) {
        $title = normalize_note_title($b['title']);
        if ($title === null) {
            json_error('Invalid title', 422);
        }
    }

    $body = null;
    if ($hasBody) {
        if (!is_string($b['body'])) {
            json_error('Invalid body', 422);
        }
        $body = trim((string)$b['body']);
        if ($body !== '') {
            $body = v_string($body, 1, 5000);
            if ($body === null) {
                json_error('Invalid body', 422);
            }
        }
    }

    $color = null;
    if ($hasColor) {
        $color = v_enum($b['color'], $allowedColors);
        if ($color === null) {
            json_error('Invalid color', 422);
        }
    }

    if (!$hasTitle && !$hasBody && !$hasColor) {
        json_error('Invalid payload', 422);
    }

    $titleSupported = task_notes_supports_title($pdo);
    if ($hasTitle && !$titleSupported) {
        json_error('Note title support is not ready on the server schema.', 500);
    }

    $selectTitleExisting = $titleSupported ? 'title' : "'' AS title";
    $existingSt = $pdo->prepare('SELECT id, ' . $selectTitleExisting . ', body FROM task_notes WHERE id = ? AND user_id = ?');
    $existingSt->execute([$id, $uid]);
    $existing = $existingSt->fetch();
    if (!$existing) {
        json_error('Not found', 404);
    }

    $currentTitle = '';
    if ($titleSupported && isset($existing['title']) && is_string($existing['title'])) {
        $currentTitle = $existing['title'] === '' ? '' : crypto_decrypt_for_user($uid, $existing['title']);
    }
    $currentBody = isset($existing['body']) && is_string($existing['body']) ? crypto_decrypt_for_user($uid, $existing['body']) : '';

    $nextTitle = $hasTitle ? (string)$title : $currentTitle;
    $nextBody = $hasBody ? (string)$body : $currentBody;
    if (trim($nextTitle) === '' && trim($nextBody) === '') {
        json_error('Note cannot be completely empty.', 422);
    }

    $sets = [];
    $params = [];
    if ($hasTitle && $titleSupported) {
        $sets[] = 'title = ?';
        $params[] = $title === '' ? '' : crypto_encrypt_for_user($uid, (string)$title);
    }
    if ($hasBody) {
        $sets[] = 'body = ?';
        $params[] = crypto_encrypt_for_user($uid, (string)$body);
    }
    if ($hasColor) {
        $sets[] = 'color = ?';
        $params[] = (string)$color;
    }

    $params[] = $id;
    $params[] = $uid;

    $st = $pdo->prepare('UPDATE task_notes SET ' . implode(', ', $sets) . ' WHERE id = ? AND user_id = ?');
    $st->execute($params);

    $selectTitle = $titleSupported ? 'title' : "'' AS title";
    $get = $pdo->prepare('SELECT id, task_id, ' . $selectTitle . ', body, color, created_at FROM task_notes WHERE id = ? AND user_id = ?');
    $get->execute([$id, $uid]);
    $note = $get->fetch();
    if ($note) {
        if (isset($note['title']) && is_string($note['title'])) {
            $note['title'] = $note['title'] === '' ? '' : crypto_decrypt_for_user($uid, $note['title']);
        }
        if (isset($note['body']) && is_string($note['body'])) {
            $note['body'] = crypto_decrypt_for_user($uid, $note['body']);
        }
    }
    if (!$note) {
        json_error('Not found', 404);
    }

    json_response(['ok' => true, 'note' => $note]);
}

if ($method === 'DELETE') {
    csrf_require_or_fail();
    $id = v_int($_GET['id'] ?? null, 1, PHP_INT_MAX);
    if ($id === null) {
        json_error('Missing id', 422);
    }

    $st = $pdo->prepare('DELETE FROM task_notes WHERE id = ? AND user_id = ?');
    $st->execute([$id, $uid]);
    json_response(['ok' => true]);
}

json_error('Method not allowed', 405);
