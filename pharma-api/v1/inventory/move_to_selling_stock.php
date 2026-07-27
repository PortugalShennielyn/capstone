<?php
require_once '../../config/db_connection.php';
require_once '../../config/require_auth.php';
require_once '../activity_log_helpers.php';
require_once '../products/product_category_schema.php';
require_once '../products/product_status_schema.php';

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
    ensureProductStatusColumn($pdo);

    $productId = cleanId($payload['product_id'] ?? null);
    $requestedBatches = is_array($payload['batches'] ?? null) ? $payload['batches'] : [];
    if (!$requestedBatches) {
        $singleBatchId = cleanId($payload['batch_id'] ?? ($payload['inventory_id'] ?? null));
        $singleQuantity = (int) ($payload['quantity_to_move'] ?? ($payload['quantity'] ?? 0));
        if ($singleBatchId !== '' || $singleQuantity > 0) {
            $requestedBatches[] = [
                'batch_id' => $singleBatchId,
                'inventory_id' => $singleBatchId,
                'quantity' => $singleQuantity
            ];
        }
    }

    if ($productId === '') {
        throw new InvalidArgumentException('Product is required.');
    }
    $activeProduct = $pdo->prepare("SELECT 1 FROM product WHERE product_id = :product_id AND status = 'Active'");
    $activeProduct->execute([':product_id' => $productId]);
    if (!$activeProduct->fetchColumn()) {
        throw new InvalidArgumentException('Inactive products cannot be moved to selling stock.');
    }

    $batchMoves = [];
    foreach ($requestedBatches as $requestedBatch) {
        $batchId = cleanId($requestedBatch['batch_id'] ?? null);
        $inventoryId = cleanId($requestedBatch['inventory_id'] ?? null);
        $quantity = (int) ($requestedBatch['quantity'] ?? ($requestedBatch['quantity_to_move'] ?? 0));

        if ($quantity <= 0) {
            continue;
        }

        if ($batchId === '' && $inventoryId === '') {
            throw new InvalidArgumentException('Each shelf movement must include a batch.');
        }

        $moveKey = $batchId !== '' ? "batch:{$batchId}" : "inventory:{$inventoryId}";
        if (!isset($batchMoves[$moveKey])) {
            $batchMoves[$moveKey] = [
                'batch_id' => $batchId,
                'inventory_id' => $inventoryId,
                'quantity' => 0
            ];
        }
        $batchMoves[$moveKey]['quantity'] += $quantity;
    }

    if (!$batchMoves) {
        throw new InvalidArgumentException('Enter a quantity for at least one batch.');
    }

    $pdo->beginTransaction();

    $batchSql = "SELECT
            ib.batch_id,
            ib.legacy_inventory_id AS inventory_id,
            ib.product_id,
            COALESCE(pi.batch_number, po.po_number, ib.legacy_inventory_id, ib.batch_id) AS batch_number,
            ib.storage_qty,
            ib.shelf_qty,
            ib.expiry_date,
            ib.batch_status
         FROM inventory_batches ib
         LEFT JOIN purchase_order_items source_item ON source_item.po_item_id = ib.po_item_id
         LEFT JOIN purchase_orders po ON po.po_id = COALESCE(ib.po_id, source_item.po_id)
         LEFT JOIN product_inventory pi ON pi.inventory_id = ib.legacy_inventory_id
         WHERE ib.product_id = :product_id
           AND (ib.batch_id = :batch_id OR ib.legacy_inventory_id = :inventory_id)
         LIMIT 1
         FOR UPDATE";

    $batchStatement = $pdo->prepare($batchSql);

    $updateBatch = $pdo->prepare(
        "UPDATE inventory_batches
         SET storage_qty = storage_qty - :quantity,
             shelf_qty = shelf_qty + :quantity_for_shelf,
             batch_status = CASE
                WHEN storage_qty - :quantity_for_depleted <= 0 AND shelf_qty + :quantity_for_depleted_shelf <= 0 THEN 'depleted'
                WHEN expiry_date IS NOT NULL AND expiry_date < CURDATE() THEN 'expired'
                ELSE 'active'
             END
         WHERE batch_id = :batch_id
           AND storage_qty >= :quantity_for_guard"
    );

    $updateLegacyInventory = $pdo->prepare(
        'UPDATE product_inventory
         SET quantity_remaining = quantity_remaining - :quantity
         WHERE inventory_id = :inventory_id
           AND quantity_remaining >= :quantity_for_guard'
    );

    $sellingStockStatement = $pdo->prepare(
        "SELECT selling_stock_id
         FROM product_selling_stock
         WHERE product_id = :product_id
           AND (
                source_batch_id = :source_batch_id
                OR (:source_inventory_id_for_null_check IS NOT NULL AND source_inventory_id = :source_inventory_id)
           )
           AND batch_number = :batch_number
           AND expiration_date <=> :expiry_date
         LIMIT 1
         FOR UPDATE"
    );

    $updateSelling = $pdo->prepare(
        'UPDATE product_selling_stock
         SET quantity_remaining = quantity_remaining + :quantity,
             quantity_stocked = quantity_stocked + :quantity_for_stocked
         WHERE selling_stock_id = :selling_stock_id'
    );

    $insertSelling = $pdo->prepare(
        'INSERT INTO product_selling_stock
            (selling_stock_id, product_id, source_inventory_id, source_batch_id, batch_number, quantity_stocked, quantity_remaining, expiration_date)
         VALUES
            (:selling_stock_id, :product_id, :source_inventory_id, :source_batch_id, :batch_number, :quantity_stocked, :quantity_remaining, :expiry_date)'
    );

    $sellingStockIds = [];
    $movementActivityRows = [];

    foreach ($batchMoves as $move) {
        $quantityToMove = (int) $move['quantity'];
        $batchStatement->execute([
            ':product_id' => $productId,
            ':batch_id' => $move['batch_id'],
            ':inventory_id' => $move['inventory_id']
        ]);
        $batch = $batchStatement->fetch(PDO::FETCH_ASSOC);

        if (!$batch) {
            throw new InvalidArgumentException('Selected inventory batch was not found.');
        }

        $batchAvailable = (int) ($batch['storage_qty'] ?? 0);

        if ($quantityToMove > $batchAvailable) {
            throw new InvalidArgumentException('Quantity to move exceeds selected batch storage stock.');
        }

        $updateBatch->execute([
            ':quantity' => $quantityToMove,
            ':quantity_for_shelf' => $quantityToMove,
            ':quantity_for_depleted' => $quantityToMove,
            ':quantity_for_depleted_shelf' => $quantityToMove,
            ':quantity_for_guard' => $quantityToMove,
            ':batch_id' => $batch['batch_id']
        ]);

        if ($updateBatch->rowCount() !== 1) {
            throw new RuntimeException('Unable to move stock without creating negative batch storage.');
        }

        if (cleanId($batch['inventory_id'] ?? null) !== '') {
            $updateLegacyInventory->execute([
                ':quantity' => $quantityToMove,
                ':quantity_for_guard' => $quantityToMove,
                ':inventory_id' => $batch['inventory_id']
            ]);
        }

        $sellingStockStatement->execute([
            ':product_id' => $productId,
            ':source_batch_id' => $batch['batch_id'],
            ':source_inventory_id_for_null_check' => $batch['inventory_id'],
            ':source_inventory_id' => $batch['inventory_id'],
            ':batch_number' => $batch['batch_number'],
            ':expiry_date' => $batch['expiry_date']
        ]);
        $sellingStockId = cleanId($sellingStockStatement->fetchColumn());

        if ($sellingStockId !== '') {
            $updateSelling->execute([
                ':quantity' => $quantityToMove,
                ':quantity_for_stocked' => $quantityToMove,
                ':selling_stock_id' => $sellingStockId
            ]);
        } else {
            $sellingStockId = newUuid($pdo);
            $insertSelling->execute([
                ':selling_stock_id' => $sellingStockId,
                ':product_id' => $productId,
                ':source_inventory_id' => $batch['inventory_id'],
                ':source_batch_id' => $batch['batch_id'],
                ':batch_number' => $batch['batch_number'],
                ':quantity_stocked' => $quantityToMove,
                ':quantity_remaining' => $quantityToMove,
                ':expiry_date' => $batch['expiry_date']
            ]);
        }

        $sellingStockIds[] = $sellingStockId;
        $movementActivityRows[] = [
            'selling_stock_id' => $sellingStockId,
            'quantity' => $quantityToMove,
            'batch_number' => $batch['batch_number'],
        ];
    }

    $pdo->commit();

    $productNameStmt = $pdo->prepare('SELECT product_name FROM product WHERE product_id = :product_id LIMIT 1');
    $productNameStmt->execute([':product_id' => $productId]);
    $productName = trim((string) $productNameStmt->fetchColumn()) ?: 'product';
    foreach ($movementActivityRows as $activity) {
        recordActivityLog(
            $pdo,
            'Inventory',
            'Moved to Shelf',
            $activity['quantity'] . ' moved to shelf: ' . $productName . ' (Batch ' . $activity['batch_number'] . ')',
            $activity['selling_stock_id']
        );
    }

    echo json_encode([
        'status' => 'success',
        'message' => 'Stock moved to selling shelf successfully.',
        'selling_stock_ids' => array_values(array_unique($sellingStockIds))
    ]);
} catch (InvalidArgumentException $e) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    http_response_code(400);
    echo json_encode(['status' => 'error', 'message' => $e->getMessage()]);
} catch (Throwable $e) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    http_response_code(500);
    echo json_encode(['status' => 'error', 'message' => 'Unable to move stock to selling shelf.', 'error' => $e->getMessage()]);
}
?>
