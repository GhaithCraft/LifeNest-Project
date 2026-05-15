<?php
declare(strict_types=1);

require_once __DIR__ . '/../includes/api_init.php';
require_once __DIR__ . '/../includes/db.php';
require_once __DIR__ . '/../includes/auth.php';
require_once __DIR__ . '/../includes/validate.php';
require_once __DIR__ . '/../includes/crypto.php';

$uid = require_login();
$pdo = db();
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';


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


if ($method !== 'GET') {
    json_error('Method not allowed', 405);
}

$view = v_enum($_GET['view'] ?? null, ['all', 'recent']) ?? 'all';
$kind = v_enum($_GET['kind'] ?? null, ['personal', 'study']);
$taskId = v_int($_GET['task_id'] ?? null, 1, PHP_INT_MAX);
$q = isset($_GET['q']) && is_string($_GET['q']) ? trim($_GET['q']) : '';
if ($q !== '') {
    if (function_exists('mb_strlen')) {
        if (mb_strlen($q, 'UTF-8') > 120) { $q = mb_substr($q, 0, 120, 'UTF-8'); }
    } else {
        if (strlen($q) > 120) { $q = substr($q, 0, 120); }
    }
}
$limit = v_int($_GET['limit'] ?? 120, 1, 200) ?? 120;

// When searching in encrypted text, we filter in PHP after decrypting.
// To find older matches, fetch a larger window (still bounded) when q is present.
$fetchLimit = ($q !== '') ? 800 : 200;

$hasTitle = task_notes_supports_title($pdo);
$noteTitleSelect = $hasTitle ? 'n.title AS note_title' : "'' AS note_title";

$params = [$uid];
$sql = "
  SELECT
    n.id AS note_id,
    n.task_id AS task_id,
    " . $noteTitleSelect . ",
    n.body AS body,
    n.color AS color,
    n.created_at AS note_created_at,
    t.title AS task_title,
    t.kind AS task_kind,
    t.priority AS task_priority,
    t.status AS task_status,
    t.due_date AS task_due_date,
    t.duration_minutes AS task_duration_minutes,
    t.created_at AS task_created_at,
    t.updated_at AS task_updated_at
  FROM task_notes n
  JOIN tasks t ON t.id = n.task_id
  WHERE n.user_id = ? AND t.user_id = ?
";
$params[] = $uid;

if ($kind !== null) {
    $sql .= " AND t.kind = ?";
    $params[] = $kind;
}

if ($taskId !== null) {
    $sql .= " AND t.id = ?";
    $params[] = $taskId;
}

if ($view === 'recent') {
    $sql .= " AND n.created_at >= (NOW() - INTERVAL 7 DAY)";
}

$sql .= " ORDER BY n.id DESC LIMIT " . (int)$fetchLimit;

$st = $pdo->prepare($sql);
$st->execute($params);
$rows = $st->fetchAll();

$needUpd = [];
$needTitleUpd = [];
$notes = [];

