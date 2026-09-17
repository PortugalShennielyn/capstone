<?php
declare(strict_types=1);

require_once __DIR__ . '/../pharma-api/config/db_connection.php';

function shelfIdentityAssert(bool $condition, string $message): void
{
    if (!$condition) throw new RuntimeException($message);
}

function shelfInventoryGet(string $sessionId, string $tabToken): array
{
    $curl = curl_init('http://127.0.0.1/PharmacySystem_for_DocR/pharma-api/v1/inventory/get_shelf_inventory.php');
    curl_setopt_array($curl, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_COOKIE => 'PHPSESSID=' . $sessionId,
        CURLOPT_HTTPHEADER => ['Accept: application/json', 'X-Tab-Token: ' . $tabToken],
        CURLOPT_TIMEOUT => 20,
    ]);
    $body = curl_exec($curl);
    $status = (int) curl_getinfo($curl, CURLINFO_RESPONSE_CODE);
    $error = curl_error($curl);
    curl_close($curl);
    shelfIdentityAssert($body !== false, 'Shelf Inventory HTTP request failed: ' . $error);
    return ['status' => $status, 'body' => json_decode((string) $body, true) ?: []];
}

$authSessionId = newUuid($pdo);
$phpSessionId = 'codexshelf' . bin2hex(random_bytes(8));
$tabToken = bin2hex(random_bytes(32));

try {
    $user = $pdo->query("SELECT user_id,username,full_name,role,status FROM users WHERE role='admin' AND status='Active' LIMIT 1")->fetch(PDO::FETCH_ASSOC);
    shelfIdentityAssert((bool) $user, 'An active admin fixture is required.');

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
    $pdo->prepare(
        "INSERT INTO auth_sessions
            (auth_session_id,php_session_id,user_id,session_token_hash,expires_at,ip_address,user_agent)
         VALUES (:id,:php,:user,:token,DATE_ADD(NOW(),INTERVAL 10 MINUTE),'127.0.0.1','Codex shelf identity test')"
    )->execute([':id' => $authSessionId, ':php' => $phpSessionId, ':user' => $user['user_id'], ':token' => hash('sha256', $tabToken)]);

    $response = shelfInventoryGet($phpSessionId, $tabToken);
    shelfIdentityAssert($response['status'] === 200 && ($response['body']['status'] ?? '') === 'success', 'Shelf Inventory API failed: ' . json_encode($response));
    $rows = $response['body']['data'] ?? [];

    $cetzyRows = array_values(array_filter($rows, static fn(array $row): bool => strtolower((string) ($row['brand_name'] ?? '')) === 'cetzy-10'));
    if (count($cetzyRows) > 0) {
        foreach ($cetzyRows as $cetzy) {
            shelfIdentityAssert(strtolower((string) ($cetzy['product_name'] ?? '')) === 'cetzy-10', 'CETZY-10 fixture changed; update this regression test.');
            shelfIdentityAssert(strtolower((string) ($cetzy['generic_name'] ?? '')) === 'cetirizine hydrochloride', 'Shelf Inventory did not fetch CETZY-10 generic name from Product Master medicine details.');
            shelfIdentityAssert(($cetzy['medicine_classification'] ?? '') === 'Prescription (Rx)', 'Shelf Inventory did not fetch CETZY-10 medicine classification from Product Master specifications.');
            shelfIdentityAssert(($cetzy['medicine_classification_badge'] ?? '') === 'Rx', 'Shelf Inventory did not expose the Rx badge marker.');
        }
    }

    $script = (string) file_get_contents(__DIR__ . '/../pharma-frontend/js/modules/shelf_inventory.js');
    shelfIdentityAssert(str_contains($script, 'function productIdentity'), 'Shelf Inventory product identity formatter is missing.');
    shelfIdentityAssert(str_contains($script, 'medicine_classification_badge'), 'Shelf Inventory Rx badge mapping is missing.');
    shelfIdentityAssert(!str_contains($script, '<td><strong>${esc(row.product_name)}</strong></td>'), 'Shelf Inventory Product column still renders product_name directly.');
    shelfIdentityAssert(!preg_match('/product_name\s*\|\|[^;]*brand_name/', $script), 'Shelf Inventory still falls back from Product to Brand.');

    echo "Shelf Inventory product identity tests passed.\n";
} finally {
    $pdo->prepare('DELETE FROM auth_sessions WHERE auth_session_id=:id')->execute([':id' => $authSessionId]);
}
