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

    $poId = cleanId($payload['po_id'] ?? null);
    if ($poId === '') {
        throw new InvalidArgumentException('Purchase order id is required.');
    }

    $reason = trim((string) ($payload['reason'] ?? ''));
    if ($reason === '') {
        throw new InvalidArgumentException('A revision reason is required.');
    }

    $pdo->beginTransaction();
    updatePurchaseOrderApprovalStatus($pdo, $poId, 'Revision Requested', 'Pending', 'Pending');
    recordPurchaseOrderApprovalAudit($pdo, $poId, 'Pending', 'Revision Requested', 'request_revision', $reason);
    $pdo->commit();

    echo json_encode(['status' => 'success', 'message' => 'Revision request sent to admin.']);
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
    echo json_encode(['status' => 'error', 'message' => 'Unable to request purchase order revision.']);
}
?>
