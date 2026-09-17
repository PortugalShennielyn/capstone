<?php

declare(strict_types=1);

require_once __DIR__ . '/../pharma-api/config/db_connection.php';
require_once __DIR__ . '/../pharma-api/config/id_helpers.php';

function prHttpAssert(bool $condition, string $message): void
{
    if (!$condition) throw new RuntimeException($message);
}

function createTestSession(PDO $pdo, string $role): array
{
    $userStmt = $pdo->prepare("SELECT user_id, username, full_name, role, status FROM users WHERE role = :role AND status = 'Active' AND is_deleted = 0 LIMIT 1");
    $userStmt->execute([':role' => $role]);
    $user = $userStmt->fetch(PDO::FETCH_ASSOC);
    prHttpAssert((bool) $user, "An active {$role} account is required.");

    if (session_status() === PHP_SESSION_ACTIVE) session_write_close();
    $phpSessionId = 'codexpr' . bin2hex(random_bytes(12));
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
        ':ip_address' => '127.0.0.1', ':user_agent' => 'Codex PR workflow test',
    ]);
    return compact('phpSessionId', 'tabToken', 'authSessionId') + ['user' => $user];
}

function apiRequest(string $method, string $path, array $session, ?array $payload = null): array
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
    prHttpAssert($body !== false, 'HTTP request failed: ' . $error);
    return ['status' => $status, 'body' => json_decode((string) $body, true) ?: []];
}

