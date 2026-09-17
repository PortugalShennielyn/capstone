<?php
require_once '../../config/db_connection.php';
$allowedRoles = ['supervisor', 'manager', 'super_admin', 'admin', 'ro-supervisor', 'ro-manager', 'ro-super-admin', 'ro-admin'];
require_once '../../config/require_auth.php';
require_once 'purchase_request_helpers.php';

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    sendPurchaseRequestJson(false, 'Only GET requests are allowed.', null, 405);
}

$prId = cleanId($_GET['pr_id'] ?? null);
if ($prId === '') {
    sendPurchaseRequestJson(false, 'Purchase request id is required.', null, 422);
}

try {
    ensurePurchaseRequestSchema($pdo);
    $result = purchaseRequestRelatedPurchaseOrders($pdo, $prId);
    if ($result === null) {
        sendPurchaseRequestJson(false, 'Purchase request was not found.', null, 404);
    }
    sendPurchaseRequestJson(true, 'Related purchase orders loaded.', $result);
} catch (Throwable $e) {
    error_log('[PURCHASE REQUESTS] Unable to load related purchase orders: ' . $e->getMessage());
    sendPurchaseRequestJson(false, 'Unable to load related purchase orders.', null, 500);
}
?>
