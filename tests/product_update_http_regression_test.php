<?php
declare(strict_types=1);

require_once __DIR__ . '/../pharma-api/config/db_connection.php';

function productUpdateAssert(bool $condition, string $message): void
{
    if (!$condition) throw new RuntimeException($message);
}

function productUpdatePost(array $payload, string $sessionId, string $token): array
{
    $curl = curl_init('http://127.0.0.1/PharmacySystem_for_DocR/pharma-api/v1/products/update_product.php');
    curl_setopt_array($curl, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_POST => true,
        CURLOPT_POSTFIELDS => json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
        CURLOPT_COOKIE => 'PHPSESSID=' . $sessionId,
        CURLOPT_HTTPHEADER => ['Accept: application/json', 'Content-Type: application/json', 'X-Tab-Token: ' . $token],
        CURLOPT_TIMEOUT => 20,
    ]);
    $body = curl_exec($curl);
    $status = (int) curl_getinfo($curl, CURLINFO_RESPONSE_CODE);
    $error = curl_error($curl);
    curl_close($curl);
    productUpdateAssert($body !== false, 'HTTP failure: ' . $error);
    return ['status' => $status, 'body' => json_decode((string) $body, true) ?: ['raw' => (string) $body]];
}

$user = $pdo->query("SELECT user_id, username, full_name, role, status FROM users WHERE role = 'admin' AND status = 'Active' LIMIT 1")->fetch(PDO::FETCH_ASSOC);
productUpdateAssert((bool) $user, 'An active admin fixture is required.');

$product = $pdo->query(
    "SELECT p.*, pc.category_name, md.generic_name,
            (SELECT psv.value_text
             FROM product_specification_values psv
             INNER JOIN product_specifications ps ON ps.specification_id = psv.specification_id
             WHERE psv.product_id = p.product_id
               AND LOWER(TRIM(ps.specification_name)) = 'medicine classification'
             LIMIT 1) AS medicine_classification
     FROM product p
     INNER JOIN product_categories pc ON pc.category_id = p.category_id
     LEFT JOIN medicine_details md ON md.product_id = p.product_id
     WHERE p.inventory_unit_id IS NOT NULL AND p.status = 'Active'
     ORDER BY CASE WHEN p.product_name = 'Disposable Face Mask 50 pcs Box' THEN 0 ELSE 1 END, p.created_at
     LIMIT 1"
)->fetch(PDO::FETCH_ASSOC);
productUpdateAssert((bool) $product, 'An active product with an inventory unit is required.');

$specificationStatement = $pdo->prepare(
    'SELECT specification_id, value_text, value_number, measurement_unit_id
     FROM product_specification_values WHERE product_id = :product_id ORDER BY specification_id'
);
$specificationStatement->execute([':product_id' => $product['product_id']]);
$specifications = $specificationStatement->fetchAll(PDO::FETCH_ASSOC);

$before = [];
foreach (['product', 'product_specification_values', 'product_selling_options'] as $table) {
    $count = $pdo->prepare("SELECT COUNT(*) FROM {$table} WHERE product_id = :product_id");
    $count->execute([':product_id' => $product['product_id']]);
    $before[$table] = (int) $count->fetchColumn();
}

if (session_status() === PHP_SESSION_ACTIVE) session_write_close();
$phpSessionId = 'codexproductupdate' . bin2hex(random_bytes(8));
$tabToken = bin2hex(random_bytes(32));
$authSessionId = newUuid($pdo);
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
     (auth_session_id, php_session_id, user_id, session_token_hash, expires_at, ip_address, user_agent)
     VALUES (:id, :php, :user, :token, DATE_ADD(NOW(), INTERVAL 10 MINUTE), '127.0.0.1', 'Codex product update regression test')"
)->execute([':id' => $authSessionId, ':php' => $phpSessionId, ':user' => $user['user_id'], ':token' => hash('sha256', $tabToken)]);

try {
    $payload = [
        'product_id' => $product['product_id'],
        'category_id' => $product['category_id'],
        'type_id' => $product['type_id'],
        'brand_name' => $product['brand_name'],
        'product_name' => $product['product_name'],
        'generic_name' => $product['generic_name'] ?? null,
        'medicine_classification' => $product['medicine_classification'] ?? null,
        'status' => $product['status'],
        'pricing_method' => $product['pricing_method'],
        'custom_markup_percentage' => $product['custom_markup_percentage'],
        'manual_selling_price' => $product['price'],
        'variations' => [[
            'type_id' => $product['type_id'],
            'medicine_classification' => $product['medicine_classification'] ?? null,
            'barcode' => $product['barcode'],
            'inventory_unit_id' => $product['inventory_unit_id'],
            'price' => $product['price'],
            'specifications' => $specifications,
        ]],
    ];
    $response = productUpdatePost($payload, $phpSessionId, $tabToken);
    productUpdateAssert($response['status'] === 200, 'Product update failed: ' . json_encode($response, JSON_UNESCAPED_SLASHES));
    productUpdateAssert(($response['body']['status'] ?? '') === 'success', 'Product update did not report success.');

    foreach ($before as $table => $expected) {
        $count = $pdo->prepare("SELECT COUNT(*) FROM {$table} WHERE product_id = :product_id");
        $count->execute([':product_id' => $product['product_id']]);
        productUpdateAssert((int) $count->fetchColumn() === $expected, "Product update changed the {$table} row count.");
    }

    $reloaded = $pdo->prepare('SELECT inventory_unit_id, price FROM product WHERE product_id = :product_id');
    $reloaded->execute([':product_id' => $product['product_id']]);
    $saved = $reloaded->fetch(PDO::FETCH_ASSOC);
    productUpdateAssert(($saved['inventory_unit_id'] ?? '') === $product['inventory_unit_id'], 'Product update did not preserve the real inventory-unit ID.');
    productUpdateAssert(abs((float) ($saved['price'] ?? 0) - (float) $product['price']) < 0.005, 'Product update did not preserve the manual selling price.');

    echo "product update HTTP regression test passed\n";
} finally {
    $pdo->prepare('DELETE FROM auth_sessions WHERE auth_session_id = :id')->execute([':id' => $authSessionId]);
}
