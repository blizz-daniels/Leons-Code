<?php
declare(strict_types=1);

namespace LeonsCode;

use DomainException;
use PDO;

final class Auth
{
    private static ?array $currentUser = null;

    public static function user(): ?array
    {
        Security::startSession();
        if (self::$currentUser !== null) {
            return self::$currentUser;
        }
        $id = filter_var($_SESSION['user_id'] ?? null, FILTER_VALIDATE_INT);
        if (!$id) {
            return null;
        }

        $statement = Database::connection()->prepare('SELECT u.id, u.name, u.email, u.status, GROUP_CONCAT(r.name) AS roles FROM users u LEFT JOIN user_roles ur ON ur.user_id = u.id LEFT JOIN roles r ON r.id = ur.role_id WHERE u.id = :id GROUP BY u.id LIMIT 1');
        $statement->execute(['id' => $id]);
        $user = $statement->fetch();
        if (!$user || $user['status'] !== 'active') {
            self::logout();
            return null;
        }
        $user['roles'] = $user['roles'] ? explode(',', $user['roles']) : [];
        return self::$currentUser = $user;
    }

    public static function register(string $name, string $email, string $password): array
    {
        $name = trim($name);
        $email = strtolower(trim($email));
        if (mb_strlen($name) < 2 || mb_strlen($name) > 100) {
            throw new DomainException('Enter a name between 2 and 100 characters.');
        }
        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
            throw new DomainException('Enter a valid email address.');
        }
        if (strlen($password) < 12) {
            throw new DomainException('Use a password with at least 12 characters.');
        }

        return Database::transaction(function (PDO $pdo) use ($name, $email, $password): array {
            $existing = $pdo->prepare('SELECT id FROM users WHERE email = :email LIMIT 1');
            $existing->execute(['email' => $email]);
            if ($existing->fetch()) {
                throw new DomainException('We could not create that account. Try signing in or use another email address.');
            }
            $insert = $pdo->prepare('INSERT INTO users (name, email, password_hash, status, created_at, updated_at) VALUES (:name, :email, :password_hash, "active", UTC_TIMESTAMP(), UTC_TIMESTAMP())');
            $insert->execute(['name' => $name, 'email' => $email, 'password_hash' => password_hash($password, PASSWORD_DEFAULT)]);
            $userId = (int) $pdo->lastInsertId();
            $role = $pdo->prepare('SELECT id FROM roles WHERE name = "student" LIMIT 1');
            $role->execute();
            $roleId = (int) $role->fetchColumn();
            if ($roleId <= 0) {
                throw new DomainException('Platform roles have not been installed. Run the database migrations and seed process.');
            }
            $pdo->prepare('INSERT INTO user_roles (user_id, role_id) VALUES (:user_id, :role_id)')->execute(['user_id' => $userId, 'role_id' => $roleId]);
            return self::authenticate($userId);
        });
    }

    public static function attempt(string $email, string $password): ?array
    {
        $email = strtolower(trim($email));
        $statement = Database::connection()->prepare('SELECT id, password_hash, status FROM users WHERE email = :email LIMIT 1');
        $statement->execute(['email' => $email]);
        $record = $statement->fetch();
        if (!$record || $record['status'] !== 'active' || !password_verify($password, $record['password_hash'])) {
            return null;
        }
        if (password_needs_rehash($record['password_hash'], PASSWORD_DEFAULT)) {
            Database::connection()->prepare('UPDATE users SET password_hash = :hash, updated_at = UTC_TIMESTAMP() WHERE id = :id')->execute(['hash' => password_hash($password, PASSWORD_DEFAULT), 'id' => $record['id']]);
        }
        return self::authenticate((int) $record['id']);
    }

    public static function requireUser(): array
    {
        $user = self::user();
        if (!$user) {
            throw new DomainException('Sign in is required to continue.');
        }
        return $user;
    }

    public static function requireRole(string $role): array
    {
        $user = self::requireUser();
        if (!in_array($role, $user['roles'], true)) {
            throw new DomainException('You do not have permission to access that area.');
        }
        return $user;
    }

    public static function logout(): void
    {
        Security::startSession();
        $_SESSION = [];
        session_regenerate_id(true);
        self::$currentUser = null;
    }

    private static function authenticate(int $id): array
    {
        Security::startSession();
        session_regenerate_id(true);
        $_SESSION['user_id'] = $id;
        self::$currentUser = null;
        return self::user() ?? throw new DomainException('Could not start your session.');
    }
}
