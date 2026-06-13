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
    ensurePurchaseOrderSchema($pdo);

    $poId = (int) ($payload['po_id'] ?? 0);
    $remarks = trim((string) ($payload['remarks'] ?? ''));
    $amountPaidRaw = $payload['amount_paid'] ?? null;
    $additionalAmountRaw = $payload['additional_amount'] ?? 0;
    $adjustmentReason = trim((string) ($payload['adjustment_reason'] ?? ''));
    $items = is_array($payload['items'] ?? null) ? $payload['items'] : [];

    if ($poId <= 0 || count($items) === 0) {
        throw new InvalidArgumentException('Purchase order and received items are required.');
    }

    $orderStatement = $pdo->prepare(
        'SELECT po_id, status, po_number
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
            poi.variation_id,
            poi.quantity,
            COALESCE(poi.unit_price_snapshot, pv.price, p.price, 0) AS unit_price
         FROM purchase_order_items poi
         INNER JOIN product p ON p.product_id = poi.product_id
         LEFT JOIN product_variations pv ON pv.variation_id = poi.variation_id
         WHERE poi.po_id = :po_id'
    );
    $poItemStatement->execute([':po_id' => $poId]);

    $poItems = [];
    foreach ($poItemStatement->fetchAll(PDO::FETCH_ASSOC) as $row) {
        $poItems[(int) $row['po_item_id']] = $row;
    }

    if (count($poItems) === 0) {
        throw new InvalidArgumentException('This purchase order has no items to receive.');
    }

    $hasDamage = false;
    $totalAmount = 0.0;
    $goodReceivedAmount = 0.0;
    $returnDamageAmount = 0.0;
    $additionalAmount = is_numeric($additionalAmountRaw) ? (float) $additionalAmountRaw : 0.0;

    if ($additionalAmount < 0) {
        throw new InvalidArgumentException('Additional amount cannot be negative.');
    }

    foreach ($poItems as $poItem) {
        $totalAmount += (int) $poItem['quantity'] * (float) $poItem['unit_price'];
    }

    foreach ($items as $item) {
        $poItemId = (int) ($item['po_item_id'] ?? 0);
        $receivedQuantity = (int) ($item['received_quantity'] ?? 0);
        $damagedQuantity = (int) ($item['damaged_quantity'] ?? 0);

        if (!isset($poItems[$poItemId])) {
            throw new InvalidArgumentException('A received item does not belong to this purchase order.');
        }

        if ($receivedQuantity < 0 || $damagedQuantity < 0) {
            throw new InvalidArgumentException('Received and damaged quantities cannot be negative.');
        }

        $orderedQuantity = (int) $poItems[$poItemId]['quantity'];
        $unitPrice = (float) $poItems[$poItemId]['unit_price'];

        if ($receivedQuantity > $orderedQuantity) {
            throw new InvalidArgumentException('Received quantity cannot exceed ordered quantity.');
        }

        if ($damagedQuantity > $receivedQuantity) {
            throw new InvalidArgumentException('Damaged quantity cannot be greater than received quantity.');
        }

        if ($damagedQuantity > 0) {
            $hasDamage = true;
        }

        $goodQuantity = $receivedQuantity - $damagedQuantity;
        $goodReceivedAmount += $goodQuantity * $unitPrice;
        $returnDamageAmount += $damagedQuantity * $unitPrice;
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
        'INSERT INTO purchase_order_receiving (po_id, received_date, remarks)
         VALUES (:po_id, CURRENT_TIMESTAMP, :remarks)'
    );
    $receivingStatement->execute([
        ':po_id' => $poId,
        ':remarks' => $remarks
    ]);

    $receivingId = (int) $pdo->lastInsertId();

    $receiveItemStatement = $pdo->prepare(
        'INSERT INTO purchase_order_receiving_items
            (receiving_id, po_item_id, received_quantity, damaged_quantity)
         VALUES
            (:receiving_id, :po_item_id, :received_quantity, :damaged_quantity)'
    );

    $inventoryStatement = $pdo->prepare(
        "INSERT INTO product_inventory
            (product_id, variation_id, batch_number, quantity_stocked, quantity_remaining, expiration_date, status)
         VALUES
            (:product_id, :variation_id, :batch_number, :quantity_stocked, :quantity_remaining, NULL, 'Available')"
    );

    $returnStatement = $pdo->prepare(
        "INSERT INTO purchase_order_returns
            (po_id, po_item_id, return_quantity, damage_reason, remarks, return_status)
         VALUES
            (:po_id, :po_item_id, :return_quantity, :damage_reason, :remarks, 'Open')"
    );

    foreach ($items as $item) {
        $poItemId = (int) $item['po_item_id'];
        $receivedQuantity = (int) ($item['received_quantity'] ?? 0);
        $damagedQuantity = (int) ($item['damaged_quantity'] ?? 0);
        $goodQuantity = $receivedQuantity - $damagedQuantity;
        $itemRemarks = trim((string) ($item['remarks'] ?? ''));
        $poItem = $poItems[$poItemId];

        $receiveItemStatement->execute([
            ':receiving_id' => $receivingId,
            ':po_item_id' => $poItemId,
            ':received_quantity' => $receivedQuantity,
            ':damaged_quantity' => $damagedQuantity
        ]);

        if ($goodQuantity > 0) {
            $inventoryStatement->execute([
                ':product_id' => (int) $poItem['product_id'],
                ':variation_id' => (int) ($poItem['variation_id'] ?? 0) ?: null,
                ':batch_number' => $order['po_number'] . '-' . $poItemId,
                ':quantity_stocked' => $goodQuantity,
                ':quantity_remaining' => $goodQuantity
            ]);
        }

        if ($damagedQuantity > 0) {
            $returnStatement->execute([
                ':po_id' => $poId,
                ':po_item_id' => $poItemId,
                ':return_quantity' => $damagedQuantity,
                ':damage_reason' => 'Damaged during delivery',
                ':remarks' => $itemRemarks !== ''
                    ? $itemRemarks
                    : trim($remarks . ($adjustmentReason !== '' ? ' Adjustment: ' . $adjustmentReason : ''))
            ]);
        }
    }

    $newStatus = $hasDamage ? 'Delivered with Return/Damage' : 'Delivered';
    $paymentStatus = ($hasDamage || $additionalAmount > 0)
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
        'has_damage' => $hasDamage,
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
