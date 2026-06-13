<?php
require_once '../../config/db_connection.php';
require_once '../products/product_category_schema.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['status' => 'error', 'message' => 'Only POST requests are allowed.']);
    exit();
}

$payload = json_decode(file_get_contents('php://input'), true);
if (!is_array($payload)) {
    http_response_code(400);
    echo json_encode(['status' => 'error', 'message' => 'Invalid JSON payload.']);
    exit();
}

try {
    ensureProductCategorySchema($pdo);

    $productId = (int) ($payload['product_id'] ?? 0);
    $variationId = (int) ($payload['variation_id'] ?? 0);
    $quantity = (int) ($payload['quantity'] ?? 0);

    if ($productId <= 0 || $variationId <= 0 || $quantity <= 0) {
        throw new InvalidArgumentException('Product variation and quantity are required.');
    }

    $availableStatement = $pdo->prepare(
        'SELECT COALESCE(SUM(quantity_remaining), 0)
         FROM product_inventory
         WHERE product_id = :product_id
           AND variation_id = :variation_id'
    );
    $availableStatement->execute([':product_id' => $productId, ':variation_id' => $variationId]);
    $available = (int) $availableStatement->fetchColumn();

    if ($quantity > $available) {
        throw new InvalidArgumentException('Quantity exceeds available warehouse inventory.');
    }

    $pdo->beginTransaction();

    $batchStatement = $pdo->prepare(
        'SELECT inventory_id, batch_number, quantity_remaining, expiration_date
         FROM product_inventory
         WHERE product_id = :product_id
           AND variation_id = :variation_id
           AND quantity_remaining > 0
         ORDER BY COALESCE(expiration_date, "9999-12-31") ASC, inventory_id ASC
         FOR UPDATE'
    );
    $batchStatement->execute([':product_id' => $productId, ':variation_id' => $variationId]);

    $updateInventory = $pdo->prepare(
        'UPDATE product_inventory
         SET quantity_remaining = quantity_remaining - :quantity
         WHERE inventory_id = :inventory_id'
    );
    $insertSelling = $pdo->prepare(
        'INSERT INTO product_selling_stock
            (product_id, variation_id, source_inventory_id, batch_number, quantity_stocked, quantity_remaining, expiration_date)
         VALUES
            (:product_id, :variation_id, :source_inventory_id, :batch_number, :quantity_stocked, :quantity_remaining, :expiration_date)'
    );

    $remainingToMove = $quantity;
    foreach ($batchStatement->fetchAll(PDO::FETCH_ASSOC) as $batch) {
        if ($remainingToMove <= 0) break;

        $moveQuantity = min($remainingToMove, (int) $batch['quantity_remaining']);

        $updateInventory->execute([
            ':quantity' => $moveQuantity,
            ':inventory_id' => (int) $batch['inventory_id']
        ]);

        $insertSelling->execute([
            ':product_id' => $productId,
            ':variation_id' => $variationId,
            ':source_inventory_id' => (int) $batch['inventory_id'],
            ':batch_number' => $batch['batch_number'],
            ':quantity_stocked' => $moveQuantity,
            ':quantity_remaining' => $moveQuantity,
            ':expiration_date' => $batch['expiration_date']
        ]);

        $remainingToMove -= $moveQuantity;
    }

    $pdo->commit();

    echo json_encode([
        'status' => 'success',
        'message' => 'Stock moved to selling shelf successfully.'
    ]);
} catch (InvalidArgumentException $e) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    http_response_code(400);
    echo json_encode(['status' => 'error', 'message' => $e->getMessage()]);
} catch (Throwable $e) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    http_response_code(500);
    echo json_encode(['status' => 'error', 'message' => 'Unable to move stock.', 'error' => $e->getMessage()]);
}
?>