$adminSession = createTestSession($pdo, 'admin');
$managerSession = createTestSession($pdo, 'manager');
$supervisorSession = createTestSession($pdo, 'supervisor');
$prId = null;
$managerPrId = null;
$poId = null;
$workflowPassed = false;
try {
    $product = $pdo->query(
        "SELECT p.product_id, sp.supplier_product_id, sp.supplier_id, sp.supplier_cost_price,
                COALESCE(sp.units_per_purchase_unit, 1) AS units_per_purchase_unit,
                COALESCE(NULLIF(sp.purchase_unit, ''), 'pcs') AS purchase_unit
         FROM product p
         INNER JOIN supplier_products sp ON sp.product_id = p.product_id
         LEFT JOIN medicine_details md ON md.product_id = p.product_id
         LEFT JOIN grocery_details gd ON gd.product_id = p.product_id
         LEFT JOIN medical_supply_details msd ON msd.product_id = p.product_id
         WHERE p.status = 'Active'
           AND COALESCE(
                (SELECT NULLIF(TRIM(psv.value_text), '')
                 FROM product_specification_values psv
                 INNER JOIN product_specifications ps ON ps.specification_id = psv.specification_id
                 WHERE psv.product_id = p.product_id
                   AND LOWER(REPLACE(REPLACE(TRIM(ps.specification_name), '_', ' '), '-', ' ')) = 'inventory unit'
                 LIMIT 1),
                NULLIF(TRIM(md.package_type), ''), NULLIF(TRIM(gd.package_type), ''), NULLIF(TRIM(msd.package_type), '')
           ) IS NOT NULL
           AND sp.supplier_cost_price IS NOT NULL
           AND NOT EXISTS (
             SELECT 1 FROM purchase_request_items pri
             INNER JOIN purchase_requests pr ON pr.pr_id = pri.pr_id
             WHERE pri.product_id = p.product_id
               AND pr.status IN ('Draft','Pending Supervisor Approval','Approved','Revision Requested')
           )
         ORDER BY p.product_name LIMIT 1"
    )->fetch(PDO::FETCH_ASSOC);
    $productId = (string) ($product['product_id'] ?? '');
    prHttpAssert($productId !== '', 'An active product without an active PR is required.');

    $created = apiRequest('POST', 'purchase_requests/create_purchase_request.php', $adminSession, [
        'submit' => false,
        'items' => [['product_id' => $productId, 'requested_qty' => 7]],
    ]);
    prHttpAssert($created['status'] === 201 && ($created['body']['success'] ?? false), 'Admin could not save a Draft PR without optional notes through the HTTP API: ' . json_encode($created));
    $prId = (string) $created['body']['data']['pr_id'];

    $listedDraft = apiRequest('GET', 'purchase_requests/get_purchase_requests.php', $adminSession);
    $draft = array_values(array_filter($listedDraft['body']['data']['requests'] ?? [], fn(array $request): bool => $request['pr_id'] === $prId))[0] ?? null;
    prHttpAssert(($draft['status'] ?? '') === 'Draft', 'Saved Draft did not appear in Purchase Request Records.');
    prHttpAssert((int) ($draft['po_generated_count'] ?? -1) === 0, 'A Draft PR without related POs did not report a zero PO count.');

    $submitted = apiRequest('POST', 'purchase_requests/save_purchase_request.php', $adminSession, [
        'pr_id' => $prId, 'submit' => true,
        'items' => [['product_id' => $productId, 'requested_qty' => 7]],
    ]);
    prHttpAssert($submitted['status'] === 200 && ($submitted['body']['success'] ?? false), 'Admin could not submit the Draft PR.');

    $adminDecision = apiRequest('POST', 'purchase_requests/decide_purchase_request.php', $adminSession, ['pr_id' => $prId, 'decision' => 'approve']);
    prHttpAssert($adminDecision['status'] === 403, 'Admin was incorrectly allowed to perform Supervisor approval.');
    $managerDecision = apiRequest('POST', 'purchase_requests/decide_purchase_request.php', $managerSession, ['pr_id' => $prId, 'decision' => 'approve']);
    prHttpAssert($managerDecision['status'] === 403, 'Manager was incorrectly allowed to perform Supervisor approval.');
    $supervisorCreate = apiRequest('POST', 'purchase_requests/create_purchase_request.php', $supervisorSession, [
        'submit' => false, 'items' => [['product_id' => $productId, 'requested_qty' => 1]],
    ]);
    prHttpAssert($supervisorCreate['status'] === 403, 'Supervisor was incorrectly allowed to create a PR.');

    $supervisorList = apiRequest('GET', 'purchase_requests/get_purchase_requests.php', $supervisorSession);
    $pending = array_values(array_filter($supervisorList['body']['data']['requests'] ?? [], fn(array $request): bool => $request['pr_id'] === $prId))[0] ?? null;
    prHttpAssert(($pending['status'] ?? '') === 'Pending Supervisor Approval', 'Submitted PR did not reach Supervisor Approval.');

    $prematureGeneration = apiRequest('POST', 'purchase_requests/generate_purchase_orders.php', $managerSession, ['pr_id' => $prId, 'items' => []]);
    prHttpAssert($prematureGeneration['status'] === 409, 'Manager was incorrectly allowed to generate a PO from a pending PR.');
    $inventoryBatchCountBefore = (int) $pdo->query('SELECT COUNT(*) FROM inventory_batches')->fetchColumn();

    $approved = apiRequest('POST', 'purchase_requests/decide_purchase_request.php', $supervisorSession, ['pr_id' => $prId, 'decision' => 'approve']);
    prHttpAssert($approved['status'] === 200 && ($approved['body']['success'] ?? false), 'Supervisor could not approve the submitted PR.');
    $approvalTimes = $pdo->prepare('SELECT submitted_at, decided_at FROM purchase_requests WHERE pr_id = :pr_id');
    $approvalTimes->execute([':pr_id' => $prId]);
    $approvalTimeRow = $approvalTimes->fetch(PDO::FETCH_ASSOC);
    prHttpAssert(
        !empty($approvalTimeRow['submitted_at']) && !empty($approvalTimeRow['decided_at'])
        && strtotime((string) $approvalTimeRow['decided_at']) >= strtotime((string) $approvalTimeRow['submitted_at']),
        'PR approval time occurred before submission time.'
    );
    $poCountAfterApproval = $pdo->prepare('SELECT COUNT(*) FROM purchase_orders WHERE pr_id = :pr_id');
    $poCountAfterApproval->execute([':pr_id' => $prId]);
    prHttpAssert((int) $poCountAfterApproval->fetchColumn() === 0, 'Supervisor PR approval incorrectly created a purchase order.');
    $supervisorGeneration = apiRequest('POST', 'purchase_requests/generate_purchase_orders.php', $supervisorSession, ['pr_id' => $prId, 'items' => []]);
    prHttpAssert($supervisorGeneration['status'] === 403, 'Supervisor was incorrectly allowed to call PO generation.');

    $listedApproved = apiRequest('GET', 'purchase_requests/get_purchase_requests.php', $adminSession);
    $final = array_values(array_filter($listedApproved['body']['data']['requests'] ?? [], fn(array $request): bool => $request['pr_id'] === $prId))[0] ?? null;
    prHttpAssert(($final['status'] ?? '') === 'Approved' && count($final['items'] ?? []) === 1, 'Approved PR did not appear correctly in Purchase Request Records.');

    $purchaseOrderQty = (int) ceil(7 / max(1, (int) $product['units_per_purchase_unit']));
    $createdPo = apiRequest('POST', 'purchase_requests/generate_purchase_orders.php', $managerSession, [
        'pr_id' => $prId,
        'items' => [[
            'pr_item_id' => $final['items'][0]['pr_item_id'],
            'supplier_product_id' => $product['supplier_product_id'],
            'order_qty' => $purchaseOrderQty,
        ]],
        'supplier_payment_terms' => [$product['supplier_id'] => 'Cash'],
        'supplier_etas' => [$product['supplier_id'] => date('Y-m-d', strtotime('+7 days'))],
    ]);
    prHttpAssert($createdPo['status'] === 201 && ($createdPo['body']['success'] ?? false), 'Manager could not generate a PO from the approved PR: ' . json_encode($createdPo));
    $poId = (string) $createdPo['body']['data']['purchase_orders'][0]['po_id'];
    $generatedState = $pdo->prepare('SELECT status, approval_status, pr_id FROM purchase_orders WHERE po_id = :po_id');
    $generatedState->execute([':po_id' => $poId]);
    $generatedStateRow = $generatedState->fetch(PDO::FETCH_ASSOC);
    prHttpAssert(($generatedStateRow['status'] ?? '') === 'Pending' && ($generatedStateRow['approval_status'] ?? '') === 'Approved' && ($generatedStateRow['pr_id'] ?? '') === $prId, 'Generated PO did not enter operational Pending state without secondary approval or retain the PR reference.');
    prHttpAssert((int) $pdo->query('SELECT COUNT(*) FROM inventory_batches')->fetchColumn() === $inventoryBatchCountBefore, 'PO generation changed inventory batches.');
    $purchaseOrderModule = apiRequest('GET', 'purchase_orders/get_purchase_orders.php', $managerSession);
    $modulePoIds = array_map('strval', array_column($purchaseOrderModule['body']['purchase_orders'] ?? [], 'po_id'));
    prHttpAssert(in_array($poId, $modulePoIds, true), 'Generated PO did not appear in the Purchase Orders module API.');
    $duplicateGeneration = apiRequest('POST', 'purchase_requests/generate_purchase_orders.php', $managerSession, [
        'pr_id' => $prId, 'items' => [], 'supplier_payment_terms' => [], 'supplier_etas' => [],
    ]);
    prHttpAssert($duplicateGeneration['status'] === 200 && ($duplicateGeneration['body']['data']['idempotent'] ?? false), 'Repeated PO generation was not idempotent.');
    $orderedList = apiRequest('GET', 'purchase_requests/get_purchase_requests.php', $adminSession);
    $ordered = array_values(array_filter($orderedList['body']['data']['requests'] ?? [], fn(array $request): bool => $request['pr_id'] === $prId))[0] ?? null;
    prHttpAssert(($ordered['workflow_status'] ?? '') === 'Ordered' && (float) ($ordered['total_remaining_qty'] ?? -1) === 0.0, 'The PR did not become Ordered after its linked PO fulfilled the requested quantity.');
    prHttpAssert((int) ($ordered['po_generated_count'] ?? 0) === 1, 'The PR listing did not aggregate its generated PO count by pr_id.');
    prHttpAssert(count($ordered['purchase_orders'] ?? []) === 1 && !empty($ordered['items'][0]['pr_item_id']), 'The PR-to-PO item traceability is missing.');

    $managerProductStmt = $pdo->prepare(
        "SELECT p.product_id FROM product p
         LEFT JOIN medicine_details md ON md.product_id = p.product_id
         LEFT JOIN grocery_details gd ON gd.product_id = p.product_id
         LEFT JOIN medical_supply_details msd ON msd.product_id = p.product_id
         WHERE p.status = 'Active' AND p.product_id <> :product_id
           AND EXISTS (SELECT 1 FROM supplier_products sp INNER JOIN suppliers s ON s.supplier_id = sp.supplier_id WHERE sp.product_id = p.product_id AND s.archived_at IS NULL)
           AND COALESCE(
                (SELECT NULLIF(TRIM(psv.value_text), '') FROM product_specification_values psv INNER JOIN product_specifications ps ON ps.specification_id = psv.specification_id WHERE psv.product_id = p.product_id AND LOWER(REPLACE(REPLACE(TRIM(ps.specification_name), '_', ' '), '-', ' ')) = 'inventory unit' LIMIT 1),
                NULLIF(TRIM(md.package_type), ''), NULLIF(TRIM(gd.package_type), ''), NULLIF(TRIM(msd.package_type), '')
           ) IS NOT NULL
         ORDER BY p.product_name LIMIT 1"
    );
    $managerProductStmt->execute([':product_id' => $productId]);
    $managerProductId = (string) $managerProductStmt->fetchColumn();
    $managerDraft = apiRequest('POST', 'purchase_requests/create_purchase_request.php', $managerSession, [
        'submit' => false,
        'items' => [['product_id' => $managerProductId, 'requested_qty' => 3]],
    ]);
    prHttpAssert($managerDraft['status'] === 201 && ($managerDraft['body']['success'] ?? false), 'Manager could not create a Draft PR.');
    $managerPrId = (string) $managerDraft['body']['data']['pr_id'];
    $managerSubmit = apiRequest('POST', 'purchase_requests/save_purchase_request.php', $managerSession, [
        'pr_id' => $managerPrId, 'submit' => true,
        'items' => [['product_id' => $managerProductId, 'requested_qty' => 3]],
    ]);
    prHttpAssert($managerSubmit['status'] === 200, 'Manager could not submit a Draft PR.');
    $revision = apiRequest('POST', 'purchase_requests/decide_purchase_request.php', $supervisorSession, [
        'pr_id' => $managerPrId, 'decision' => 'revision',
    ]);
    prHttpAssert($revision['status'] === 200 && ($revision['body']['data']['status'] ?? '') === 'Revision Requested', 'Supervisor could not request a revision.');
    $resubmitted = apiRequest('POST', 'purchase_requests/save_purchase_request.php', $managerSession, [
        'pr_id' => $managerPrId, 'submit' => true,
        'items' => [['product_id' => $managerProductId, 'requested_qty' => 4]],
    ]);
    prHttpAssert($resubmitted['status'] === 200 && ($resubmitted['body']['data']['status'] ?? '') === 'Pending Supervisor Approval', 'Manager could not edit and resubmit a Revision Requested PR.');
    $resubmittedDecision = $pdo->prepare('SELECT supervisor_user_id, decided_at FROM purchase_requests WHERE pr_id = :pr_id');
    $resubmittedDecision->execute([':pr_id' => $managerPrId]);
    $resubmittedDecisionRow = $resubmittedDecision->fetch(PDO::FETCH_ASSOC);
    prHttpAssert($resubmittedDecisionRow['supervisor_user_id'] === null && $resubmittedDecisionRow['decided_at'] === null, 'Resubmission retained stale decision metadata.');
    $rejected = apiRequest('POST', 'purchase_requests/decide_purchase_request.php', $supervisorSession, [
        'pr_id' => $managerPrId, 'decision' => 'reject',
    ]);
    prHttpAssert($rejected['status'] === 200 && ($rejected['body']['data']['status'] ?? '') === 'Rejected', 'Supervisor could not reject the resubmitted PR.');
    $rejectedList = apiRequest('GET', 'purchase_requests/get_purchase_requests.php', $supervisorSession);
    $rejectedRecord = array_values(array_filter($rejectedList['body']['data']['requests'] ?? [], fn(array $request): bool => $request['pr_id'] === $managerPrId))[0] ?? null;
    prHttpAssert(
        ($rejectedRecord['status'] ?? '') === 'Rejected'
        && !empty($rejectedRecord['supervisor_name'])
        && !empty($rejectedRecord['decided_at']),
        'Rejected PR audit information was not retained.'
    );

    $workflowPassed = true;
} finally {
    if ($prId) {
        $linkedPoIds = $pdo->prepare('SELECT po_id FROM purchase_orders WHERE pr_id = :pr_id');
        $linkedPoIds->execute([':pr_id' => $prId]);
        foreach ($linkedPoIds->fetchAll(PDO::FETCH_COLUMN) as $linkedPoId) {
            $pdo->prepare('DELETE FROM activity_logs WHERE reference_id = :reference_id')->execute([':reference_id' => $linkedPoId]);
        }
        $pdo->prepare('DELETE FROM purchase_orders WHERE pr_id = :pr_id')->execute([':pr_id' => $prId]);
        $pdo->prepare('DELETE FROM activity_logs WHERE reference_id = :reference_id')->execute([':reference_id' => $prId]);
        $pdo->prepare('DELETE FROM purchase_requests WHERE pr_id = :pr_id')->execute([':pr_id' => $prId]);
    }
    if ($managerPrId) {
        $pdo->prepare('DELETE FROM activity_logs WHERE reference_id = :reference_id')->execute([':reference_id' => $managerPrId]);
        $pdo->prepare('DELETE FROM purchase_requests WHERE pr_id = :pr_id')->execute([':pr_id' => $managerPrId]);
    }
    $pdo->prepare('DELETE FROM auth_sessions WHERE auth_session_id IN (?, ?, ?)')->execute([$adminSession['authSessionId'], $managerSession['authSessionId'], $supervisorSession['authSessionId']]);
    foreach ([$adminSession, $managerSession, $supervisorSession] as $testSession) {
        if (session_status() === PHP_SESSION_ACTIVE) session_write_close();
        session_id($testSession['phpSessionId']);
        session_start();
        $_SESSION = [];
        session_destroy();
    }
}
if ($workflowPassed) echo "HTTP PR workflow passed: Admin Draft -> Submit -> Supervisor PR-only approval -> Manager PO generation -> Ordered; duplicate generation idempotent; Manager Revision -> Resubmit -> Supervisor Rejected; role boundaries enforced.\n";
