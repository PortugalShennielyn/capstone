<?php

declare(strict_types=1);

require_once __DIR__ . '/../pharma-api/config/db_connection.php';
require_once __DIR__ . '/../pharma-api/config/id_helpers.php';

function supplierEligibilityAssert(bool $condition, string $message): void
{
    if (!$condition) throw new RuntimeException($message);
}

function supplierEligibilitySession(PDO $pdo, string $role): array
{
    $stmt = $pdo->prepare("SELECT user_id, username, full_name, role, status FROM users WHERE role = :role AND status = 'Active' AND COALESCE(is_deleted, 0) = 0 LIMIT 1");
    $stmt->execute([':role' => $role]);
    $user = $stmt->fetch(PDO::FETCH_ASSOC);
    supplierEligibilityAssert((bool) $user, "An active {$role} account is required.");

    if (session_status() === PHP_SESSION_ACTIVE) session_write_close();
    $phpSessionId = 'codexsupplier' . bin2hex(random_bytes(8));
    $tabToken = bin2hex(random_bytes(32));
    $authSessionId = newUuid($pdo);
    session_id($phpSessionId);
    session_start();
    $_SESSION = [
        'user_id' => $user['user_id'], 'username' => $user['username'], 'full_name' => $user['full_name'],
        'role' => $user['role'], 'roles' => [$user['role']],
        'role_identifiers' => ['ro-' . str_replace('_', '-', $user['role'])],
        'user_status' => $user['status'], 'auth_session_id' => $authSessionId,
        'tab_token_hash' => hash('sha256', $tabToken),
    ];
    session_write_close();

    $pdo->prepare(
        'INSERT INTO auth_sessions
            (auth_session_id, php_session_id, user_id, session_token_hash, expires_at, ip_address, user_agent)
         VALUES (:auth_session_id, :php_session_id, :user_id, :session_token_hash, :expires_at, :ip_address, :user_agent)'
    )->execute([
        ':auth_session_id' => $authSessionId, ':php_session_id' => $phpSessionId,
        ':user_id' => $user['user_id'], ':session_token_hash' => hash('sha256', $tabToken),
        ':expires_at' => date('Y-m-d H:i:s', time() + 3600),
        ':ip_address' => '127.0.0.1', ':user_agent' => 'Codex supplier eligibility test',
    ]);
    return compact('phpSessionId', 'tabToken', 'authSessionId') + ['user' => $user];
}

function supplierEligibilityApi(string $method, string $path, array $session, ?array $payload = null): array
{
    $curl = curl_init('http://127.0.0.1/PharmacySystem_for_DocR/pharma-api/v1/' . ltrim($path, '/'));
    $headers = ['Accept: application/json', 'X-Tab-Token: ' . $session['tabToken']];
    curl_setopt_array($curl, [
        CURLOPT_RETURNTRANSFER => true, CURLOPT_CUSTOMREQUEST => $method,
        CURLOPT_COOKIE => 'PHPSESSID=' . $session['phpSessionId'], CURLOPT_HTTPHEADER => $headers,
        CURLOPT_TIMEOUT => 20,
    ]);
    if ($payload !== null) {
        $headers[] = 'Content-Type: application/json';
        curl_setopt($curl, CURLOPT_HTTPHEADER, $headers);
        curl_setopt($curl, CURLOPT_POSTFIELDS, json_encode($payload, JSON_THROW_ON_ERROR));
    }
    $body = curl_exec($curl);
    $status = (int) curl_getinfo($curl, CURLINFO_RESPONSE_CODE);
    $error = curl_error($curl);
    curl_close($curl);
    supplierEligibilityAssert($body !== false, 'HTTP request failed: ' . $error);
    return ['status' => $status, 'body' => json_decode((string) $body, true) ?: []];
}

$managerSession = supplierEligibilitySession($pdo, 'manager');
$supervisorSession = supplierEligibilitySession($pdo, 'supervisor');
$typeId = (string) $pdo->query('SELECT type_id FROM product_types ORDER BY type_id LIMIT 1')->fetchColumn();
$supplierId = (string) $pdo->query('SELECT supplier_id FROM suppliers WHERE archived_at IS NULL ORDER BY supplier_id LIMIT 1')->fetchColumn();
$inventoryUnitId = (string) $pdo->query('SELECT measurement_unit_id FROM product_measurement_units WHERE is_active=1 ORDER BY measurement_unit_id LIMIT 1')->fetchColumn();
supplierEligibilityAssert($typeId !== '' && $supplierId !== '' && $inventoryUnitId !== '', 'A product type, inventory unit, and active supplier are required.');

