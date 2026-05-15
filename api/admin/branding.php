<?php
declare(strict_types=1);

require_once __DIR__ . '/../../includes/api_init.php';
require_once __DIR__ . '/../../includes/admin.php';
require_once __DIR__ . '/../../includes/site_settings.php';

$adminId = require_admin_api();

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'POST') {
    json_error('Method not allowed', 405);
}

$docRoot = $_SERVER['DOCUMENT_ROOT'] ?? dirname(__DIR__, 2);
$docRoot = rtrim((string)$docRoot, '/\\');
$targetDir = $docRoot . DIRECTORY_SEPARATOR . 'assets' . DIRECTORY_SEPARATOR . 'img' . DIRECTORY_SEPARATOR . 'branding';
if (!is_dir($targetDir) && !@mkdir($targetDir, 0755, true) && !is_dir($targetDir)) {
    json_error('Unable to prepare branding storage', 500);
}

/**
 * @param array<string,string> $allowedMimeToExt
 * @return array{setting_key:string, public_path:string, public_url:string}|null
 */
function branding_store_upload(string $field, string $settingKey, string $basename, array $allowedMimeToExt, int $maxBytes): ?array
{
    if (!isset($_FILES[$field]) || !is_array($_FILES[$field])) {
        return null;
    }

    $file = $_FILES[$field];
    $error = isset($file['error']) ? (int)$file['error'] : UPLOAD_ERR_NO_FILE;
    if ($error === UPLOAD_ERR_NO_FILE) {
        return null;
    }
    if ($error !== UPLOAD_ERR_OK) {
        json_error('Upload failed for ' . $field, 422);
    }

    $tmp = isset($file['tmp_name']) ? (string)$file['tmp_name'] : '';
    if ($tmp === '' || !is_uploaded_file($tmp)) {
        json_error('Invalid uploaded file', 422);
    }

    $size = isset($file['size']) ? (int)$file['size'] : 0;
    if ($size <= 0 || $size > $maxBytes) {
        json_error('Uploaded file is too large', 422);
    }

    $finfo = new finfo(FILEINFO_MIME_TYPE);
    $mime = (string)$finfo->file($tmp);
    if (!isset($allowedMimeToExt[$mime])) {
        json_error('Unsupported image format', 422);
    }

    if (@getimagesize($tmp) === false) {
        json_error('Uploaded file is not a valid image', 422);
    }

    $ext = $allowedMimeToExt[$mime];
    $docRoot = $_SERVER['DOCUMENT_ROOT'] ?? dirname(__DIR__, 2);
    $docRoot = rtrim((string)$docRoot, '/\\');
    $targetDir = $docRoot . DIRECTORY_SEPARATOR . 'assets' . DIRECTORY_SEPARATOR . 'img' . DIRECTORY_SEPARATOR . 'branding';
    foreach (glob($targetDir . DIRECTORY_SEPARATOR . $basename . '.*') ?: [] as $oldFile) {
        @unlink($oldFile);
    }

    $targetFs = $targetDir . DIRECTORY_SEPARATOR . $basename . '.' . $ext;
    if (!move_uploaded_file($tmp, $targetFs)) {
        json_error('Unable to save uploaded file', 500);
    }
    @chmod($targetFs, 0644);

    $publicPath = '/assets/img/branding/' . $basename . '.' . $ext;

    return [
        'setting_key' => $settingKey,
        'public_path' => $publicPath,
        'public_url' => asset_url($publicPath),
    ];
}

$logo = branding_store_upload(
    'site_logo',
    'site_logo_path',
    'site-logo',
    ['image/png' => 'png', 'image/jpeg' => 'jpg', 'image/webp' => 'webp'],
    2 * 1024 * 1024
);

$favicon = branding_store_upload(
    'site_favicon',
    'site_favicon_path',
    'site-favicon',
    ['image/png' => 'png', 'image/jpeg' => 'jpg', 'image/webp' => 'webp'],
    1024 * 1024
);

$save = [];
if ($logo !== null) {
    $save[$logo['setting_key']] = $logo['public_path'];
}
if ($favicon !== null) {
    $save[$favicon['setting_key']] = $favicon['public_path'];
}

if (!$save) {
    json_error('No files uploaded', 422);
}

site_setting_save_many($save, $adminId);

json_response([
    'ok' => true,
    'branding' => [
        'logo_path' => site_logo_path(),
        'logo_url' => site_logo_url(),
        'favicon_path' => site_favicon_path(),
        'favicon_url' => site_favicon_url(),
    ],
]);
