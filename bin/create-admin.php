<?php
declare(strict_types=1);

require dirname(__DIR__) . '/app/bootstrap.php';

use LeonsCode\Database;

if ($argc !== 3) {
    fwrite(STDERR, "Usage: php bin/create-admin.php \"Administrator name\" admin@example.com" . PHP_EOL);
    exit(1);
}
[$script, $name, $email] = $argv;
$email = strtolower(trim($email));
if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
    fwrite(STDERR, "A valid email address is required." . PHP_EOL);
    exit(1);
}
fwrite(STDOUT, 'Password (at least 12 characters): ');
$password = trim((string) fgets(STDIN));
if (strlen($password) < 12) {
    fwrite(STDERR, "Password must be at least 12 characters." . PHP_EOL);
    exit(1);
}
Database::transaction(function (PDO $pdo) use ($name, $email, $password): void {
    $pdo->prepare('INSERT INTO users (name, email, password_hash, status, email_verified_at, created_at, updated_at) VALUES (:name, :email, :password, "active", UTC_TIMESTAMP(), UTC_TIMESTAMP(), UTC_TIMESTAMP()) ON DUPLICATE KEY UPDATE name = VALUES(name), password_hash = VALUES(password_hash), status = "active", updated_at = UTC_TIMESTAMP()')->execute(['name' => trim($name), 'email' => $email, 'password' => password_hash($password, PASSWORD_DEFAULT)]);
    $user = $pdo->prepare('SELECT id FROM users WHERE email = :email');
    $user->execute(['email' => $email]);
    $role = $pdo->query('SELECT id FROM roles WHERE name = "administrator"')->fetchColumn();
    $pdo->prepare('INSERT IGNORE INTO user_roles (user_id, role_id) VALUES (:user_id, :role_id)')->execute(['user_id' => (int) $user->fetchColumn(), 'role_id' => (int) $role]);
});
echo "Administrator created or updated. Keep this password out of source control." . PHP_EOL;
