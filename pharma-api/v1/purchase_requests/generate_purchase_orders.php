<?php
require_once '../../config/db_connection.php';
$allowedRoles = ['super_admin', 'admin', 'manager', 'ro-super-admin', 'ro-admin', 'ro-manager'];
require_once '../../config/require_auth.php';
require_once '../activity_log_helpers.php';
require_once 'purchase_request_helpers.php';
require_once 'automatic_purchase_order_helpers.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    sendPurchaseRequestJson(false, 'Only POST requests are allowed.', null, 405);
}

$payload = readPurchaseRequestPayload();
$prId = cleanId($payload['pr_id'] ?? null);
$assignments = is_array($payload['items'] ?? null) ? $payload['items'] : [];
$supplierEtas = is_array($payload['supplier_etas'] ?? null) ? $payload['supplier_etas'] : [];

if ($prId === '') sendPurchaseRequestJson(false, 'Purchase request id is required.', null, 422);

try {
    ensurePurchaseRequestSchema($pdo);
    ensurePurchaseOrderSchema($pdo);
    requireActivePurchaseRequestManager($pdo);
    $pdo->beginTransaction();
    $request = purchaseRequestById($pdo, $prId, true);
    if (!$request) throw new InvalidArgumentException('Purchase request was not found.');
    if (($request['status'] ?? '') !== 'Approved') {
        throw new InvalidArgumentException('Purchase orders can only be generated from an approved purchase request.');
    }

    // The locked PR row serializes concurrent clicks. Recheck related records
    // after acquiring the lock so repeated calls can never create another set.
    assertPurchaseRequestHasValidItems($pdo, $prId, 'Cannot generate Purchase Order because this Purchase Request has no products.');
    $existing = array_values(array_filter(purchaseRequestPurchaseOrders($pdo, $prId), static fn($po) => !in_array($po['status'], ['Cancelled', 'Rejected'], true)));
    if ($existing) {
        $pdo->commit();
        sendPurchaseRequestJson(true, 'Purchase orders were already generated for this request.', [
            'pr_id' => $prId,
            'purchase_orders' => $existing,
            'idempotent' => true,
        ]);
    }

    $generated = generatePurchaseOrdersForApprovedRequest(
        $pdo,
        $request,
        $assignments,
        $supplierEtas
    );
    $pdo->commit();
    recordActivityLog(
        $pdo,
        'Purchase Order',
        'Generated',
        count($generated) . ' purchase order(s) generated from ' . ($request['pr_number'] ?? 'PR') . ' by Manager/Admin',
        $prId
    );
    sendPurchaseRequestJson(true, count($generated) . ' purchase order(s) generated.', [
        'pr_id' => $prId,
        'purchase_orders' => $generated,
        'idempotent' => false,
    ], 201);
} catch (InvalidArgumentException $e) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    sendPurchaseRequestJson(false, $e->getMessage(), null, 409);
} catch (Throwable $e) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    error_log('[PURCHASE REQUESTS] PO generation failed: ' . $e->getMessage());
    sendPurchaseRequestJson(false, 'Unable to generate purchase orders. No purchase orders were created.', null, 500);
}
?>
