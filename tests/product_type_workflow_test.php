<?php
declare(strict_types=1);

require_once __DIR__ . '/../pharma-api/config/db_connection.php';
require_once __DIR__ . '/../pharma-api/config/id_helpers.php';

function typeAssert(bool $condition, string $message): void
{
    if (!$condition) throw new RuntimeException($message);
}

function typeApi(string $method, string $path, array $session, ?array $payload = null): array
{
    $curl = curl_init('http://127.0.0.1/PharmacySystem_for_DocR/pharma-api/v1/products/' . $path);
    $headers = ['Accept: application/json', 'X-Tab-Token: ' . $session['tabToken']];
    if ($payload !== null) $headers[] = 'Content-Type: application/json';
    curl_setopt_array($curl, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_CUSTOMREQUEST => $method,
        CURLOPT_COOKIE => 'PHPSESSID=' . $session['phpSessionId'],
        CURLOPT_HTTPHEADER => $headers,
        CURLOPT_POSTFIELDS => $payload === null ? null : json_encode($payload, JSON_THROW_ON_ERROR),
        CURLOPT_TIMEOUT => 20,
    ]);
    $body = curl_exec($curl);
    $status = (int) curl_getinfo($curl, CURLINFO_RESPONSE_CODE);
    $error = curl_error($curl);
    curl_close($curl);
    typeAssert($body !== false, 'HTTP request failed: ' . $error);
    return ['status' => $status, 'body' => json_decode((string) $body, true) ?: []];
}

$user = $pdo->query("SELECT user_id, username, full_name, role, status FROM users WHERE role='admin' AND status='Active' AND is_deleted=0 LIMIT 1")->fetch(PDO::FETCH_ASSOC);
typeAssert((bool) $user, 'An active admin account is required.');
$categoryId = (string) $pdo->query("SELECT category_id FROM product_categories WHERE category_name='Grocery' LIMIT 1")->fetchColumn();
$medicineCategoryId = (string) $pdo->query("SELECT category_id FROM product_categories WHERE category_name='Medicine' LIMIT 1")->fetchColumn();
$unitId = (string) $pdo->query("SELECT measurement_unit_id FROM product_measurement_units WHERE measurement_group='Count' AND is_active=1 LIMIT 1")->fetchColumn();
typeAssert($categoryId !== '' && $medicineCategoryId !== '' && $unitId !== '', 'Product Type test configuration is incomplete.');

$phpSessionId = 'codextype' . bin2hex(random_bytes(8));
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
$pdo->prepare("INSERT INTO auth_sessions (auth_session_id,php_session_id,user_id,session_token_hash,expires_at,ip_address,user_agent) VALUES (?,?,?,?,DATE_ADD(NOW(),INTERVAL 10 MINUTE),'127.0.0.1','Codex Product Type workflow test')")
    ->execute([$authSessionId, $phpSessionId, $user['user_id'], hash('sha256', $tabToken)]);

