<?php
declare(strict_types=1);

namespace LeonsCode;

final class Config
{
    private static array $values = [];

    public static function load(string $root): void
    {
        if (self::$values !== []) {
            return;
        }

        $file = $root . DIRECTORY_SEPARATOR . '.env';
        if (is_file($file)) {
            foreach (file($file, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) ?: [] as $line) {
                $line = trim($line);
                if ($line === '' || str_starts_with($line, '#') || !str_contains($line, '=')) {
                    continue;
                }
                [$key, $value] = explode('=', $line, 2);
                self::$values[trim($key)] = trim(trim($value), "\"'");
            }
        }
    }

    public static function get(string $key, mixed $default = null): mixed
    {
        $environment = getenv($key);
        if ($environment !== false) {
            return $environment;
        }

        return self::$values[$key] ?? $default;
    }

    public static function bool(string $key, bool $default = false): bool
    {
        return filter_var(self::get($key, $default), FILTER_VALIDATE_BOOL, FILTER_NULL_ON_FAILURE) ?? $default;
    }
}
