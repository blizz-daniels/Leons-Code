<?php
declare(strict_types=1);

require dirname(__DIR__) . '/app/bootstrap.php';

use LeonsCode\Database;

$pdo = Database::connection();
$pdo->exec('CREATE TABLE IF NOT EXISTS schema_migrations (version VARCHAR(100) PRIMARY KEY, applied_at DATETIME NOT NULL) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4');
foreach (glob(dirname(__DIR__) . '/database/migrations/*.sql') ?: [] as $file) {
    $version = basename($file);
    $exists = $pdo->prepare('SELECT 1 FROM schema_migrations WHERE version = :version');
    $exists->execute(['version' => $version]);
    if ($exists->fetchColumn()) {
        echo "Skipped {$version}" . PHP_EOL;
        continue;
    }
    try {
        // MySQL DDL causes implicit commits, so migrations cannot be wrapped in
        // a transaction. Each version is recorded only after its SQL succeeds.
        $pdo->exec((string) file_get_contents($file));
        $pdo->prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (:version, UTC_TIMESTAMP())')->execute(['version' => $version]);
        echo "Applied {$version}" . PHP_EOL;
    } catch (Throwable $exception) {
        fwrite(STDERR, "Migration {$version} failed: {$exception->getMessage()}" . PHP_EOL);
        exit(1);
    }
}