$session = compact('phpSessionId', 'tabToken');
$createdTypeIds = [];
$createdProductId = '';
$passed = false;
try {
    $suffix = strtoupper(bin2hex(random_bytes(3)));
    $create = typeApi('POST', 'add_product_type.php', $session, ['category_id' => $categoryId, 'type_name' => "Workflow Type {$suffix}"]);
    typeAssert($create['status'] === 200, 'Product Type creation failed.');
    $editableTypeId = (string) ($create['body']['type']['type_id'] ?? '');
    $createdTypeIds[] = $editableTypeId;

    $edit = typeApi('POST', 'add_product_type.php', $session, ['type_id' => $editableTypeId, 'category_id' => $categoryId, 'type_name' => "Workflow Type {$suffix} Edited"]);
    typeAssert($edit['status'] === 200, 'Product Type update failed.');
    $count = $pdo->prepare('SELECT COUNT(*) FROM product_types WHERE type_id=? AND type_name=?');
    $count->execute([$editableTypeId, "Workflow Type {$suffix} Edited"]);
    typeAssert((int) $count->fetchColumn() === 1, 'Editing inserted a duplicate Product Type.');

    $delete = typeApi('POST', 'delete_product_type.php', $session, ['type_id' => $editableTypeId, 'category_id' => $categoryId]);
    typeAssert($delete['status'] === 200 && empty($delete['body']['archived']), 'Unused Product Type was not hard-deleted.');
    $createdTypeIds = array_values(array_diff($createdTypeIds, [$editableTypeId]));

    $dosageName = "Film-Coated Tablet {$suffix}";
    $dosage = typeApi('POST', 'add_product_type.php', $session, [
        'category_id' => $medicineCategoryId,
        'type_name' => $dosageName,
        'specification_pattern' => 'simple_strength',
    ]);
    $dosageTypeId = (string) ($dosage['body']['type']['type_id'] ?? '');
    typeAssert($dosage['status'] === 200 && $dosageTypeId !== '', 'Dosage Form creation failed: ' . json_encode($dosage));
    $createdTypeIds[] = $dosageTypeId;
    $configuration = $pdo->prepare(
        'SELECT ps.specification_name FROM product_type_specifications pts
         INNER JOIN product_specifications ps ON ps.specification_id=pts.specification_id
         WHERE pts.type_id=? ORDER BY pts.sort_order'
    );
    $configuration->execute([$dosageTypeId]);
    $dosageFields = $configuration->fetchAll(PDO::FETCH_COLUMN);
    typeAssert(count(array_intersect(['Medicine Classification', 'Strength', 'Package Type', 'Pack Content'], $dosageFields)) === 4, 'Simple Strength pattern is missing expected normalized fields.');
    typeAssert(count(array_intersect(['Strength Denominator', 'Volume', 'Flavor'], $dosageFields)) === 0, 'Simple Strength pattern incorrectly contains concentration fields.');
    $duplicate = typeApi('POST', 'add_product_type.php', $session, [
        'category_id' => $medicineCategoryId,
        'type_name' => strtolower($dosageName),
        'specification_pattern' => 'simple_strength',
    ]);
    typeAssert($duplicate['status'] === 400, 'A case-insensitive duplicate Dosage Form was accepted.');
    $duplicateCount = $pdo->prepare('SELECT COUNT(*) FROM product_types WHERE category_id=? AND LOWER(TRIM(type_name))=LOWER(TRIM(?))');
    $duplicateCount->execute([$medicineCategoryId, $dosageName]);
    typeAssert((int) $duplicateCount->fetchColumn() === 1, 'Duplicate Dosage Form rows were created.');

    $used = typeApi('POST', 'add_product_type.php', $session, ['category_id' => $categoryId, 'type_name' => "Used Workflow Type {$suffix}"]);
    $usedTypeId = (string) ($used['body']['type']['type_id'] ?? '');
    typeAssert($used['status'] === 200 && $usedTypeId !== '', 'Used Product Type setup failed.');
    $createdTypeIds[] = $usedTypeId;
    $createdProductId = newUuid($pdo);
    $pdo->prepare("INSERT INTO product (product_id,barcode,brand_name,product_name,category_id,type_id,inventory_unit_id,price,pricing_method,status) VALUES (?,?,?,?,?,?,?,1.00,'manual','Active')")
        ->execute([$createdProductId, 'TYPE-' . $suffix, 'Workflow', 'Type Archive Test', $categoryId, $usedTypeId, $unitId]);

    $archive = typeApi('POST', 'delete_product_type.php', $session, ['type_id' => $usedTypeId, 'category_id' => $categoryId]);
    typeAssert($archive['status'] === 400 && str_contains((string) ($archive['body']['message'] ?? ''), 'cannot be deleted'), 'Referenced Product Type deletion was not blocked: ' . json_encode($archive));
    $active = $pdo->prepare('SELECT is_active FROM product_types WHERE type_id=?');
    $active->execute([$usedTypeId]);
    typeAssert((int) $active->fetchColumn() === 1, 'Blocked Product Type deletion changed its active status.');
    typeAssert((int) $pdo->query('SELECT COUNT(*) FROM product WHERE product_id=' . $pdo->quote($createdProductId))->fetchColumn() === 1, 'Blocked deletion destroyed the referenced product.');

    $list = typeApi('GET', 'get_product_types.php?category_id=' . rawurlencode($categoryId), $session);
    typeAssert(in_array($usedTypeId, array_column($list['body']['types'] ?? [], 'type_id'), true), 'Blocked Product Type deletion removed it from the active list.');

    $passed = true;
} finally {
    if ($createdProductId !== '') $pdo->prepare('DELETE FROM product WHERE product_id=?')->execute([$createdProductId]);
    foreach ($createdTypeIds as $typeId) $pdo->prepare('DELETE FROM product_types WHERE type_id=?')->execute([$typeId]);
    $pdo->prepare('DELETE FROM auth_sessions WHERE auth_session_id=?')->execute([$authSessionId]);
    if (session_status() === PHP_SESSION_ACTIVE) session_write_close();
    session_id($phpSessionId);
    session_start();
    $_SESSION = [];
    session_destroy();
}
if ($passed) echo "Product Type add/edit/delete/archive workflow test passed.\n";
?>
