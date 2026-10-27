<?php
declare(strict_types=1);

namespace LeonsCode;

use DomainException;
use PDO;

final class PaystackService
{
    private const API = 'https://api.paystack.co';

    public static function configured(): bool
    {
        return trim((string) Config::get('PAYSTACK_SECRET_KEY', '')) !== '';
    }

    public static function beginCheckout(array $user, int $planId): string
    {
        if (!self::configured()) {
            throw new DomainException('Payments are in safe test setup mode. Add Paystack test keys to .env before checkout can be enabled.');
        }
        $plan = CourseRepository::plan($planId);
        if (!$plan || (int) $plan['amount_kobo'] <= 0) {
            throw new DomainException('That payment plan is not available for checkout.');
        }

        $reference = 'LC_' . bin2hex(random_bytes(12));
        $paymentId = Database::transaction(function (PDO $pdo) use ($user, $plan, $reference): int {
            $statement = $pdo->prepare('INSERT INTO payments (user_id, plan_id, provider, reference, amount_kobo, currency, status, created_at, updated_at) VALUES (:user_id, :plan_id, "paystack", :reference, :amount, :currency, "pending", UTC_TIMESTAMP(), UTC_TIMESTAMP())');
            $statement->execute(['user_id' => $user['id'], 'plan_id' => $plan['id'], 'reference' => $reference, 'amount' => $plan['amount_kobo'], 'currency' => $plan['currency']]);
            return (int) $pdo->lastInsertId();
        });

        try {
            $payload = ['email' => $user['email'], 'amount' => (string) $plan['amount_kobo'], 'currency' => $plan['currency'], 'reference' => $reference, 'callback_url' => (string) Config::get('PAYSTACK_CALLBACK_URL'), 'metadata' => ['payment_id' => $paymentId, 'plan_id' => (int) $plan['id'], 'user_id' => (int) $user['id']]];
            if (!empty($plan['paystack_plan_code']) && in_array($plan['billing_type'], ['subscription'], true)) {
                $payload['plan'] = $plan['paystack_plan_code'];
            }
            $response = self::request('POST', '/transaction/initialize', $payload);
            if (!($response['status'] ?? false) || empty($response['data']['authorization_url'])) {
                throw new DomainException('Paystack could not start checkout.');
            }
            return (string) $response['data']['authorization_url'];
        } catch (\Throwable $exception) {
            Database::connection()->prepare('UPDATE payments SET status = "failed", failure_reason = :reason, updated_at = UTC_TIMESTAMP() WHERE id = :id')->execute(['reason' => substr($exception->getMessage(), 0, 255), 'id' => $paymentId]);
            throw $exception;
        }
    }

    public static function verifyForUser(string $reference, array $user): void
    {
        $payment = self::payment($reference, (int) $user['id']);
        if (!$payment) {
            throw new DomainException('We could not find that payment for your account.');
        }
        self::verifyAndApply($payment);
    }

    public static function handleWebhook(string $rawBody, ?string $signature): void
    {
        if (!self::validSignature($rawBody, $signature)) {
            throw new DomainException('Invalid webhook signature.');
        }
        $event = json_decode($rawBody, true, 512, JSON_THROW_ON_ERROR);
        $eventName = $event['event'] ?? '';
        $reference = $event['data']['reference'] ?? $event['data']['transaction']['reference'] ?? null;
        $eventHash = hash('sha256', $rawBody);
        $accepted = Database::transaction(function (PDO $pdo) use ($eventHash, $eventName, $reference): bool {
            try {
                $pdo->prepare('INSERT INTO payment_webhook_events (event_hash, provider, event_name, reference, received_at) VALUES (:hash, "paystack", :event, :reference, UTC_TIMESTAMP())')->execute(['hash' => $eventHash, 'event' => substr((string) $eventName, 0, 100), 'reference' => is_string($reference) ? $reference : null]);
                return true;
            } catch (\PDOException $exception) {
                if ($exception->getCode() === '23000') {
                    return false;
                }
                throw $exception;
            }
        });
        if (!$accepted || !is_string($reference) || !in_array($eventName, ['charge.success', 'invoice.update'], true)) {
            return;
        }
        $payment = self::payment($reference);
        if ($payment) {
            self::verifyAndApply($payment);
        }
    }

    public static function validSignature(string $body, ?string $signature): bool
    {
        $secret = (string) Config::get('PAYSTACK_SECRET_KEY', '');
        return $secret !== '' && is_string($signature) && hash_equals(hash_hmac('sha512', $body, $secret), $signature);
    }

