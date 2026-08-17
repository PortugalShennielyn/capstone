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
            por.claim_id AS return_id,
            poi.po_id,
            por.po_item_id,
            por.affected_quantity AS return_quantity,
            por.unit_conversion_id,
            por.remarks AS stored_remarks,
            poi.quantity AS ordered_quantity,
            COALESCE(poi.unit_price_snapshot,0) AS unit_price,
            c.base_quantity
         FROM supplier_claims por
         INNER JOIN purchase_order_items poi ON poi.po_item_id = por.po_item_id
         INNER JOIN supplier_product_unit_conversions c ON c.conversion_id = por.unit_conversion_id
         WHERE por.claim_id = :return_id
         LIMIT 1"
    );
    $recordStatement->execute([':return_id' => $returnId]);
    $record = $recordStatement->fetch(PDO::FETCH_ASSOC);

    if (!$record) {
        throw new InvalidArgumentException('Return/Damage record not found.');
    }

    if ($action === 'resolve') {
        $statement = $pdo->prepare(
            "UPDATE supplier_claims
             SET claim_status = 'Resolved', resolved_at = CURRENT_TIMESTAMP
             WHERE claim_id = :return_id"
        );
        $statement->execute([':return_id' => $returnId]);

        echo json_encode(['status' => 'success', 'message' => 'Return/Damage record marked as resolved.']);
        exit();
    }

    $returnQuantity = (int) ($payload['return_quantity'] ?? 0);
    $damageReason = trim((string) ($payload['damage_reason'] ?? ''));
    $remarks = trim((string) ($payload['remarks'] ?? ''));
    $disposition = trim((string) ($payload['disposition'] ?? ''));
    $resolutionType = trim((string) ($payload['resolution_type'] ?? '')) ?: null;
    $parsedRemarks = parsePurchaseOrderReturnRemarks($record['stored_remarks'] ?? '');
    $storedRemarks = empty($parsedRemarks['metadata']) ? $remarks : buildPurchaseOrderReturnRemarks($parsedRemarks['metadata'], $remarks);
    $maxReturnQuantity = intdiv((int) $record['ordered_quantity'], max(1, (int) $record['base_quantity']));

    if ($returnQuantity <= 0 || $returnQuantity > $maxReturnQuantity) {
        throw new InvalidArgumentException('Return quantity must be greater than zero and cannot exceed the allowed damaged/ordered quantity.');
    }

    if (!in_array($damageReason, $allowedReasons, true)) {
        throw new InvalidArgumentException('A valid damage reason is required.');
    }
    if (!in_array($disposition, ['Return to Supplier','Hold/Quarantine','Dispose'], true)) throw new InvalidArgumentException('Select a valid physical disposition.');
    if ($resolutionType !== null && !in_array($resolutionType, ['Replacement','Current PO Credit','Next PO Credit'], true)) throw new InvalidArgumentException('Select a valid supplier resolution.');

    $pdo->beginTransaction();

    $statement = $pdo->prepare(
        "UPDATE supplier_claims
         SET affected_quantity = :return_quantity,
             damage_reason = :damage_reason,
             disposition = :disposition,
             resolution_type = :resolution_type,
             claim_status = :claim_status,
             remarks = :remarks
         WHERE claim_id = :return_id"
    );
    $statement->execute([
        ':return_quantity' => $returnQuantity,
        ':damage_reason' => $damageReason,
        ':disposition' => $disposition,
        ':resolution_type' => $resolutionType,
        ':claim_status' => supplierClaimStatus($resolutionType),
        ':remarks' => $storedRemarks,
        ':return_id' => $returnId
    ]);

    if (in_array($resolutionType, ['Current PO Credit','Next PO Credit'], true)) {
        $creditCheck=$pdo->prepare('SELECT credit_id FROM supplier_credits WHERE claim_id=:claim_id LIMIT 1');$creditCheck->execute([':claim_id'=>$returnId]);
        if(!$creditCheck->fetchColumn()){
            $creditId=newUuid($pdo);$creditAmount=round($returnQuantity*(int)$record['base_quantity']*(float)$record['unit_price'],2);
            if($creditAmount>0){$pdo->prepare("INSERT INTO supplier_credits(credit_id,claim_id,credit_amount,credit_status) VALUES(:credit_id,:claim_id,:amount,'Available')")->execute([':credit_id'=>$creditId,':claim_id'=>$returnId,':amount'=>$creditAmount]);if($resolutionType==='Current PO Credit'){$pdo->prepare('INSERT INTO supplier_credit_applications(application_id,credit_id,po_id,amount_applied) VALUES(:id,:credit_id,:po_id,:amount)')->execute([':id'=>newUuid($pdo),':credit_id'=>$creditId,':po_id'=>$record['po_id'],':amount'=>$creditAmount]);$pdo->prepare("UPDATE supplier_credits SET credit_status='Applied' WHERE credit_id=:credit_id")->execute([':credit_id'=>$creditId]);}}
        }
    }

    synchronizePurchaseOrderPaymentStatus($pdo, cleanId($record['po_id']), purchaseOrderEffectivePayable($pdo, cleanId($record['po_id'])));

    $pdo->commit();

    echo json_encode(['status' => 'success', 'message' => 'Return/Damage record updated successfully.']);
} catch (InvalidArgumentException $e) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    http_response_code(400);
    echo json_encode(['status' => 'error', 'message' => $e->getMessage()]);
} catch (Throwable $e) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    http_response_code(500);
    echo json_encode(['status' => 'error', 'message' => 'Unable to update return/damage record.']);
}
?>
