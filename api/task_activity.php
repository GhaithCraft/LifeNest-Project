<?php
declare(strict_types=1);

require_once __DIR__ . '/../includes/api_init.php';
require_once __DIR__ . '/../includes/db.php';
require_once __DIR__ . '/../includes/auth.php';
require_once __DIR__ . '/../includes/validate.php';
require_once __DIR__ . '/../includes/csrf.php';
require_once __DIR__ . '/../includes/date_utils.php';

$uid = require_login();
$pdo = db();
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

function range_from_request(): array
{
    $date = v_date_ymd($_GET['date'] ?? null);
    if ($date !== null) {
        $start = $date;
        $next = (new DateTimeImmutable($date . ' 00:00:00'))->modify('+1 day')->format('Y-m-d');
        return [$start, $next];
    }

    $from = v_date_ymd($_GET['from'] ?? null);
    $to = v_date_ymd($_GET['to'] ?? null);
    if ($from !== null && $to !== null) {
        $next = (new DateTimeImmutable($to . ' 00:00:00'))->modify('+1 day')->format('Y-m-d');
        return [$from, $next];
    }

    $today = today_ymd();
    $next = (new DateTimeImmutable($today . ' 00:00:00'))->modify('+1 day')->format('Y-m-d');
    return [$today, $next];
}

if ($method === 'GET') {
    [$start, $next] = range_from_request();

    $st = $pdo->prepare(
        'SELECT id, task_id, action, happened_at FROM task_activity_logs WHERE user_id = ? AND happened_at >= ? AND happened_at < ? ORDER BY happened_at DESC, id DESC'
    );
    $st->execute([$uid, $start . ' 00:00:00', $next . ' 00:00:00']);
    $rows = $st->fetchAll();

    $latestByTask = [];
    $uniqueByAction = [
        'started' => [],
        'completed' => [],
        'postponed' => [],
    ];

    foreach ($rows as $r) {
        $taskId = (string)($r['task_id'] ?? '');
        $action = (string)($r['action'] ?? '');
        if ($taskId === '' || !isset($uniqueByAction[$action])) {
            continue;
        }
        if (!isset($latestByTask[$taskId])) {
            $latestByTask[$taskId] = [
                'action' => $action,
                'happened_at' => (string)($r['happened_at'] ?? ''),
            ];
        }
        $uniqueByAction[$action][$taskId] = true;
    }

    json_response([
        'ok' => true,
        'range' => ['start' => $start, 'next' => $next],
        'items' => $rows,
        'latest_by_task' => $latestByTask,
        'summary' => [
            'started' => count($uniqueByAction['started']),
            'completed' => count($uniqueByAction['completed']),
            'postponed' => count($uniqueByAction['postponed']),
        ],
    ]);
}

if ($method === 'POST') {
    csrf_require_or_fail();
    $b = json_body();

    $taskId = v_int($b['task_id'] ?? null, 1, PHP_INT_MAX);
    $action = v_enum($b['action'] ?? null, ['started', 'completed', 'postponed']);
    if ($taskId === null || $action === null) {
        json_error('Invalid task_id or action', 422);
    }

    $chk = $pdo->prepare('SELECT id FROM tasks WHERE id = ? AND user_id = ?');
    $chk->execute([$taskId, $uid]);
    if (!$chk->fetch()) {
        json_error('Task not found', 404);
    }

    $ins = $pdo->prepare('INSERT INTO task_activity_logs (user_id, task_id, action) VALUES (?, ?, ?)');
    $ins->execute([$uid, $taskId, $action]);

    $get = $pdo->prepare('SELECT id, task_id, action, happened_at FROM task_activity_logs WHERE id = ? AND user_id = ?');
    $get->execute([(int)$pdo->lastInsertId(), $uid]);
    $row = $get->fetch();

    json_response([
        'ok' => true,
        'activity' => $row,
    ], 201);
}

json_error('Method not allowed', 405);
