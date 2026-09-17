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
$items = is_array($payload['items'] ?? null) ? $payload['items'] : [];
$submit = ($payload['submit'] ?? true) !== false;

if (!$items) sendPurchaseRequestJson(false, 'Purchase Request must contain at least one product.', null, 422);

try {
    ensurePurchaseRequestSchema($pdo);
    $pdo->beginTransaction();
    $prId = newUuid($pdo);
    $prNumber = nextPurchaseRequestNumber();
    $status = $submit ? 'Pending Supervisor Approval' : 'Draft';
    $stmt = $pdo->prepare(
        'INSERT INTO purchase_requests
            (pr_id, pr_number, requested_by, request_date, status, submitted_at)
         VALUES (:pr_id, :pr_number, :requested_by, CURDATE(), :status,
                 IF(:is_submitted = 1, NOW(), NULL))'
    );
    $stmt->execute([
        ':pr_id' => $prId,
        ':pr_number' => $prNumber,
        ':requested_by' => cleanId($_SESSION['user_id'] ?? null),
        ':status' => $status,
        ':is_submitted' => $submit ? 1 : 0,
    ]);

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
        assertNoActivePurchaseRequestConflict($pdo, $productId, (string) $product['product_name']);
        $stockStmt->execute([':product_id' => $productId]);
        $itemStmt->execute([
            ':pr_item_id' => newUuid($pdo), ':pr_id' => $prId, ':product_id' => $productId,
            ':current_stock' => (float) ($stockStmt->fetchColumn() ?: 0), ':requested_qty' => $qty,
            ':unit' => $requestUnit,
        ]);
    }
    assertPurchaseRequestHasValidItems($pdo, $prId, 'Purchase Request must contain at least one product.');
    $pdo->commit();
    recordActivityLog($pdo, 'Purchase Request', $status, $prNumber . ' created by ' . ($_SESSION['full_name'] ?? 'Authorized user'), $prId);
    sendPurchaseRequestJson(true, $submit ? 'Purchase Request submitted for Supervisor approval.' : 'Purchase Request saved as Draft.', ['pr_id' => $prId, 'pr_number' => $prNumber, 'status' => $status], 201);
} catch (InvalidArgumentException $e) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    sendPurchaseRequestJson(false, $e->getMessage(), null, 422);
} catch (Throwable $e) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    error_log('Purchase Request create failed: ' . $e->getMessage());
    sendPurchaseRequestJson(false, 'Unable to create purchase request: ' . $e->getMessage(), null, 500);
}
?>
