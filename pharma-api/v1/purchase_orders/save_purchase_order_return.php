<?php
$allowedRoles = ['super_admin', 'admin', 'manager', 'Admin', 'ro-super-admin', 'ro-admin', 'ro-manager'];
require_once '../../config/db_connection.php';
require_once '../../config/require_auth.php';
require_once 'purchase_order_helpers.php';
require_once 'purchase_order_payment_helpers.php';

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
    ensureActivityLogSchema($pdo);

    $poId = cleanId($payload['po_id'] ?? null);
    $records = is_array($payload['returns'] ?? null) ? $payload['returns'] : [];
    $allowedReasons = [
        'Expired',
        'Broken package',
        'Wrong item delivered',
        'Incorrect quantity',
        'Damaged during delivery',
        'Other'
    ];

    if ($poId === '' || count($records) === 0) {
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
        $poItems[cleanId($row['po_item_id'])] = [
            'quantity' => (int) $row['quantity'],
            'damaged_quantity' => (int) $row['damaged_quantity'],
            'receiving_item_count' => (int) $row['receiving_item_count']
        ];
    }

    $hasReceivingRecord = array_sum(array_column($poItems, 'receiving_item_count')) > 0;

    $pdo->beginTransaction();

    $insertStatement = $pdo->prepare(
        'INSERT INTO purchase_order_returns
            (return_id, po_id, po_item_id, return_quantity, damage_reason, remarks)
         VALUES
            (:return_id, :po_id, :po_item_id, :return_quantity, :damage_reason, :remarks)'
    );

    foreach ($records as $record) {
        $poItemId = cleanId($record['po_item_id'] ?? null);
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
            ':return_id' => newUuid($pdo),
            ':po_id' => $poId,
            ':po_item_id' => $poItemId,
            ':return_quantity' => $returnQuantity,
            ':damage_reason' => $damageReason,
            ':remarks' => $remarks
        ]);
    }

    updatePurchaseOrderStatus($pdo, $poId, 'Delivered with Return/Damage');
    $payableStatement = $pdo->prepare('SELECT final_payment FROM purchase_orders WHERE po_id = :po_id LIMIT 1');
    $payableStatement->execute([':po_id' => $poId]);
    synchronizePurchaseOrderPaymentStatus($pdo, $poId, (float) $payableStatement->fetchColumn());

    $pdo->commit();

    $poNumberStmt = $pdo->prepare('SELECT po_number FROM purchase_orders WHERE po_id = :po_id LIMIT 1');
    $poNumberStmt->execute([':po_id' => $poId]);
    $poNumber = trim((string) $poNumberStmt->fetchColumn()) ?: $poId;
    recordActivityLog($pdo, 'Purchase Order', 'Returned/Damaged', 'PO ' . $poNumber . ' has return/damage items', $poId);

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
