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
$today = today_ymd();

$override = v_date_ymd($_GET['week_start'] ?? null);
if ($override !== null) {
    $wStart = $override;
    $wNext = (new DateTimeImmutable($wStart))->modify('+7 days')->format('Y-m-d');
}

$st = $pdo->prepare("SELECT COUNT(*) FROM tasks WHERE user_id = ? AND status = 'todo' AND due_date IS NOT NULL AND due_date < ?");
$st->execute([$uid, $today]);
$overdueOpen = (int)$st->fetchColumn();

$st = $pdo->prepare("SELECT kind, COUNT(*) AS c FROM tasks WHERE user_id = ? AND status = 'todo' AND due_date IS NOT NULL AND due_date < ? GROUP BY kind");
$st->execute([$uid, $today]);
$overdueByKind = ['personal' => 0, 'study' => 0];
foreach ($st->fetchAll() as $r) {
    $kind = (string)($r['kind'] ?? '');
    if (isset($overdueByKind[$kind])) {
        $overdueByKind[$kind] = (int)($r['c'] ?? 0);
    }
}

$latestByTask = [];
$postponedOpen = 0;
$completedByKind = ['personal' => 0, 'study' => 0];
$startedCount = 0;

$st = $pdo->prepare('SELECT l.task_id, l.action, l.happened_at, t.kind, t.status FROM task_activity_logs l INNER JOIN tasks t ON t.id = l.task_id WHERE l.user_id = ? AND l.happened_at >= ? AND l.happened_at < ? ORDER BY l.happened_at DESC, l.id DESC');
$st->execute([$uid, $wStart . ' 00:00:00', $wNext . ' 00:00:00']);
foreach ($st->fetchAll() as $r) {
    $taskId = (string)($r['task_id'] ?? '');
    $action = (string)($r['action'] ?? '');
    $kind = (string)($r['kind'] ?? '');
    $status = (string)($r['status'] ?? '');
    if ($taskId === '') continue;
    if (!isset($latestByTask[$taskId])) {
        $latestByTask[$taskId] = [
            'action' => $action,
            'status' => $status,
            'kind' => $kind,
            'happened_at' => (string)($r['happened_at'] ?? '')
        ];
    }
    if ($action === 'started') $startedCount++;
    if ($action === 'completed' && isset($completedByKind[$kind])) $completedByKind[$kind] += 1;
}
foreach ($latestByTask as $info) {
    if (($info['action'] ?? '') === 'postponed' && ($info['status'] ?? '') === 'todo') {
        $postponedOpen++;
    }
}
$carryOver = $overdueOpen + $postponedOpen;

$weekSpent = 0;
$weekTopSpendCat = '';
$weekTopSpendCents = 0;
$currency = budget_app_currency();
$agg = [];
$st = $pdo->prepare('SELECT amount_cents, currency, category FROM expenses WHERE user_id = ? AND expense_date >= ? AND expense_date < ?');
$st->execute([$uid, $wStart, $wNext]);
foreach ($st->fetchAll() as $r) {
    $rawAmt = is_string($r['amount_cents'] ?? null) ? (string)$r['amount_cents'] : '0';
    $rawCat = is_string($r['category'] ?? null) ? (string)$r['category'] : '';
    $currency = budget_app_currency();
    $amt = crypto_decrypt_int($uid, $rawAmt, 0);
    $cat = trim(crypto_decrypt_for_user($uid, $rawCat));
    $weekSpent += $amt;
    if ($cat !== '') {
        if (!isset($agg[$cat])) $agg[$cat] = 0;
        $agg[$cat] += $amt;
    }
}
if ($agg) {
    arsort($agg);
    $weekTopSpendCat = (string)array_key_first($agg);
    $weekTopSpendCents = (int)$agg[$weekTopSpendCat];
}

$month = $now->format('Y-m');
[$mStart, $mNext] = month_range_ym($month);
$budgetCents = 0;
$monthSpent = 0;
$daysInMonth = days_in_month_ym($month);
$dayNum = (int)$now->format('j');
$daysLeft = max(1, $daysInMonth - $dayNum + 1);

$st = $pdo->prepare('SELECT amount_cents FROM budgets WHERE user_id = ? AND month = ?');
$st->execute([$uid, $month]);
$row = $st->fetch();
if ($row) {
    $raw = is_string($row['amount_cents'] ?? null) ? (string)$row['amount_cents'] : '0';
    $budgetCents = crypto_decrypt_int($uid, $raw, 0);
}

