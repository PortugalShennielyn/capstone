<?php
declare(strict_types=1);

require_once __DIR__ . '/../pharma-api/config/db_connection.php';
require_once __DIR__ . '/../pharma-api/v1/inventory/inventory_stock_summary.php';

function storageInventoryAssert(bool $condition, string $message): void
{
    if (!$condition) throw new RuntimeException($message);
}

function storageInventoryGet(string $sessionId, string $tabToken): array
{
    $curl = curl_init('http://127.0.0.1/PharmacySystem_for_DocR/pharma-api/v1/inventory/get_inventory.php');
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
    storageInventoryAssert($body !== false, 'Inventory HTTP request failed: ' . $error);
    return ['status' => $status, 'body' => json_decode((string) $body, true) ?: []];
}

$authSessionId = newUuid($pdo);
$phpSessionId = 'codexstorage' . bin2hex(random_bytes(8));
$tabToken = bin2hex(random_bytes(32));

try {
    $user = $pdo->query("SELECT user_id,username,full_name,role,status FROM users WHERE role='admin' AND status='Active' LIMIT 1")->fetch(PDO::FETCH_ASSOC);
    storageInventoryAssert((bool) $user, 'An active admin fixture is required.');

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
         VALUES (:id,:php,:user,:token,DATE_ADD(NOW(),INTERVAL 10 MINUTE),'127.0.0.1','Codex storage inventory test')"
    )->execute([':id' => $authSessionId, ':php' => $phpSessionId, ':user' => $user['user_id'], ':token' => hash('sha256', $tabToken)]);

    $response = storageInventoryGet($phpSessionId, $tabToken);
    storageInventoryAssert($response['status'] === 200 && ($response['body']['status'] ?? '') === 'success', 'Storage Inventory API failed: ' . json_encode($response));
    $rows = $response['body']['data'] ?? [];
    $ids = array_column($rows, 'product_id');
    storageInventoryAssert(count($ids) === count(array_unique($ids)), 'Storage Inventory returned duplicate rows for one product_id.');

    $chuckie = array_values(array_filter($rows, static fn(array $row): bool => strtolower((string) ($row['product_name'] ?? '')) === 'chuckie'));
    if (count($chuckie) > 0) {
        storageInventoryAssert(count($chuckie) === 1, 'Chuckie must remain one row for its authoritative product_id.');
        storageInventoryAssert(($chuckie[0]['normalized_specification'] ?? '') === 'Chocolate • 250 mL', 'Chuckie did not use its normalized Product Master specification.');

        $stockSql = inventoryStockSummarySql();
        $stock = $pdo->prepare("SELECT storage_quantity,shelf_quantity FROM ({$stockSql}) stock WHERE product_id=:product_id");
        $stock->execute([':product_id' => $chuckie[0]['product_id']]);
        $authoritative = $stock->fetch(PDO::FETCH_ASSOC);
        storageInventoryAssert((int) $chuckie[0]['storage_quantity'] === (int) $authoritative['storage_quantity'], 'Storage quantity changed while loading specifications.');
        storageInventoryAssert((int) $chuckie[0]['shelf_quantity'] === (int) $authoritative['shelf_quantity'], 'Shelf quantity changed while loading specifications.');
    }

    $cetzyRows = array_values(array_filter($rows, static fn(array $row): bool => strtolower((string) ($row['brand_name'] ?? '')) === 'cetzy-10'));
    if (count($cetzyRows) > 0) {
        foreach ($cetzyRows as $cetzy) {
            storageInventoryAssert(strtolower((string) ($cetzy['product_name'] ?? '')) === 'cetzy-10', 'CETZY-10 fixture changed; update this regression test.');
            storageInventoryAssert(strtolower((string) ($cetzy['generic_name'] ?? '')) === 'cetirizine hydrochloride', 'Storage Inventory did not fetch CETZY-10 generic name from Product Master medicine details.');
            storageInventoryAssert(array_key_exists('brand_name', $cetzy) && array_key_exists('product_name', $cetzy) && array_key_exists('generic_name', $cetzy), 'Storage Inventory API product identity keys are incomplete.');
        }
    }

    $script = (string) file_get_contents(__DIR__ . '/../pharma-frontend/js/modules/inventory.js');
    storageInventoryAssert(!str_contains($script, 'procurementBadge('), 'Storage Inventory still renders the PR approval badge.');
    storageInventoryAssert(str_contains($script, 'highlightSearchText'), 'Storage Inventory search highlighting is missing.');
    storageInventoryAssert(str_contains($script, 'function productIdentityParts'), 'Storage Inventory product identity formatter is missing.');
    storageInventoryAssert(!str_contains($script, 'product-cell">${highlightSearchText(cleanText(row.product_name'), 'Storage Inventory Product column still renders product_name directly.');

    echo "Storage Inventory specification and search tests passed.\n";
} finally {
    $pdo->prepare('DELETE FROM auth_sessions WHERE auth_session_id=:id')->execute([':id' => $authSessionId]);
}