foreach ($rows as $r) {
    $rawTitle = is_string($r['note_title'] ?? null) ? (string)$r['note_title'] : '';
    $plainTitle = $rawTitle === '' ? '' : crypto_decrypt_for_user($uid, $rawTitle);

    if ($rawTitle !== '' && !crypto_is_encrypted($rawTitle)) {
        $needTitleUpd[(int)$r['note_id']] = $plainTitle;
    }

    $raw = is_string($r['body'] ?? null) ? (string)$r['body'] : '';
    $plain = crypto_decrypt_for_user($uid, $raw);

    if ($raw !== '' && !crypto_is_encrypted($raw)) {
        $needUpd[(int)$r['note_id']] = $plain;
    }

    $taskTitleRaw = is_string($r['task_title'] ?? null) ? (string)$r['task_title'] : '';
    $taskTitle = $taskTitleRaw === '' ? '' : crypto_decrypt_for_user($uid, $taskTitleRaw);
    $hay = $plainTitle . " " . $plain . " " . $taskTitle;

    if ($q !== '') {
        if ((function_exists('mb_stripos') ? (mb_stripos($hay, $q, 0, 'UTF-8') === false) : (stripos($hay, $q) === false))) {
            continue;
        }
    }

    $notes[] = [
        'id' => (int)$r['note_id'],
        'task_id' => (int)$r['task_id'],
        'title' => $plainTitle,
        'body' => $plain,
        'color' => is_string($r['color'] ?? null) ? (string)$r['color'] : 'blue',
        'created_at' => $r['note_created_at'],
        'task' => [
            'id' => (int)$r['task_id'],
            'title' => $taskTitle,
            'kind' => is_string($r['task_kind'] ?? null) ? (string)$r['task_kind'] : 'personal',
            'priority' => is_string($r['task_priority'] ?? null) ? (string)$r['task_priority'] : 'medium',
            'status' => is_string($r['task_status'] ?? null) ? (string)$r['task_status'] : 'todo',
            'due_date' => $r['task_due_date'],
            'duration_minutes' => $r['task_duration_minutes'] === null ? null : (int)$r['task_duration_minutes'],
            'created_at' => $r['task_created_at'],
            'updated_at' => $r['task_updated_at'],
        ],
    ];

    if (count($notes) >= $limit) {
        break;
    }
}

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

/* counts */
$counts = [
    'all' => 0,
    'recent' => 0,
    'personal' => 0,
    'study' => 0,
];

$st = $pdo->prepare('SELECT COUNT(*) AS c FROM task_notes WHERE user_id = ?');
$st->execute([$uid]);
$counts['all'] = (int)($st->fetch()['c'] ?? 0);

$st = $pdo->prepare('SELECT COUNT(*) AS c FROM task_notes WHERE user_id = ? AND created_at >= (NOW() - INTERVAL 7 DAY)');
$st->execute([$uid]);
$counts['recent'] = (int)($st->fetch()['c'] ?? 0);

$st = $pdo->prepare("
    SELECT t.kind AS kind, COUNT(*) AS c
    FROM task_notes n
    JOIN tasks t ON t.id = n.task_id
    WHERE n.user_id = ? AND t.user_id = ?
    GROUP BY t.kind
");
$st->execute([$uid, $uid]);
foreach ($st->fetchAll() as $row) {
    $k = is_string($row['kind'] ?? null) ? (string)$row['kind'] : '';
    if ($k === 'personal') $counts['personal'] = (int)($row['c'] ?? 0);
    if ($k === 'study') $counts['study'] = (int)($row['c'] ?? 0);
}

/* tasks (for filter dropdown + linked-task selector)
   - includes tasks with 0 notes (so you can add the first note from this page)
   - note_count/last_note_at are still computed per-user
*/
$tasks = [];
$st = $pdo->prepare("
    SELECT
      t.id,
      t.title,
      t.kind,
      COUNT(n.id) AS note_count,
      MAX(n.created_at) AS last_note_at
    FROM tasks t
    LEFT JOIN task_notes n
      ON n.task_id = t.id
     AND n.user_id = ?
    WHERE t.user_id = ?
    GROUP BY t.id
    ORDER BY last_note_at DESC, t.updated_at DESC
    LIMIT 200
");
$st->execute([$uid, $uid]);
foreach ($st->fetchAll() as $row) {
    $titleRaw = is_string($row['title'] ?? null) ? (string)$row['title'] : '';
    $title = $titleRaw === '' ? '' : crypto_decrypt_for_user($uid, $titleRaw);
    $tasks[] = [
        'id' => (int)$row['id'],
        'title' => $title,
        'kind' => is_string($row['kind'] ?? null) ? (string)$row['kind'] : 'personal',
        'note_count' => (int)($row['note_count'] ?? 0),
        'last_note_at' => $row['last_note_at'] ?? null,
    ];
}

json_response([
    'ok' => true,
    'counts' => $counts,
    'tasks' => $tasks,
    'notes' => $notes,
]);
