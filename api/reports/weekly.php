<?php
declare(strict_types=1);

require_once __DIR__ . '/../../includes/api_init.php';
require_once __DIR__ . '/../../includes/db.php';
require_once __DIR__ . '/../../includes/auth.php';
require_once __DIR__ . '/../../includes/validate.php';
require_once __DIR__ . '/../../includes/date_utils.php';
require_once __DIR__ . '/../../includes/crypto.php';
require_once __DIR__ . '/../../includes/budget_defaults.php';

$uid = require_login();
$pdo = db();

$now = dt_now();
[$wStart, $wNext] = week_range($now);

$override = v_date_ymd($_GET['week_start'] ?? null);
if ($override !== null) {
    $wStart = $override;
    $wNext = (new DateTimeImmutable($wStart))->modify('+7 days')->format('Y-m-d');
}

$st = $pdo->prepare(
    "SELECT status, COUNT(*) AS c FROM tasks WHERE user_id = ? AND due_date IS NOT NULL AND due_date >= ? AND due_date < ? GROUP BY status"
);
$st->execute([$uid, $wStart, $wNext]);
$wk = ['todo' => 0, 'done' => 0];
foreach ($st->fetchAll() as $r) {
    $s = (string)($r['status'] ?? '');
    if (isset($wk[$s])) {
        $wk[$s] = (int)($r['c'] ?? 0);
    }
}
$total = $wk['todo'] + $wk['done'];
$pct = $total > 0 ? (int)round(($wk['done'] / $total) * 100) : 0;

$daily = array_fill(0, 7, 0);
$byDay = [];
$st = $pdo->prepare(
    "SELECT due_date, status, COUNT(*) AS c FROM tasks WHERE user_id = ? AND due_date IS NOT NULL AND due_date >= ? AND due_date < ? GROUP BY due_date, status"
);
$st->execute([$uid, $wStart, $wNext]);
foreach ($st->fetchAll() as $r) {
    $d = (string)($r['due_date'] ?? '');
    $s = (string)($r['status'] ?? '');
    if ($d === '' || ($s !== 'todo' && $s !== 'done')) {
        continue;
    }
    if (!isset($byDay[$d])) {
        $byDay[$d] = ['todo' => 0, 'done' => 0];
    }
    $byDay[$d][$s] = (int)($r['c'] ?? 0);
}

$dt = new DateTimeImmutable($wStart);
for ($i = 0; $i < 7; $i++) {
    $d = $dt->modify('+' . $i . ' days')->format('Y-m-d');
    $row = $byDay[$d] ?? ['todo' => 0, 'done' => 0];
    $t = (int)$row['todo'] + (int)$row['done'];
    $daily[$i] = $t > 0 ? (int)round(((int)$row['done'] / $t) * 100) : 0;
}

$act = [
    'started' => [],
    'completed' => [],
    'postponed' => [],
];
$st = $pdo->prepare(
    'SELECT task_id, action FROM task_activity_logs WHERE user_id = ? AND happened_at >= ? AND happened_at < ? ORDER BY happened_at DESC, id DESC'
);
$st->execute([$uid, $wStart . ' 00:00:00', $wNext . ' 00:00:00']);
foreach ($st->fetchAll() as $r) {
    $taskId = (string)($r['task_id'] ?? '');
    $action = (string)($r['action'] ?? '');
    if ($taskId === '' || !isset($act[$action])) {
        continue;
    }
    $act[$action][$taskId] = true;
}

$st = $pdo->prepare('SELECT amount_cents, currency, category FROM expenses WHERE user_id = ? AND expense_date >= ? AND expense_date < ?');
$st->execute([$uid, $wStart, $wNext]);

$spentCents = 0;
$currency = budget_app_currency();
$agg = [];
foreach ($st->fetchAll() as $r) {
    $rawAmt = is_string($r['amount_cents'] ?? null) ? (string)$r['amount_cents'] : '0';
    $rawCat = is_string($r['category'] ?? null) ? (string)$r['category'] : '';
    $currency = budget_app_currency();

    $amt = crypto_decrypt_int($uid, $rawAmt, 0);
    $cat = trim(crypto_decrypt_for_user($uid, $rawCat));

    $spentCents += $amt;
    if ($cat !== '') {
        if (!isset($agg[$cat])) $agg[$cat] = 0;
        $agg[$cat] += $amt;
    }
}

arsort($agg);
$byCat = [];
$top = array_slice($agg, 0, 8, true);
foreach ($top as $cat => $c) {
    $byCat[] = ['category' => $cat, 'c' => (int)$c];
}

json_response([
    'ok' => true,
    'week_start' => $wStart,
    'week_next' => $wNext,
    'tasks' => [
        'total' => $total,
        'done' => $wk['done'],
        'percent' => $pct,
        'daily_series' => $daily,
    ],
    'expenses' => [
        'currency' => $currency,
        'spent_cents' => $spentCents,
        'by_category' => $byCat,
    ],
    'execution' => [
        'started' => count($act['started']),
        'completed' => count($act['completed']),
        'postponed' => count($act['postponed']),
    ],
]);
