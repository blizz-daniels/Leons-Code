<?php
declare(strict_types=1);

require dirname(__DIR__) . '/app/bootstrap.php';

try {
    \LeonsCode\PaystackService::handleWebhook((string) file_get_contents('php://input'), $_SERVER['HTTP_X_PAYSTACK_SIGNATURE'] ?? null);
    http_response_code(200);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['received' => true]);
} catch (Throwable $exception) {
    \LeonsCode\Database::log('Rejected Paystack webhook: ' . $exception->getMessage());
    http_response_code(400);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['received' => false]);
}
