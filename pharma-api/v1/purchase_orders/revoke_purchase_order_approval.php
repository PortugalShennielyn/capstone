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

    $role = (string) ($_SESSION['role'] ?? '');
    $roles = $_SESSION['roles'] ?? [];
    $allRoles = array_map('strtolower', array_merge([$role], is_array($roles) ? $roles : []));
    $canRevoke = in_array('admin', $allRoles, true) || in_array('owner', $allRoles, true);
    if (!$canRevoke) {
        throw new InvalidArgumentException('Only an owner or admin can revoke approval.');
    }

    $poId = cleanId($payload['po_id'] ?? null);
    if ($poId === '') {
        throw new InvalidArgumentException('Purchase order id is required.');
    }

    $reason = trim((string) ($payload['reason'] ?? ''));
    revokePurchaseOrderApproval($pdo, $poId, $reason);

    echo json_encode(['status' => 'success', 'message' => 'Purchase order approval was revoked.']);
} catch (InvalidArgumentException $e) {
    http_response_code(400);
    echo json_encode(['status' => 'error', 'message' => $e->getMessage()]);
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode(['status' => 'error', 'message' => 'Unable to revoke purchase order approval.']);
}
?>
