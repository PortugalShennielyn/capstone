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
$statuses = ['approve' => 'Approved', 'reject' => 'Rejected'];
$rejectionReason = trim((string) ($payload['rejection_reason'] ?? $payload['decision_reason'] ?? ''));

if ($prId === '' || !isset($statuses[$decision])) sendPurchaseRequestJson(false, 'A valid purchase request decision is required.', null, 422);
if ($decision === 'reject' && $rejectionReason === '') {
    sendPurchaseRequestJson(false, 'Please enter a reason for rejection.', null, 422);
}

try {
    ensurePurchaseRequestSchema($pdo);
    requireActiveSupervisor($pdo);
    $pdo->beginTransaction();
    $request = purchaseRequestById($pdo, $prId, true);
    if (!$request) throw new InvalidArgumentException('Purchase request was not found.');
    if (($request['status'] ?? '') !== 'Pending Supervisor Approval') {
        throw new InvalidArgumentException('Only pending purchase requests can be reviewed.');
    }

    if ($decision === 'approve') {
        assertPurchaseRequestHasValidItems($pdo, $prId, 'Cannot approve an empty Purchase Request.');
        $submittedQuantities = is_array($payload['approved_quantities'] ?? null) ? $payload['approved_quantities'] : [];
        $items = purchaseRequestItems($pdo, $prId);
        $quantitiesByItem = [];
        foreach ($submittedQuantities as $submitted) {
            $prItemId = cleanId($submitted['pr_item_id'] ?? null);
            if ($prItemId === '' || isset($quantitiesByItem[$prItemId])) {
                throw new InvalidArgumentException('Submit one approved quantity for every requested product.');
            }
            $quantitiesByItem[$prItemId] = $submitted['approved_qty'] ?? null;
        }
        if (count($items) !== count($quantitiesByItem)) {
            throw new InvalidArgumentException('Submit one approved quantity for every requested product.');
        }
        $updateQuantity = $pdo->prepare(
            'UPDATE purchase_request_items SET approved_qty = :approved_qty
             WHERE pr_item_id = :pr_item_id AND pr_id = :pr_id'
        );
        foreach ($items as $item) {
            $prItemId = cleanId($item['pr_item_id'] ?? null);
            if (!array_key_exists($prItemId, $quantitiesByItem)) {
                throw new InvalidArgumentException('An approved quantity does not belong to this purchase request.');
            }
            $approvedQty = positivePurchaseRequestQuantity($quantitiesByItem[$prItemId], (string) ($item['unit'] ?? ''));
            $updateQuantity->execute([
                ':approved_qty' => $approvedQty,
                ':pr_item_id' => $prItemId,
                ':pr_id' => $prId,
            ]);
            if ($updateQuantity->rowCount() !== 1) {
                throw new RuntimeException('A purchase request item changed while it was being reviewed.');
            }
        }
    }

    $stmt = $pdo->prepare(
        'UPDATE purchase_requests
         SET status = :status, supervisor_user_id = :supervisor_user_id,
             decided_at = NOW(), decision_reason = :decision_reason, updated_at = NOW()
         WHERE pr_id = :pr_id AND status = "Pending Supervisor Approval"'
    );
    $stmt->execute([
        ':status' => $statuses[$decision], ':supervisor_user_id' => cleanId($_SESSION['user_id'] ?? null),
        ':decision_reason' => $decision === 'reject' ? $rejectionReason : null,
        ':pr_id' => $prId,
    ]);
    if ($stmt->rowCount() !== 1) throw new RuntimeException('Purchase request changed while it was being reviewed.');
    $pdo->commit();
    recordActivityLog($pdo, 'Purchase Request', $statuses[$decision], ($request['pr_number'] ?? 'PR') . ' ' . $statuses[$decision] . ' by Supervisor', $prId);
    $message = $decision === 'approve'
        ? 'Purchase request and approved quantities saved. It is now available to Manager/Admin for PO generation.'
        : 'Purchase request rejected successfully.';
    sendPurchaseRequestJson(true, $message, [
        'pr_id' => $prId,
        'status' => $statuses[$decision],
        'rejection_reason' => $decision === 'reject' ? $rejectionReason : null,
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
