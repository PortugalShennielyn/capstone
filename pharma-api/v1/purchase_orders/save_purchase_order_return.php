<?php
$allowedRoles = ['super_admin', 'admin', 'manager', 'Admin', 'ro-super-admin', 'ro-admin', 'ro-manager'];
require_once '../../config/db_connection.php';
require_once '../../config/require_auth.php';
require_once 'purchase_order_helpers.php';
require_once 'purchase_order_payment_helpers.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') { http_response_code(405); echo json_encode(['status'=>'error','message'=>'Only POST requests are allowed.']); exit(); }
$payload = json_decode(file_get_contents('php://input'), true);
if (!is_array($payload)) { http_response_code(400); echo json_encode(['status'=>'error','message'=>'Invalid JSON payload.']); exit(); }

try {
    ensurePurchaseOrderSchema($pdo);
    $poId = cleanId($payload['po_id'] ?? null);
    $records = is_array($payload['returns'] ?? null) ? $payload['returns'] : [];
    $allowedReasons = ['Expired','Broken package','Wrong item delivered','Incorrect quantity','Damaged during delivery','Other'];
    $allowedDispositions = ['Return to Supplier','Hold/Quarantine','Dispose'];
    $allowedResolutions = ['Replacement','Current PO Credit','Next PO Credit'];
    if ($poId === '' || !$records) throw new InvalidArgumentException('Purchase order and claim items are required.');
$orderStatement = $pdo->prepare("SELECT po_id,po_number,status,total_amount,final_payment FROM purchase_orders WHERE po_id=:po_id AND status='Delivered' LIMIT 1");
    $orderStatement->execute([':po_id'=>$poId]);
    $order = $orderStatement->fetch(PDO::FETCH_ASSOC);
    if (!$order) throw new InvalidArgumentException('Only a delivered purchase order can receive a later supplier claim.');

    $pdo->beginTransaction();
    $itemStatement = $pdo->prepare('SELECT po_item_id,COALESCE(NULLIF(inventory_qty_ordered,0),quantity) ordered_quantity,COALESCE(unit_price_snapshot,0) unit_price FROM purchase_order_items WHERE po_id=:po_id');
    $itemStatement->execute([':po_id'=>$poId]);
    $poItems=[]; foreach ($itemStatement->fetchAll(PDO::FETCH_ASSOC) as $row) $poItems[cleanId($row['po_item_id'])]=$row;
    $insertClaim=$pdo->prepare('INSERT INTO supplier_claims (claim_id,po_item_id,inventory_batch_id,affected_quantity,unit_conversion_id,damage_reason,disposition,resolution_type,requested_resolution_type,claim_status,reported_by,remarks) VALUES (:claim_id,:po_item_id,:batch_id,:quantity,:conversion_id,:reason,:disposition,:resolution,:requested_resolution,:status,:reported_by,:remarks)');
    $insertCredit=$pdo->prepare("INSERT INTO supplier_credits (credit_id,claim_id,credit_amount,credit_status) VALUES (:credit_id,:claim_id,:amount,'Available')");
    $insertApplication=$pdo->prepare('INSERT INTO supplier_credit_applications (application_id,credit_id,po_id,amount_applied,applied_by) VALUES (:application_id,:credit_id,:po_id,:amount,:applied_by)');
    $currentCreditTotal=0.0;
    $existingCurrentDiscount = (float) (purchaseOrderPaymentSummary($pdo, $poId, (float) $order['final_payment'])['current_po_discount'] ?? 0);
    $grossPayable = purchaseOrderEffectivePayable($pdo, $poId, (float) $order['final_payment']);

    foreach ($records as $record) {
        $poItemId=cleanId($record['po_item_id']??null);
        if (!isset($poItems[$poItemId])) throw new InvalidArgumentException('A claim item does not belong to this purchase order.');
        $quantity=(int)($record['affected_quantity']??($record['return_quantity']??0));
        $conversionId=cleanId($record['unit_conversion_id']??null)?:supplierClaimDefaultConversion($pdo,$poItemId);
        $baseQuantity=supplierClaimBaseQuantity($pdo,$poItemId,$conversionId);
        $affectedBase=$quantity*$baseQuantity;
        $reason=trim((string)($record['damage_reason']??''));
        $remarks=trim((string)($record['remarks']??''));
        $disposition=trim((string)($record['disposition']??'Return to Supplier'));
        $resolution=trim((string)($record['resolution_type']??''))?:null;
        $confirmedAmount=round((float)($record['confirmed_amount']??0),2);
        $batchId=cleanId($record['inventory_batch_id']??null)?:null;
        if ($quantity<=0 || $affectedBase>(int)$poItems[$poItemId]['ordered_quantity']) throw new InvalidArgumentException('Affected quantity is outside the original ordered quantity.');
        if (!in_array($reason,$allowedReasons,true)) throw new InvalidArgumentException('A valid damage reason is required.');
        if (!in_array($disposition,$allowedDispositions,true)) throw new InvalidArgumentException('Select a valid physical disposition.');
        if ($resolution!==null && !in_array($resolution,$allowedResolutions,true)) throw new InvalidArgumentException('Select a valid supplier resolution.');
        if (in_array($resolution,['Current PO Credit','Next PO Credit'],true) && $confirmedAmount<=0) throw new InvalidArgumentException('Enter the positive amount confirmed by the supplier.');
        if ($batchId!==null) {
            $batchStatement=$pdo->prepare('SELECT batch_id,storage_qty,shelf_qty FROM inventory_batches WHERE batch_id=:batch_id AND po_item_id=:po_item_id LIMIT 1 FOR UPDATE');
            $batchStatement->execute([':batch_id'=>$batchId,':po_item_id'=>$poItemId]);
            $batch=$batchStatement->fetch(PDO::FETCH_ASSOC);
            if (!$batch) throw new InvalidArgumentException('The selected inventory batch does not belong to the original PO item.');
            if ($affectedBase>(int)$batch['storage_qty']+(int)$batch['shelf_qty']) throw new InvalidArgumentException('Affected quantity exceeds usable stock in the selected batch.');
            $fromStorage=min($affectedBase,(int)$batch['storage_qty']); $fromShelf=$affectedBase-$fromStorage;
            $pdo->prepare('UPDATE inventory_batches SET storage_qty=storage_qty-:storage_qty,shelf_qty=shelf_qty-:shelf_qty,damaged_qty=damaged_qty+:affected_qty WHERE batch_id=:batch_id')->execute([':storage_qty'=>$fromStorage,':shelf_qty'=>$fromShelf,':affected_qty'=>$affectedBase,':batch_id'=>$batchId]);
        }
        $claimId=newUuid($pdo);
        $insertClaim->execute([':claim_id'=>$claimId,':po_item_id'=>$poItemId,':batch_id'=>$batchId,':quantity'=>$quantity,':conversion_id'=>$conversionId,':reason'=>$reason,':disposition'=>$disposition,':resolution'=>$resolution,':requested_resolution'=>$resolution,':status'=>supplierClaimStatus($resolution),':reported_by'=>$_SESSION['user_id']??null,':remarks'=>$remarks ?: null]);
        if (in_array($resolution,['Current PO Credit','Next PO Credit'],true)) {
            $amount=$confirmedAmount;
            if ($amount>0) {
                $creditId=newUuid($pdo); $insertCredit->execute([':credit_id'=>$creditId,':claim_id'=>$claimId,':amount'=>$amount]);
                if ($resolution==='Current PO Credit') { $currentCreditTotal+=$amount; if($existingCurrentDiscount+$currentCreditTotal>$grossPayable)throw new InvalidArgumentException('Confirmed current-PO discounts cannot exceed the original PO total.'); $insertApplication->execute([':application_id'=>newUuid($pdo),':credit_id'=>$creditId,':po_id'=>$poId,':amount'=>$amount,':applied_by'=>$_SESSION['user_id']??null]); $pdo->prepare("UPDATE supplier_credits SET credit_status='Applied' WHERE credit_id=:credit_id")->execute([':credit_id'=>$creditId]); $pdo->prepare("UPDATE supplier_claims SET claim_status='Credit Applied',resolved_at=CURRENT_TIMESTAMP WHERE claim_id=:claim_id")->execute([':claim_id'=>$claimId]); }
            }
        }
    }
    $payable=purchaseOrderEffectivePayable($pdo,$poId,(float)$order['final_payment']);
    $pdo->prepare("UPDATE purchase_orders SET final_payment=:payable WHERE po_id=:po_id")->execute([':payable'=>$payable,':po_id'=>$poId]);
    synchronizePurchaseOrderPaymentStatus($pdo,$poId,$payable);
    $pdo->commit();
    recordActivityLog($pdo,'Purchase Order','Supplier Claim','Supplier claim recorded for PO '.$order['po_number'],$poId);
    echo json_encode(['status'=>'success','message'=>'Supplier claim saved successfully.']);
} catch (InvalidArgumentException $e) { if ($pdo->inTransaction()) $pdo->rollBack(); http_response_code(400); echo json_encode(['status'=>'error','message'=>$e->getMessage()]); }
catch (Throwable $e) { if ($pdo->inTransaction()) $pdo->rollBack(); http_response_code(500); echo json_encode(['status'=>'error','message'=>'Unable to save supplier claim.','error'=>$e->getMessage()]); }
