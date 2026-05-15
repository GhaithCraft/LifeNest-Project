<?php
declare(strict_types=1);

require_once __DIR__ . '/../includes/api_init.php';
require_once __DIR__ . '/../includes/auth.php';
require_once __DIR__ . '/../includes/db.php';
require_once __DIR__ . '/../includes/budget_defaults.php';

$uid = current_user_id();
$user = $uid ? fetch_user_public($uid) : null;
$preferredBudgetCurrency = budget_app_currency();
$budgetMemory = null;

if ($uid) {
    try {
        $budgetCtx = budget_fetch_context(db(), $uid, (new DateTimeImmutable('now'))->format('Y-m'));
        $preferredBudgetCurrency = budget_normalize_currency($budgetCtx['currency'] ?? null, budget_app_currency());
        $budgetMemory = is_array($budgetCtx['remembered'] ?? null) ? $budgetCtx['remembered'] : null;
    } catch (Throwable $ignore) {
        $preferredBudgetCurrency = budget_app_currency();
        $budgetMemory = null;
    }
}

json_response([
    'ok' => true,
    'csrf_token' => csrf_token(),
    'user' => $user,
    'preferred_budget_currency' => $preferredBudgetCurrency,
    'budget_memory' => $budgetMemory,
]);
