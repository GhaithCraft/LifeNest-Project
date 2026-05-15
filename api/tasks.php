<?php
declare(strict_types=1);

require_once __DIR__ . '/../includes/api_init.php';
require_once __DIR__ . '/../includes/db.php';
require_once __DIR__ . '/../includes/auth.php';
require_once __DIR__ . '/../includes/validate.php';
require_once __DIR__ . '/../includes/csrf.php';
require_once __DIR__ . '/../includes/date_utils.php';
require_once __DIR__ . '/../includes/crypto.php';
require_once __DIR__ . '/../includes/budget_defaults.php';

$uid = require_login();
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$pdo = db();

define('TASK_COST_CURRENCIES', ['TRY']);

function task_present_rows(PDO $pdo, int $uid, array $rows): array
{
    $needUpd = [];

    foreach ($rows as &$r) {
        $rawTitle = is_string($r['title'] ?? null) ? (string)$r['title'] : '';
        $plainTitle = crypto_decrypt_for_user($uid, $rawTitle);
        $r['title'] = $plainTitle;

        if ($rawTitle !== '' && !crypto_is_encrypted($rawTitle)) {
            $needUpd[(int)$r['id']]['title'] = crypto_encrypt_for_user($uid, $plainTitle);
        }

        $rawCost = isset($r['expected_cost_cents']) && is_string($r['expected_cost_cents'])
            ? (string)$r['expected_cost_cents']
            : null;
        $cost = null;
        if ($rawCost !== null && $rawCost !== '') {
            $tmp = crypto_decrypt_int($uid, $rawCost, 0);
            if ($tmp > 0) {
                $cost = $tmp;
            }
            if (!crypto_is_encrypted($rawCost)) {
                $needUpd[(int)$r['id']]['expected_cost_cents'] = $cost === null ? null : crypto_encrypt_int($uid, $cost);
            }
        }
        $r['expected_cost_cents'] = $cost;

        $currency = v_enum($r['expected_cost_currency'] ?? null, TASK_COST_CURRENCIES);
        $r['expected_cost_currency'] = $cost === null ? null : budget_app_currency();
        if ($cost !== null && ($currency ?? '') !== budget_app_currency()) {
            $needUpd[(int)$r['id']]['expected_cost_currency'] = budget_app_currency();
        }
    }
    unset($r);

    if ($needUpd) {
        foreach ($needUpd as $id => $cols) {
            if (!$cols) continue;
            $fields = [];
            $params = [];
            foreach ($cols as $k => $v) {
                $fields[] = $k . ' = ?';
                $params[] = $v;
            }
            $params[] = $id;
            $params[] = $uid;
            $up = $pdo->prepare('UPDATE tasks SET ' . implode(', ', $fields) . ' WHERE id = ? AND user_id = ?');
            try {
                $up->execute($params);
            } catch (Throwable $ignore) {
                // Keep GET resilient.
            }
        }
    }

    return $rows;
}

function task_supports_expected_cost(PDO $pdo): bool
{
    static $supported = null;
    if ($supported !== null) {
        return $supported;
    }
    try {
        $pdo->query('SELECT expected_cost_cents, expected_cost_currency FROM tasks LIMIT 1');
        $supported = true;
    } catch (Throwable $e) {
        $supported = false;
    }
    return $supported;
}

function task_select_sql(PDO $pdo): string
{
    $cols = [
        'id',
        'title',
        'kind',
        'priority',
        'status',
    ];

    if (task_supports_completed_at($pdo)) {
        $cols[] = 'completed_at';
    } else {
        $cols[] = 'NULL AS completed_at';
    }

    $cols[] = 'due_date';
    $cols[] = 'duration_minutes';

    if (task_supports_expected_cost($pdo)) {
        $cols[] = 'expected_cost_cents';
        $cols[] = 'expected_cost_currency';
    } else {
        $cols[] = 'NULL AS expected_cost_cents';
        $cols[] = 'NULL AS expected_cost_currency';
    }

    $cols[] = 'created_at';
    $cols[] = 'updated_at';

    return 'SELECT ' . implode(', ', $cols) . ' FROM tasks';
}

