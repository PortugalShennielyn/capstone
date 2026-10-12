<?php
require_once '../../config/db_connection.php';
require_once '../../config/require_auth.php';
require_once '../activity_log_helpers.php';
require_once '../../config/audit_log.php';
require_once '../products/product_category_schema.php';
require_once '../products/product_status_schema.php';
require_once '../purchase_orders/purchase_order_helpers.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode([
        'status' => 'error',
        'message' => 'Only POST requests are allowed.'
    ]);
    exit();
}

$payload = json_decode(file_get_contents('php://input'), true);

if (!is_array($payload)) {
    http_response_code(400);
    echo json_encode([
        'status' => 'error',
        'message' => 'Invalid JSON payload.'
    ]);
    exit();
}

try {
    ensureProductCategorySchema($pdo);
    ensureProductStatusColumn($pdo);

    $productId = cleanId($payload['product_id'] ?? null);
    $batchNumber = isset($payload['batch_number']) ? trim((string) $payload['batch_number']) : '';
    $quantityStocked = isset($payload['quantity_stocked']) ? (int) $payload['quantity_stocked'] : 0;
    $expirationDate = isset($payload['expiration_date']) ? trim((string) $payload['expiration_date']) : '';

    if ($productId === '' || $batchNumber === '' || $quantityStocked <= 0 || $expirationDate === '') {
        http_response_code(400);
        echo json_encode([
            'status' => 'error',
            'message' => 'Product, batch number, quantity, and expiration date are required.'
        ]);
        exit();
    }
    $expirationDate = validateDateNotBeforeToday(
        $expirationDate,
        'Expiration date must be a valid date.',
        'Expiry date cannot be earlier than today.'
    );
    $activeProduct = $pdo->prepare("SELECT 1 FROM product WHERE product_id = :product_id AND status = 'Active'");
    $activeProduct->execute([':product_id' => $productId]);
    if (!$activeProduct->fetchColumn()) {
        throw new InvalidArgumentException('Inactive products cannot receive new inventory.');
    }

    ensureActivityLogSchema($pdo);
    ensureAuditLogSchema($pdo);
    $pdo->beginTransaction();
    $beforeStmt = $pdo->prepare('SELECT COALESCE((SELECT SUM(storage_qty) FROM inventory_batches WHERE product_id=:storage_id),0) + COALESCE((SELECT SUM(quantity_remaining) FROM product_selling_stock WHERE product_id=:shelf_id),0)');
    $beforeStmt->execute([':storage_id' => $productId, ':shelf_id' => $productId]);
    $stockBefore = (int) $beforeStmt->fetchColumn();
    $statement = $pdo->prepare(
        "INSERT INTO product_selling_stock
            (selling_stock_id, product_id, batch_number, quantity_stocked, quantity_remaining, expiration_date)
         VALUES
            (:selling_stock_id, :product_id, :batch_number, :quantity_stocked, :quantity_remaining, :expiration_date)"
    );

    $sellingStockId = newUuid($pdo);
    $statement->execute([
        ':selling_stock_id' => $sellingStockId,
        ':product_id' => $productId,
        ':batch_number' => $batchNumber,
        ':quantity_stocked' => $quantityStocked,
        ':quantity_remaining' => $quantityStocked,
        ':expiration_date' => $expirationDate
    ]);

    $productNameStmt = $pdo->prepare('SELECT product_name, category_id FROM product WHERE product_id = :product_id LIMIT 1');
    $productNameStmt->execute([':product_id' => $productId]);
    $product = $productNameStmt->fetch(PDO::FETCH_ASSOC) ?: [];
    $productName = trim((string) ($product['product_name'] ?? '')) ?: 'product';
    $description = "{$productName}: stock increased from {$stockBefore} to " . ($stockBefore + $quantityStocked) . ". Difference: +{$quantityStocked}.";
    recordInventoryAudit($pdo, 'STOCK_ADJUSTED', $description, $productId, [
        'product_id' => $productId, 'product_name' => $productName,
        'previous_stock' => $stockBefore, 'new_stock' => $stockBefore + $quantityStocked,
        'difference' => $quantityStocked, 'reason' => 'Stock added', 'batch_id' => $sellingStockId,
        'expiry_date' => $expirationDate,
    ]);
    recordActivityLog($pdo, 'Inventory', 'Added', $quantityStocked . ' added to selling stock: ' . $productName, $sellingStockId, null, null, false);
    $pdo->commit();

    http_response_code(201);
    echo json_encode([
        'status' => 'success',
        'message' => 'Stock successfully added to Products selling stock.',
        'inventory_id' => $sellingStockId
    ]);
} catch (InvalidArgumentException $e) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    recordInventoryAuditFailure($pdo, 'STOCK_ADJUSTMENT_FAILED', 'Stock addition failed validation.', isset($productId) ? (string) $productId : null);
    http_response_code(400);
    echo json_encode(['status' => 'error', 'message' => $e->getMessage()]);
} catch (Throwable $e) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    recordInventoryAuditFailure($pdo, 'STOCK_ADJUSTMENT_FAILED', 'Stock addition failed before commit.', isset($productId) ? (string) $productId : null);
    http_response_code(500);
    echo json_encode([
        'status' => 'error',
        'message' => 'Unable to add stock. Please try again later.',
        'error' => $e->getMessage()
    ]);
}
?>
