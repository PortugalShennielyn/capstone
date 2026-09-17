<?php
$allowedRoles=['super_admin','admin','manager','supervisor','Admin','ro-super-admin','ro-admin','ro-manager','ro-supervisor'];
require_once '../../config/db_connection.php';
require_once '../../config/require_auth.php';
require_once 'purchase_order_helpers.php';
if ($_SERVER['REQUEST_METHOD']!=='GET') { http_response_code(405); echo json_encode(['status'=>'error','message'=>'Only GET requests are allowed.']); exit(); }
try {
    $poId=cleanId($_GET['po_id']??null); if ($poId==='') throw new InvalidArgumentException('Purchase order is required.');
    $statement=$pdo->prepare("SELECT cr.credit_id,cr.claim_id,cr.credit_amount,cr.credit_status,cr.created_at,sc.damage_reason,source_po.po_number AS source_po_number,COALESCE(SUM(app.amount_applied),0) amount_applied,cr.credit_amount-COALESCE(SUM(app.amount_applied),0) available_amount FROM supplier_credits cr INNER JOIN supplier_claims sc ON sc.claim_id=cr.claim_id INNER JOIN purchase_order_items source_item ON source_item.po_item_id=sc.po_item_id INNER JOIN purchase_orders source_po ON source_po.po_id=source_item.po_id INNER JOIN purchase_orders target_po ON target_po.po_id=:target_po_id AND target_po.supplier_id=source_po.supplier_id AND target_po.created_at>=source_po.created_at LEFT JOIN supplier_credit_applications app ON app.credit_id=cr.credit_id WHERE cr.credit_status IN ('Available','Partially Applied') AND source_po.po_id<>:source_po_id GROUP BY cr.credit_id,cr.claim_id,cr.credit_amount,cr.credit_status,cr.created_at,sc.damage_reason,source_po.po_number HAVING available_amount>0 ORDER BY cr.created_at,cr.credit_id");
    $statement->execute([':target_po_id'=>$poId,':source_po_id'=>$poId]); $credits=$statement->fetchAll(PDO::FETCH_ASSOC);
    foreach($credits as &$credit){$credit['credit_amount']=round((float)$credit['credit_amount'],2);$credit['amount_applied']=round((float)$credit['amount_applied'],2);$credit['available_amount']=round((float)$credit['available_amount'],2);} unset($credit);
    echo json_encode(['status'=>'success','credits'=>$credits]);
} catch(InvalidArgumentException $e){http_response_code(400);echo json_encode(['status'=>'error','message'=>$e->getMessage()]);}
catch(Throwable $e){http_response_code(500);echo json_encode(['status'=>'error','message'=>'Unable to load supplier credits.','error'=>$e->getMessage()]);}
