<?php
require_once '../../config/db_connection.php';
$allowedRoles = ['supervisor', 'ro-supervisor'];
require_once '../../config/require_auth.php';
require_once '../activity_log_helpers.php';
require_once 'purchase_request_helpers.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    sendPurchaseRequestJson(false, 'Only POST requests are allowed.', null, 405);
}

$payload = readPurchaseRequestPayload();
$prId = cleanId($payload['pr_id'] ?? null);
$decision = strtolower(trim((string) ($payload['decision'] ?? '')));
$statuses = ['approve' => 'Approved', 'reject' => 'Rejected', 'revision' => 'Revision Requested'];

if ($prId === '' || !isset($statuses[$decision])) sendPurchaseRequestJson(false, 'A valid purchase request decision is required.', null, 422);

try {
    ensurePurchaseRequestSchema($pdo);
    requireActiveSupervisor($pdo);
    $pdo->beginTransaction();
    $request = purchaseRequestById($pdo, $prId, true);
    if (!$request) throw new InvalidArgumentException('Purchase request was not found.');
    if (($request['status'] ?? '') !== 'Pending Supervisor Approval') {
        throw new InvalidArgumentException('Only pending purchase requests can be reviewed.');
    }

    $stmt = $pdo->prepare(
        'UPDATE purchase_requests
         SET status = :status, supervisor_user_id = :supervisor_user_id,
             decided_at = NOW(), updated_at = NOW()
         WHERE pr_id = :pr_id AND status = "Pending Supervisor Approval"'
    );
    $stmt->execute([
        ':status' => $statuses[$decision], ':supervisor_user_id' => cleanId($_SESSION['user_id'] ?? null),
        ':pr_id' => $prId,
    ]);
    if ($stmt->rowCount() !== 1) throw new RuntimeException('Purchase request changed while it was being reviewed.');
    $pdo->commit();
    recordActivityLog($pdo, 'Purchase Request', $statuses[$decision], ($request['pr_number'] ?? 'PR') . ' ' . $statuses[$decision] . ' by Supervisor', $prId);
    $message = $decision === 'approve'
        ? 'Purchase request approved. It is now available to Manager/Admin for PO generation.'
        : 'Purchase request ' . strtolower($statuses[$decision]) . ' successfully.';
    sendPurchaseRequestJson(true, $message, [
        'pr_id' => $prId,
        'status' => $statuses[$decision],
        'purchase_orders' => [],
    ]);
} catch (InvalidArgumentException $e) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    sendPurchaseRequestJson(false, $e->getMessage(), null, 409);
} catch (Throwable $e) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    sendPurchaseRequestJson(false, 'Unable to update the purchase request.', null, 500);
}
?>
