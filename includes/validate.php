<?php
declare(strict_types=1);

function v_string(mixed $v, int $min = 0, int $max = 10000): ?string
{
    if (!is_string($v)) {
        return null;
    }
    $s = trim($v);
    // mbstring might be disabled on some shared-hosting setups.
    // Fall back to byte-length to avoid fatal errors.
    if (function_exists('mb_strlen')) {
        $len = mb_strlen($s, 'UTF-8');
    } else {
        $len = strlen($s);
    }
    if ($len < $min || $len > $max) {
        return null;
    }
    return $s;
}

function v_email(mixed $v): ?string
{
    $s = v_string($v, 3, 190);
    if ($s === null) {
        return null;
    }
    return filter_var($s, FILTER_VALIDATE_EMAIL) ? $s : null;
}

function v_int(mixed $v, int $min, int $max): ?int
{
    if (is_int($v)) {
        $n = $v;
    } elseif (is_string($v) && preg_match('/^-?\d+$/', $v)) {
        $n = (int)$v;
    } else {
        return null;
    }
    if ($n < $min || $n > $max) {
        return null;
    }
    return $n;
}

function v_enum(mixed $v, array $allowed): ?string
{
    if (!is_string($v)) {
        return null;
    }
    $s = trim($v);
    return in_array($s, $allowed, true) ? $s : null;
}

function v_date_ymd(mixed $v): ?string
{
    if ($v === null || $v === '') {
        return null;
    }
    if (!is_string($v)) {
        return null;
    }
    $s = trim($v);
    if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $s)) {
        return null;
    }
    [$y, $m, $d] = array_map('intval', explode('-', $s));
    return checkdate($m, $d, $y) ? $s : null;
}

function v_month_ym(mixed $v): ?string
{
    if (!is_string($v)) {
        return null;
    }
    $s = trim($v);
    if (!preg_match('/^\d{4}-\d{2}$/', $s)) {
        return null;
    }
    [$y, $m] = array_map('intval', explode('-', $s));
    return ($m >= 1 && $m <= 12 && $y >= 2000 && $y <= 2100) ? $s : null;
}
