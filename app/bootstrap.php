<?php
declare(strict_types=1);

define('LEONS_CODE_ROOT', dirname(__DIR__));

spl_autoload_register(static function (string $class): void {
    $prefix = 'LeonsCode\\';
    if (!str_starts_with($class, $prefix)) {
        return;
    }
    $path = LEONS_CODE_ROOT . DIRECTORY_SEPARATOR . 'app' . DIRECTORY_SEPARATOR . str_replace('\\', DIRECTORY_SEPARATOR, substr($class, strlen($prefix))) . '.php';
    if (is_file($path)) {
        require $path;
    }
});

require LEONS_CODE_ROOT . DIRECTORY_SEPARATOR . 'app' . DIRECTORY_SEPARATOR . 'helpers.php';

\LeonsCode\Config::load(LEONS_CODE_ROOT);
\LeonsCode\Security::startSession();
\LeonsCode\Security::headers();
