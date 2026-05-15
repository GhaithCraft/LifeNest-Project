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
$pdo = db();
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

function expense_fetch_linked_task(PDO $pdo, int $uid, ?int $taskId): ?array
{
    if ($taskId === null) return null;
    $st = $pdo->prepare('SELECT id, title, kind FROM tasks WHERE id = ? AND user_id = ? LIMIT 1');
    $st->execute([$taskId, $uid]);
    $row = $st->fetch();
    if (!$row) return null;
    $row['title'] = crypto_decrypt_for_user($uid, (string)($row['title'] ?? ''));
    return $row;
}

function expense_resolve_link(PDO $pdo, int $uid, mixed $taskRaw, mixed $lifeRaw, bool $allowNullTask = true): array
{
    $lifeArea = v_enum($lifeRaw, ['general', 'personal', 'study']) ?? 'general';

    if ($taskRaw === null || $taskRaw === '') {
        if (!$allowNullTask) {
            json_error('Invalid linked_task_id', 422);
        }
        return [null, $lifeArea, null];
    }

    $taskId = v_int($taskRaw, 1, PHP_INT_MAX);
    if ($taskId === null) {
        json_error('Invalid linked_task_id', 422);
    }

    $task = expense_fetch_linked_task($pdo, $uid, $taskId);
    if (!$task) {
        json_error('Linked task not found', 422);
    }

    $kind = (string)($task['kind'] ?? 'personal');
    if ($kind !== 'study' && $kind !== 'personal') {
        $kind = 'general';
    }

    return [$taskId, $kind, $task];
}

function expense_present_rows(PDO $pdo, int $uid, array $rows): array
{
    $needUpd = [];

    foreach ($rows as &$r) {
        $rawAmt = is_string($r['amount_cents'] ?? null) ? (string)$r['amount_cents'] : '';
        $rawCat = is_string($r['category'] ?? null) ? (string)$r['category'] : '';
        $rawNote = isset($r['note']) && is_string($r['note']) ? (string)$r['note'] : null;
        $rawLinkedTitle = is_string($r['linked_task_title'] ?? null) ? (string)$r['linked_task_title'] : '';

        $amt = crypto_decrypt_int($uid, $rawAmt, 0);
        $cat = crypto_decrypt_for_user($uid, $rawCat);
        $note = $rawNote === null ? null : crypto_decrypt_for_user($uid, $rawNote);

        $r['amount_cents'] = $amt;
        $r['category'] = $cat;
        $r['note'] = $note;
        $r['linked_task_id'] = isset($r['linked_task_id']) && $r['linked_task_id'] !== null ? (int)$r['linked_task_id'] : null;
        $r['life_area'] = v_enum($r['life_area'] ?? 'general', ['general', 'personal', 'study']) ?? 'general';
        $r['linked_task_title'] = $rawLinkedTitle !== '' ? crypto_decrypt_for_user($uid, $rawLinkedTitle) : null;
        if (($r['currency'] ?? '') !== budget_app_currency()) {
            $needUpd[(int)$r['id']]['currency'] = budget_app_currency();
        }
        $r['currency'] = budget_app_currency();
        if ($rawAmt !== '' && !crypto_is_encrypted($rawAmt)) {
            $needUpd[(int)$r['id']]['amount_cents'] = crypto_encrypt_int($uid, $amt);
        }
        if ($rawCat !== '' && !crypto_is_encrypted($rawCat)) {
            $needUpd[(int)$r['id']]['category'] = crypto_encrypt_for_user($uid, $cat);
        }
        if ($rawNote !== null && $rawNote !== '' && !crypto_is_encrypted($rawNote)) {
            $needUpd[(int)$r['id']]['note'] = crypto_encrypt_for_user($uid, (string)$note);
        }
    }
    unset($r);

    if ($needUpd) {
        foreach ($needUpd as $id => $cols) {
            $fields = [];
            $params = [];
            foreach ($cols as $k => $v) {
                $fields[] = $k . ' = ?';
                $params[] = $v;
            }
            if (!$fields) continue;
            $params[] = $id;
            $params[] = $uid;
            $stUp = $pdo->prepare('UPDATE expenses SET ' . implode(', ', $fields) . ' WHERE id = ? AND user_id = ?');
            $stUp->execute($params);
        }
    }

    return $rows;
}

if ($method === 'GET') {
    $limit = v_int($_GET['limit'] ?? 20, 1, 200) ?? 20;
    $month = v_month_ym($_GET['month'] ?? null);
    $from = v_date_ymd($_GET['from'] ?? null);
    $to = v_date_ymd($_GET['to'] ?? null);

    $sql = 'SELECT e.id, e.amount_cents, e.currency, e.category, e.expense_date, e.note, e.created_at, e.linked_task_id, e.life_area, t.title AS linked_task_title FROM expenses e LEFT JOIN tasks t ON t.id = e.linked_task_id AND t.user_id = e.user_id WHERE e.user_id = ?';
    $params = [$uid];

    if ($month !== null) {
        [$start, $next] = month_range_ym($month);
        $sql .= ' AND e.expense_date >= ? AND e.expense_date < ?';
        $params[] = $start;
        $params[] = $next;
    } else {
        if ($from !== null) {
            $sql .= ' AND e.expense_date >= ?';
            $params[] = $from;
        }
        if ($to !== null) {
            $dt = new DateTimeImmutable($to);
            $next = $dt->modify('+1 day')->format('Y-m-d');
            $sql .= ' AND e.expense_date < ?';
            $params[] = $next;
        }
    }

    $sql .= ' ORDER BY e.expense_date DESC, e.id DESC LIMIT ' . (int)$limit;

    $st = $pdo->prepare($sql);
    $st->execute($params);
    $rows = expense_present_rows($pdo, $uid, $st->fetchAll());
    json_response(['ok' => true, 'expenses' => $rows]);
}

