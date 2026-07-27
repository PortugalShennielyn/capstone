<?php
$allowedRoles = ['super_admin', 'admin', 'manager', 'Admin', 'ro-super-admin', 'ro-admin', 'ro-manager'];
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
    ensurePurchaseOrderSchema($pdo);

    $returnId = cleanId($payload['return_id'] ?? null);
    $action = trim((string) ($payload['action'] ?? 'update'));
    $allowedReasons = [
        'Expired',
        'Broken package',
        'Wrong item delivered',
        'Incorrect quantity',
        'Damaged during delivery',
        'Other'
    ];

    if ($returnId === '') {
        throw new InvalidArgumentException('Return/Damage id is required.');
    }

    $recordStatement = $pdo->prepare(
        "SELECT
            por.return_id,
            por.po_id,
            por.po_item_id,
            por.return_quantity,
            por.remarks AS stored_remarks,
            poi.quantity AS ordered_quantity,
            COALESCE(SUM(pori.damaged_quantity), 0) AS damaged_quantity,
            COUNT(pori.receiving_item_id) AS receiving_item_count
         FROM purchase_order_returns por
         INNER JOIN purchase_order_items poi ON poi.po_item_id = por.po_item_id
         LEFT JOIN purchase_order_receiving_items pori ON pori.po_item_id = poi.po_item_id
         WHERE por.return_id = :return_id
         GROUP BY por.return_id, por.po_id, por.po_item_id, por.return_quantity, por.remarks, poi.quantity
         LIMIT 1"
    );
    $recordStatement->execute([':return_id' => $returnId]);
    $record = $recordStatement->fetch(PDO::FETCH_ASSOC);

    if (!$record) {
        throw new InvalidArgumentException('Return/Damage record not found.');
    }

    if ($action === 'resolve') {
        $statement = $pdo->prepare(
            "UPDATE purchase_order_returns
             SET return_status = 'Resolved'
             WHERE return_id = :return_id"
        );
        $statement->execute([':return_id' => $returnId]);

        echo json_encode(['status' => 'success', 'message' => 'Return/Damage record marked as resolved.']);
        exit();
    }

    $returnQuantity = (int) ($payload['return_quantity'] ?? 0);
    $damageReason = trim((string) ($payload['damage_reason'] ?? ''));
    $remarks = trim((string) ($payload['remarks'] ?? ''));
    $parsedRemarks = parsePurchaseOrderReturnRemarks($record['stored_remarks'] ?? '');
    $storedRemarks = empty($parsedRemarks['metadata']) ? $remarks : buildPurchaseOrderReturnRemarks($parsedRemarks['metadata'], $remarks);
    $maxReturnQuantity = (int) $record['receiving_item_count'] > 0
        ? (int) $record['damaged_quantity']
        : (int) $record['ordered_quantity'];

    if ($returnQuantity <= 0 || $returnQuantity > $maxReturnQuantity) {
        throw new InvalidArgumentException('Return quantity must be greater than zero and cannot exceed the allowed damaged/ordered quantity.');
    }

    if (!in_array($damageReason, $allowedReasons, true)) {
        throw new InvalidArgumentException('A valid damage reason is required.');
    }

    $statement = $pdo->prepare(
        "UPDATE purchase_order_returns
         SET return_quantity = :return_quantity,
             damage_reason = :damage_reason,
             remarks = :remarks
         WHERE return_id = :return_id"
    );
    $statement->execute([
        ':return_quantity' => $returnQuantity,
        ':damage_reason' => $damageReason,
        ':remarks' => $storedRemarks,
        ':return_id' => $returnId
    ]);

    updatePurchaseOrderStatus($pdo, cleanId($record['po_id']), 'Delivered with Return/Damage');

    echo json_encode(['status' => 'success', 'message' => 'Return/Damage record updated successfully.']);
} catch (InvalidArgumentException $e) {
    http_response_code(400);
    echo json_encode(['status' => 'error', 'message' => $e->getMessage()]);
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode(['status' => 'error', 'message' => 'Unable to update return/damage record.']);
}
?>
