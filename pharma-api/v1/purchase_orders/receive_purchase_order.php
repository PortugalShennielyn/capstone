<?php
require_once '../../config/db_connection.php';
require_once 'purchase_order_helpers.php';

function receiveResponse(bool $success, string $message, string $error = '', array $extra = [], int $httpCode = 200): void
{
    http_response_code($httpCode);
    echo json_encode(array_merge([
        'success' => $success,
        'status' => $success ? 'success' : 'error',
        'message' => $message,
        'error' => $error
    ], $extra));
    exit();
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    receiveResponse(false, 'Only POST requests are allowed.', 'Invalid request method.', [], 405);
}

$payload = json_decode(file_get_contents('php://input'), true);
if (!is_array($payload)) {
    receiveResponse(false, 'Invalid JSON payload.', 'Request body is not valid JSON.', [], 400);
}

try {

    $poId = cleanId($payload['po_id'] ?? null);
    $remarks = trim((string) ($payload['remarks'] ?? ''));
    $amountPaidRaw = $payload['amount_paid'] ?? null;
    $additionalAmountRaw = $payload['additional_amount'] ?? 0;
    $adjustmentReason = trim((string) ($payload['adjustment_reason'] ?? ''));
    $items = is_array($payload['items'] ?? null) ? $payload['items'] : [];

    if ($poId === '' || count($items) === 0) {
        throw new InvalidArgumentException('Purchase order and received items are required.');
    }

    $orderStatement = $pdo->prepare(
        'SELECT po_id, supplier_id, status, po_number
         FROM purchase_orders
         WHERE po_id = :po_id
         LIMIT 1'
    );
    $orderStatement->execute([':po_id' => $poId]);
    $order = $orderStatement->fetch(PDO::FETCH_ASSOC);

    if (!$order) {
        throw new InvalidArgumentException('Purchase order not found.');
    }

    if ($order['status'] !== 'Arrived') {
        throw new InvalidArgumentException('Only arrived purchase orders can be received.');
    }

    $existingReceivingStatement = $pdo->prepare(
        'SELECT COUNT(*)
         FROM purchase_order_receiving por
         INNER JOIN purchase_order_receiving_items pori ON pori.receiving_id = por.receiving_id
         WHERE por.po_id = :po_id'
    );
    $existingReceivingStatement->execute([':po_id' => $poId]);
    if ((int) $existingReceivingStatement->fetchColumn() > 0) {
        throw new InvalidArgumentException('This purchase order has already been received.');
    }

    $poItemStatement = $pdo->prepare(
        'SELECT
            poi.po_item_id,
            poi.product_id,
            poi.quantity,
            COALESCE(NULLIF(poi.inventory_qty_ordered, 0), poi.quantity) AS inventory_qty_ordered,
            COALESCE(NULLIF(poi.line_total, 0), COALESCE(NULLIF(poi.inventory_qty_ordered, 0), poi.quantity) * COALESCE(poi.unit_price_snapshot, 0)) AS line_total,
            COALESCE(poi.unit_price_snapshot, 0) AS unit_price
         FROM purchase_order_items poi
         INNER JOIN product p ON p.product_id = poi.product_id
         WHERE poi.po_id = :po_id'
    );
    $poItemStatement->execute([':po_id' => $poId]);

    $poItems = [];
    foreach ($poItemStatement->fetchAll(PDO::FETCH_ASSOC) as $row) {
        $poItems[cleanId($row['po_item_id'])] = $row;
    }

    if (count($poItems) === 0) {
        throw new InvalidArgumentException('This purchase order has no items to receive.');
    }

    $hasAdjustment = false;
    $totalAmount = 0.0;
    $goodReceivedAmount = 0.0;
    $returnDamageAmount = 0.0;
    $additionalAmount = is_numeric($additionalAmountRaw) ? (float) $additionalAmountRaw : 0.0;

    if ($additionalAmount < 0) {
        throw new InvalidArgumentException('Additional amount cannot be negative.');
    }

    foreach ($poItems as $poItem) {
        $totalAmount += (float) ($poItem['line_total'] ?: ((int) $poItem['inventory_qty_ordered'] * (float) $poItem['unit_price']));
    }

    foreach ($items as $item) {
        $poItemId = cleanId($item['po_item_id'] ?? null);
        $receivedQuantity = (int) ($item['received_quantity'] ?? 0);
        $damagedQuantity = (int) ($item['damaged_quantity'] ?? 0);
        $returnedQuantity = (int) ($item['returned_quantity'] ?? 0);
        $expiryDate = trim((string) ($item['expiry_date'] ?? ''));

        if (!isset($poItems[$poItemId])) {
            throw new InvalidArgumentException('A received item does not belong to this purchase order.');
        }

        if ($receivedQuantity < 0 || $damagedQuantity < 0 || $returnedQuantity < 0) {
            throw new InvalidArgumentException('Received, damaged, and returned quantities cannot be negative.');
        }

        $orderedQuantity = (int) ($poItems[$poItemId]['inventory_qty_ordered'] ?: $poItems[$poItemId]['quantity']);
        $unitPrice = (float) $poItems[$poItemId]['unit_price'];

        if ($receivedQuantity > $orderedQuantity) {
            throw new InvalidArgumentException('Received quantity cannot exceed ordered quantity.');
        }

        if (($damagedQuantity + $returnedQuantity) > $receivedQuantity) {
            throw new InvalidArgumentException('Damaged and returned quantities cannot be greater than received quantity.');
        }

        if ($expiryDate !== '') {
            $parsedExpiry = DateTime::createFromFormat('Y-m-d', $expiryDate);
            if (!$parsedExpiry || $parsedExpiry->format('Y-m-d') !== $expiryDate) {
                throw new InvalidArgumentException('Expiry date must be a valid date.');
            }
        }

        if ($damagedQuantity > 0 || $returnedQuantity > 0) {
            $hasAdjustment = true;
        }

        $goodQuantity = $receivedQuantity - $damagedQuantity - $returnedQuantity;
        $goodReceivedAmount += $goodQuantity * $unitPrice;
        $returnDamageAmount += ($damagedQuantity + $returnedQuantity) * $unitPrice;
    }

    $calculatedFinalPayment = max(0, $totalAmount - $returnDamageAmount) + $additionalAmount;

    if ($amountPaidRaw !== null && $amountPaidRaw !== '' && !is_numeric($amountPaidRaw)) {
        throw new InvalidArgumentException('Amount paid must be a valid number.');
    }

    $amountPaid = $calculatedFinalPayment;

    if ($amountPaid < 0) {
        throw new InvalidArgumentException('Amount paid cannot be negative.');
    }

    $pdo->beginTransaction();

    $receivingStatement = $pdo->prepare(
        'INSERT INTO purchase_order_receiving (receiving_id, po_id, received_date, remarks)
         VALUES (:receiving_id, :po_id, CURRENT_TIMESTAMP, :remarks)'
    );
    $receivingId = newUuid($pdo);
    $receivingStatement->execute([
        ':receiving_id' => $receivingId,
        ':po_id' => $poId,
        ':remarks' => $remarks
    ]);

    $receiveItemStatement = $pdo->prepare(
        'INSERT INTO purchase_order_receiving_items
            (receiving_item_id, receiving_id, po_item_id, received_quantity, damaged_quantity)
         VALUES
            (:receiving_item_id, :receiving_id, :po_item_id, :received_quantity, :damaged_quantity)'
    );

    $inventoryStatement = $pdo->prepare(
        "INSERT INTO product_inventory
            (inventory_id, product_id, batch_number, quantity_stocked, quantity_remaining, expiration_date, status)
         VALUES
            (:inventory_id, :product_id, :batch_number, :quantity_stocked, :quantity_remaining, :expiration_date, 'Available')"
    );

    $batchStatement = $pdo->prepare(
        "INSERT INTO inventory_batches
            (batch_id, legacy_inventory_id, po_id, po_item_id, product_id, supplier_id, received_date, expiry_date, received_qty, storage_qty, shelf_qty, damaged_qty, returned_qty, unit_cost, batch_status)
         VALUES
            (:batch_id, :legacy_inventory_id, :po_id, :po_item_id, :product_id, :supplier_id, CURRENT_TIMESTAMP, :expiry_date, :received_qty, :storage_qty, 0, :damaged_qty, :returned_qty, :unit_cost, :batch_status)
         ON DUPLICATE KEY UPDATE
            legacy_inventory_id = VALUES(legacy_inventory_id),
            supplier_id = VALUES(supplier_id),
            received_date = VALUES(received_date),
            expiry_date = VALUES(expiry_date),
            received_qty = VALUES(received_qty),
            storage_qty = VALUES(storage_qty),
            damaged_qty = VALUES(damaged_qty),
            returned_qty = VALUES(returned_qty),
            unit_cost = VALUES(unit_cost),
            batch_status = VALUES(batch_status)"
    );

    $returnStatement = $pdo->prepare(
        "INSERT INTO purchase_order_returns
            (return_id, po_id, po_item_id, return_quantity, damage_reason, remarks, return_status)
         VALUES
            (:return_id, :po_id, :po_item_id, :return_quantity, :damage_reason, :remarks, 'Open')"
    );

    foreach ($items as $item) {
        $poItemId = cleanId($item['po_item_id'] ?? null);
        $receivedQuantity = (int) ($item['received_quantity'] ?? 0);
        $damagedQuantity = (int) ($item['damaged_quantity'] ?? 0);
        $returnedQuantity = (int) ($item['returned_quantity'] ?? 0);
        $goodQuantity = $receivedQuantity - $damagedQuantity - $returnedQuantity;
        $expiryDate = trim((string) ($item['expiry_date'] ?? ''));
        $itemRemarks = trim((string) ($item['remarks'] ?? ''));
        $poItem = $poItems[$poItemId];

        $receiveItemStatement->execute([
            ':receiving_item_id' => newUuid($pdo),
            ':receiving_id' => $receivingId,
            ':po_item_id' => $poItemId,
            ':received_quantity' => $receivedQuantity,
            ':damaged_quantity' => $damagedQuantity
        ]);

        $inventoryId = null;
        if ($goodQuantity > 0) {
            $inventoryId = newUuid($pdo);
            $inventoryStatement->execute([
                ':inventory_id' => $inventoryId,
                ':product_id' => cleanId($poItem['product_id']),
                ':batch_number' => $order['po_number'] . '-' . $poItemId,
                ':quantity_stocked' => $goodQuantity,
                ':quantity_remaining' => $goodQuantity,
                ':expiration_date' => $expiryDate !== '' ? $expiryDate : null
            ]);
        }

        if ($receivedQuantity > 0 || $damagedQuantity > 0) {
            $batchStatement->execute([
                ':batch_id' => newUuid($pdo),
                ':legacy_inventory_id' => $inventoryId,
                ':po_id' => $poId,
                ':po_item_id' => $poItemId,
                ':product_id' => cleanId($poItem['product_id']),
                ':supplier_id' => cleanId($order['supplier_id']),
                ':expiry_date' => $expiryDate !== '' ? $expiryDate : null,
                ':received_qty' => $receivedQuantity,
                ':storage_qty' => $goodQuantity,
                ':damaged_qty' => $damagedQuantity,
                ':returned_qty' => $returnedQuantity,
                ':unit_cost' => (float) $poItem['unit_price'],
                ':batch_status' => $goodQuantity > 0 ? 'active' : (($damagedQuantity > 0 || $returnedQuantity > 0) ? 'damaged' : 'depleted')
            ]);
        }

        if ($damagedQuantity > 0) {
            $returnStatement->execute([
                ':return_id' => newUuid($pdo),
                ':po_id' => $poId,
                ':po_item_id' => $poItemId,
                ':return_quantity' => $damagedQuantity,
                ':damage_reason' => 'Damaged during delivery',
                ':remarks' => $itemRemarks !== ''
                    ? $itemRemarks
                    : trim($remarks . ($adjustmentReason !== '' ? ' Adjustment: ' . $adjustmentReason : ''))
            ]);
        }
        if ($returnedQuantity > 0) {
            $returnStatement->execute([
                ':return_id' => newUuid($pdo),
                ':po_id' => $poId,
                ':po_item_id' => $poItemId,
                ':return_quantity' => $returnedQuantity,
                ':damage_reason' => 'Returned during receiving',
                ':remarks' => $itemRemarks !== ''
                    ? $itemRemarks
                    : trim($remarks . ($adjustmentReason !== '' ? ' Adjustment: ' . $adjustmentReason : ''))
            ]);
        }
    }

    $newStatus = 'Delivered';
    $paymentStatus = ($hasAdjustment || $additionalAmount > 0)
        ? 'Adjusted'
        : ($amountPaid >= $totalAmount ? 'Paid' : 'Partially Paid');

    $orderUpdateStatement = $pdo->prepare(
        'UPDATE purchase_orders
         SET status = :status,
             payment_status = :payment_status,
             total_amount = :total_amount,
             final_payment = :final_payment
         WHERE po_id = :po_id'
    );
    $orderUpdateStatement->execute([
        ':status' => $newStatus,
        ':payment_status' => $paymentStatus,
        ':total_amount' => $totalAmount,
        ':final_payment' => $amountPaid,
        ':po_id' => $poId
    ]);

    $pdo->commit();

    receiveResponse(true, 'Purchase order received successfully.', '', [
        'po_status' => $newStatus,
        'has_adjustment' => $hasAdjustment,
        'total_amount' => $totalAmount,
        'good_received_amount' => $goodReceivedAmount,
        'final_payment' => $amountPaid,
        'return_damage_amount' => $returnDamageAmount,
        'additional_amount' => $additionalAmount
    ]);
} catch (InvalidArgumentException $e) {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }

    receiveResponse(false, $e->getMessage(), $e->getMessage(), [], 400);
} catch (Throwable $e) {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }

    receiveResponse(false, 'Unable to receive purchase order.', $e->getMessage(), [], 500);
}
?>
