<?php
require_once '../../config/db_connection.php';
$allowedRoles = ['super_admin', 'admin', 'manager', 'ro-super-admin', 'ro-admin', 'ro-manager'];
require_once '../../config/require_auth.php';
require_once '../activity_log_helpers.php';
require_once 'purchase_request_helpers.php';
require_once '../inventory/inventory_stock_summary.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    sendPurchaseRequestJson(false, 'Only POST requests are allowed.', null, 405);
}

$payload = readPurchaseRequestPayload();
$prId = cleanId($payload['pr_id'] ?? null);
$items = is_array($payload['items'] ?? null) ? $payload['items'] : [];
$submit = ($payload['submit'] ?? false) === true;

if ($prId === '') sendPurchaseRequestJson(false, 'Purchase request id is required.', null, 422);
if (!$items) sendPurchaseRequestJson(false, 'Purchase Request must contain at least one product.', null, 422);

try {
    ensurePurchaseRequestSchema($pdo);
    $pdo->beginTransaction();
    $request = purchaseRequestById($pdo, $prId, true);
    if (!$request) throw new InvalidArgumentException('Purchase request was not found.');
    if (cleanId($request['requested_by'] ?? null) !== cleanId($_SESSION['user_id'] ?? null)) {
        throw new InvalidArgumentException('You can only edit purchase requests you created.');
    }
    if (!in_array($request['status'] ?? '', ['Draft', 'Revision Requested'], true)) {
        throw new InvalidArgumentException('Only draft or revision-requested PRs can be edited.');
    }

    $productStmt = $pdo->prepare("SELECT product_id, product_name FROM product WHERE product_id = :product_id AND status = 'Active' LIMIT 1 FOR UPDATE");
    $inventoryStockSql = inventoryStockSummarySql();
    $stockStmt = $pdo->prepare("SELECT total_quantity FROM ({$inventoryStockSql}) stock WHERE product_id = :product_id");
    $itemStmt = $pdo->prepare(
        'INSERT INTO purchase_request_items
            (pr_item_id, pr_id, product_id, stock_qty_at_request, requested_qty, unit_label_at_request)
         VALUES (:pr_item_id, :pr_id, :product_id, :current_stock, :requested_qty, :unit)'
    );
    $packageOptions = purchaseRequestSupplierOptions($pdo, array_column($items, 'product_id'));
    $seen = [];
    $validated = [];
    foreach ($items as $item) {
        $productId = cleanId($item['product_id'] ?? null);
        if ($productId === '' || isset($seen[$productId])) throw new InvalidArgumentException('Each requested product must be unique.');
        $seen[$productId] = true;
        $productStmt->execute([':product_id' => $productId]);
        $product = $productStmt->fetch(PDO::FETCH_ASSOC);
        if (!$product) throw new InvalidArgumentException('One of the selected products is missing or inactive.');
        assertProductHasActiveSupplierAssignment($pdo, $productId, (string) $product['product_name']);
        $baseInventoryUnit = purchaseRequestBaseInventoryUnit($pdo, $productId);
        if ($baseInventoryUnit === null) {
            throw new InvalidArgumentException($product['product_name'] . ' cannot be requested because its base inventory unit is not configured. Fix the Product Master configuration first.');
        }
        $requestUnit = purchaseRequestConfiguredUnit($packageOptions[$productId] ?? []);
        if ($requestUnit === null) {
            throw new InvalidArgumentException($product['product_name'] . ' does not have one unambiguous supplier purchase unit configured. Review Supplier Product Setup first.');
        }
        $requestedUnit = trim((string)($item['unit'] ?? $item['requested_unit'] ?? '')) ?: $requestUnit;
        $requestUnit = validatePurchaseRequestPackage($packageOptions[$productId] ?? [], $item['requested_qty'] ?? null, $requestedUnit);
        $qty = positivePurchaseRequestQuantity($item['requested_qty'] ?? null, $requestUnit);
        assertNoActivePurchaseRequestConflict($pdo, $productId, (string) $product['product_name'], $prId);
        $stockStmt->execute([':product_id' => $productId]);
        $validated[] = [
            'product_id' => $productId,
            'current_stock' => (float) ($stockStmt->fetchColumn() ?: 0),
            'requested_qty' => $qty,
            'unit' => $requestUnit,
        ];
    }

    $delete = $pdo->prepare('DELETE FROM purchase_request_items WHERE pr_id = :pr_id');
    $delete->execute([':pr_id' => $prId]);
    foreach ($validated as $item) {
        $itemStmt->execute([
            ':pr_item_id' => newUuid($pdo), ':pr_id' => $prId,
            ':product_id' => $item['product_id'], ':current_stock' => $item['current_stock'],
            ':requested_qty' => $item['requested_qty'], ':unit' => $item['unit'],
        ]);
    }

    $status = $submit ? 'Pending Supervisor Approval' : 'Draft';
    $update = $pdo->prepare(
        'UPDATE purchase_requests
         SET status = :status,
             submitted_at = IF(:is_submitted = 1, NOW(), NULL),
             supervisor_user_id = NULL, decided_at = NULL, updated_at = NOW()
         WHERE pr_id = :pr_id'
    );
    $update->execute([
        ':status' => $status,
        ':is_submitted' => $submit ? 1 : 0,
        ':pr_id' => $prId,
    ]);
    assertPurchaseRequestHasValidItems($pdo, $prId, 'Purchase Request must contain at least one product.');
    $pdo->commit();
    recordActivityLog($pdo, 'Purchase Request', $status, ($request['pr_number'] ?? 'PR') . ($submit ? ' resubmitted for Supervisor approval' : ' saved as draft'), $prId);
    sendPurchaseRequestJson(true, $submit ? 'Purchase Request submitted for Supervisor approval.' : 'Purchase Request saved as Draft.', ['pr_id' => $prId, 'status' => $status]);
} catch (InvalidArgumentException $e) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    sendPurchaseRequestJson(false, $e->getMessage(), null, 409);
} catch (Throwable $e) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    error_log('Purchase Request save failed: ' . $e->getMessage());
    sendPurchaseRequestJson(false, 'Unable to save the purchase request: ' . $e->getMessage(), null, 500);
}
?>
