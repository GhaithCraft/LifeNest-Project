<?php
declare(strict_types=1);

require_once __DIR__ . '/../includes/api_init.php';
require_once __DIR__ . '/../includes/db.php';
require_once __DIR__ . '/../includes/auth.php';
require_once __DIR__ . '/../includes/date_utils.php';
require_once __DIR__ . '/../includes/crypto.php';
require_once __DIR__ . '/../includes/budget_defaults.php';

$uid = require_login();
$pdo = db();

$warnings = [];

/**
 * Run a dashboard sub-block safely.
 * - keeps the endpoint returning ok=true even if a single subquery fails
 * - logs details to cache/api_error.log
 */
function dash_try(callable $fn, array &$warnings): mixed
{
    try {
        return $fn();
    } catch (Throwable $e) {
        // Log and continue with a default value.
        $id = lifenest_log_exception($e);
        $warnings[] = $id;
        return null;
    }
}

$now = dt_now();
$today = $now->format('Y-m-d');
$ym = $now->format('Y-m');

// Defaults (so UI never goes blank)
$taskCounts = ['todo' => 0, 'done' => 0];
$overdueCount = 0;
$criticalTitle = null;

$studyPlannedMin = 0;
$studyDoneMin = 0;

$budgetCents = 0;
$currency = budget_app_currency();
$monthSpentCents = 0;
$monthRemainingCents = 0;
$daysLeft = days_left_in_month($ym, $now);
$dailyAllowanceCents = 0;

$spentTodayCents = 0;
$spentTodayTopCats = [];

$wkPct = 0;
$wStart = $today;

$topPriorities = [];
$studyItems = [];
$lastExpenses = [];

// --- Tasks Today snapshot
dash_try(function () use ($pdo, $uid, $today, &$taskCounts): void {
    $st = $pdo->prepare('SELECT status, COUNT(*) AS c FROM tasks WHERE user_id = ? AND due_date = ? GROUP BY status');
    $st->execute([$uid, $today]);
    foreach ($st->fetchAll() as $r) {
        $s = (string)($r['status'] ?? '');
        if (isset($taskCounts[$s])) {
            $taskCounts[$s] = (int)($r['c'] ?? 0);
        }
    }
}, $warnings);

$tasksTodayTotal = $taskCounts['todo'] + $taskCounts['done'];
$tasksTodayDone = $taskCounts['done'];
$tasksTodayPct = $tasksTodayTotal > 0 ? (int)round(($tasksTodayDone / $tasksTodayTotal) * 100) : 0;

// --- Overdue snapshot
dash_try(function () use ($pdo, $uid, $today, &$overdueCount): void {
    $st = $pdo->prepare("SELECT COUNT(*) AS c FROM tasks WHERE user_id = ? AND status = 'todo' AND due_date IS NOT NULL AND due_date < ?");
    $st->execute([$uid, $today]);
    $row = $st->fetch();
    $overdueCount = (int)(is_array($row) ? ($row['c'] ?? 0) : 0);
}, $warnings);

dash_try(function () use ($pdo, $uid, $today, &$criticalTitle): void {
    $crit = $pdo->prepare(
        "SELECT id, title FROM tasks WHERE user_id = ? AND status = 'todo' AND due_date IS NOT NULL AND due_date < ? "
        . "ORDER BY (priority='high') DESC, (priority='medium') DESC, due_date ASC, id DESC LIMIT 1"
    );
    $crit->execute([$uid, $today]);
    $critRow = $crit->fetch();
    if ($critRow && isset($critRow['title']) && is_string($critRow['title'])) {
        $raw = (string)$critRow['title'];
        $criticalTitle = crypto_decrypt_for_user($uid, $raw);
        // Lazy migrate plaintext -> encrypted (best-effort; never break dashboard)
        if ($raw !== '' && !crypto_is_encrypted($raw)) {
            $taskId = (int)($critRow['id'] ?? 0);
            if ($taskId > 0) {
                try {
                    $up = $pdo->prepare('UPDATE tasks SET title = ? WHERE id = ? AND user_id = ?');
                    $up->execute([crypto_encrypt_for_user($uid, $criticalTitle), $taskId, $uid]);
                } catch (Throwable $ignore) {
                    // ignore
                }
            }
        }
    }
}, $warnings);

