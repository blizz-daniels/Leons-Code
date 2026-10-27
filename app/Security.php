<?php
declare(strict_types=1);

namespace LeonsCode;

use DomainException;

final class Security
{
    public static function startSession(): void
    {
        if (session_status() === PHP_SESSION_ACTIVE) {
            return;
        }

        $sessionDirectory = dirname(__DIR__) . DIRECTORY_SEPARATOR . 'storage' . DIRECTORY_SEPARATOR . 'sessions';
        if (!is_dir($sessionDirectory)) {
            @mkdir($sessionDirectory, 0775, true);
        }
        if (is_dir($sessionDirectory) && is_writable($sessionDirectory)) {
            session_save_path($sessionDirectory);
        }
        $https = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') || ($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https';
        session_name('leons_code_session');
        session_set_cookie_params([
            'lifetime' => 0,
            'path' => '/',
            'secure' => $https,
            'httponly' => true,
            'samesite' => 'Lax',
        ]);
        session_start();
    }

    public static function headers(): void
    {
        if (headers_sent()) {
            return;
        }
        header('X-Content-Type-Options: nosniff');
        header('X-Frame-Options: SAMEORIGIN');
        header('Referrer-Policy: strict-origin-when-cross-origin');
        header('Permissions-Policy: camera=(), microphone=(), geolocation=()');
        header("Content-Security-Policy: default-src 'self'; base-uri 'self'; form-action 'self'; frame-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; object-src 'none'; upgrade-insecure-requests");
    }

    public static function csrfToken(): string
    {
        self::startSession();
        if (!isset($_SESSION['_csrf'])) {
            $_SESSION['_csrf'] = bin2hex(random_bytes(32));
        }
        return (string) $_SESSION['_csrf'];
    }

    public static function verifyCsrf(?string $token): void
    {
        self::startSession();
        if (!is_string($token) || !isset($_SESSION['_csrf']) || !hash_equals((string) $_SESSION['_csrf'], $token)) {
            throw new DomainException('Your form expired. Refresh the page and try again.');
        }
    }

    public static function flash(string $type, string $message): void
    {
        self::startSession();
        $_SESSION['_flash'][] = ['type' => $type, 'message' => $message];
    }

    public static function consumeFlash(): array
    {
        self::startSession();
        $messages = $_SESSION['_flash'] ?? [];
        unset($_SESSION['_flash']);
        return is_array($messages) ? $messages : [];
    }
}