$st = $pdo->prepare('SELECT amount_cents FROM expenses WHERE user_id = ? AND expense_date >= ? AND expense_date < ?');
$st->execute([$uid, $mStart, $mNext]);
foreach ($st->fetchAll() as $r) {
    $raw = is_string($r['amount_cents'] ?? null) ? (string)$r['amount_cents'] : '0';
    $monthSpent += crypto_decrypt_int($uid, $raw, 0);
}

$remaining = max(0, $budgetCents - $monthSpent);
$safeDailyAllowance = $daysLeft > 0 ? (int)floor($remaining / $daysLeft) : 0;
$avgDailySpent = $dayNum > 0 ? (int)floor($monthSpent / $dayNum) : 0;
$budgetPressure = 'safe';
if ($budgetCents > 0 && $remaining <= 0) {
    $budgetPressure = 'critical';
} elseif ($budgetCents > 0 && $avgDailySpent > $safeDailyAllowance && $safeDailyAllowance > 0) {
    $budgetPressure = 'warning';
}

$mode = 'balanced';
if ($budgetPressure === 'critical' || $carryOver >= 4 || $overdueOpen >= 3) {
    $mode = 'rescue';
} elseif ($budgetPressure === 'warning' || $postponedOpen >= 2 || $carryOver >= 2) {
    $mode = 'caution';
}

$recommendedFocusKind = 'mixed';
if ($overdueByKind['study'] > $overdueByKind['personal']) {
    $recommendedFocusKind = 'study';
} elseif ($overdueByKind['personal'] > $overdueByKind['study']) {
    $recommendedFocusKind = 'personal';
} elseif ($completedByKind['study'] === 0 && $completedByKind['personal'] > 0) {
    $recommendedFocusKind = 'study';
} elseif ($completedByKind['personal'] === 0 && $completedByKind['study'] > 0) {
    $recommendedFocusKind = 'personal';
}

$recommendedMaxAuto = 4;
if ($mode === 'rescue') {
    $recommendedMaxAuto = 2;
} elseif ($mode === 'caution') {
    $recommendedMaxAuto = 3;
}

$insights = [];
if ($overdueOpen > 0) {
    $dominantKind = $overdueByKind['study'] > $overdueByKind['personal'] ? 'Study' : 'Personal tasks';
    $insights[] = 'Start with the highest-priority overdue task first, because the current backlog is putting more pressure on ' . $dominantKind . '.';
}
if ($postponedOpen >= 2) {
    $insights[] = 'Postponement repeated this week; lighten the next day’s load and leave more time buffer instead of filling the entire day.';
}
if ($budgetPressure === 'critical') {
    $insights[] = 'The budget has entered a critical zone; freeze non-essential spending and begin with tasks that do not require cost.';
} elseif ($budgetPressure === 'warning') {
    $insights[] = 'Daily spending is above the safe threshold; review the "' . ($weekTopSpendCat !== '' ? $weekTopSpendCat : 'Expenses') . '" category before the rest of the month.';
}
if ($completedByKind['study'] === 0 && $completedByKind['personal'] > 0) {
    $insights[] = 'You completed more personal work than study work this week; dedicate tomorrow’s first focus block to study before anything else.';
} elseif ($completedByKind['study'] > $completedByKind['personal'] && $completedByKind['personal'] === 0) {
    $insights[] = 'Study pressure is clear; add a short block for personal tasks so they do not quietly pile up.';
}
if (!$insights) {
    $insights[] = 'The week is balanced so far; keep the same rhythm and do not change the plan unless there is a real conflict.';
}
$insights = array_slice($insights, 0, 4);
$primaryDecision = $insights[0] ?? 'Keep the current pace.';

json_response([
    'ok' => true,
    'week_start' => $wStart,
    'week_next' => $wNext,
    'latest_by_task' => $latestByTask,
    'summary' => [
        'overdue_open' => $overdueOpen,
        'postponed_open' => $postponedOpen,
        'carry_over' => $carryOver,
        'started_count' => $startedCount,
        'completed_study' => $completedByKind['study'],
        'completed_personal' => $completedByKind['personal'],
        'overdue_study' => $overdueByKind['study'],
        'overdue_personal' => $overdueByKind['personal'],
        'top_spend_category' => $weekTopSpendCat,
        'top_spend_cents' => $weekTopSpendCents,
        'week_spent_cents' => $weekSpent,
        'currency' => $currency,
        'budget_pressure' => $budgetPressure,
        'mode' => $mode,
        'recommended_focus_kind' => $recommendedFocusKind,
        'recommended_max_auto' => $recommendedMaxAuto,
        'safe_daily_allowance_cents' => $safeDailyAllowance,
        'avg_daily_spent_cents' => $avgDailySpent,
    ],
    'decision' => $primaryDecision,
    'insights' => $insights,
]);
