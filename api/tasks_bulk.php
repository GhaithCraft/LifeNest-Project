<?php
declare(strict_types=1);

require_once __DIR__ . '/../includes/api_init.php';
require_once __DIR__ . '/../includes/db.php';
require_once __DIR__ . '/../includes/auth.php';
require_once __DIR__ . '/../includes/validate.php';
require_once __DIR__ . '/../includes/csrf.php';
require_once __DIR__ . '/../includes/crypto.php';
require_once __DIR__ . '/../includes/budget_defaults.php';

$uid = require_login();
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

if ($method !== 'POST') {
    json_error('Method not allowed', 405);
}

csrf_require_or_fail();

const TASK_BULK_CURRENCIES = ['TRY'];

function tb_supports_completed_at(PDO $pdo): bool
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

function tb_supports_expected_cost(PDO $pdo): bool
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

function tb_supports_expense_source_type(PDO $pdo): bool
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

function tb_select_sql(PDO $pdo): string
{
    $cols = [
        'id',
        'title',
        'kind',
        'priority',
        'status',
    ];

    if (tb_supports_completed_at($pdo)) {
        $cols[] = 'completed_at';
    } else {
        $cols[] = 'NULL AS completed_at';
    }

    if (tb_supports_expected_cost($pdo)) {
        $cols[] = 'expected_cost_cents';
        $cols[] = 'expected_cost_currency';
    } else {
        $cols[] = 'NULL AS expected_cost_cents';
        $cols[] = 'NULL AS expected_cost_currency';
    }

    return 'SELECT ' . implode(', ', $cols) . ' FROM tasks';
}

function tb_present_rows(PDO $pdo, int $uid, array $rows): array
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

        $currency = v_enum($r['expected_cost_currency'] ?? null, TASK_BULK_CURRENCIES);
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
                // keep bulk resilient
            }
        }
    }

    return $rows;
}

function tb_sync_completion_expense(PDO $pdo, int $uid, ?array $task): void
{
    if (!$task) {
        return;
    }

    $taskId = isset($task['id']) ? (int)$task['id'] : 0;
    if ($taskId <= 0) {
        return;
    }

    $supportsSourceType = tb_supports_expense_source_type($pdo);
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

    $expenseDate = date('Y-m-d');
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

function tb_fetch_tasks_by_ids(PDO $pdo, int $uid, array $ids): array
{
    if (!$ids) return [];
    $ph = implode(',', array_fill(0, count($ids), '?'));
    $sql = tb_select_sql($pdo) . " WHERE user_id = ? AND id IN ($ph)";
    $params = array_merge([$uid], $ids);
    $st = $pdo->prepare($sql);
    $st->execute($params);
    return tb_present_rows($pdo, $uid, $st->fetchAll());
}

$b = json_body();
$action = v_enum($b['action'] ?? null, ['done', 'todo', 'priority', 'delete']);
if ($action === null) {
    json_error('Invalid action', 422);
}

$idsRaw = $b['ids'] ?? null;
if (!is_array($idsRaw)) {
    json_error('Invalid ids', 422);
}

$ids = [];
$seen = [];
foreach ($idsRaw as $x) {
    $n = v_int($x, 1, PHP_INT_MAX);
    if ($n === null || isset($seen[$n])) {
        continue;
    }
    $seen[$n] = true;
    $ids[] = $n;
    if (count($ids) >= 200) {
        break;
    }
}

if (!$ids) {
    json_error('No valid ids', 422);
}

$pdo = db();
$ph = implode(',', array_fill(0, count($ids), '?'));

if ($action === 'done' || $action === 'todo') {
    $status = ($action === 'done') ? 'done' : 'todo';

    $pdo->beginTransaction();
    try {
        if (tb_supports_completed_at($pdo)) {
            if ($status === 'done') {
                $sql = "UPDATE tasks SET status = ?, completed_at = CASE WHEN status <> 'done' OR completed_at IS NULL OR completed_at = '' THEN NOW() ELSE completed_at END WHERE user_id = ? AND id IN ($ph)";
            } else {
                $sql = "UPDATE tasks SET status = ?, completed_at = NULL WHERE user_id = ? AND id IN ($ph)";
            }
        } else {
            $sql = "UPDATE tasks SET status = ? WHERE user_id = ? AND id IN ($ph)";
        }

        $params = array_merge([$status, $uid], $ids);
        $st = $pdo->prepare($sql);
        $st->execute($params);

        $tasks = tb_fetch_tasks_by_ids($pdo, $uid, $ids);
        foreach ($tasks as $task) {
            tb_sync_completion_expense($pdo, $uid, is_array($task) ? $task : null);
        }

        $pdo->commit();
        json_response(['ok' => true]);
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        throw $e;
    }
}

if ($action === 'priority') {
    $priority = v_enum($b['priority'] ?? null, ['low', 'medium', 'high']);
    if ($priority === null) {
        json_error('Invalid priority', 422);
    }
    $sql = "UPDATE tasks SET priority = ? WHERE user_id = ? AND id IN ($ph)";
    $params = array_merge([$priority, $uid], $ids);
    $st = $pdo->prepare($sql);
    $st->execute($params);
    json_response(['ok' => true]);
}

$pdo->beginTransaction();
try {
    if (tb_supports_expense_source_type($pdo)) {
        $delExpense = $pdo->prepare("DELETE FROM expenses WHERE user_id = ? AND linked_task_id IN ($ph) AND source_type = ?");
        $delExpense->execute(array_merge([$uid], $ids, ['task_completion']));
    } else {
        $delExpense = $pdo->prepare("DELETE FROM expenses WHERE user_id = ? AND linked_task_id IN ($ph)");
        $delExpense->execute(array_merge([$uid], $ids));
    }

    $sql = "DELETE FROM tasks WHERE user_id = ? AND id IN ($ph)";
    $params = array_merge([$uid], $ids);
    $st = $pdo->prepare($sql);
    $st->execute($params);

    $pdo->commit();
    json_response(['ok' => true]);
} catch (Throwable $e) {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }
    throw $e;
}