// --- Study snapshot
dash_try(function () use ($pdo, $uid, &$studyPlannedMin, &$studyDoneMin): void {
    $st = $pdo->prepare('SELECT COALESCE(SUM(planned_minutes),0) AS planned, COALESCE(SUM(done_minutes),0) AS done FROM study_items WHERE user_id = ?');
    $st->execute([$uid]);
    $row = $st->fetch();
    if (is_array($row)) {
        $studyPlannedMin = (int)($row['planned'] ?? 0);
        $studyDoneMin = (int)($row['done'] ?? 0);
    }
}, $warnings);

// --- Budget snapshot
[$mStart, $mNext] = month_range_ym($ym);

dash_try(function () use ($pdo, $uid, $ym, &$budgetCents, &$currency): void {
    $budgetCtx = budget_fetch_context($pdo, $uid, $ym);
    $budgetCents = (int)($budgetCtx['budget_cents'] ?? 0);
    $currency = budget_normalize_currency($budgetCtx['currency'] ?? null, budget_app_currency());
}, $warnings);

dash_try(function () use ($pdo, $uid, $mStart, $mNext, &$monthSpentCents): void {
    // amount_cents is encrypted, so aggregate in PHP.
    $sum = $pdo->prepare('SELECT amount_cents FROM expenses WHERE user_id = ? AND expense_date >= ? AND expense_date < ?');
    $sum->execute([$uid, $mStart, $mNext]);
    $monthSpentCents = 0;
    foreach ($sum->fetchAll() as $r) {
        $raw = is_string($r['amount_cents'] ?? null) ? (string)$r['amount_cents'] : '0';
        $monthSpentCents += crypto_decrypt_int($uid, $raw, 0);
    }
}, $warnings);

$monthRemainingCents = max(0, $budgetCents - $monthSpentCents);
$dailyAllowanceCents = $daysLeft > 0 ? (int)floor($monthRemainingCents / $daysLeft) : 0;

// --- Spent Today snapshot
dash_try(function () use ($pdo, $uid, $today, &$spentTodayCents, &$spentTodayTopCats): void {
    $st = $pdo->prepare('SELECT amount_cents, category FROM expenses WHERE user_id = ? AND expense_date = ?');
    $st->execute([$uid, $today]);
    $spentTodayCents = 0;
    $catAgg = [];
    foreach ($st->fetchAll() as $r) {
        $rawAmt = is_string($r['amount_cents'] ?? null) ? (string)$r['amount_cents'] : '0';
        $rawCat = is_string($r['category'] ?? null) ? (string)$r['category'] : '';
        $amt = crypto_decrypt_int($uid, $rawAmt, 0);
        $cat = trim(crypto_decrypt_for_user($uid, $rawCat));
        $spentTodayCents += $amt;
        if ($cat !== '') {
            if (!isset($catAgg[$cat])) $catAgg[$cat] = 0;
            $catAgg[$cat] += $amt;
        }
    }
    $spentTodayTopCats = [];
    if ($catAgg) {
        arsort($catAgg);
        $spentTodayTopCats = array_slice(array_keys($catAgg), 0, 2);
    }
}, $warnings);

// --- Weekly progress
dash_try(function () use ($pdo, $uid, $now, &$wkPct, &$wStart): void {
    [$wStart, $wNext] = week_range($now);
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
    $wkTotal = $wk['todo'] + $wk['done'];
    $wkPct = $wkTotal > 0 ? (int)round(($wk['done'] / $wkTotal) * 100) : 0;
}, $warnings);

