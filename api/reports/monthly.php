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
$month = v_month_ym($_GET['month'] ?? $now->format('Y-m'));
if ($month === null) {
    json_error('Invalid month', 422);
}

[$start, $next] = month_range_ym($month);

$st = $pdo->prepare('SELECT amount_cents, currency FROM budgets WHERE user_id = ? AND month = ?');
$st->execute([$uid, $month]);
$b = $st->fetch();

$budgetCents = 0;
$currency = budget_app_currency();
if ($b) {
    $rawAmt = is_string($b['amount_cents'] ?? null) ? (string)$b['amount_cents'] : '0';
    $budgetCents = crypto_decrypt_int($uid, $rawAmt, 0);
    $currency = budget_app_currency();

    if ($rawAmt !== '' && !crypto_is_encrypted($rawAmt)) {
        $up = $pdo->prepare('UPDATE budgets SET amount_cents = ? WHERE user_id = ? AND month = ?');
        $up->execute([crypto_encrypt_int($uid, $budgetCents), $uid, $month]);
    }
}

$last = $pdo->prepare('SELECT id, amount_cents, currency, category, expense_date, note FROM expenses WHERE user_id = ? AND expense_date >= ? AND expense_date < ? ORDER BY expense_date DESC, id DESC LIMIT 2000');
$last->execute([$uid, $start, $next]);
$all = $last->fetchAll();

$spentCents = 0;
$agg = [];
foreach ($all as &$r) {
    $rawAmt = is_string($r['amount_cents'] ?? null) ? (string)$r['amount_cents'] : '0';
    $rawCat = is_string($r['category'] ?? null) ? (string)$r['category'] : '';
    $rawNote = isset($r['note']) && $r['note'] !== null && is_string($r['note']) ? (string)$r['note'] : null;

    $amt = crypto_decrypt_int($uid, $rawAmt, 0);
    $cat = trim(crypto_decrypt_for_user($uid, $rawCat));
    $note = $rawNote === null ? null : crypto_decrypt_for_user($uid, $rawNote);

    $r['amount_cents'] = $amt;
    $r['category'] = $cat;
    $r['note'] = $note;
    $r['currency'] = budget_app_currency();

    $spentCents += $amt;
    if ($cat !== '') {
        if (!isset($agg[$cat])) $agg[$cat] = 0;
        $agg[$cat] += $amt;
    }
}
unset($r);

$remaining = max(0, $budgetCents - $spentCents);

arsort($agg);
$byCat = [];
$top = array_slice($agg, 0, 12, true);
foreach ($top as $cat => $c) {
    $byCat[] = ['category' => $cat, 'c' => (int)$c];
}

$expenses = array_slice($all, 0, 50);

$act = [
    'started' => [],
    'completed' => [],
    'postponed' => [],
];
$st = $pdo->prepare(
    'SELECT task_id, action FROM task_activity_logs WHERE user_id = ? AND happened_at >= ? AND happened_at < ? ORDER BY happened_at DESC, id DESC'
);
$st->execute([$uid, $start . ' 00:00:00', $next . ' 00:00:00']);
foreach ($st->fetchAll() as $r) {
    $taskId = (string)($r['task_id'] ?? '');
    $action = (string)($r['action'] ?? '');
    if ($taskId === '' || !isset($act[$action])) {
        continue;
    }
    $act[$action][$taskId] = true;
}

json_response([
    'ok' => true,
    'month' => $month,
    'range' => ['start' => $start, 'next' => $next],
    'budget' => [
        'currency' => $currency,
        'budget_cents' => $budgetCents,
        'spent_cents' => $spentCents,
        'remaining_cents' => $remaining,
        'days_in_month' => days_in_month_ym($month),
    ],
    'expenses' => [
        'items' => $expenses,
        'by_category' => $byCat,
    ],
    'execution' => [
        'started' => count($act['started']),
        'completed' => count($act['completed']),
        'postponed' => count($act['postponed']),
    ],
]);
