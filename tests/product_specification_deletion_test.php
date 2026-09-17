<?php

declare(strict_types=1);

require_once __DIR__ . '/../pharma-api/config/db_connection.php';
require_once __DIR__ . '/../pharma-api/v1/products/product_customization_schema.php';

function specificationDeleteAssert(bool $condition, string $message): void
{
    if (!$condition) throw new RuntimeException($message);
}

function specificationDeleteApi(string $sessionId, string $tabToken, string $specificationId): array
{
    $curl = curl_init('http://127.0.0.1/PharmacySystem_for_DocR/pharma-api/v1/products/delete_product_specification.php');
    curl_setopt_array($curl, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_POST => true,
        CURLOPT_COOKIE => 'PHPSESSID=' . $sessionId,
        CURLOPT_HTTPHEADER => ['Content-Type: application/json', 'X-Tab-Token: ' . $tabToken],
        CURLOPT_POSTFIELDS => json_encode(['specification_id' => $specificationId]),
        CURLOPT_TIMEOUT => 20,
    ]);
    $body = curl_exec($curl);
    $status = (int) curl_getinfo($curl, CURLINFO_RESPONSE_CODE);
    $error = curl_error($curl);
    curl_close($curl);
    specificationDeleteAssert($body !== false, 'Specification delete request failed: ' . $error);
    $json = json_decode((string) $body, true);
    specificationDeleteAssert(is_array($json), 'Specification delete response was not JSON.');
    return [$status, $json];
}

ensureProductCustomizationSchema($pdo);
$frontend = (string) file_get_contents(__DIR__ . '/../pharma-frontend/js/modules/products.js');
$productsHtml = (string) file_get_contents(__DIR__ . '/../pharma-frontend/products.html');
specificationDeleteAssert(!str_contains($frontend, 'move-specification-up') && !str_contains($frontend, 'move-specification-down'), 'Specification reorder controls or handlers still exist.');
specificationDeleteAssert(str_contains($frontend, 'delete-specification-option') && str_contains($frontend, 'fa-trash'), 'Dynamic specification rows do not include Delete actions.');
specificationDeleteAssert(str_contains($frontend, "title: 'Delete Specification?'") && str_contains($frontend, "confirmButtonText: 'Delete'"), 'Specification deletion does not use the project confirmation dialog.');
specificationDeleteAssert(str_contains($frontend, "container: 'product-specification-confirmation'") && str_contains($productsHtml, '.swal2-container.product-specification-confirmation { z-index:1090!important; }'), 'Specification confirmation is not raised above the nested customizer modal.');

$user = $pdo->query("SELECT user_id, username, full_name, role, status FROM users WHERE role IN ('admin','super_admin','manager') AND status = 'Active' AND is_deleted = 0 LIMIT 1")->fetch(PDO::FETCH_ASSOC);
specificationDeleteAssert((bool) $user, 'An active Manager/Admin fixture is required.');
$typeId = (string) $pdo->query('SELECT type_id FROM product_types ORDER BY type_id LIMIT 1')->fetchColumn();
specificationDeleteAssert($typeId !== '', 'A Product Type fixture is required.');
$usedSpecificationId = (string) $pdo->query(
    'SELECT specification_id FROM product_specification_values GROUP BY specification_id HAVING COUNT(*) > 0 LIMIT 1'
)->fetchColumn();
specificationDeleteAssert($usedSpecificationId !== '', 'A specification used by a product is required.');

$sessionId = 'codexspecdelete' . bin2hex(random_bytes(8));
$tabToken = bin2hex(random_bytes(32));
$authSessionId = newUuid($pdo);
$specificationId = newUuid($pdo);
$choiceId = newUuid($pdo);

if (session_status() === PHP_SESSION_ACTIVE) session_write_close();
session_id($sessionId);
session_start();
$_SESSION = [
    'user_id' => $user['user_id'], 'username' => $user['username'], 'full_name' => $user['full_name'],
    'role' => $user['role'], 'roles' => [$user['role']], 'role_identifiers' => ['ro-' . str_replace('_', '-', strtolower((string) $user['role']))],
    'user_status' => $user['status'], 'auth_session_id' => $authSessionId,
    'tab_token_hash' => hash('sha256', $tabToken),
];
session_write_close();
$pdo->prepare('INSERT INTO auth_sessions (auth_session_id, php_session_id, user_id, session_token_hash, expires_at, ip_address, user_agent) VALUES (?, ?, ?, ?, DATE_ADD(NOW(), INTERVAL 1 HOUR), ?, ?)')
    ->execute([$authSessionId, $sessionId, $user['user_id'], hash('sha256', $tabToken), '127.0.0.1', 'Codex specification deletion test']);

try {
    $pdo->prepare("INSERT INTO product_specifications (specification_id, specification_name, field_style, allow_custom_value) VALUES (?, ?, 'Selection List', 1)")
        ->execute([$specificationId, 'Codex Unused Specification ' . substr($specificationId, 0, 8)]);
    $pdo->prepare('INSERT INTO product_specification_choices (choice_id, specification_id, choice_value, sort_order) VALUES (?, ?, ?, 1)')
        ->execute([$choiceId, $specificationId, 'Fixture Choice']);
    $pdo->prepare('INSERT INTO product_type_specifications (type_id, specification_id, sort_order) VALUES (?, ?, 9999)')
        ->execute([$typeId, $specificationId]);

    [$unusedStatus, $unusedResponse] = specificationDeleteApi($sessionId, $tabToken, $specificationId);
    specificationDeleteAssert($unusedStatus === 200 && ($unusedResponse['status'] ?? '') === 'success', 'Unused specification was not deleted.');
    $definitionCheck = $pdo->prepare('SELECT COUNT(*) FROM product_specifications WHERE specification_id = ?');
    $definitionCheck->execute([$specificationId]);
    specificationDeleteAssert((int) $definitionCheck->fetchColumn() === 0, 'Unused specification definition still exists.');
    $assignmentCheck = $pdo->prepare('SELECT COUNT(*) FROM product_type_specifications WHERE specification_id = ?');
    $assignmentCheck->execute([$specificationId]);
    specificationDeleteAssert((int) $assignmentCheck->fetchColumn() === 0, 'Unused specification assignment was not removed by the existing cascade.');
    $choiceCheck = $pdo->prepare('SELECT COUNT(*) FROM product_specification_choices WHERE specification_id = ?');
    $choiceCheck->execute([$specificationId]);
    specificationDeleteAssert((int) $choiceCheck->fetchColumn() === 0, 'Unused specification choices were not removed by the existing cascade.');

    [$usedStatus, $usedResponse] = specificationDeleteApi($sessionId, $tabToken, $usedSpecificationId);
    specificationDeleteAssert($usedStatus === 409, 'A specification used by products was not protected.');
    specificationDeleteAssert(($usedResponse['message'] ?? '') === 'This specification is currently used by existing products and cannot be deleted.', 'Used-specification safety message is incorrect.');
    $definitionCheck->execute([$usedSpecificationId]);
    specificationDeleteAssert((int) $definitionCheck->fetchColumn() === 1, 'Protected specification definition was deleted.');

} finally {
    $pdo->prepare('DELETE FROM product_specifications WHERE specification_id = ?')->execute([$specificationId]);
    $pdo->prepare('DELETE FROM auth_sessions WHERE auth_session_id = ?')->execute([$authSessionId]);
    if (session_status() === PHP_SESSION_ACTIVE) session_write_close();
    session_id($sessionId);
    session_start();
    $_SESSION = [];
    session_destroy();
}

echo "Product specification deletion safety tests passed.\n";
