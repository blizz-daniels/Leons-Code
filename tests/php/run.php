<?php
declare(strict_types=1);

require dirname(__DIR__, 2) . '/app/bootstrap.php';

use LeonsCode\PaystackService;
use LeonsCode\Security;

function check(bool $condition, string $message): void { if (!$condition) { throw new RuntimeException($message); } }

$token = Security::csrfToken();
Security::verifyCsrf($token);
check(strlen($token) === 64, 'CSRF token must be 256-bit hex.');
check(!PaystackService::validSignature('{"event":"charge.success"}', 'not-a-valid-signature'), 'Invalid Paystack signature must be rejected.');
echo "PHP security unit checks passed." . PHP_EOL;
