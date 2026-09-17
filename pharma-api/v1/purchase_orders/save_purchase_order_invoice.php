<?php
$allowedRoles = ['super_admin','admin','manager','Admin','ro-super-admin','ro-admin','ro-manager'];
require_once '../../config/db_connection.php';
require_once '../../config/require_auth.php';
require_once 'purchase_order_helpers.php';
require_once 'purchase_order_payment_helpers.php';
require_once 'purchase_order_invoice_helpers.php';

function invoiceFailure(string $message, int $code=422): void { if ($GLOBALS['pdo']->inTransaction()) $GLOBALS['pdo']->rollBack(); http_response_code($code); echo json_encode(['status'=>'error','message'=>$message]); exit; }
function validInvoiceFinancialValue(mixed $value, bool $allowZero): bool {
    if (!is_int($value) && !is_float($value) && !is_string($value)) return false;
    $raw=trim((string)$value);
    if ($raw===''||!preg_match('/^\d+(?:\.\d+)?$/D',$raw)) return false;
    $amount=(float)$raw;
    return is_finite($amount)&&($allowZero?$amount>=0:$amount>0);
}
function syncNextPoCreditStatus(PDO $pdo, string $creditId): void {
    $statement=$pdo->prepare('SELECT cr.credit_amount,cr.claim_id,COALESCE(SUM(app.amount_applied),0) amount_applied FROM supplier_credits cr LEFT JOIN supplier_credit_applications app ON app.credit_id=cr.credit_id WHERE cr.credit_id=:credit_id GROUP BY cr.credit_amount,cr.claim_id LIMIT 1 FOR UPDATE');
    $statement->execute([':credit_id'=>$creditId]);
    $credit=$statement->fetch(PDO::FETCH_ASSOC);
    if(!$credit)return;
    $used=round((float)$credit['amount_applied'],2);
    $amount=round((float)$credit['credit_amount'],2);
    $creditStatus=$used<=0?'Available':($used+0.005>=$amount?'Applied':'Partially Applied');
    $claimStatus=$creditStatus==='Available'?'Credit Available':($creditStatus==='Applied'?'Credit Applied':'Supplier Credit Partially Applied');
    $pdo->prepare('UPDATE supplier_credits SET credit_status=:status WHERE credit_id=:credit_id')->execute([':status'=>$creditStatus,':credit_id'=>$creditId]);
    $pdo->prepare('UPDATE supplier_claims SET claim_status=:status,resolved_at=:resolved_at WHERE claim_id=:claim_id')->execute([':status'=>$claimStatus,':resolved_at'=>$creditStatus==='Applied'?date('Y-m-d H:i:s'):null,':claim_id'=>$credit['claim_id']]);
}
if ($_SERVER['REQUEST_METHOD'] !== 'POST') invoiceFailure('Only POST requests are allowed.',405);
$payload=json_decode(file_get_contents('php://input'),true);
if (!is_array($payload)) invoiceFailure('Invalid JSON payload.',400);
foreach (['po_id','invoice_number','invoice_date'] as $field) {
    if (!isset($payload[$field]) || !is_string($payload[$field])) invoiceFailure('Purchase order, invoice number and date must be text values.');
}
$poId=cleanId($payload['po_id']??null); $number=trim((string)($payload['invoice_number']??'')); $date=trim((string)($payload['invoice_date']??''));
$discountRaw=$payload['discount']??0; $chargesRaw=$payload['other_charges']??0; $supplierTotalRaw=$payload['supplier_invoice_total']??null; $items=$payload['items']??[];
$validDate=DateTime::createFromFormat('!Y-m-d',$date); $validDate=$validDate&&$validDate->format('Y-m-d')===$date;
if ($poId===''||$number===''||strlen($number)>100||!$validDate) invoiceFailure('Invoice number and a valid invoice date are required.');
if(!validInvoiceFinancialValue($discountRaw,true)||!validInvoiceFinancialValue($chargesRaw,true)||!validInvoiceFinancialValue($supplierTotalRaw,false)) invoiceFailure('Enter valid non-negative invoice amounts.');
$discount=round((float)$discountRaw,2); $charges=round((float)$chargesRaw,2); $supplierTotal=round((float)$supplierTotalRaw,2);
if (!is_array($items)||!count($items)||$discount<0||$charges<0||$supplierTotal<=0) invoiceFailure('Enter a supplier invoice total greater than zero and all invoice lines.');
try {
    ensurePurchaseOrderInvoiceSchema($pdo); $pdo->beginTransaction();
    $orderStmt=$pdo->prepare('SELECT status FROM purchase_orders WHERE po_id=:po_id LIMIT 1 FOR UPDATE'); $orderStmt->execute([':po_id'=>$poId]); $status=$orderStmt->fetchColumn();
    if ($status===false) invoiceFailure('Purchase order not found.',404);
    assertPurchaseOrderHasProducts($pdo, $poId);
    if (!in_array($status,['Draft','Pending','Arrived','Delivered'],true)) invoiceFailure('Supplier invoices can only be recorded for Draft, Pending, Arrived, or Delivered purchase orders.');
    $lineStmt=$pdo->prepare('SELECT po_item_id,purchase_qty FROM purchase_order_items WHERE po_id=:po_id FOR UPDATE');
    $lineStmt->execute([':po_id'=>$poId]); $ordered=[]; foreach($lineStmt->fetchAll(PDO::FETCH_ASSOC) as $row) $ordered[(string)$row['po_item_id']]=$row;
    if (count($ordered)!==count($items)) invoiceFailure('The invoice must include every purchase-order line exactly once.');
    $normalized=[]; $subtotal=0;
    $seen=[];
    foreach($items as $item){
        if (!is_array($item) || !isset($item['po_item_id']) || !is_string($item['po_item_id'])) invoiceFailure('Invalid invoice line.');
        $id=cleanId($item['po_item_id']); $cost=$item['unit_cost']??null; $invoiceQtyRaw=$item['invoice_qty']??$ordered[$id]['purchase_qty'];
        if(!isset($ordered[$id])||isset($seen[$id])||!validInvoiceFinancialValue($cost,false)||(float)$cost>99999999.9999) invoiceFailure('Enter a valid supplier unit cost greater than ₱0.00.');
        if(!validInvoiceFinancialValue($invoiceQtyRaw,true)||(float)$invoiceQtyRaw>99999999.9999) invoiceFailure('Enter a valid invoice quantity of zero or greater.');
        $qty = round((float) $invoiceQtyRaw, 4);
        $cost = round((float)$cost,4);
        if ($cost <= 0) invoiceFailure('Unit cost must be greater than ₱0.00.');
        $seen[$id]=true;
        $line=round((float)$qty*$cost,2); $subtotal=round($subtotal+$line,2); $normalized[]=['id'=>$id,'cost'=>$cost,'qty'=>(float)$qty];
    }
    $calculated=round($subtotal-$discount+$charges,2); $difference=round($supplierTotal-$calculated,2);
    if($calculated<0) invoiceFailure('Discount cannot make the calculated invoice total negative.');
    if ($calculated > 9999999999.99 || $discount > 9999999999.99 || $charges > 9999999999.99) invoiceFailure('Invoice amounts exceed the supported limit.');
    if(abs($difference)>=0.01) invoiceFailure('The supplier invoice total does not match the purchase-order line calculation.');
    $supplierTotal=$calculated;
    $existing=$pdo->prepare('SELECT invoice_id FROM purchase_order_invoices WHERE po_id=:po_id LIMIT 1'); $existing->execute([':po_id'=>$poId]);
    $existingInvoiceId=(string)($existing->fetchColumn()?:'');
    if ($existingInvoiceId !== '') {
        $currentPayment=purchaseOrderPaymentSummary($pdo,$poId);
        if (($currentPayment['payment_status']??'')==='Paid') invoiceFailure('A paid supplier invoice is read-only. Use the supplier credit or discrepancy workflow for financial corrections.',409);
    }
    $invoiceId=$existingInvoiceId!==''?$existingInvoiceId:newUuid($pdo);
    $pdo->prepare('INSERT INTO purchase_order_invoices(invoice_id,po_id,invoice_number,invoice_date,discount,other_charges,supplier_invoice_total,recorded_by) VALUES(:id,:po,:number,:date,:discount,:charges,:supplier_total,:user) ON DUPLICATE KEY UPDATE invoice_number=VALUES(invoice_number),invoice_date=VALUES(invoice_date),discount=VALUES(discount),other_charges=VALUES(other_charges),supplier_invoice_total=VALUES(supplier_invoice_total),recorded_by=VALUES(recorded_by)')->execute([':id'=>$invoiceId,':po'=>$poId,':number'=>$number,':date'=>$date,':discount'=>$discount,':charges'=>$charges,':supplier_total'=>$supplierTotal,':user'=>$_SESSION['user_id']??null]);
    $pdo->prepare('DELETE FROM purchase_order_invoice_items WHERE invoice_id=:id')->execute([':id'=>$invoiceId]);
    $insert=$pdo->prepare('INSERT INTO purchase_order_invoice_items(invoice_item_id,invoice_id,po_item_id,unit_cost,invoice_qty) VALUES(:id,:invoice,:po_item,:cost,:qty)');
    foreach($normalized as $line) $insert->execute([':id'=>newUuid($pdo),':invoice'=>$invoiceId,':po_item'=>$line['id'],':cost'=>$line['cost'],':qty'=>$line['qty']]);
    $previousCredits=$pdo->prepare("SELECT DISTINCT app.credit_id
        FROM supplier_credit_applications app
        INNER JOIN supplier_credits cr ON cr.credit_id=app.credit_id
        INNER JOIN supplier_claims sc ON sc.claim_id=cr.claim_id
        WHERE app.po_id=:po_id AND sc.resolution_type='Next PO Credit' FOR UPDATE");
    $previousCredits->execute([':po_id'=>$poId]);
    $previousCreditIds=$previousCredits->fetchAll(PDO::FETCH_COLUMN);
    $deleteApplications=$pdo->prepare("DELETE app FROM supplier_credit_applications app
        INNER JOIN supplier_credits cr ON cr.credit_id=app.credit_id
        INNER JOIN supplier_claims sc ON sc.claim_id=cr.claim_id
        WHERE app.po_id=:po_id AND sc.resolution_type='Next PO Credit'");
    $deleteApplications->execute([':po_id'=>$poId]);
    foreach($previousCreditIds as $previousCreditId) syncNextPoCreditStatus($pdo,(string)$previousCreditId);
    $creditRows=$pdo->prepare("SELECT cr.credit_id,cr.claim_id,cr.credit_amount
        FROM supplier_credits cr
        INNER JOIN supplier_claims sc ON sc.claim_id=cr.claim_id
        INNER JOIN purchase_order_items source_item ON source_item.po_item_id=sc.po_item_id
        INNER JOIN purchase_orders source_po ON source_po.po_id=source_item.po_id
                WHERE source_po.supplier_id=(SELECT supplier_id FROM purchase_orders WHERE po_id=:target_supplier_po_id)
                    AND source_po.po_id<>:target_source_po_id
                    AND source_po.created_at <= (SELECT created_at FROM purchase_orders WHERE po_id=:target_created_po_id)
          AND sc.resolution_type='Next PO Credit'
          AND sc.claim_status NOT LIKE '%Cancel%'
          AND cr.credit_status IN ('Available','Partially Applied')
        ORDER BY cr.created_at,cr.credit_id FOR UPDATE");
    $creditRows->execute([':target_supplier_po_id'=>$poId,':target_source_po_id'=>$poId,':target_created_po_id'=>$poId]);
    $insertApplication=$pdo->prepare('INSERT INTO supplier_credit_applications(application_id,credit_id,po_id,amount_applied,applied_by) VALUES(:id,:credit_id,:po_id,:amount,:applied_by)');
    $payableBeforeCredit=$calculated;
    foreach($creditRows->fetchAll(PDO::FETCH_ASSOC) as $creditRow){
        if($payableBeforeCredit<=0) break;
        $usedStatement=$pdo->prepare('SELECT COALESCE(SUM(amount_applied),0) FROM supplier_credit_applications WHERE credit_id=:credit_id');
        $usedStatement->execute([':credit_id'=>$creditRow['credit_id']]);
        $remainingCredit=round((float)$creditRow['credit_amount']-(float)$usedStatement->fetchColumn(),2);
        if($remainingCredit<=0) continue;
        $appliedAmount=round(min($remainingCredit,$payableBeforeCredit),2);
        $insertApplication->execute([':id'=>newUuid($pdo),':credit_id'=>$creditRow['credit_id'],':po_id'=>$poId,':amount'=>$appliedAmount,':applied_by'=>$_SESSION['user_id']??null]);
        $newRemaining=round($remainingCredit-$appliedAmount,2);
        syncNextPoCreditStatus($pdo,(string)$creditRow['credit_id']);
        $payableBeforeCredit=round($payableBeforeCredit-$appliedAmount,2);
    }
    if ($status === 'Draft') {
        $statusUpdate = $pdo->prepare("UPDATE purchase_orders SET status='Pending', total_amount=NULL WHERE po_id=:po_id AND status='Draft'");
        $statusUpdate->execute([':po_id' => $poId]);
    }
    $summary=synchronizePurchaseOrderPaymentStatus($pdo,$poId,$supplierTotal); $pdo->commit();
    recordActivityLog($pdo,'Purchase Order','Supplier Invoice','Supplier invoice '.$number.' recorded for PO',$poId);
    echo json_encode(['status'=>'success','message'=>'Supplier invoice recorded.','invoice'=>purchaseOrderInvoice($pdo,$poId),'payment'=>$summary]);
} catch(Throwable $e){ if($pdo->inTransaction())$pdo->rollBack(); http_response_code(500); echo json_encode(['status'=>'error','message'=>'Unable to save supplier invoice.','error'=>$e->getMessage()]); }
?>