function task_parse_expected_cost(array $b, ?array $existing = null): array
{
    $hasCostKey = array_key_exists('expected_cost_cents', $b);
    $hasCurrencyKey = array_key_exists('expected_cost_currency', $b);

    if (!$hasCostKey && !$hasCurrencyKey) {
        return ['present' => false, 'cost' => null, 'currency' => null];
    }

    $rawCost = $hasCostKey ? $b['expected_cost_cents'] : ($existing['expected_cost_cents'] ?? null);
    $rawCurrency = $hasCurrencyKey ? $b['expected_cost_currency'] : ($existing['expected_cost_currency'] ?? null);

    if ($rawCost === null || $rawCost === '') {
        return ['present' => true, 'cost' => null, 'currency' => null];
    }

    $cost = v_int($rawCost, 1, 10_000_000);
    if ($cost === null) {
        json_error('Invalid expected_cost_cents', 422);
    }

    $currency = budget_app_currency();
    return ['present' => true, 'cost' => $cost, 'currency' => $currency];
}

function task_supports_completed_at(PDO $pdo): bool
{
    static $supported = null;
    if ($supported !== null) {
        return $supported;
    }
    try {
        $pdo->query('SELECT completed_at FROM tasks LIMIT 1');
        $supported = true;
    } catch (Throwable $e) {
        $supported = false;
    }
    return $supported;
}

function task_supports_expense_source_type(PDO $pdo): bool
{
    static $supported = null;
    if ($supported !== null) {
        return $supported;
    }
    try {
        $pdo->query('SELECT source_type FROM expenses LIMIT 1');
        $supported = true;
    } catch (Throwable $e) {
        $supported = false;
    }
    return $supported;
}

