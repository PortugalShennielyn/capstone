<?php
require_once __DIR__ . '/../pharma-api/config/db_connection.php';
require_once __DIR__ . '/../pharma-api/v1/purchase_orders/purchase_order_helpers.php';
require_once __DIR__ . '/../pharma-api/v1/purchase_orders/purchase_order_payment_helpers.php';

function claimAssert(bool $condition, string $message): void { if (!$condition) throw new RuntimeException($message); }

$pdo->beginTransaction();
try {
    $fixture=$pdo->query("SELECT po.po_id,po.supplier_id,poi.po_item_id,poi.product_id,c.conversion_id,c.base_quantity FROM purchase_orders po INNER JOIN purchase_order_items poi ON poi.po_id=po.po_id INNER JOIN supplier_products sp ON sp.supplier_id=po.supplier_id AND sp.product_id=poi.product_id INNER JOIN supplier_product_unit_conversions c ON c.supplier_product_id=sp.supplier_product_id WHERE c.base_quantity>1 ORDER BY c.base_quantity ASC LIMIT 1")->fetch(PDO::FETCH_ASSOC);
    claimAssert((bool)$fixture,'A package-conversion fixture is required.');
    $poId=cleanId($fixture['po_id']);$poItemId=cleanId($fixture['po_item_id']);$conversionId=cleanId($fixture['conversion_id']);$base=(int)$fixture['base_quantity'];
    $pdo->prepare("UPDATE purchase_orders SET status='Delivered',total_amount=1000,final_payment=1000 WHERE po_id=:po_id")->execute([':po_id'=>$poId]);
    $receivingId=newUuid($pdo);$pdo->prepare("INSERT INTO purchase_order_receiving(receiving_id,po_id,remarks,inspection_status) VALUES(:id,:po_id,'test','Confirmed')")->execute([':id'=>$receivingId,':po_id'=>$poId]);
    $pdo->prepare('INSERT INTO purchase_order_receiving_items(receiving_item_id,receiving_id,po_item_id,received_quantity) VALUES(:id,:receiving_id,:po_item_id,50)')->execute([':id'=>newUuid($pdo),':receiving_id'=>$receivingId,':po_item_id'=>$poItemId]);
    claimAssert((string)$pdo->query("SELECT inspection_status FROM purchase_order_receiving WHERE receiving_id='{$receivingId}'")->fetchColumn()==='Confirmed','Clean receiving did not reach Confirmed inspection state.');
    claimAssert((int)$pdo->query("SELECT COUNT(*) FROM supplier_claims WHERE po_item_id='{$poItemId}'")->fetchColumn()===0,'Clean receiving unexpectedly created a claim.');
    $batchId=newUuid($pdo);$pdo->prepare("INSERT INTO inventory_batches(batch_id,po_id,po_item_id,product_id,supplier_id,received_qty,storage_qty,unit_cost) VALUES(:batch_id,:po_id,:po_item_id,:product_id,:supplier_id,50,50,20)")->execute([':batch_id'=>$batchId,':po_id'=>$poId,':po_item_id'=>$poItemId,':product_id'=>$fixture['product_id'],':supplier_id'=>$fixture['supplier_id']]);
    $claimId=newUuid($pdo);$pdo->prepare("INSERT INTO supplier_claims(claim_id,po_item_id,inventory_batch_id,affected_quantity,unit_conversion_id,damage_reason,disposition,resolution_type,claim_status) VALUES(:claim_id,:po_item_id,:batch_id,1,:conversion_id,'Broken package','Hold/Quarantine','Next PO Credit','Awaiting Supplier Resolution')")->execute([':claim_id'=>$claimId,':po_item_id'=>$poItemId,':batch_id'=>$batchId,':conversion_id'=>$conversionId]);
    $pdo->prepare('UPDATE inventory_batches SET storage_qty=storage_qty-:storage_qty,damaged_qty=damaged_qty+:damaged_qty WHERE batch_id=:batch_id')->execute([':storage_qty'=>$base,':damaged_qty'=>$base,':batch_id'=>$batchId]);
    $damaged=$pdo->prepare('SELECT damaged_quantity FROM purchase_order_receiving_item_summary WHERE po_item_id=:po_item_id');$damaged->execute([':po_item_id'=>$poItemId]);claimAssert((int)$damaged->fetchColumn()===$base,'Package-level claim was not converted to the correct base quantity.');
    $baseConversion=supplierClaimDefaultConversion($pdo,$poItemId);
    $replacementClaimId=newUuid($pdo);$pdo->prepare("INSERT INTO supplier_claims(claim_id,po_item_id,affected_quantity,unit_conversion_id,damage_reason,disposition,resolution_type,claim_status) VALUES(:id,:po_item_id,1,:conversion_id,'Damaged during delivery','Return to Supplier','Replacement','Awaiting Replacement')")->execute([':id'=>$replacementClaimId,':po_item_id'=>$poItemId,':conversion_id'=>$baseConversion]);
    claimAssert((string)$pdo->query("SELECT claim_status FROM supplier_claims WHERE claim_id='{$replacementClaimId}'")->fetchColumn()==='Awaiting Replacement','Replacement claim status was not preserved separately from the PO.');
    $currentClaimId=newUuid($pdo);$pdo->prepare("INSERT INTO supplier_claims(claim_id,po_item_id,affected_quantity,unit_conversion_id,damage_reason,disposition,resolution_type,claim_status) VALUES(:id,:po_item_id,1,:conversion_id,'Broken package','Return to Supplier','Current PO Credit','Awaiting Supplier Resolution')")->execute([':id'=>$currentClaimId,':po_item_id'=>$poItemId,':conversion_id'=>$baseConversion]);
    $currentCreditId=newUuid($pdo);$pdo->prepare("INSERT INTO supplier_credits(credit_id,claim_id,credit_amount,credit_status) VALUES(:credit_id,:claim_id,20,'Applied')")->execute([':credit_id'=>$currentCreditId,':claim_id'=>$currentClaimId]);$pdo->prepare('INSERT INTO supplier_credit_applications(application_id,credit_id,po_id,amount_applied) VALUES(:id,:credit_id,:po_id,20)')->execute([':id'=>newUuid($pdo),':credit_id'=>$currentCreditId,':po_id'=>$poId]);
    $sourceSummary=purchaseOrderPaymentSummary($pdo,$poId,1000);claimAssert($sourceSummary['remaining_balance']===980.0,'Current-PO credit was not applied separately from gross merchandise cost.');
    $creditId=newUuid($pdo);$pdo->prepare("INSERT INTO supplier_credits(credit_id,claim_id,credit_amount) VALUES(:credit_id,:claim_id,200)")->execute([':credit_id'=>$creditId,':claim_id'=>$claimId]);
    $targetPoId=newUuid($pdo);$pdo->prepare("INSERT INTO purchase_orders(po_id,po_number,supplier_id,status,total_amount,final_payment) VALUES(:id,:number,:supplier_id,'Delivered',500,500)")->execute([':id'=>$targetPoId,':number'=>'TEST-CREDIT-'.substr(str_replace('-','',$targetPoId),0,10),':supplier_id'=>$fixture['supplier_id']]);
    $pdo->prepare('INSERT INTO supplier_credit_applications(application_id,credit_id,po_id,amount_applied) VALUES(:id,:credit_id,:po_id,125)')->execute([':id'=>newUuid($pdo),':credit_id'=>$creditId,':po_id'=>$targetPoId]);
    $summary=purchaseOrderPaymentSummary($pdo,$targetPoId,500);claimAssert($summary['supplier_credit_applied']===125.0 && $summary['remaining_balance']===375.0,'Future-PO credit was not deducted separately from merchandise cost.');
    $key='claim-test-'.str_replace('-','',newUuid($pdo));$insert=$pdo->prepare("INSERT INTO purchase_order_payments(payment_id,po_id,amount,payment_method,payment_date,payment_request_key) VALUES(:id,:po_id,10,'cash',CURRENT_DATE,:request_key)");$insert->execute([':id'=>newUuid($pdo),':po_id'=>$targetPoId,':request_key'=>$key]);
    $duplicateBlocked=false;try{$insert->execute([':id'=>newUuid($pdo),':po_id'=>$targetPoId,':request_key'=>$key]);}catch(PDOException $e){$duplicateBlocked=(string)$e->getCode()==='23000';}claimAssert($duplicateBlocked,'Duplicate payment request key was not rejected.');
    $pdo->rollBack();
    echo "supplier claim workflow test passed\n";
} catch(Throwable $e) { if($pdo->inTransaction())$pdo->rollBack(); throw $e; }
