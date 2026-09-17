<?php
declare(strict_types=1);

require_once __DIR__ . '/../pharma-api/config/db_connection.php';
require_once __DIR__ . '/../pharma-api/v1/purchase_orders/purchase_order_receiving_helpers.php';

function poPageAssert(bool $condition, string $message): void
{
    if (!$condition) throw new RuntimeException($message);
}

function poPageGet(string $path, string $sessionId, string $tabToken): array
{
    $curl = curl_init('http://127.0.0.1/PharmacySystem_for_DocR/pharma-api/v1/' . ltrim($path, '/'));
    curl_setopt_array($curl, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_COOKIE => 'PHPSESSID=' . $sessionId,
        CURLOPT_HTTPHEADER => ['Accept: application/json', 'X-Tab-Token: ' . $tabToken],
        CURLOPT_TIMEOUT => 20,
    ]);
    $rawBody = curl_exec($curl);
    $status = (int) curl_getinfo($curl, CURLINFO_RESPONSE_CODE);
    $error = curl_error($curl);
    curl_close($curl);
    poPageAssert($rawBody !== false, 'HTTP request failed: ' . $error);
    $body = json_decode((string) $rawBody, true);
    poPageAssert(is_array($body), 'Endpoint returned invalid JSON: ' . $rawBody);
    return ['status' => $status, 'body' => $body];
}

$authSessionId = newUuid($pdo);
$phpSessionId = 'codexpopage' . bin2hex(random_bytes(8));
$tabToken = bin2hex(random_bytes(32));