if ($method === 'POST') {
    csrf_require_or_fail();
    $b = json_body();

    $amount = v_int($b['amount_cents'] ?? null, 1, 10_000_000);
    $currency = budget_app_currency();
    $category = v_string($b['category'] ?? null, 1, 60);
    $date = v_date_ymd($b['expense_date'] ?? null);
    $note = v_string($b['note'] ?? null, 0, 255);

    if ($amount === null || $category === null || $date === null) {
        json_error('Invalid expense payload', 422);
    }

    [$linkedTaskId, $lifeArea] = expense_resolve_link($pdo, $uid, $b['linked_task_id'] ?? null, $b['life_area'] ?? 'general');

    $st = $pdo->prepare('INSERT INTO expenses (user_id, amount_cents, currency, category, expense_date, note, linked_task_id, life_area) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
    $st->execute([
        $uid,
        crypto_encrypt_int($uid, $amount),
        $currency,
        crypto_encrypt_for_user($uid, $category),
        $date,
        ($note === '' || $note === null) ? null : crypto_encrypt_for_user($uid, $note),
        $linkedTaskId,
        $lifeArea,
    ]);

    $id = (int)$pdo->lastInsertId();
    $get = $pdo->prepare('SELECT e.id, e.amount_cents, e.currency, e.category, e.expense_date, e.note, e.created_at, e.linked_task_id, e.life_area, t.title AS linked_task_title FROM expenses e LEFT JOIN tasks t ON t.id = e.linked_task_id AND t.user_id = e.user_id WHERE e.id = ? AND e.user_id = ?');
    $get->execute([$id, $uid]);
    $rows = expense_present_rows($pdo, $uid, $get->fetchAll());
    $row = $rows[0] ?? null;
    json_response(['ok' => true, 'expense' => $row], 201);
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

    if (array_key_exists('amount_cents', $b)) {
        $amount = v_int($b['amount_cents'], 1, 10_000_000);
        if ($amount === null) {
            json_error('Invalid amount_cents', 422);
        }
        $fields[] = 'amount_cents = ?';
        $params[] = crypto_encrypt_int($uid, $amount);
    }

    if (array_key_exists('currency', $b)) {
        $fields[] = 'currency = ?';
        $params[] = budget_app_currency();
    }

    if (array_key_exists('category', $b)) {
        $category = v_string($b['category'], 1, 60);
        if ($category === null) {
            json_error('Invalid category', 422);
        }
        $fields[] = 'category = ?';
        $params[] = crypto_encrypt_for_user($uid, $category);
    }

    if (array_key_exists('expense_date', $b)) {
        $date = v_date_ymd($b['expense_date']);
        if ($b['expense_date'] !== null && $b['expense_date'] !== '' && $date === null) {
            json_error('Invalid expense_date', 422);
        }
        $fields[] = 'expense_date = ?';
        $params[] = $date;
    }

    if (array_key_exists('note', $b)) {
        $note = v_string($b['note'], 0, 255);
        if ($note === null) {
            json_error('Invalid note', 422);
        }
        $fields[] = 'note = ?';
        $params[] = ($note === '' ? null : crypto_encrypt_for_user($uid, $note));
    }

    if (array_key_exists('linked_task_id', $b) || array_key_exists('life_area', $b)) {
        [$linkedTaskId, $lifeArea] = expense_resolve_link($pdo, $uid, $b['linked_task_id'] ?? null, $b['life_area'] ?? 'general');
        $fields[] = 'linked_task_id = ?';
        $params[] = $linkedTaskId;
        $fields[] = 'life_area = ?';
        $params[] = $lifeArea;
    }

    if (!$fields) {
        json_error('No fields to update', 422);
    }

    $params[] = $id;
    $params[] = $uid;

    $sql = 'UPDATE expenses SET ' . implode(', ', $fields) . ' WHERE id = ? AND user_id = ?';
    $st = $pdo->prepare($sql);
    $st->execute($params);

    $get = $pdo->prepare('SELECT e.id, e.amount_cents, e.currency, e.category, e.expense_date, e.note, e.created_at, e.linked_task_id, e.life_area, t.title AS linked_task_title FROM expenses e LEFT JOIN tasks t ON t.id = e.linked_task_id AND t.user_id = e.user_id WHERE e.id = ? AND e.user_id = ?');
    $get->execute([$id, $uid]);
    $rows = expense_present_rows($pdo, $uid, $get->fetchAll());
    $row = $rows[0] ?? null;
    if (!$row) {
        json_error('Not found', 404);
    }

    json_response(['ok' => true, 'expense' => $row]);
}

if ($method === 'DELETE') {
    csrf_require_or_fail();
    $id = v_int($_GET['id'] ?? null, 1, PHP_INT_MAX);
    if ($id === null) {
        json_error('Missing id', 422);
    }

    $st = $pdo->prepare('DELETE FROM expenses WHERE id = ? AND user_id = ?');
    $st->execute([$id, $uid]);
    json_response(['ok' => true]);
}

json_error('Method not allowed', 405);