// --- Panels: top 3 priorities (today + overdue)
dash_try(function () use ($pdo, $uid, $today, &$topPriorities): void {
    $st = $pdo->prepare(
        "SELECT id, title, priority, status FROM tasks "
        . "WHERE user_id = ? AND status = 'todo' AND (due_date = ? OR (due_date IS NOT NULL AND due_date < ?)) "
        . "ORDER BY (priority='high') DESC, (priority='medium') DESC, due_date ASC, id DESC LIMIT 3"
    );
    $st->execute([$uid, $today, $today]);
    $topPriorities = $st->fetchAll();
    foreach ($topPriorities as &$r) {
        if (isset($r['title']) && is_string($r['title'])) {
            $r['title'] = crypto_decrypt_for_user($uid, (string)$r['title']);
        }
    }
    unset($r);
}, $warnings);

// --- Panels: study (top 2)
dash_try(function () use ($pdo, $uid, &$studyItems): void {
    $st = $pdo->prepare('SELECT id, title, planned_minutes, done_minutes, next_due_date FROM study_items WHERE user_id = ? ORDER BY (next_due_date IS NULL) ASC, next_due_date ASC, id DESC LIMIT 2');
    $st->execute([$uid]);
    $studyItems = $st->fetchAll();
    foreach ($studyItems as &$r) {
        if (isset($r['title']) && is_string($r['title'])) {
            $r['title'] = crypto_decrypt_for_user($uid, (string)$r['title']);
        }
    }
    unset($r);
}, $warnings);

// --- Panels: last 5 expenses
dash_try(function () use ($pdo, $uid, &$lastExpenses): void {
    $st = $pdo->prepare('SELECT id, amount_cents, currency, category, expense_date, note FROM expenses WHERE user_id = ? ORDER BY expense_date DESC, id DESC LIMIT 5');
    $st->execute([$uid]);
    $lastExpenses = $st->fetchAll();
    foreach ($lastExpenses as &$r) {
        $rawAmt = is_string($r['amount_cents'] ?? null) ? (string)$r['amount_cents'] : '0';
        $rawCat = is_string($r['category'] ?? null) ? (string)$r['category'] : '';
        $rawNote = isset($r['note']) && $r['note'] !== null && is_string($r['note']) ? (string)$r['note'] : null;

        $r['amount_cents'] = crypto_decrypt_int($uid, $rawAmt, 0);
        $r['category'] = crypto_decrypt_for_user($uid, $rawCat);
        $r['note'] = $rawNote === null ? null : crypto_decrypt_for_user($uid, $rawNote);
        $r['currency'] = budget_app_currency();
    }
    unset($r);
}, $warnings);

// Suggestions (cheap + encrypted-safe): derive from last expenses categories
$suggestCats = [];
foreach ($lastExpenses as $e) {
    $c = isset($e['category']) ? trim((string)$e['category']) : '';
    if ($c !== '') $suggestCats[] = $c;
}
$suggestCats = array_values(array_unique($suggestCats));

json_response([
    'ok' => true,
    'today' => $today,
    'warnings' => $warnings,
    'snapshot' => [
        'tasks_today' => [
            'count' => $tasksTodayTotal,
            'completed_pct' => $tasksTodayPct,
        ],
        'overdue' => [
            'count' => $overdueCount,
            'critical_title' => $criticalTitle,
        ],
        'study_time' => [
            'planned_minutes' => $studyPlannedMin,
            'done_minutes' => $studyDoneMin,
        ],
        'budget' => [
            'month' => $ym,
            'currency' => $currency,
            'budget_cents' => $budgetCents,
            'spent_cents' => $monthSpentCents,
            'remaining_cents' => $monthRemainingCents,
            'days_left' => $daysLeft,
            'daily_allowance_cents' => $dailyAllowanceCents,
        ],
        'spent_today' => [
            'spent_cents' => $spentTodayCents,
            'top_categories' => $spentTodayTopCats,
        ],
        'weekly_progress' => [
            'percent' => $wkPct,
            'week_start' => $wStart,
        ],
    ],
    'panels' => [
        'top_priorities' => $topPriorities,
        'study_items' => $studyItems,
        'last_expenses' => $lastExpenses,
    ],
    'suggestions' => [
        'expense_categories' => $suggestCats,
    ],
]);
