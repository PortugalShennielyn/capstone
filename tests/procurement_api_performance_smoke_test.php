<?php

declare(strict_types=1);

require_once __DIR__ . '/../pharma-api/config/db_connection.php';
require_once __DIR__ . '/../pharma-api/config/id_helpers.php';

function performanceAssert(bool $condition, string $message): void
{
    if (!$condition) throw new RuntimeException($message);
}

$user = $pdo->query("SELECT user_id, username, full_name, role, status FROM users WHERE role = 'admin' AND status = 'Active' AND is_deleted = 0 LIMIT 1")->fetch(PDO::FETCH_ASSOC);
performanceAssert((bool) $user, 'An active admin account is required.');

$phpSessionId = 'codexperf' . bin2hex(random_bytes(10));
$tabToken = bin2hex(random_bytes(32));
$authSessionId = newUuid($pdo);
if (session_status() === PHP_SESSION_ACTIVE) session_write_close();
session_id($phpSessionId);
session_start();
$_SESSION = [
    'user_id' => $user['user_id'], 'username' => $user['username'], 'full_name' => $user['full_name'],
    'role' => $user['role'], 'roles' => [$user['role']], 'role_identifiers' => ['ro-admin'],
    'user_status' => $user['status'], 'auth_session_id' => $authSessionId,
    'tab_token_hash' => hash('sha256', $tabToken),
];
session_write_close();
$pdo->prepare('INSERT INTO auth_sessions (auth_session_id, php_session_id, user_id, session_token_hash, expires_at, ip_address, user_agent) VALUES (?, ?, ?, ?, DATE_ADD(NOW(), INTERVAL 1 HOUR), ?, ?)')
    ->execute([$authSessionId, $phpSessionId, $user['user_id'], hash('sha256', $tabToken), '127.0.0.1', 'Codex procurement performance smoke test']);

$endpoints = [
    'purchase_requests' => 'purchase_requests/get_purchase_requests.php',
    'pr_candidates' => 'purchase_requests/get_pr_candidates.php',
    'purchase_orders' => 'purchase_orders/get_purchase_orders.php',
    'products' => 'products/get_products.php',
];
$results = [];

try {
    foreach ($endpoints as $label => $path) {
        $curl = curl_init('http://127.0.0.1/PharmacySystem_for_DocR/pharma-api/v1/' . $path);
        curl_setopt_array($curl, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_COOKIE => 'PHPSESSID=' . $phpSessionId,
            CURLOPT_HTTPHEADER => ['Accept: application/json', 'X-Tab-Token: ' . $tabToken],
            CURLOPT_TIMEOUT => 20,
        ]);
        $started = hrtime(true);
        $body = curl_exec($curl);
        $milliseconds = (hrtime(true) - $started) / 1_000_000;
        $status = (int) curl_getinfo($curl, CURLINFO_RESPONSE_CODE);
        $error = curl_error($curl);
        curl_close($curl);
        performanceAssert($body !== false, "{$label} request failed: {$error}");
        performanceAssert($status === 200, "{$label} returned HTTP {$status}: {$body}");
        performanceAssert(is_array(json_decode((string) $body, true)), "{$label} did not return JSON.");
        $results[] = [$label, $milliseconds, strlen((string) $body)];
    }
} finally {
    $pdo->prepare('DELETE FROM auth_sessions WHERE auth_session_id = ?')->execute([$authSessionId]);
    if (session_status() === PHP_SESSION_ACTIVE) session_write_close();
    session_id($phpSessionId);
    session_start();
    $_SESSION = [];
    session_destroy();
}

foreach ($results as [$label, $milliseconds, $bytes]) {
    printf("%-20s %8.1f ms  %8d bytes\n", $label, $milliseconds, $bytes);
}