try {
    $user = $pdo->query("SELECT user_id,username,full_name,role,status FROM users WHERE role IN ('admin','super_admin') AND status='Active' LIMIT 1")->fetch(PDO::FETCH_ASSOC);
    poPageAssert((bool) $user, 'An active admin fixture is required.');

    if (session_status() === PHP_SESSION_ACTIVE) session_write_close();
    session_id($phpSessionId);
    session_start();
    $_SESSION = [
        'user_id' => $user['user_id'],
        'username' => $user['username'],
        'full_name' => $user['full_name'],
        'role' => $user['role'],
        'roles' => [$user['role']],
        'role_identifiers' => ['ro-admin'],
        'user_status' => $user['status'],
        'auth_session_id' => $authSessionId,
        'tab_token_hash' => hash('sha256', $tabToken),
    ];
    session_write_close();

    $pdo->prepare("INSERT INTO auth_sessions (auth_session_id,php_session_id,user_id,session_token_hash,expires_at,ip_address,user_agent) VALUES (:id,:php,:user,:token,DATE_ADD(NOW(),INTERVAL 10 MINUTE),'127.0.0.1','Codex PO page API test')")
        ->execute([':id' => $authSessionId, ':php' => $phpSessionId, ':user' => $user['user_id'], ':token' => hash('sha256', $tabToken)]);

    $orders = $pdo->query("SELECT po_id,po_number,status FROM purchase_orders WHERE status IN ('Pending','Delivered') ORDER BY created_at DESC")->fetchAll(PDO::FETCH_ASSOC);
    poPageAssert(count($orders) > 0, 'At least one Pending or Delivered PO fixture is required.');

    $list = poPageGet('purchase_orders/get_purchase_orders.php', $phpSessionId, $tabToken);
    poPageAssert($list['status'] === 200, 'Purchase Order list API failed: ' . json_encode($list));
    $listedById = [];
    foreach (($list['body']['purchase_orders'] ?? []) as $listedOrder) $listedById[(string) ($listedOrder['po_id'] ?? '')] = $listedOrder;

    foreach ($orders as $order) {
        $poId = (string) $order['po_id'];
        $details = poPageGet('purchase_orders/get_purchase_order.php?po_id=' . rawurlencode($poId), $phpSessionId, $tabToken);
        poPageAssert($details['status'] === 200, sprintf('%s PO detail failed: %s', $order['po_number'], json_encode($details)));
        poPageAssert(($details['body']['purchase_order']['po_id'] ?? '') === $poId, sprintf('%s returned the wrong PO id.', $order['po_number']));
        poPageAssert(isset($listedById[$poId]), sprintf('%s is missing from the normal PO list.', $order['po_number']));

        if ($order['status'] === 'Delivered') {
            $payable = (float) ($listedById[$poId]['final_payment'] ?? $listedById[$poId]['total_amount'] ?? 0);
            $hasInvoice = (bool)($listedById[$poId]['invoice_recorded'] ?? false);
            poPageAssert(($listedById[$poId]['payment_available'] ?? false) === ($payable > 0 && $hasInvoice), sprintf('%s payment visibility must require a recorded supplier invoice.', $order['po_number']));
            $receiving = poPageGet('purchase_orders/get_receiving_details.php?po_id=' . rawurlencode($poId), $phpSessionId, $tabToken);
            poPageAssert(in_array($receiving['status'], [200, 404], true), sprintf('%s receiving detail crashed: %s', $order['po_number'], json_encode($receiving)));
            if ($receiving['status'] === 200) {
                poPageAssert(($receiving['body']['receiving']['po_id'] ?? '') === $poId, sprintf('%s receiving API returned the wrong PO id.', $order['po_number']));
            } else {
                poPageAssert(($receiving['body']['code'] ?? '') === 'LEGACY_RECEIVING_UNAVAILABLE', sprintf('%s needs a specific legacy-safe receiving response.', $order['po_number']));
            }
        }
    }

    $legacyCandidate = $pdo->query("SELECT po.po_id FROM purchase_orders po WHERE po.status='Pending' AND NOT EXISTS (SELECT 1 FROM purchase_order_receiving por WHERE por.po_id=po.po_id) LIMIT 1")->fetchColumn();
    if (is_string($legacyCandidate) && $legacyCandidate !== '') {
        $pdo->beginTransaction();
        try {
            $pdo->prepare("UPDATE purchase_orders SET status='Delivered' WHERE po_id=:po_id")->execute([':po_id' => $legacyCandidate]);
            $legacy = buildLegacyPurchaseOrderPaymentDetails($pdo, $legacyCandidate);
            poPageAssert(is_array($legacy), 'Legacy Delivered PO payment fallback must load from the PO record.');
            poPageAssert(($legacy['legacy_receiving_unavailable'] ?? false) === true, 'Legacy fallback must identify unavailable receiving data.');
            poPageAssert(array_key_exists('accepted_units', $legacy['totals']) && $legacy['totals']['accepted_units'] === null, 'Legacy fallback must not manufacture accepted quantities.');
        } finally {
            $pdo->rollBack();
        }
    }

    $pageSource = file_get_contents(__DIR__ . '/../pharma-frontend/purchase_orders.html');
    $moduleSource = file_get_contents(__DIR__ . '/../pharma-frontend/js/modules/purchase_orders.js');
    $printSource = file_get_contents(__DIR__ . '/../pharma-frontend/js/modules/purchase_order_print.js');
    $utilsSource = file_get_contents(__DIR__ . '/../pharma-frontend/js/utils.js');
    poPageAssert(str_contains($pageSource, '.po-table-scroll.po-active-fit { max-height:none!important; overflow:visible!important;'), 'Desktop PO table wrapper must not create an internal scrollbar.');
    poPageAssert(str_contains($pageSource, 'table-layout:fixed!important') && str_contains($pageSource, 'width:23%!important'), 'Desktop PO table must use a fixed proportional layout with the widest Items column.');
    poPageAssert(str_contains($moduleSource, 'purchaseOrderViewRequests') && str_contains($moduleSource, 'purchaseOrderPaymentRequests'), 'View and Payment actions must use single-flight guards.');
    poPageAssert(str_contains($moduleSource, '{ retryGet: false }'), 'Action detail requests must not retry deterministic API failures.');
    poPageAssert(str_contains($printSource, '__purchaseOrderPreviewCache'), 'Embedded PO preview must reuse the View request instead of issuing a duplicate detail request.');
    poPageAssert(str_contains($utilsSource, 'if (error.isHttpResponse) throw lastError;'), 'HTTP failures must not be retried as transport failures.');

    echo 'Purchase Order page API regression test passed for ' . count($orders) . " visible records.\n";
} finally {
    if ($pdo->inTransaction()) $pdo->rollBack();
    $pdo->prepare('DELETE FROM auth_sessions WHERE auth_session_id=:id')->execute([':id' => $authSessionId]);
}
