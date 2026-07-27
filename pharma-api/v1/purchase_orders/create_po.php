<?php
require_once '../../config/db_connection.php';
require_once '../../config/require_auth.php';
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

    $supplierId = cleanId($payload['supplier_id'] ?? null);
    $items = is_array($payload['items'] ?? null) ? $payload['items'] : [];
    $paymentTerms = validatePaymentTerms($payload);
    $expectedDeliveryDate = validateExpectedDeliveryDate($payload);

    if ($supplierId === '') {
        throw new InvalidArgumentException('A supplier is required.');
    }

    validatePurchaseOrderItems($items);

    $pdo->beginTransaction();
    validatePurchaseOrderSupplier($pdo, $supplierId);
    validateProductsForSupplier($pdo, $supplierId, $items);
    $items = applySupplierProductSetup($pdo, $supplierId, $items);
    $validatedTotalAmount = validateSubmittedPurchaseOrderTotals($payload, $items);

    $poNumber = 'PO-' . date('Ymd-His') . '-' . strtoupper(bin2hex(random_bytes(2)));
    $poId = newUuid($pdo);
    $masterStatement = $pdo->prepare(
        "INSERT INTO purchase_orders (po_id, supplier_id, po_number, payment_terms, expected_delivery_date, status, total_amount, created_at)
         VALUES (:po_id, :supplier_id, :po_number, :payment_terms, :expected_delivery_date, 'Pending', 0.00, NOW())"
    );
    $masterStatement->execute([
        ':po_id' => $poId,
        ':supplier_id' => $supplierId,
        ':po_number' => $poNumber,
        ':payment_terms' => $paymentTerms,
        ':expected_delivery_date' => $expectedDeliveryDate
    ]);

    $itemStatement = $pdo->prepare(
        'INSERT INTO purchase_order_items (
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

    $totalAmount = 0.0;

    foreach ($items as $item) {
        $quantityParams = purchaseOrderQuantityParams($item);
        $totalAmount += (float) $quantityParams[':line_total'];
        $itemStatement->execute(array_merge([
            ':po_id' => $poId,
            ':product_id' => cleanId($item['product_id'])
        ], $quantityParams, purchaseOrderItemSnapshotParams($item)));
    }

    if (purchaseOrderMoneyCents($totalAmount, 'Purchase-order total is invalid.') !== purchaseOrderMoneyCents($validatedTotalAmount, 'Purchase-order total is invalid.')) {
        throw new InvalidArgumentException('Purchase-order total changed during validation. Please try again.');
    }

    $totalStatement = $pdo->prepare('UPDATE purchase_orders SET total_amount = :total_amount WHERE po_id = :po_id');
    $totalStatement->execute([
        ':total_amount' => $totalAmount,
        ':po_id' => $poId
    ]);

    $pdo->commit();

    recordActivityLog($pdo, 'Purchase Order', 'Pending', 'PO ' . $poNumber . ' is Pending', $poId);

    http_response_code(201);
    echo json_encode([
        'status' => 'success',
        'message' => 'Purchase order created successfully.',
        'po_id' => $poId,
        'po_number' => $poNumber
    ]);
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
    echo json_encode(['status' => 'error', 'message' => 'Unable to create purchase order.']);
}
?>
