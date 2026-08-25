<?php
$allowedRoles = ['super_admin','admin','manager','Admin','ro-super-admin','ro-admin','ro-manager'];
require_once '../../config/db_connection.php';
require_once '../../config/require_auth.php';
require_once 'purchase_order_helpers.php';
require_once 'purchase_order_payment_helpers.php';
require_once 'purchase_order_invoice_helpers.php';

function invoiceFailure(string $message, int $code=422): void { if ($GLOBALS['pdo']->inTransaction()) $GLOBALS['pdo']->rollBack(); http_response_code($code); echo json_encode(['status'=>'error','message'=>$message]); exit; }
if ($_SERVER['REQUEST_METHOD'] !== 'POST') invoiceFailure('Only POST requests are allowed.',405);
$payload=json_decode(file_get_contents('php://input'),true);
if (!is_array($payload)) invoiceFailure('Invalid JSON payload.',400);
$poId=cleanId($payload['po_id']??null); $number=trim((string)($payload['invoice_number']??'')); $date=trim((string)($payload['invoice_date']??''));
$discountRaw=$payload['discount']??0; $chargesRaw=$payload['other_charges']??0; $supplierTotalRaw=$payload['supplier_invoice_total']??null; $items=$payload['items']??[];
$validDate=DateTime::createFromFormat('!Y-m-d',$date); $validDate=$validDate&&$validDate->format('Y-m-d')===$date;
if ($poId===''||$number===''||strlen($number)>100||!$validDate) invoiceFailure('Invoice number and a valid invoice date are required.');
if(!is_numeric($discountRaw)||!is_numeric($chargesRaw)||!is_numeric($supplierTotalRaw)) invoiceFailure('Enter valid invoice amounts.');
$discount=round((float)$discountRaw,2); $charges=round((float)$chargesRaw,2); $supplierTotal=round((float)$supplierTotalRaw,2);
if (!is_array($items)||!count($items)||$discount<0||$charges<0||$supplierTotal<=0) invoiceFailure('Enter a supplier invoice total greater than zero and all invoice lines.');
try {
    ensurePurchaseOrderInvoiceSchema($pdo); $pdo->beginTransaction();
    $orderStmt=$pdo->prepare('SELECT status FROM purchase_orders WHERE po_id=:po_id LIMIT 1 FOR UPDATE'); $orderStmt->execute([':po_id'=>$poId]); $status=$orderStmt->fetchColumn();
    if ($status===false) invoiceFailure('Purchase order not found.',404);
    if (!in_array($status,['Pending','Arrived'],true)) invoiceFailure('Supplier invoices can only be recorded while a purchase order is Pending or Arrived.');
    $lineStmt=$pdo->prepare('SELECT po_item_id,purchase_qty FROM purchase_order_items WHERE po_id=:po_id FOR UPDATE');
    $lineStmt->execute([':po_id'=>$poId]); $ordered=[]; foreach($lineStmt->fetchAll(PDO::FETCH_ASSOC) as $row) $ordered[(string)$row['po_item_id']]=$row;
    if (count($ordered)!==count($items)) invoiceFailure('The invoice must include every purchase-order line exactly once.');
    $normalized=[]; $subtotal=0;
    $seen=[];
    foreach($items as $item){ $id=cleanId($item['po_item_id']??null); $cost=$item['unit_cost']??null;
        if(!isset($ordered[$id])||isset($seen[$id])||!is_numeric($cost)||(float)$cost<=0||(float)$cost>99999999.9999) invoiceFailure('Each purchase-order line needs a supplier unit cost greater than zero.');
        $seen[$id]=true; $qty=(int)$ordered[$id]['purchase_qty'];
        $line=round($qty*(float)$cost,2); $subtotal=round($subtotal+$line,2); $normalized[]=['id'=>$id,'cost'=>round((float)$cost,4)];
    }
    $calculated=round($subtotal-$discount+$charges,2); $difference=round($supplierTotal-$calculated,2);
    if($calculated<0) invoiceFailure('Discount cannot make the calculated invoice total negative.');
    if(abs($difference)>=0.01) invoiceFailure('The supplier invoice total does not match the purchase-order line calculation.');
    $supplierTotal=$calculated;
    $existing=$pdo->prepare('SELECT invoice_id FROM purchase_order_invoices WHERE po_id=:po_id LIMIT 1'); $existing->execute([':po_id'=>$poId]); $invoiceId=(string)($existing->fetchColumn()?:newUuid($pdo));
    $pdo->prepare('INSERT INTO purchase_order_invoices(invoice_id,po_id,invoice_number,invoice_date,discount,other_charges,supplier_invoice_total,recorded_by) VALUES(:id,:po,:number,:date,:discount,:charges,:supplier_total,:user) ON DUPLICATE KEY UPDATE invoice_number=VALUES(invoice_number),invoice_date=VALUES(invoice_date),discount=VALUES(discount),other_charges=VALUES(other_charges),supplier_invoice_total=VALUES(supplier_invoice_total),recorded_by=VALUES(recorded_by)')->execute([':id'=>$invoiceId,':po'=>$poId,':number'=>$number,':date'=>$date,':discount'=>$discount,':charges'=>$charges,':supplier_total'=>$supplierTotal,':user'=>$_SESSION['user_id']??null]);
    $pdo->prepare('DELETE FROM purchase_order_invoice_items WHERE invoice_id=:id')->execute([':id'=>$invoiceId]);
    $insert=$pdo->prepare('INSERT INTO purchase_order_invoice_items(invoice_item_id,invoice_id,po_item_id,unit_cost) VALUES(:id,:invoice,:po_item,:cost)');
    foreach($normalized as $line) $insert->execute([':id'=>newUuid($pdo),':invoice'=>$invoiceId,':po_item'=>$line['id'],':cost'=>$line['cost']]);
    $summary=synchronizePurchaseOrderPaymentStatus($pdo,$poId,$supplierTotal); $pdo->commit();
    recordActivityLog($pdo,'Purchase Order','Supplier Invoice','Supplier invoice '.$number.' recorded for PO',$poId);
    echo json_encode(['status'=>'success','message'=>'Supplier invoice recorded.','invoice'=>purchaseOrderInvoice($pdo,$poId),'payment'=>$summary]);
} catch(Throwable $e){ if($pdo->inTransaction())$pdo->rollBack(); http_response_code(500); echo json_encode(['status'=>'error','message'=>'Unable to save supplier invoice.','error'=>$e->getMessage()]); }
?>
