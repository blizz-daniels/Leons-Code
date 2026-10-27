<?php
declare(strict_types=1);

namespace LeonsCode;

use PDO;

final class RateLimiter
{
    public static function allowed(string $action, string $identity, int $maximum = 5, int $windowSeconds = 900): bool
    {
        $key = hash('sha256', strtolower(trim($identity)));
        $statement = Database::connection()->prepare('SELECT attempts, window_started FROM auth_rate_limits WHERE action = :action AND identity_hash = :identity LIMIT 1');
        $statement->execute(['action' => $action, 'identity' => $key]);
        $row = $statement->fetch();
        return !$row || strtotime($row['window_started'] . ' UTC') + $windowSeconds <= time() || (int) $row['attempts'] < $maximum;
    }

    public static function hit(string $action, string $identity, int $windowSeconds = 900): void
    {
        $key = hash('sha256', strtolower(trim($identity)));
        Database::transaction(function (PDO $pdo) use ($action, $key, $windowSeconds): void {
            $read = $pdo->prepare('SELECT attempts, window_started FROM auth_rate_limits WHERE action = :action AND identity_hash = :identity FOR UPDATE');
            $read->execute(['action' => $action, 'identity' => $key]);
            $row = $read->fetch();
            if (!$row) {
                $pdo->prepare('INSERT INTO auth_rate_limits (action, identity_hash, attempts, window_started, updated_at) VALUES (:action, :identity, 1, UTC_TIMESTAMP(), UTC_TIMESTAMP())')->execute(['action' => $action, 'identity' => $key]);
                return;
            }
            $reset = strtotime($row['window_started'] . ' UTC') + $windowSeconds <= time();
            $pdo->prepare('UPDATE auth_rate_limits SET attempts = :attempts, window_started = IF(:reset = 1, UTC_TIMESTAMP(), window_started), updated_at = UTC_TIMESTAMP() WHERE action = :action AND identity_hash = :identity')->execute([
                'attempts' => $reset ? 1 : (int) $row['attempts'] + 1,
                'reset' => $reset ? 1 : 0,
                'action' => $action,
                'identity' => $key,
            ]);
        });
    }

    public static function clear(string $action, string $identity): void
    {
        Database::connection()->prepare('DELETE FROM auth_rate_limits WHERE action = :action AND identity_hash = :identity')->execute(['action' => $action, 'identity' => hash('sha256', strtolower(trim($identity)))]);
    }
}
