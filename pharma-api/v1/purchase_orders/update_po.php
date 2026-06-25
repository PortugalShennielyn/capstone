<?php
require_once '../../config/db_connection.php';
require_once 'purchase_order_helpers.php';

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

    $poId = cleanId($payload['po_id'] ?? null);
    $supplierId = cleanId($payload['supplier_id'] ?? null);
    $items = is_array($payload['items'] ?? null) ? $payload['items'] : [];
    $paymentTerms = validatePaymentTerms($payload);
    $expectedDeliveryDate = validateExpectedDeliveryDate($payload);
    $status = validatePurchaseOrderStatus($payload);

    if ($poId === '') {
        throw new InvalidArgumentException('Purchase order id is required.');
    }

    if ($supplierId === '') {
        throw new InvalidArgumentException('A supplier is required.');
    }

    validatePurchaseOrderItems($items);

    $pdo->beginTransaction();
    validateProductsForSupplier($pdo, $supplierId, $items);
    $items = applySupplierProductSetup($pdo, $supplierId, $items);

    $orderStatement = $pdo->prepare(
        'UPDATE purchase_orders
         SET supplier_id = :supplier_id,
             payment_terms = :payment_terms,
             expected_delivery_date = :expected_delivery_date,
             status = :status
         WHERE po_id = :po_id'
    );
    $orderStatement->execute([
        ':supplier_id' => $supplierId,
        ':payment_terms' => $paymentTerms,
        ':expected_delivery_date' => $expectedDeliveryDate,
        ':status' => $status,
        ':po_id' => $poId
    ]);

    if ($orderStatement->rowCount() === 0) {
        $existsStatement = $pdo->prepare('SELECT COUNT(*) FROM purchase_orders WHERE po_id = :po_id');
        $existsStatement->execute([':po_id' => $poId]);
        if ((int) $existsStatement->fetchColumn() === 0) {
            throw new InvalidArgumentException('Purchase order not found.');
        }
    }

    $existingItemsStatement = $pdo->prepare('SELECT po_item_id FROM purchase_order_items WHERE po_id = :po_id');
    $existingItemsStatement->execute([':po_id' => $poId]);
    $existingItemIds = array_map('cleanId', $existingItemsStatement->fetchAll(PDO::FETCH_COLUMN));
    $keptItemIds = [];

    $insertItemStatement = $pdo->prepare(
        'INSERT INTO purchase_order_items (
            po_item_id,
            po_id,
            product_id,
            quantity,
            purchase_qty,
            purchase_unit_snapshot,
            units_per_purchase_unit_snapshot,
            inventory_qty_ordered,
            product_name_snapshot,
            brand_name_snapshot,
            category_name_snapshot,
            type_name_snapshot,
            generic_name_snapshot,
            variant_flavor_snapshot,
            strength_snapshot,
            size_value_snapshot,
            unit_snapshot,
            packaging_snapshot,
            unit_price_snapshot,
            line_total
         )
         VALUES (
            :po_item_id,
            :po_id,
            :product_id,
            :quantity,
            :purchase_qty,
            :purchase_unit_snapshot,
            :units_per_purchase_unit_snapshot,
            :inventory_qty_ordered,
            :product_name_snapshot,
            :brand_name_snapshot,
            :category_name_snapshot,
            :type_name_snapshot,
            :generic_name_snapshot,
            :variant_flavor_snapshot,
            :strength_snapshot,
            :size_value_snapshot,
            :unit_snapshot,
            :packaging_snapshot,
            :unit_price_snapshot,
            :line_total
         )'
    );
    $updateItemStatement = $pdo->prepare(
        'UPDATE purchase_order_items
         SET product_id = :product_id,
             quantity = :quantity,
             purchase_qty = :purchase_qty,
             purchase_unit_snapshot = :purchase_unit_snapshot,
             units_per_purchase_unit_snapshot = :units_per_purchase_unit_snapshot,
             inventory_qty_ordered = :inventory_qty_ordered,
             product_name_snapshot = :product_name_snapshot,
             brand_name_snapshot = :brand_name_snapshot,
             category_name_snapshot = :category_name_snapshot,
             type_name_snapshot = :type_name_snapshot,
             generic_name_snapshot = :generic_name_snapshot,
             variant_flavor_snapshot = :variant_flavor_snapshot,
             strength_snapshot = :strength_snapshot,
             size_value_snapshot = :size_value_snapshot,
             unit_snapshot = :unit_snapshot,
             packaging_snapshot = :packaging_snapshot,
             unit_price_snapshot = :unit_price_snapshot,
             line_total = :line_total
         WHERE po_item_id = :po_item_id
           AND po_id = :po_id'
    );

    $totalAmount = 0.0;

    foreach ($items as $item) {
        $poItemId = cleanId($item['po_item_id'] ?? null);
        $quantityParams = purchaseOrderQuantityParams($item);
        $totalAmount += (float) $quantityParams[':line_total'];
        $params = array_merge([
            ':po_id' => $poId,
            ':product_id' => cleanId($item['product_id'])
        ], $quantityParams, purchaseOrderItemSnapshotParams($item));

        if ($poItemId !== '') {
            if (!in_array($poItemId, $existingItemIds, true)) {
                throw new InvalidArgumentException('A purchase-order item does not belong to this order.');
            }

            $updateItemStatement->execute(array_merge($params, [':po_item_id' => $poItemId]));
            $keptItemIds[] = $poItemId;
        } else {
            $newPoItemId = newUuid($pdo);
            $params[':po_item_id'] = $newPoItemId;
            $insertItemStatement->execute($params);
            $keptItemIds[] = $newPoItemId;
        }
    }

    $deleteItemIds = array_values(array_diff($existingItemIds, $keptItemIds));
    if (count($deleteItemIds) > 0) {
        $placeholders = implode(',', array_fill(0, count($deleteItemIds), '?'));
        $referenceStatement = $pdo->prepare(
            "SELECT COUNT(*)
             FROM (
                SELECT po_item_id FROM purchase_order_receiving_items WHERE po_item_id IN ({$placeholders})
                UNION ALL
                SELECT po_item_id FROM purchase_order_returns WHERE po_item_id IN ({$placeholders})
             ) linked_items"
        );
        $referenceStatement->execute(array_merge($deleteItemIds, $deleteItemIds));

        if ((int) $referenceStatement->fetchColumn() > 0) {
            throw new InvalidArgumentException('Cannot remove a purchase-order item that already has receiving or return records.');
        }

        $deleteStatement = $pdo->prepare("DELETE FROM purchase_order_items WHERE po_id = ? AND po_item_id IN ({$placeholders})");
        $deleteStatement->execute(array_merge([$poId], $deleteItemIds));
    }

    $totalStatement = $pdo->prepare('UPDATE purchase_orders SET total_amount = :total_amount WHERE po_id = :po_id');
    $totalStatement->execute([
        ':total_amount' => $totalAmount,
        ':po_id' => $poId
    ]);

    $pdo->commit();
    echo json_encode(['status' => 'success', 'message' => 'Purchase order updated successfully.']);
} catch (InvalidArgumentException $e) {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }

    http_response_code(400);
    echo json_encode(['status' => 'error', 'message' => $e->getMessage()]);
} catch (Throwable $e) {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }

    http_response_code(500);
    echo json_encode(['status' => 'error', 'message' => 'Unable to update purchase order.']);
}
?>
