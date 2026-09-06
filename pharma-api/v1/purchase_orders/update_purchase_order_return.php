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
    if ($returnId === '') {
        throw new InvalidArgumentException('Return/Damage id is required.');
    }

    $recordStatement = $pdo->prepare(
        "SELECT
            por.claim_id AS return_id,
            poi.po_id,
            por.po_item_id,
            por.affected_quantity AS return_quantity,
            por.damage_reason,
            por.disposition,
            por.unit_conversion_id,
            por.resolution_type AS existing_resolution_type,
            por.requested_resolution_type,
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

    $resolutionType = trim((string) ($payload['resolution_type'] ?? '')) ?: null;
    $confirmedAmountInput = $payload['confirmed_amount'] ?? null;
    if ($confirmedAmountInput !== null && $confirmedAmountInput !== '' && !is_numeric($confirmedAmountInput)) {
        throw new InvalidArgumentException('Enter a valid credit amount confirmed by the supplier.');
    }
    $confirmedAmount = $confirmedAmountInput === null || $confirmedAmountInput === '' ? null : round((float) $confirmedAmountInput, 2);
    if ($confirmedAmount !== null && $confirmedAmount < 0) {
        throw new InvalidArgumentException('The confirmed credit amount cannot be negative.');
    }
    $managementRemarks = trim((string) ($payload['management_remarks'] ?? ''));

    if ($resolutionType !== null && !in_array($resolutionType, ['Replacement','Current PO Credit','Next PO Credit'], true)) throw new InvalidArgumentException('Select a valid supplier resolution.');

    $pdo->beginTransaction();

    if ($resolutionType === 'Current PO Credit' && $confirmedAmount !== null && $confirmedAmount > 0) {
        $otherDiscounts = $pdo->prepare("SELECT COALESCE(SUM(app.amount_applied),0) FROM supplier_credit_applications app INNER JOIN supplier_credits cr ON cr.credit_id=app.credit_id INNER JOIN supplier_claims sc ON sc.claim_id=cr.claim_id INNER JOIN purchase_order_items source_item ON source_item.po_item_id=sc.po_item_id WHERE app.po_id=:po_id AND source_item.po_id=:source_po_id AND sc.claim_id<>:claim_id AND sc.resolution_type IN ('Current PO Credit','Supplier Credit')");
        $otherDiscounts->execute([':po_id' => $record['po_id'], ':source_po_id' => $record['po_id'], ':claim_id' => $returnId]);
        if ((float) $otherDiscounts->fetchColumn() + $confirmedAmount > purchaseOrderEffectivePayable($pdo, cleanId($record['po_id']))) throw new InvalidArgumentException('Confirmed current-PO discounts cannot exceed the original PO total.');
    }

    $statement = $pdo->prepare(
        "UPDATE supplier_claims
         SET resolution_type = :resolution_type,
             requested_resolution_type = COALESCE(requested_resolution_type, :requested_resolution_type),
             management_remarks = :management_remarks,
             claim_status = :claim_status,
             resolved_at = NULL
         WHERE claim_id = :return_id"
    );
    $statement->execute([
        ':resolution_type' => $resolutionType,
        ':requested_resolution_type' => $record['requested_resolution_type'] ?: $record['existing_resolution_type'],
        ':management_remarks' => $managementRemarks ?: null,
        ':claim_status' => supplierClaimStatus($resolutionType),
        ':return_id' => $returnId
    ]);

    $creditCheck=$pdo->prepare('SELECT cr.credit_id,cr.credit_amount,cr.credit_status,COALESCE(SUM(app.amount_applied),0) amount_applied FROM supplier_credits cr LEFT JOIN supplier_credit_applications app ON app.credit_id=cr.credit_id WHERE cr.claim_id=:claim_id GROUP BY cr.credit_id,cr.credit_amount,cr.credit_status LIMIT 1 FOR UPDATE');$creditCheck->execute([':claim_id'=>$returnId]);
    $existingCredit=$creditCheck->fetch(PDO::FETCH_ASSOC)?:null;
    if ($existingCredit && !in_array($resolutionType, ['Current PO Credit','Next PO Credit'], true)) throw new InvalidArgumentException('This claim already has a supplier credit. Reconcile that credit before changing to a non-credit resolution.');
    if ($existingCredit && ($record['existing_resolution_type'] ?? null) !== $resolutionType) throw new InvalidArgumentException('A generated supplier credit cannot be changed between current-PO discount and future credit.');
    if (in_array($resolutionType, ['Current PO Credit','Next PO Credit'], true)) {
        if($existingCredit){
            if ($confirmedAmount === null || $confirmedAmount <= 0) {
                if ((float) $existingCredit['amount_applied'] > 0) throw new InvalidArgumentException('Applied supplier credit cannot be cleared. Reconcile the applications first.');
                $pdo->prepare('DELETE FROM supplier_credits WHERE credit_id=:credit_id')->execute([':credit_id'=>$existingCredit['credit_id']]);
                $pdo->prepare("UPDATE supplier_claims SET claim_status='Awaiting Supplier Credit',resolved_at=NULL WHERE claim_id=:claim_id")->execute([':claim_id'=>$returnId]);
            } else {
            if((float)$existingCredit['amount_applied']>$confirmedAmount)throw new InvalidArgumentException('The confirmed amount is lower than credit already applied. Reconcile the applications first.');
            $pdo->prepare('UPDATE supplier_credits SET credit_amount=:amount WHERE credit_id=:credit_id')->execute([':amount'=>$confirmedAmount,':credit_id'=>$existingCredit['credit_id']]);
            if($resolutionType==='Current PO Credit'){
                $application=$pdo->prepare('SELECT application_id FROM supplier_credit_applications WHERE credit_id=:credit_id AND po_id=:po_id LIMIT 1 FOR UPDATE');$application->execute([':credit_id'=>$existingCredit['credit_id'],':po_id'=>$record['po_id']]);$applicationId=$application->fetchColumn();
                if($applicationId)$pdo->prepare('UPDATE supplier_credit_applications SET amount_applied=:amount,applied_at=CURRENT_TIMESTAMP,applied_by=:applied_by WHERE application_id=:id')->execute([':amount'=>$confirmedAmount,':applied_by'=>$_SESSION['user_id']??null,':id'=>$applicationId]);
                else $pdo->prepare('INSERT INTO supplier_credit_applications(application_id,credit_id,po_id,amount_applied,applied_by) VALUES(:id,:credit_id,:po_id,:amount,:applied_by)')->execute([':id'=>newUuid($pdo),':credit_id'=>$existingCredit['credit_id'],':po_id'=>$record['po_id'],':amount'=>$confirmedAmount,':applied_by'=>$_SESSION['user_id']??null]);
                $pdo->prepare("UPDATE supplier_credits SET credit_status='Applied' WHERE credit_id=:credit_id")->execute([':credit_id'=>$existingCredit['credit_id']]);
            }
            if($resolutionType==='Current PO Credit')$pdo->prepare("UPDATE supplier_claims SET claim_status='Credit Applied',resolved_at=CURRENT_TIMESTAMP WHERE claim_id=:claim_id")->execute([':claim_id'=>$returnId]);
            if($resolutionType==='Next PO Credit')$pdo->prepare("UPDATE supplier_claims SET claim_status=:status,resolved_at=NULL WHERE claim_id=:claim_id")->execute([':status'=>((float)$existingCredit['amount_applied']>0?'Supplier Credit Partially Applied':'Credit Available'),':claim_id'=>$returnId]);
            }
        } else {
            $creditId=newUuid($pdo);$creditAmount=$confirmedAmount ?? 0;
            if($creditAmount>0){$pdo->prepare("INSERT INTO supplier_credits(credit_id,claim_id,credit_amount,credit_status) VALUES(:credit_id,:claim_id,:amount,'Available')")->execute([':credit_id'=>$creditId,':claim_id'=>$returnId,':amount'=>$creditAmount]);if($resolutionType==='Current PO Credit'){$pdo->prepare('INSERT INTO supplier_credit_applications(application_id,credit_id,po_id,amount_applied,applied_by) VALUES(:id,:credit_id,:po_id,:amount,:applied_by)')->execute([':id'=>newUuid($pdo),':credit_id'=>$creditId,':po_id'=>$record['po_id'],':amount'=>$creditAmount,':applied_by'=>$_SESSION['user_id']??null]);$pdo->prepare("UPDATE supplier_credits SET credit_status='Applied' WHERE credit_id=:credit_id")->execute([':credit_id'=>$creditId]);}}
            if($creditAmount>0 && $resolutionType==='Current PO Credit')$pdo->prepare("UPDATE supplier_claims SET claim_status='Credit Applied',resolved_at=CURRENT_TIMESTAMP WHERE claim_id=:claim_id")->execute([':claim_id'=>$returnId]);
            if($creditAmount>0 && $resolutionType==='Next PO Credit')$pdo->prepare("UPDATE supplier_claims SET claim_status='Credit Available',resolved_at=NULL WHERE claim_id=:claim_id")->execute([':claim_id'=>$returnId]);
            if($creditAmount<=0)$pdo->prepare("UPDATE supplier_claims SET claim_status='Awaiting Supplier Credit',resolved_at=NULL WHERE claim_id=:claim_id")->execute([':claim_id'=>$returnId]);
        }
    }

    synchronizePurchaseOrderPaymentStatus($pdo, cleanId($record['po_id']), purchaseOrderEffectivePayable($pdo, cleanId($record['po_id'])));

    $pdo->commit();

    recordActivityLog($pdo, 'Return/Damage', 'Supplier Response', 'Supplier response recorded: ' . ($resolutionType ?: 'Awaiting Supplier Decision') . '.', $returnId);

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
