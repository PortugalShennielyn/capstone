<?php
$allowedRoles=['super_admin','admin','manager','Admin','ro-super-admin','ro-admin','ro-manager'];
require_once '../../config/db_connection.php';
require_once '../../config/require_auth.php';
require_once 'purchase_order_helpers.php';
require_once 'purchase_order_payment_helpers.php';
if ($_SERVER['REQUEST_METHOD']!=='POST'){http_response_code(405);echo json_encode(['status'=>'error','message'=>'Only POST requests are allowed.']);exit();}
$payload=json_decode(file_get_contents('php://input'),true); if(!is_array($payload)){http_response_code(400);echo json_encode(['status'=>'error','message'=>'Invalid JSON payload.']);exit();}
try{
    $poId=cleanId($payload['po_id']??null);$creditId=cleanId($payload['credit_id']??null);$amount=round((float)($payload['amount_applied']??0),2);
    if($poId===''||$creditId===''||$amount<=0)throw new InvalidArgumentException('Purchase order, supplier credit, and a positive amount are required.');
    $pdo->beginTransaction();
    $statement=$pdo->prepare("SELECT cr.credit_amount,cr.credit_status,source_po.supplier_id source_supplier,target_po.supplier_id target_supplier,target_po.final_payment FROM supplier_credits cr INNER JOIN supplier_claims sc ON sc.claim_id=cr.claim_id INNER JOIN purchase_order_items poi ON poi.po_item_id=sc.po_item_id INNER JOIN purchase_orders source_po ON source_po.po_id=poi.po_id INNER JOIN purchase_orders target_po ON target_po.po_id=:po_id WHERE cr.credit_id=:credit_id LIMIT 1 FOR UPDATE");
    $statement->execute([':po_id'=>$poId,':credit_id'=>$creditId]);$credit=$statement->fetch(PDO::FETCH_ASSOC);if(!$credit)throw new InvalidArgumentException('Supplier credit or target PO was not found.');
    if($credit['source_supplier']!==$credit['target_supplier'])throw new InvalidArgumentException('A supplier credit can only be applied to a PO for the same supplier.');
    $used=$pdo->prepare('SELECT COALESCE(SUM(amount_applied),0) FROM supplier_credit_applications WHERE credit_id=:credit_id');$used->execute([':credit_id'=>$creditId]);$remaining=round((float)$credit['credit_amount']-(float)$used->fetchColumn(),2);
    if($amount>$remaining)throw new InvalidArgumentException('Applied amount exceeds the available supplier credit.');
    $before=purchaseOrderPaymentSummary($pdo,$poId,(float)$credit['final_payment']);if($amount>$before['remaining_balance'])throw new InvalidArgumentException('Applied credit exceeds the PO remaining balance.');
    $existing=$pdo->prepare('SELECT application_id,amount_applied FROM supplier_credit_applications WHERE credit_id=:credit_id AND po_id=:po_id LIMIT 1 FOR UPDATE');$existing->execute([':credit_id'=>$creditId,':po_id'=>$poId]);$application=$existing->fetch(PDO::FETCH_ASSOC);
    if($application){$pdo->prepare('UPDATE supplier_credit_applications SET amount_applied=amount_applied+:amount,applied_at=CURRENT_TIMESTAMP WHERE application_id=:id')->execute([':amount'=>$amount,':id'=>$application['application_id']]);$applicationId=$application['application_id'];}
    else{$applicationId=newUuid($pdo);$pdo->prepare('INSERT INTO supplier_credit_applications(application_id,credit_id,po_id,amount_applied) VALUES(:id,:credit_id,:po_id,:amount)')->execute([':id'=>$applicationId,':credit_id'=>$creditId,':po_id'=>$poId,':amount'=>$amount]);}
    $newRemaining=round($remaining-$amount,2);$pdo->prepare('UPDATE supplier_credits SET credit_status=:status WHERE credit_id=:credit_id')->execute([':status'=>$newRemaining<=0?'Applied':'Partially Applied',':credit_id'=>$creditId]);
    $summary=synchronizePurchaseOrderPaymentStatus($pdo,$poId,(float)$credit['final_payment']);$pdo->commit();
    echo json_encode(['status'=>'success','message'=>'Supplier credit applied.','application_id'=>$applicationId,'credit_remaining'=>$newRemaining,'payment'=>$summary]);
}catch(InvalidArgumentException $e){if($pdo->inTransaction())$pdo->rollBack();http_response_code(400);echo json_encode(['status'=>'error','message'=>$e->getMessage()]);}
catch(Throwable $e){if($pdo->inTransaction())$pdo->rollBack();http_response_code(500);echo json_encode(['status'=>'error','message'=>'Unable to apply supplier credit.','error'=>$e->getMessage()]);}
