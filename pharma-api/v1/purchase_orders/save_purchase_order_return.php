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

    $poId = (int) ($payload['po_id'] ?? 0);
    $records = is_array($payload['returns'] ?? null) ? $payload['returns'] : [];
    $allowedReasons = [
        'Expired',
        'Broken package',
        'Wrong item delivered',
        'Incorrect quantity',
        'Damaged during delivery',
        'Other'
    ];

    if ($poId <= 0 || count($records) === 0) {
        throw new InvalidArgumentException('Purchase order and return items are required.');
    }

    $itemStatement = $pdo->prepare(
        'SELECT
            poi.po_item_id,
            poi.quantity,
            COALESCE(SUM(pori.damaged_quantity), 0) AS damaged_quantity,
            COUNT(pori.receiving_item_id) AS receiving_item_count
         FROM purchase_order_items poi
         LEFT JOIN purchase_order_receiving_items pori ON pori.po_item_id = poi.po_item_id
         WHERE poi.po_id = :po_id
         GROUP BY poi.po_item_id, poi.quantity'
    );
    $itemStatement->execute([':po_id' => $poId]);
    $poItems = [];
    foreach ($itemStatement->fetchAll(PDO::FETCH_ASSOC) as $row) {
        $poItems[(int) $row['po_item_id']] = [
            'quantity' => (int) $row['quantity'],
            'damaged_quantity' => (int) $row['damaged_quantity'],
            'receiving_item_count' => (int) $row['receiving_item_count']
        ];
    }

    $hasReceivingRecord = array_sum(array_column($poItems, 'receiving_item_count')) > 0;

    $pdo->beginTransaction();

    $insertStatement = $pdo->prepare(
        'INSERT INTO purchase_order_returns
            (po_id, po_item_id, return_quantity, damage_reason, remarks)
         VALUES
            (:po_id, :po_item_id, :return_quantity, :damage_reason, :remarks)'
    );

    foreach ($records as $record) {
        $poItemId = (int) ($record['po_item_id'] ?? 0);
        $returnQuantity = (int) ($record['return_quantity'] ?? 0);
        $damageReason = trim((string) ($record['damage_reason'] ?? ''));
        $remarks = trim((string) ($record['remarks'] ?? ''));

        if (!isset($poItems[$poItemId])) {
            throw new InvalidArgumentException('A return item does not belong to this purchase order.');
        }

        $maxReturnQuantity = $hasReceivingRecord
            ? $poItems[$poItemId]['damaged_quantity']
            : $poItems[$poItemId]['quantity'];

        if ($returnQuantity <= 0 || $returnQuantity > $maxReturnQuantity) {
            throw new InvalidArgumentException('Return quantity must be greater than zero and cannot exceed the damaged quantity recorded for the item.');
        }

        if (!in_array($damageReason, $allowedReasons, true)) {
            throw new InvalidArgumentException('A valid damage reason is required.');
        }

        $insertStatement->execute([
            ':po_id' => $poId,
            ':po_item_id' => $poItemId,
            ':return_quantity' => $returnQuantity,
            ':damage_reason' => $damageReason,
            ':remarks' => $remarks
        ]);
    }

    updatePurchaseOrderStatus($pdo, $poId, 'Delivered with Return/Damage');
    $paymentStatement = $pdo->prepare("UPDATE purchase_orders SET payment_status = 'Adjusted' WHERE po_id = :po_id");
    $paymentStatement->execute([':po_id' => $poId]);

    $pdo->commit();

    echo json_encode([
        'status' => 'success',
        'message' => 'Return/Damage record saved successfully.'
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
    echo json_encode(['status' => 'error', 'message' => 'Unable to save return/damage record.']);
}
?>
