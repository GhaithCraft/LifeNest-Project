<?php
declare(strict_types=1);

require_once __DIR__ . '/../includes/api_init.php';
require_once __DIR__ . '/../includes/auth.php';

$uid = current_user_id();
if ($uid === null) {
    json_response(['ok' => false, 'error' => 'Unauthorized'], 401);
}

$pdo = db();
$items = [];

try {
    $today = (new DateTimeImmutable('today'))->format('Y-m-d');

    $stTasks = $pdo->prepare(
        'SELECT '
        . 'SUM(CASE WHEN due_date = ? AND status <> "done" THEN 1 ELSE 0 END) AS due_today, '
        . 'SUM(CASE WHEN due_date < ? AND status <> "done" THEN 1 ELSE 0 END) AS overdue '
        . 'FROM tasks WHERE user_id = ?'
    );
    $stTasks->execute([$today, $today, $uid]);
    $taskRow = $stTasks->fetch() ?: [];
    $dueToday = (int)($taskRow['due_today'] ?? 0);
    $overdue = (int)($taskRow['overdue'] ?? 0);

    if ($overdue > 0) {
        $items[] = [
            'label' => $overdue . ' overdue task' . ($overdue === 1 ? '' : 's'),
            'meta' => 'Review overdue items before they keep slipping further.',
            'href' => '/tasks.php'
        ];
    }

    if ($dueToday > 0) {
        $items[] = [
            'label' => $dueToday . ' task' . ($dueToday === 1 ? '' : 's') . ' due today',
            'meta' => 'Open the Tasks page to finish today\'s work.',
            'href' => '/tasks.php'
        ];
    }

    $stNotes = $pdo->prepare('SELECT COUNT(*) FROM task_notes WHERE user_id = ?');
    $stNotes->execute([$uid]);
    $notesCount = (int)$stNotes->fetchColumn();
    if ($notesCount > 0) {
        $items[] = [
            'label' => $notesCount . ' saved note' . ($notesCount === 1 ? '' : 's'),
            'meta' => 'Open Notes to review linked task notes.',
            'href' => '/notes.php'
        ];
    }

    if (is_admin_user()) {
        $disabledUsers = (int)$pdo->query("SELECT COUNT(*) FROM users WHERE status = 'disabled'")->fetchColumn();
        if ($disabledUsers > 0) {
            $items[] = [
                'label' => $disabledUsers . ' disabled account' . ($disabledUsers === 1 ? '' : 's'),
                'meta' => 'Review account status from the Admin workspace.',
                'href' => '/admin/'
            ];
        }
    }
} catch (Throwable $e) {
    $id = lifenest_log_exception($e);
    json_response(['ok' => false, 'error' => 'Failed to load topbar notifications', 'error_id' => $id], 500);
}

json_response([
    'ok' => true,
    'items' => array_slice($items, 0, 5),
]);