function task_sync_completion_expense(PDO $pdo, int $uid, ?array $task): void
{
    if (!$task) {
        return;
    }

    $taskId = isset($task['id']) ? (int)$task['id'] : 0;
    if ($taskId <= 0) {
        return;
    }

    $supportsSourceType = task_supports_expense_source_type($pdo);
    $sourceType = 'task_completion';
    $status = (string)($task['status'] ?? 'todo');
    $cost = isset($task['expected_cost_cents']) ? (int)$task['expected_cost_cents'] : 0;

    if ($status !== 'done' || $cost <= 0) {
        if ($supportsSourceType) {
            $del = $pdo->prepare('DELETE FROM expenses WHERE user_id = ? AND linked_task_id = ? AND source_type = ?');
            $del->execute([$uid, $taskId, $sourceType]);
        } else {
            $del = $pdo->prepare('DELETE FROM expenses WHERE user_id = ? AND linked_task_id = ?');
            $del->execute([$uid, $taskId]);
        }
        return;
    }

    $currency = budget_app_currency();
    $lifeArea = v_enum($task['kind'] ?? 'general', ['general', 'personal', 'study']) ?? 'general';
    $title = trim((string)($task['title'] ?? 'Task'));
    if ($title === '') {
        $title = 'Task';
    }

    $category = $lifeArea === 'study' ? 'Study task' : 'Personal task';
    $note = 'Auto-created from completed task: ' . $title;
    if (function_exists('mb_substr')) {
        $note = mb_substr($note, 0, 255, 'UTF-8');
    } else {
        $note = substr($note, 0, 255);
    }

    $expenseDate = today_ymd();
    $completedAt = isset($task['completed_at']) && is_string($task['completed_at']) ? trim((string)$task['completed_at']) : '';
    if ($completedAt !== '') {
        $expenseDate = substr(str_replace('T', ' ', $completedAt), 0, 10);
    }

    if ($supportsSourceType) {
        $st = $pdo->prepare('SELECT id FROM expenses WHERE user_id = ? AND linked_task_id = ? AND source_type = ? ORDER BY id DESC LIMIT 1');
        $st->execute([$uid, $taskId, $sourceType]);
    } else {
        $st = $pdo->prepare('SELECT id FROM expenses WHERE user_id = ? AND linked_task_id = ? ORDER BY id DESC LIMIT 1');
        $st->execute([$uid, $taskId]);
    }
    $existing = $st->fetch();

    $encAmount = crypto_encrypt_int($uid, $cost);
    $encCategory = crypto_encrypt_for_user($uid, $category);
    $encNote = crypto_encrypt_for_user($uid, $note);

    if ($existing && isset($existing['id'])) {
        if ($supportsSourceType) {
            $up = $pdo->prepare('UPDATE expenses SET amount_cents = ?, currency = ?, category = ?, expense_date = ?, note = ?, linked_task_id = ?, life_area = ? WHERE id = ? AND user_id = ? AND source_type = ?');
            $up->execute([$encAmount, $currency, $encCategory, $expenseDate, $encNote, $taskId, $lifeArea, (int)$existing['id'], $uid, $sourceType]);
        } else {
            $up = $pdo->prepare('UPDATE expenses SET amount_cents = ?, currency = ?, category = ?, expense_date = ?, note = ?, linked_task_id = ?, life_area = ? WHERE id = ? AND user_id = ?');
            $up->execute([$encAmount, $currency, $encCategory, $expenseDate, $encNote, $taskId, $lifeArea, (int)$existing['id'], $uid]);
        }
        return;
    }

    if ($supportsSourceType) {
        $ins = $pdo->prepare('INSERT INTO expenses (user_id, amount_cents, currency, category, expense_date, note, linked_task_id, life_area, source_type) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
        $ins->execute([$uid, $encAmount, $currency, $encCategory, $expenseDate, $encNote, $taskId, $lifeArea, $sourceType]);
    } else {
        $ins = $pdo->prepare('INSERT INTO expenses (user_id, amount_cents, currency, category, expense_date, note, linked_task_id, life_area) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
        $ins->execute([$uid, $encAmount, $currency, $encCategory, $expenseDate, $encNote, $taskId, $lifeArea]);
    }
}


function task_order_sql_for_today_plan(string $sort, string $today): string
{
    $todaySql = "'" . $today . "'";

    if ($sort === 'priority') {
        return " ORDER BY CASE WHEN status = 'done' THEN 1 ELSE 0 END ASC, "
            . "(priority='high') DESC, (priority='medium') DESC, "
            . "CASE WHEN due_date IS NULL THEN 1 ELSE 0 END ASC, due_date ASC, id DESC";
    }

    if ($sort === 'due') {
        return " ORDER BY CASE WHEN status = 'done' THEN 1 ELSE 0 END ASC, "
            . "CASE WHEN due_date IS NULL THEN 1 ELSE 0 END ASC, due_date ASC, "
            . "(priority='high') DESC, (priority='medium') DESC, id DESC";
    }

    if ($sort === 'newest') {
        return " ORDER BY CASE WHEN status = 'done' THEN 1 ELSE 0 END ASC, created_at DESC, id DESC";
    }

    return " ORDER BY "
        . "CASE "
        . "WHEN status = 'done' THEN 4 "
        . "WHEN due_date IS NOT NULL AND due_date < " . $todaySql . " THEN 0 "
        . "WHEN due_date = " . $todaySql . " THEN 1 "
        . "WHEN due_date IS NOT NULL AND due_date > " . $todaySql . " THEN 2 "
        . "ELSE 3 END, "
        . "(priority='high') DESC, (priority='medium') DESC, "
        . "CASE WHEN due_date IS NULL THEN 1 ELSE 0 END ASC, due_date ASC, id DESC";
}

if ($method === 'GET') {
    $status = v_enum($_GET['status'] ?? null, ['todo', 'done']);
    $kind = v_enum($_GET['kind'] ?? null, ['personal', 'study']);
    $priority = v_enum($_GET['priority'] ?? null, ['low', 'medium', 'high']);
    $tab = v_enum($_GET['tab'] ?? null, ['today', 'overdue', 'upcoming', 'all']);
    $panel = v_enum($_GET['panel'] ?? null, ['today_plan']);
    $sort = v_enum($_GET['sort'] ?? null, ['smart', 'priority', 'due', 'newest']) ?? 'smart';
    $includeDone = (string)($_GET['include_done'] ?? '0') === '1';
    $q = isset($_GET['q']) && is_string($_GET['q']) ? trim($_GET['q']) : '';
    $limit = v_int($_GET['limit'] ?? 200, 1, 200) ?? 200;
    $offset = v_int($_GET['offset'] ?? 0, 0, 2000) ?? 0;

    $today = today_ymd();

    if ($panel === 'today_plan') {
        $limit = min(50, max(1, $limit));
        $offset = max(0, $offset);

        $where = ['user_id = ?'];
        $params = [$uid];

        if (!$includeDone) {
            $where[] = "status = 'todo'";
        }
        if ($kind !== null) {
            $where[] = 'kind = ?';
            $params[] = $kind;
        }
        if ($priority !== null) {
            $where[] = 'priority = ?';
            $params[] = $priority;
        }

        $baseWhere = ' WHERE ' . implode(' AND ', $where);

        $countSt = $pdo->prepare('SELECT COUNT(*) AS c FROM tasks' . $baseWhere);
        $countSt->execute($params);
        $total = (int)(($countSt->fetch()['c'] ?? 0));

        $sql = task_select_sql($pdo) . $baseWhere . task_order_sql_for_today_plan($sort, $today)
            . ' LIMIT ' . (int)$limit . ' OFFSET ' . (int)$offset;
        $st = $pdo->prepare($sql);
        $st->execute($params);
        $rows = task_present_rows($pdo, $uid, $st->fetchAll());

        if ($q !== '') {
            $qq = function_exists('mb_strtolower') ? mb_strtolower($q, 'UTF-8') : strtolower($q);
            $rows = array_values(array_filter($rows, static function ($r) use ($qq): bool {
                $t = isset($r['title']) ? (function_exists('mb_strtolower') ? mb_strtolower((string)$r['title'], 'UTF-8') : strtolower((string)$r['title'])) : '';
                return $t !== '' && strpos($t, $qq) !== false;
            }));
            $total = count($rows);
            if ($offset > 0) {
                $rows = [];
            }
        }

        json_response([
            'ok' => true,
            'tasks' => $rows,
            'meta' => [
                'panel' => 'today_plan',
                'sort' => $sort,
                'include_done' => $includeDone,
                'offset' => $offset,
                'limit' => $limit,
                'total' => $total,
                'has_more' => ($offset + count($rows)) < $total,
            ],
        ]);
    }

    $sql = task_select_sql($pdo) . ' WHERE user_id = ?';
    $params = [$uid];

    if ($status !== null) {
        $sql .= ' AND status = ?';
        $params[] = $status;
    }
    if ($kind !== null) {
        $sql .= ' AND kind = ?';
        $params[] = $kind;
    }
    if ($priority !== null) {
        $sql .= ' AND priority = ?';
        $params[] = $priority;
    }

    if ($tab === 'today') {
        $sql .= ' AND due_date = ?';
        $params[] = $today;
    } elseif ($tab === 'overdue') {
        $sql .= " AND status = 'todo' AND due_date IS NOT NULL AND due_date < ?";
        $params[] = $today;
    } elseif ($tab === 'upcoming') {
        $sql .= " AND status = 'todo' AND due_date IS NOT NULL AND due_date > ?";
        $params[] = $today;
    }

    $dbLimit = min(1000, max(1, (int)$limit) * 5);
    $sql .= ' ORDER BY (due_date IS NULL) ASC, due_date ASC, id DESC LIMIT ' . (int)$dbLimit;

    $st = $pdo->prepare($sql);
    $st->execute($params);
    $rows = task_present_rows($pdo, $uid, $st->fetchAll());

    if ($q !== '') {
        $qq = function_exists('mb_strtolower') ? mb_strtolower($q, 'UTF-8') : strtolower($q);
        $rows = array_values(array_filter($rows, static function ($r) use ($qq): bool {
            $t = isset($r['title']) ? (function_exists('mb_strtolower') ? mb_strtolower((string)$r['title'], 'UTF-8') : strtolower((string)$r['title'])) : '';
            return $t !== '' && strpos($t, $qq) !== false;
        }));
    }

    if (count($rows) > (int)$limit) {
        $rows = array_slice($rows, 0, (int)$limit);
    }

    json_response(['ok' => true, 'tasks' => $rows]);
}

if ($method === 'POST') {
    csrf_require_or_fail();
    $b = json_body();

    $title = v_string($b['title'] ?? null, 1, 255);
    $kind = v_enum($b['kind'] ?? 'personal', ['personal', 'study']) ?? 'personal';
    $priority = v_enum($b['priority'] ?? 'medium', ['low', 'medium', 'high']) ?? 'medium';
    $status = v_enum($b['status'] ?? 'todo', ['todo', 'done']) ?? 'todo';
    $due = v_date_ymd($b['due_date'] ?? null);
    $dur = ($b['duration_minutes'] ?? null);
    $duration = ($dur === null || $dur === '') ? null : v_int($dur, 1, 24 * 60);
    $supportsExpectedCost = task_supports_expected_cost($pdo);
    $costInfo = task_parse_expected_cost($b);

    if ($title === null) {
        json_error('Invalid title', 422);
    }
    if (($dur !== null && $dur !== '' && $duration === null)) {
        json_error('Invalid duration_minutes', 422);
    }

    $completedAt = null;
    if ($status === 'done' && task_supports_completed_at($pdo)) {
        $completedAt = date('Y-m-d H:i:s');
    }

    $insertCols = ['user_id', 'title', 'kind', 'priority', 'status'];
    $insertVals = ['?', '?', '?', '?', '?'];
    $insertParams = [
        $uid,
        crypto_encrypt_for_user($uid, $title),
        $kind,
        $priority,
        $status,
    ];

    if (task_supports_completed_at($pdo)) {
        $insertCols[] = 'completed_at';
        $insertVals[] = '?';
        $insertParams[] = $completedAt;
    }

    $insertCols[] = 'due_date';
    $insertVals[] = '?';
    $insertParams[] = $due;

    $insertCols[] = 'duration_minutes';
    $insertVals[] = '?';
    $insertParams[] = $duration;

    if ($supportsExpectedCost) {
        $insertCols[] = 'expected_cost_cents';
        $insertVals[] = '?';
        $insertParams[] = $costInfo['cost'] === null ? null : crypto_encrypt_int($uid, $costInfo['cost']);

        $insertCols[] = 'expected_cost_currency';
        $insertVals[] = '?';
        $insertParams[] = $costInfo['currency'];
    }

    $st = $pdo->prepare('INSERT INTO tasks (' . implode(', ', $insertCols) . ') VALUES (' . implode(', ', $insertVals) . ')');
    $st->execute($insertParams);

    $id = (int)$pdo->lastInsertId();
    $get = $pdo->prepare(task_select_sql($pdo) . ' WHERE id = ? AND user_id = ?');
    $get->execute([$id, $uid]);
    $rows = task_present_rows($pdo, $uid, $get->fetchAll());
    $task = $rows[0] ?? null;
    task_sync_completion_expense($pdo, $uid, $task);

    json_response(['ok' => true, 'task' => $task], 201);
}

if ($method === 'PATCH') {
    csrf_require_or_fail();

    $id = v_int($_GET['id'] ?? null, 1, PHP_INT_MAX);
    if ($id === null) {
        json_error('Missing id', 422);
    }

    $b = json_body();

    $stExisting = $pdo->prepare(task_select_sql($pdo) . ' WHERE id = ? AND user_id = ?');
    $stExisting->execute([$id, $uid]);
    $tmpRows = task_present_rows($pdo, $uid, $stExisting->fetchAll());
    $existingRow = $tmpRows[0] ?? null;
    if (!$existingRow) {
        json_error('Not found', 404);
    }

    $fields = [];
    $params = [];

    if (array_key_exists('title', $b)) {
        $title = v_string($b['title'], 1, 255);
        if ($title === null) {
            json_error('Invalid title', 422);
        }
        $fields[] = 'title = ?';
        $params[] = crypto_encrypt_for_user($uid, $title);
    }

    if (array_key_exists('kind', $b)) {
        $kind = v_enum($b['kind'], ['personal', 'study']);
        if ($kind === null) {
            json_error('Invalid kind', 422);
        }
        $fields[] = 'kind = ?';
        $params[] = $kind;
    }

    if (array_key_exists('priority', $b)) {
        $priority = v_enum($b['priority'], ['low', 'medium', 'high']);
        if ($priority === null) {
            json_error('Invalid priority', 422);
        }
        $fields[] = 'priority = ?';
        $params[] = $priority;
    }

    if (array_key_exists('status', $b)) {
        $status = v_enum($b['status'], ['todo', 'done']);
        if ($status === null) {
            json_error('Invalid status', 422);
        }
        $fields[] = 'status = ?';
        $params[] = $status;
    }

    if (array_key_exists('status', $b) && task_supports_completed_at($pdo)) {
        $nextCompletedAt = $existingRow['completed_at'] ?? null;
        if ($status === 'done') {
            if ($existingRow['status'] !== 'done' || $nextCompletedAt === null || $nextCompletedAt === '') {
                $nextCompletedAt = date('Y-m-d H:i:s');
            }
        } else {
            $nextCompletedAt = null;
        }
        $fields[] = 'completed_at = ?';
        $params[] = $nextCompletedAt;
    }

    if (array_key_exists('due_date', $b)) {
        $due = v_date_ymd($b['due_date']);
        if ($b['due_date'] !== null && $b['due_date'] !== '' && $due === null) {
            json_error('Invalid due_date', 422);
        }
        $fields[] = 'due_date = ?';
        $params[] = $due;
    }

    if (array_key_exists('duration_minutes', $b)) {
        $dur = $b['duration_minutes'];
        $duration = ($dur === null || $dur === '') ? null : v_int($dur, 1, 24 * 60);
        if (($dur !== null && $dur !== '' && $duration === null)) {
            json_error('Invalid duration_minutes', 422);
        }
        $fields[] = 'duration_minutes = ?';
        $params[] = $duration;
    }

    $costInfo = task_parse_expected_cost($b, $existingRow);
    if ($costInfo['present'] && task_supports_expected_cost($pdo)) {
        $fields[] = 'expected_cost_cents = ?';
        $params[] = $costInfo['cost'] === null ? null : crypto_encrypt_int($uid, $costInfo['cost']);
        $fields[] = 'expected_cost_currency = ?';
        $params[] = $costInfo['currency'];
    }

    if (!$fields) {
        json_error('No fields to update', 422);
    }

    $params[] = $id;
    $params[] = $uid;

    $sql = 'UPDATE tasks SET ' . implode(', ', $fields) . ' WHERE id = ? AND user_id = ?';
    $st = $pdo->prepare($sql);
    $st->execute($params);

    $get = $pdo->prepare(task_select_sql($pdo) . ' WHERE id = ? AND user_id = ?');
    $get->execute([$id, $uid]);
    $rows = task_present_rows($pdo, $uid, $get->fetchAll());
    $task = $rows[0] ?? null;
    if (!$task) {
        json_error('Not found', 404);
    }

    task_sync_completion_expense($pdo, $uid, $task);

    json_response(['ok' => true, 'task' => $task]);
}

if ($method === 'DELETE') {
    csrf_require_or_fail();

    $id = v_int($_GET['id'] ?? null, 1, PHP_INT_MAX);
    if ($id === null) {
        json_error('Missing id', 422);
    }

    if (task_supports_expense_source_type($pdo)) {
        $delExpense = $pdo->prepare('DELETE FROM expenses WHERE user_id = ? AND linked_task_id = ? AND source_type = ?');
        $delExpense->execute([$uid, $id, 'task_completion']);
    }

    $st = $pdo->prepare('DELETE FROM tasks WHERE id = ? AND user_id = ?');
    $st->execute([$id, $uid]);

    json_response(['ok' => true]);
}

json_error('Method not allowed', 405);
