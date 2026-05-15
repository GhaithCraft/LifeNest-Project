<?php
declare(strict_types=1);

require_once __DIR__ . '/../includes/api_init.php';

$root = dirname(__DIR__);
$extensions = ['php' => true, 'css' => true, 'js' => true, 'sql' => true, 'htaccess' => true];
$ignoredDirs = ['cache' => true, '.git' => true, 'node_modules' => true, 'vendor' => true];
$parts = [];

$it = new RecursiveIteratorIterator(
    new RecursiveCallbackFilterIterator(
        new RecursiveDirectoryIterator($root, FilesystemIterator::SKIP_DOTS),
        static function (SplFileInfo $current) use ($ignoredDirs): bool {
            if (!$current->isDir()) {
                return true;
            }
            return !isset($ignoredDirs[$current->getFilename()]);
        }
    )
);

foreach ($it as $file) {
    if (!$file instanceof SplFileInfo || !$file->isFile()) {
        continue;
    }

    $name = $file->getFilename();
    $ext = strtolower(pathinfo($name, PATHINFO_EXTENSION));
    if ($name === '.htaccess') {
        $ext = 'htaccess';
    }
    if (!isset($extensions[$ext])) {
        continue;
    }

    $path = str_replace('\\', '/', substr($file->getPathname(), strlen($root) + 1));
    $parts[] = $path . ':' . $file->getMTime() . ':' . $file->getSize();
}

sort($parts, SORT_STRING);
$version = hash('sha256', implode('|', $parts));

json_response([
    'ok' => true,
    'version' => $version,
    'checked_at' => gmdate('c'),
]);
