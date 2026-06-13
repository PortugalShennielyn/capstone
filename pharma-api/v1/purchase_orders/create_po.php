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
    ensurePurchaseOrderSchema($pdo);

    $supplierId = isset($payload['supplier_id']) ? (int) $payload['supplier_id'] : 0;
    $items = is_array($payload['items'] ?? null) ? $payload['items'] : [];
    $paymentTerms = validatePaymentTerms($payload);
    $expectedDeliveryDate = validateExpectedDeliveryDate($payload);

    if ($supplierId <= 0) {
        throw new InvalidArgumentException('A supplier is required.');
    }

    validatePurchaseOrderItems($items);

    $pdo->beginTransaction();
    validateProductsForSupplier($pdo, $supplierId, $items);

    $poNumber = 'PO-' . date('Ymd-His') . '-' . strtoupper(bin2hex(random_bytes(2)));
    $masterStatement = $pdo->prepare(
        "INSERT INTO purchase_orders (supplier_id, po_number, payment_terms, expected_delivery_date, status, created_at)
         VALUES (:supplier_id, :po_number, :payment_terms, :expected_delivery_date, 'Pending', NOW())"
    );
    $masterStatement->execute([
        ':supplier_id' => $supplierId,
        ':po_number' => $poNumber,
        ':payment_terms' => $paymentTerms,
        ':expected_delivery_date' => $expectedDeliveryDate
    ]);

    $poId = (int) $pdo->lastInsertId();
    $itemStatement = $pdo->prepare(
        'INSERT INTO purchase_order_items (
            po_id,
            product_id,
            variation_id,
            quantity,
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
            unit_price_snapshot
         )
         VALUES (
            :po_id,
            :product_id,
            :variation_id,
            :quantity,
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
            :unit_price_snapshot
         )'
    );

    foreach ($items as $item) {
        $itemStatement->execute(array_merge([
            ':po_id' => $poId,
            ':product_id' => (int) $item['product_id'],
            ':variation_id' => (int) ($item['variation_id'] ?? 0) ?: null,
            ':quantity' => (int) $item['quantity']
        ], purchaseOrderItemSnapshotParams($item)));
    }

    $pdo->commit();

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
