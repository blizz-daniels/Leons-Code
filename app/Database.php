<?php
declare(strict_types=1);

namespace LeonsCode;

use PDO;
use PDOException;
use RuntimeException;

final class Database
{
    private static ?PDO $connection = null;

    public static function connection(): PDO
    {
        if (self::$connection instanceof PDO) {
            return self::$connection;
        }

        $host = (string) Config::get('DB_HOST', '127.0.0.1');
        $port = (string) Config::get('DB_PORT', '3306');
        $database = (string) Config::get('DB_DATABASE', 'leons_code');
        $dsn = "mysql:host={$host};port={$port};dbname={$database};charset=utf8mb4";

        try {
            self::$connection = new PDO($dsn, (string) Config::get('DB_USERNAME', 'root'), (string) Config::get('DB_PASSWORD', ''), [
                PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                PDO::ATTR_EMULATE_PREPARES => false,
            ]);
        } catch (PDOException $exception) {
            self::log('Database connection unavailable: ' . $exception->getMessage());
            throw new RuntimeException('The learning platform database is not available. Finish the local setup and try again.');
        }

        return self::$connection;
    }

    public static function transaction(callable $operation): mixed
    {
        $pdo = self::connection();
        $pdo->beginTransaction();
        try {
            $result = $operation($pdo);
            $pdo->commit();
            return $result;
        } catch (\Throwable $exception) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            throw $exception;
        }
    }

    public static function log(string $message): void
    {
        $directory = dirname(__DIR__) . DIRECTORY_SEPARATOR . 'storage' . DIRECTORY_SEPARATOR . 'logs';
        if (!is_dir($directory)) {
            @mkdir($directory, 0775, true);
        }
        @error_log(gmdate('c') . ' ' . $message . PHP_EOL, 3, $directory . DIRECTORY_SEPARATOR . 'app.log');
    }
}
