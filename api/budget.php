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

if ($method === 'GET') {
    $month = v_month_ym($_GET['month'] ?? (new DateTimeImmutable('now'))->format('Y-m'));
    if ($month === null) {
        json_error('Invalid month', 422);
    }

    [$start, $next] = month_range_ym($month);

    $budgetCtx = budget_fetch_context($pdo, $uid, $month);
    $budgetCents = (int)($budgetCtx['budget_cents'] ?? 0);
    $currency = budget_normalize_currency($budgetCtx['currency'] ?? null, budget_app_currency());
    $hasBudget = !empty($budgetCtx['has_budget']);
    $remembered = is_array($budgetCtx['remembered'] ?? null) ? $budgetCtx['remembered'] : null;

    // amount_cents is encrypted, so aggregate in PHP.
    $sum = $pdo->prepare('SELECT amount_cents FROM expenses WHERE user_id = ? AND expense_date >= ? AND expense_date < ?');
    $sum->execute([$uid, $start, $next]);
    $spentCents = 0;
    foreach ($sum->fetchAll() as $r) {
        $raw = is_string($r['amount_cents'] ?? null) ? (string)$r['amount_cents'] : '0';
        $spentCents += crypto_decrypt_int($uid, $raw, 0);
    }

    $remaining = max(0, $budgetCents - $spentCents);

    $now = dt_now();
    $daysLeft = days_left_in_month($month, $now);
    $dailyAllowance = $daysLeft > 0 ? (int)floor($remaining / $daysLeft) : 0;
    $daysInMonth = days_in_month_ym($month);

    json_response([
        'ok' => true,
        'month' => $month,
        'currency' => $currency,
        'budget_cents' => $budgetCents,
        'spent_cents' => $spentCents,
        'remaining_cents' => $remaining,
        'days_in_month' => $daysInMonth,
        'days_left' => $daysLeft,
        'daily_allowance_cents' => $dailyAllowance,
        'has_budget' => $hasBudget,
        'remembered' => $remembered,
    ]);
}

if ($method === 'POST') {
    csrf_require_or_fail();

    $b = json_body();
    $month = v_month_ym($b['month'] ?? null);
    $amount = v_int($b['amount_cents'] ?? null, 0, 100_000_000);
    $currency = budget_app_currency();

    if ($month === null || $amount === null) {
        json_error('Invalid budget payload', 422);
    }

    $st = $pdo->prepare(
        'INSERT INTO budgets (user_id, month, amount_cents, currency) VALUES (?, ?, ?, ?) '
        . 'ON DUPLICATE KEY UPDATE amount_cents = VALUES(amount_cents), currency = VALUES(currency)'
    );
    $st->execute([$uid, $month, crypto_encrypt_int($uid, $amount), $currency]);

    json_response(['ok' => true]);
}

json_error('Method not allowed', 405);