$products = [];
$requestIds = [];
$testPassed = false;
try {
    $insertProduct = $pdo->prepare(
        "INSERT INTO product (product_id, barcode, brand_name, product_name, price, type_id, inventory_unit_id, status)
         VALUES (:product_id, :barcode, 'Supplier Eligibility Test', :product_name, 1, :type_id, :inventory_unit_id, 'Active')"
    );
    $insertBatch = $pdo->prepare(
        "INSERT INTO inventory_batches (batch_id, product_id, received_qty, storage_qty, shelf_qty, batch_status)
         VALUES (:batch_id, :product_id, :received_qty, :storage_qty, 0, 'active')"
    );
    $insertAssignment = $pdo->prepare(
        "INSERT INTO supplier_products
            (supplier_product_id, supplier_id, product_id, supplier_cost_price, purchase_unit, units_per_purchase_unit)
         VALUES (:supplier_product_id, :supplier_id, :product_id, 10, 'Box', 1)"
    );
    $cases = [
        'A' => ['stock' => 'out', 'supplier' => true],
        'B' => ['stock' => 'low', 'supplier' => true],
        'C' => ['stock' => 'new', 'supplier' => true],
        'D' => ['stock' => 'out', 'supplier' => false],
        'E' => ['stock' => 'low', 'supplier' => false],
        'F' => ['stock' => 'new', 'supplier' => false],
    ];
    foreach ($cases as $label => $case) {
        $productId = newUuid($pdo);
        $products[$label] = $productId;
        $insertProduct->execute([
            ':product_id' => $productId, ':barcode' => 'supplier-eligibility-' . strtolower($label) . '-' . $productId,
            ':product_name' => "Supplier Eligibility Product {$label}", ':type_id' => $typeId,
            ':inventory_unit_id' => $inventoryUnitId,
        ]);
        if ($case['stock'] !== 'new') {
            $quantity = $case['stock'] === 'low' ? 5 : 0;
            $insertBatch->execute([
                ':batch_id' => newUuid($pdo), ':product_id' => $productId,
                ':received_qty' => max(1, $quantity), ':storage_qty' => $quantity,
            ]);
        }
        if ($case['supplier']) {
            $insertAssignment->execute([
                ':supplier_product_id' => newUuid($pdo), ':supplier_id' => $supplierId, ':product_id' => $productId,
            ]);
        }
    }

    $specification = $pdo->prepare(
        "SELECT ps.specification_id, ps.field_style
         FROM product_type_specifications pts
         INNER JOIN product_specifications ps ON ps.specification_id = pts.specification_id
         WHERE pts.type_id = :type_id
         ORDER BY pts.sort_order, ps.specification_name
         LIMIT 1"
    );
    $specification->execute([':type_id' => $typeId]);
    $specification = $specification->fetch(PDO::FETCH_ASSOC);
    if ($specification) {
        $insertSpecificationValue = $pdo->prepare(
            'INSERT INTO product_specification_values
                (product_id, specification_id, value_text, value_number, measurement_unit_id)
             VALUES (:product_id, :specification_id, :value_text, NULL, NULL)'
        );
        foreach (['A', 'D'] as $label) {
            $insertSpecificationValue->execute([
                ':product_id' => $products[$label],
                ':specification_id' => $specification['specification_id'],
                ':value_text' => "Candidate specification {$label}",
            ]);
        }
    }

    $secondSupplier = $pdo->prepare('SELECT supplier_id FROM suppliers WHERE archived_at IS NULL AND supplier_id <> :supplier_id ORDER BY supplier_id LIMIT 1');
    $secondSupplier->execute([':supplier_id' => $supplierId]);
    $secondSupplierId = (string) $secondSupplier->fetchColumn();
    if ($secondSupplierId !== '') {
        $insertAssignment->execute([
            ':supplier_product_id' => newUuid($pdo), ':supplier_id' => $secondSupplierId, ':product_id' => $products['A'],
        ]);
    }

    $candidateResponse = supplierEligibilityApi('GET', 'purchase_requests/get_pr_candidates.php', $managerSession);
    supplierEligibilityAssert($candidateResponse['status'] === 200, 'Candidate API request failed.');
    foreach ($candidateResponse['body']['data'] ?? [] as $candidate) {
        foreach (['supplier_options', 'supplier_id', 'supplier_product_id', 'supplier_name', 'purchase_unit', 'supplier_cost_price'] as $purchasingField) {
            supplierEligibilityAssert(!array_key_exists($purchasingField, $candidate), "Create PR candidate leaked purchasing field {$purchasingField}.");
        }
        supplierEligibilityAssert(array_key_exists('base_inventory_unit', $candidate), 'Create PR candidate omitted the explicit Product Master base inventory unit field.');
    }
    $candidateIds = array_map('strval', array_column($candidateResponse['body']['data'] ?? [], 'product_id'));
    foreach (['A', 'B', 'C'] as $label) {
        supplierEligibilityAssert(in_array($products[$label], $candidateIds, true), "Product {$label} should be requestable.");
    }
    foreach (['D', 'E', 'F'] as $label) {
        supplierEligibilityAssert(!in_array($products[$label], $candidateIds, true), "Product {$label} must not be requestable.");
    }
    supplierEligibilityAssert(count(array_filter($candidateIds, static fn(string $id): bool => $id === $products['A'])) === 1, 'A product with multiple suppliers appeared more than once.');
    if ($specification) {
        $candidateA = array_values(array_filter($candidateResponse['body']['data'] ?? [], static fn(array $row): bool => ($row['product_id'] ?? '') === $products['A']))[0] ?? null;
        supplierEligibilityAssert(($candidateA['specifications'][0]['value_text'] ?? '') === 'Candidate specification A', 'Saved Product Master specifications were not returned by the PR candidate API.');
    }
    $candidateB = array_values(array_filter($candidateResponse['body']['data'] ?? [], static fn(array $row): bool => ($row['product_id'] ?? '') === $products['B']))[0] ?? null;
    supplierEligibilityAssert($candidateB !== null && empty($candidateB['specifications']), 'A supplier-backed product without a specification did not remain eligible.');

    $requestHtml = (string) file_get_contents(__DIR__ . '/../pharma-frontend/purchase_requests.html');
    $requestJs = (string) file_get_contents(__DIR__ . '/../pharma-frontend/js/modules/purchase_requests.js');
    supplierEligibilityAssert(str_contains($requestHtml, 'id="selectAllVisibleProducts"'), 'The visible-products master checkbox is missing.');
    supplierEligibilityAssert(str_contains($requestJs, "event.target.closest('input,select,button,a,label')"), 'Row selection does not protect interactive controls from double toggles.');
    supplierEligibilityAssert(str_contains($requestJs, "event.target.closest('[data-product-row]')"), 'Whole-row selection is missing.');
    supplierEligibilityAssert(str_contains($requestJs, 'master.indeterminate'), 'The visible-products master checkbox has no indeterminate state.');
    supplierEligibilityAssert(str_contains($requestJs, 'visibleEligibleProducts(type)'), 'Bulk selection does not share the visible eligible-product query.');

    $beforeRequestCount = (int) $pdo->query('SELECT COUNT(*) FROM purchase_requests')->fetchColumn();
    $bypass = supplierEligibilityApi('POST', 'purchase_requests/create_purchase_request.php', $managerSession, [
        'submit' => true,
        'items' => [['product_id' => $products['D'], 'requested_qty' => 10]],
    ]);
    supplierEligibilityAssert($bypass['status'] === 422, 'The no-supplier API bypass was not rejected.');
    supplierEligibilityAssert(
        str_contains((string) ($bypass['body']['message'] ?? ''), 'Supplier Eligibility Product D cannot be requested because no supplier is assigned.')
        || str_contains((string) ($bypass['body']['message'] ?? ''), 'Supplier Eligibility Product D requires an active supplier purchasing setup.'),
        'The no-supplier API error is not clear.'
    );
    supplierEligibilityAssert((int) $pdo->query('SELECT COUNT(*) FROM purchase_requests')->fetchColumn() === $beforeRequestCount, 'The rejected API request saved a partial PR.');

    $invalidPrId = newUuid($pdo);
    $requestIds[] = $invalidPrId;
    $pdo->prepare(
        "INSERT INTO purchase_requests (pr_id, pr_number, requested_by, request_date, status, submitted_at)
         VALUES (:pr_id, :pr_number, :requested_by, CURDATE(), 'Pending Supervisor Approval', NOW())"
    )->execute([
        ':pr_id' => $invalidPrId, ':pr_number' => 'PR-SUPPLIER-INVALID-' . strtoupper(bin2hex(random_bytes(2))),
        ':requested_by' => $managerSession['user']['user_id'],
    ]);
    $pdo->prepare(
        "INSERT INTO purchase_request_items
            (pr_item_id, pr_id, product_id, stock_qty_at_request, requested_qty, unit_label_at_request)
         VALUES (:pr_item_id, :pr_id, :product_id, 0, 10, 'pcs')"
    )->execute([':pr_item_id' => newUuid($pdo), ':pr_id' => $invalidPrId, ':product_id' => $products['D']]);
    $approveInvalid = supplierEligibilityApi('POST', 'purchase_requests/decide_purchase_request.php', $supervisorSession, [
        'pr_id' => $invalidPrId, 'decision' => 'approve',
    ]);
    supplierEligibilityAssert($approveInvalid['status'] === 200, 'Supervisor could not approve a PR independently of supplier setup.');
    $statusStmt = $pdo->prepare('SELECT status FROM purchase_requests WHERE pr_id = :pr_id');
    $statusStmt->execute([':pr_id' => $invalidPrId]);
    supplierEligibilityAssert($statusStmt->fetchColumn() === 'Approved', 'Supervisor approval did not set the PR to Approved.');
    $poStmt = $pdo->prepare('SELECT COUNT(*) FROM purchase_orders WHERE pr_id = :pr_id');
    $poStmt->execute([':pr_id' => $invalidPrId]);
    supplierEligibilityAssert((int) $poStmt->fetchColumn() === 0, 'Supervisor PR approval generated a PO.');
    $generateInvalid = supplierEligibilityApi('POST', 'purchase_requests/generate_purchase_orders.php', $managerSession, [
        'pr_id' => $invalidPrId, 'items' => [], 'supplier_etas' => [], 'supplier_payment_terms' => [],
    ]);
    supplierEligibilityAssert($generateInvalid['status'] === 409, 'Manager PO generation did not reject a product with no active supplier setup.');
    supplierEligibilityAssert(str_contains((string) ($generateInvalid['body']['message'] ?? ''), 'no active supplier purchasing setup'), 'Manager received an unclear missing supplier setup error.');

    $validPrId = newUuid($pdo);
    $requestIds[] = $validPrId;
    $pdo->prepare(
        "INSERT INTO purchase_requests (pr_id, pr_number, requested_by, request_date, status, submitted_at)
         VALUES (:pr_id, :pr_number, :requested_by, CURDATE(), 'Pending Supervisor Approval', NOW())"
    )->execute([
        ':pr_id' => $validPrId, ':pr_number' => 'PR-SUPPLIER-VALID-' . strtoupper(bin2hex(random_bytes(2))),
        ':requested_by' => $managerSession['user']['user_id'],
    ]);
    $pdo->prepare(
        "INSERT INTO purchase_request_items
            (pr_item_id, pr_id, product_id, stock_qty_at_request, requested_qty, unit_label_at_request)
         VALUES (:pr_item_id, :pr_id, :product_id, 0, 10, 'pcs')"
    )->execute([':pr_item_id' => newUuid($pdo), ':pr_id' => $validPrId, ':product_id' => $products['A']]);
    $supervisorList = supplierEligibilityApi('GET', 'purchase_requests/get_purchase_requests.php', $supervisorSession);
    $validRequest = array_values(array_filter(
        $supervisorList['body']['data']['requests'] ?? [],
        static fn(array $request): bool => ($request['pr_id'] ?? '') === $validPrId
    ))[0] ?? null;
    supplierEligibilityAssert(empty($validRequest['items'][0]['supplier_options']), 'Supervisor received supplier purchasing controls during PR review.');
    $approveValid = supplierEligibilityApi('POST', 'purchase_requests/decide_purchase_request.php', $supervisorSession, [
        'pr_id' => $validPrId, 'decision' => 'approve',
    ]);
    supplierEligibilityAssert($approveValid['status'] === 200, 'Supervisor could not approve the valid PR.');
    $managerList = supplierEligibilityApi('GET', 'purchase_requests/get_purchase_requests.php', $managerSession);
    $managerValidRequest = array_values(array_filter(
        $managerList['body']['data']['requests'] ?? [],
        static fn(array $request): bool => ($request['pr_id'] ?? '') === $validPrId
    ))[0] ?? null;
    supplierEligibilityAssert(!empty($managerValidRequest['items'][0]['supplier_options']), 'Approved PR did not expose supplier options to Manager/Admin PO generation.');

    $testPassed = true;
} finally {
    foreach ($requestIds as $requestId) {
        $pdo->prepare('DELETE FROM activity_logs WHERE reference_id = :reference_id')->execute([':reference_id' => $requestId]);
        $pdo->prepare('DELETE FROM purchase_requests WHERE pr_id = :pr_id')->execute([':pr_id' => $requestId]);
    }
    if ($products) {
        $ids = array_values($products);
        $placeholders = implode(',', array_fill(0, count($ids), '?'));
        $pdo->prepare("DELETE FROM product_specification_values WHERE product_id IN ({$placeholders})")->execute($ids);
        $pdo->prepare("DELETE FROM supplier_products WHERE product_id IN ({$placeholders})")->execute($ids);
        $pdo->prepare("DELETE FROM inventory_batches WHERE product_id IN ({$placeholders})")->execute($ids);
        $pdo->prepare("DELETE FROM product WHERE product_id IN ({$placeholders})")->execute($ids);
    }
    $pdo->prepare('DELETE FROM auth_sessions WHERE auth_session_id IN (?, ?)')->execute([
        $managerSession['authSessionId'], $supervisorSession['authSessionId'],
    ]);
    foreach ([$managerSession, $supervisorSession] as $testSession) {
        if (session_status() === PHP_SESSION_ACTIVE) session_write_close();
        session_id($testSession['phpSessionId']);
        session_start();
        $_SESSION = [];
        session_destroy();
    }
}

if ($testPassed) echo "Purchase Request supplier eligibility tests passed.\n";
