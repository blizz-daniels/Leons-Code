<?php
declare(strict_types=1);

use LeonsCode\Config;
use LeonsCode\Security;

function e(mixed $value): string
{
    return htmlspecialchars((string) $value, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}

function route(string $page = 'home', array $parameters = []): string
{
    if ($page !== 'home') {
        $parameters = ['page' => $page] + $parameters;
    }
    return 'index.php' . ($parameters ? '?' . http_build_query($parameters, '', '&', PHP_QUERY_RFC3986) : '');
}

function csrf_field(): string
{
    return '<input type="hidden" name="_csrf" value="' . e(Security::csrfToken()) . '">';
}

function money(int|float|string|null $kobo, string $currency = 'NGN'): string
{
    $amount = ((int) $kobo) / 100;
    return $currency === 'NGN' ? '₦' . number_format($amount, 0) : e($currency) . ' ' . number_format($amount, 2);
}

function configured(string $key): bool
{
    return trim((string) Config::get($key, '')) !== '';
}
