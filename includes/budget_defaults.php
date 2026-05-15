<?php
declare(strict_types=1);

require_once __DIR__ . '/crypto.php';

function budget_app_currency(): string
{
    return 'TRY';
}

function budget_currency_whitelist(): array
{
    return [budget_app_currency()];
}

function budget_normalize_currency(mixed $value = null, string $fallback = 'TRY'): string
{
    return budget_app_currency();
}

function budget_fetch_context(PDO $pdo, int $uid, string $month): array
{
    $context = [
        'month' => $month,
        'has_budget' => false,
        'budget_cents' => 0,
        'currency' => budget_app_currency(),
        'remembered' => null,
    ];

    $st = $pdo->prepare('SELECT amount_cents, currency FROM budgets WHERE user_id = ? AND month = ? LIMIT 1');
    $st->execute([$uid, $month]);
    $budget = $st->fetch();

    if ($budget) {
        $rawAmt = is_string($budget['amount_cents'] ?? null) ? (string)$budget['amount_cents'] : '0';
        $budgetCents = crypto_decrypt_int($uid, $rawAmt, 0);
        $currency = budget_normalize_currency($budget['currency'] ?? null, budget_app_currency());

        $context['has_budget'] = true;
        $context['budget_cents'] = $budgetCents;
        $context['currency'] = $currency;

        if (($budget['currency'] ?? '') !== budget_app_currency()) {
            try {
                $upCur = $pdo->prepare('UPDATE budgets SET currency = ? WHERE user_id = ? AND month = ?');
                $upCur->execute([budget_app_currency(), $uid, $month]);
            } catch (Throwable $ignore) {
                // Keep callers resilient.
            }
        }

        if ($rawAmt !== '' && !crypto_is_encrypted($rawAmt)) {
            try {
                $up = $pdo->prepare('UPDATE budgets SET amount_cents = ? WHERE user_id = ? AND month = ?');
                $up->execute([crypto_encrypt_int($uid, $budgetCents), $uid, $month]);
            } catch (Throwable $ignore) {
                // Keep callers resilient.
            }
        }
    }

    $st = $pdo->prepare(
        'SELECT month, amount_cents, currency FROM budgets WHERE user_id = ? '
        . 'ORDER BY COALESCE(updated_at, created_at) DESC, month DESC LIMIT 1'
    );
    $st->execute([$uid]);
    $latest = $st->fetch();

    if ($latest) {
        $latestMonth = is_string($latest['month'] ?? null) ? (string)$latest['month'] : '';
        $rawLatestAmt = is_string($latest['amount_cents'] ?? null) ? (string)$latest['amount_cents'] : '0';
        $latestAmount = crypto_decrypt_int($uid, $rawLatestAmt, 0);
        $latestCurrency = budget_normalize_currency($latest['currency'] ?? null, budget_app_currency());

        $context['remembered'] = [
            'month' => $latestMonth,
            'currency' => $latestCurrency,
            'amount_cents' => $latestAmount,
        ];

        if (!$context['has_budget']) {
            $context['currency'] = $latestCurrency;
        }

        if (($latest['currency'] ?? '') !== budget_app_currency() && $latestMonth !== '') {
            try {
                $upCur = $pdo->prepare('UPDATE budgets SET currency = ? WHERE user_id = ? AND month = ?');
                $upCur->execute([budget_app_currency(), $uid, $latestMonth]);
            } catch (Throwable $ignore) {
                // Keep callers resilient.
            }
        }

        if ($rawLatestAmt !== '' && !crypto_is_encrypted($rawLatestAmt) && $latestMonth !== '') {
            try {
                $up = $pdo->prepare('UPDATE budgets SET amount_cents = ? WHERE user_id = ? AND month = ?');
                $up->execute([crypto_encrypt_int($uid, $latestAmount), $uid, $latestMonth]);
            } catch (Throwable $ignore) {
                // Keep callers resilient.
            }
        }
    }

    return $context;
}
