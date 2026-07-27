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
    ensurePurchaseOrderSchema($pdo);
    ensureActivityLogSchema($pdo);

    $poId = cleanId($payload['po_id'] ?? null);
    $status = trim((string) ($payload['status'] ?? ''));

    if ($poId === '') {
        throw new InvalidArgumentException('Purchase order id is required.');
    }

    $currentStatement = $pdo->prepare(
        'SELECT approval_status, status
         FROM purchase_orders
         WHERE po_id = :po_id
         LIMIT 1'
    );
    $currentStatement->execute([':po_id' => $poId]);
    $current = $currentStatement->fetch(PDO::FETCH_ASSOC);
    if ($current === false) {
        throw new InvalidArgumentException('Purchase order not found.');
    }

    $currentStatus = (string) ($current['status'] ?? '');
    $approvalStatus = (string) ($current['approval_status'] ?? '');
    $allowedTransitions = [
        'Pending' => ['In transit', 'Cancelled'],
        'In transit' => ['Arrived', 'Cancelled'],
        'Arrived' => ['Cancelled']
    ];

    if (!in_array($status, $allowedTransitions[$currentStatus] ?? [], true)) {
        throw new InvalidArgumentException('Invalid purchase order status transition.');
    }

    if ($status !== 'Cancelled' && $approvalStatus !== 'Approved') {
        throw new InvalidArgumentException('Owner approval is required before this purchase order can move forward.');
    }

    if ($status === 'Cancelled') {
        $reason = trim((string) ($payload['reason'] ?? ''));
        if ($reason === '') {
            throw new InvalidArgumentException('A cancellation reason is required.');
        }

        $receivingStatement = $pdo->prepare(
            'SELECT COUNT(*)
             FROM purchase_order_receiving
             WHERE po_id = :po_id'
        );
        $receivingStatement->execute([':po_id' => $poId]);
        if ((int) $receivingStatement->fetchColumn() > 0) {
            throw new InvalidArgumentException('Cannot cancel a purchase order after receiving has been processed.');
        }
    }

    $pdo->beginTransaction();
    updatePurchaseOrderStatus($pdo, $poId, $status, $currentStatus);
    if ($status === 'Cancelled') {
        recordPurchaseOrderApprovalAudit($pdo, $poId, $approvalStatus, $approvalStatus, 'cancel', $reason);
    }
    $pdo->commit();

    echo json_encode([
        'status' => 'success',
        'message' => 'Purchase order status updated successfully.'
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
    echo json_encode(['status' => 'error', 'message' => 'Unable to update purchase order status.']);
}
?>
