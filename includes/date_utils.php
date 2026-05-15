<?php
declare(strict_types=1);

/**
 * Date helpers (server timezone aware).
 * Keep logic simple and explicit for shared hosting.
 */

function dt_now(): DateTimeImmutable
{
    return new DateTimeImmutable('now');
}

function today_ymd(): string
{
    return dt_now()->format('Y-m-d');
}

/**
 * @return array{0:string,1:string} [startYmd, nextMonthStartYmd)
 */
function month_range_ym(string $ym): array
{
    [$y, $m] = array_map('intval', explode('-', $ym));
    $start = sprintf('%04d-%02d-01', $y, $m);
    $dt = new DateTimeImmutable($start);
    $next = $dt->modify('first day of next month')->format('Y-m-d');
    return [$start, $next];
}

function days_in_month_ym(string $ym): int
{
    [$y, $m] = array_map('intval', explode('-', $ym));
    $dt = new DateTimeImmutable(sprintf('%04d-%02d-01', $y, $m));
    return (int)$dt->format('t');
}

/**
 * Days left in a month INCLUDING today, only meaningful for the current month.
 */
function days_left_in_month(string $ym, DateTimeImmutable $now): int
{
    $cur = $now->format('Y-m');
    if ($ym !== $cur) {
        return 0;
    }
    $daysInMonth = (int)$now->format('t');
    $day = (int)$now->format('j');
    return max(0, $daysInMonth - $day + 1);
}

/**
 * @return array{0:string,1:string} [weekStartYmd, nextWeekStartYmd)
 * Week starts on Monday.
 */
function week_range(DateTimeImmutable $now): array
{
    $dow = (int)$now->format('N'); // 1..7 (Mon..Sun)
    $start = $now->modify('-' . ($dow - 1) . ' days')->format('Y-m-d');
    $next = (new DateTimeImmutable($start))->modify('+7 days')->format('Y-m-d');
    return [$start, $next];
}