    private static function payment(string $reference, ?int $userId = null): ?array
    {
        $sql = 'SELECT p.*, u.email, sp.billing_type, sp.interval_unit FROM payments p JOIN users u ON u.id = p.user_id JOIN subscription_plans sp ON sp.id = p.plan_id WHERE p.reference = :reference';
        $parameters = ['reference' => $reference];
        if ($userId !== null) {
            $sql .= ' AND p.user_id = :user_id';
            $parameters['user_id'] = $userId;
        }
        $statement = Database::connection()->prepare($sql . ' LIMIT 1');
        $statement->execute($parameters);
        return $statement->fetch() ?: null;
    }

    private static function verifyAndApply(array $payment): void
    {
        $response = self::request('GET', '/transaction/verify/' . rawurlencode($payment['reference']));
        $data = $response['data'] ?? [];
        $valid = ($response['status'] ?? false) && ($data['status'] ?? '') === 'success'
            && ($data['reference'] ?? '') === $payment['reference']
            && (int) ($data['amount'] ?? -1) === (int) $payment['amount_kobo']
            && ($data['currency'] ?? '') === $payment['currency']
            && strtolower((string) ($data['customer']['email'] ?? '')) === strtolower((string) $payment['email']);
        if (!$valid) {
            Database::connection()->prepare('UPDATE payments SET status = "failed", failure_reason = "Verification data did not match pending payment", updated_at = UTC_TIMESTAMP() WHERE id = :id AND status = "pending"')->execute(['id' => $payment['id']]);
            throw new DomainException('Payment verification could not confirm the expected purchase.');
        }

        Database::transaction(function (PDO $pdo) use ($payment, $data): void {
            $changed = $pdo->prepare('UPDATE payments SET status = "success", verified_at = UTC_TIMESTAMP(), provider_transaction_id = :provider_id, updated_at = UTC_TIMESTAMP() WHERE id = :id AND status = "pending"');
            $changed->execute(['provider_id' => (string) ($data['id'] ?? ''), 'id' => $payment['id']]);
            if ($changed->rowCount() === 0) {
                return;
            }
            $endsAt = $payment['billing_type'] === 'one_time' ? gmdate('Y-m-d H:i:s', strtotime('+1 year')) : null;
            $status = $payment['billing_type'] === 'subscription' ? 'active' : 'active';
            $pdo->prepare('INSERT INTO subscriptions (user_id, plan_id, provider, provider_subscription_code, status, started_at, ends_at, created_at, updated_at) VALUES (:user_id, :plan_id, "paystack", :subscription_code, :status, UTC_TIMESTAMP(), :ends_at, UTC_TIMESTAMP(), UTC_TIMESTAMP()) ON DUPLICATE KEY UPDATE plan_id = VALUES(plan_id), status = VALUES(status), ends_at = VALUES(ends_at), updated_at = UTC_TIMESTAMP()')->execute([
                'user_id' => $payment['user_id'],
                'plan_id' => $payment['plan_id'],
                'subscription_code' => (string) ($data['plan']['subscription_code'] ?? $data['authorization']['signature'] ?? ''),
                'status' => $status,
                'ends_at' => $endsAt,
            ]);
        });
    }

    private static function request(string $method, string $path, ?array $payload = null): array
    {
        if (!function_exists('curl_init')) {
            throw new DomainException('PHP cURL is required for Paystack checkout and verification.');
        }
        $handle = curl_init(self::API . $path);
        $headers = ['Authorization: Bearer ' . Config::get('PAYSTACK_SECRET_KEY'), 'Accept: application/json'];
        if ($payload !== null) {
            $headers[] = 'Content-Type: application/json';
            curl_setopt($handle, CURLOPT_POSTFIELDS, json_encode($payload, JSON_THROW_ON_ERROR));
        }
        curl_setopt_array($handle, [CURLOPT_CUSTOMREQUEST => $method, CURLOPT_HTTPHEADER => $headers, CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 20, CURLOPT_CONNECTTIMEOUT => 8]);
        $body = curl_exec($handle);
        $status = (int) curl_getinfo($handle, CURLINFO_RESPONSE_CODE);
        $error = curl_error($handle);
        curl_close($handle);
        if ($body === false || $status < 200 || $status >= 300) {
            throw new DomainException('The payment provider is temporarily unavailable. Please try again later.');
        }
        try {
            return json_decode($body, true, 512, JSON_THROW_ON_ERROR);
        } catch (\JsonException) {
            Database::log('Paystack returned invalid JSON: ' . $error);
            throw new DomainException('The payment provider returned an invalid response.');
        }
    }
}
