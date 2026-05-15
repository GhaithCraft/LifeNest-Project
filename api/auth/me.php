<?php
declare(strict_types=1);

require_once __DIR__ . '/../../includes/api_init.php';
require_once __DIR__ . '/../../includes/auth.php';

$uid = current_user_id();
if (!$uid) {
    json_response(['ok' => true, 'user' => null]);
}

json_response(['ok' => true, 'user' => fetch_user_public($uid)]);
