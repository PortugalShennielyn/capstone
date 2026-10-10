<?php
require_once __DIR__.'/../pharma-api/config/db_connection.php';
require_once __DIR__.'/../pharma-api/v1/products/supplier_invoice_pricing.php';
function invoiceAssert($ok, $message) { if (!$ok) throw new RuntimeException($message); }
$poIds=[]; $authId=newUuid($pdo); $sessionId='invoice'.bin2hex(random_bytes(12)); $token=bin2hex(random_bytes(32));
function invoiceHttp($path, $body=null) {
    global $sessionId,$token;
    $c=curl_init('http://127.0.0.1/PharmacySystem_for_DocR/pharma-api/v1/'.$path);
    curl_setopt_array($c,[CURLOPT_RETURNTRANSFER=>true,CURLOPT_COOKIE=>'PHPSESSID='.$sessionId,CURLOPT_HTTPHEADER=>['Content-Type: application/json','X-Tab-Token: '.$token],CURLOPT_TIMEOUT=>20]);
    if ($body!==null) curl_setopt_array($c,[CURLOPT_POST=>true,CURLOPT_POSTFIELDS=>json_encode($body)]);
    $raw=curl_exec($c); $status=curl_getinfo($c,CURLINFO_RESPONSE_CODE); curl_close($c);
    $data=json_decode($raw,true); invoiceAssert(is_array($data),'Invalid API JSON: '.$raw);
    return [$status,$data];
}
try {
    $user=$pdo->query("SELECT * FROM users WHERE role IN ('admin','super_admin') AND status='Active' LIMIT 1")->fetch();
    $fixtureProduct=newUuid($pdo); $fixtureSupplier=newUuid($pdo);
    $unit=$pdo->query("SELECT measurement_unit_id FROM product_measurement_units WHERE measurement_group='Count' AND is_active=1 LIMIT 1")->fetchColumn();
    $category=$pdo->query('SELECT category_id FROM product_categories LIMIT 1')->fetchColumn();
    $pdo->prepare("INSERT INTO suppliers(supplier_id,supplier_name) VALUES(?,'Invoice regression fixture')")->execute([$fixtureSupplier]);
    $type=$pdo->query('SELECT type_id FROM product_types LIMIT 1')->fetchColumn();
    $pdo->prepare("INSERT INTO product(product_id,barcode,brand_name,product_name,price,category_id,inventory_unit_id,type_id) VALUES(?,'INVOICE-REGRESSION','Test','Invoice fixture',55,?,?,?)")->execute([$fixtureProduct,$category,$unit,$type]);
    $product=['product_id'=>$fixtureProduct,'supplier_id'=>$fixtureSupplier,'price'=>55,'category_id'=>$category];
    invoiceAssert($user && $product,'An active admin and configured supplier product are required.');
    session_write_close(); session_id($sessionId); session_start();
    $_SESSION=['user_id'=>$user['user_id'],'username'=>$user['username'],'full_name'=>$user['full_name'],'role'=>$user['role'],'roles'=>[$user['role']],'role_identifiers'=>['ro-admin'],'user_status'=>'Active','auth_session_id'=>$authId,'tab_token_hash'=>hash('sha256',$token)]; session_write_close();
    $pdo->prepare("INSERT INTO auth_sessions(auth_session_id,php_session_id,user_id,session_token_hash,expires_at,ip_address,user_agent) VALUES(?,?,?,?,DATE_ADD(NOW(),INTERVAL 10 MINUTE),'127.0.0.1','Invoice regression')")->execute([$authId,$sessionId,$user['user_id'],hash('sha256',$token)]);
    $itemIds=[];
    for($n=0;$n<2;$n++) {
        $poIds[]=newUuid($pdo); $itemIds[]=newUuid($pdo);
        $pdo->prepare("INSERT INTO purchase_orders(po_id,po_number,supplier_id,status) VALUES(?,?,?,'Pending')")->execute([$poIds[$n],'TEST-INVOICE-'.bin2hex(random_bytes(6)),$product['supplier_id']]);
        $pdo->prepare("INSERT INTO purchase_order_items(po_item_id,po_id,product_id,quantity,purchase_qty,purchase_unit_snapshot,units_per_purchase_unit_snapshot,inventory_qty_ordered) VALUES(?,?,?,100,10,'Box',10,100)")->execute([$itemIds[$n],$poIds[$n],$product['product_id']]);
    }
    $body=['po_id'=>$poIds[0],'invoice_number'=>'REGRESSION-1','invoice_date'=>'2026-09-01','supplier_invoice_total'=>4000,'items'=>[['po_item_id'=>$itemIds[0],'invoice_qty'=>8,'unit_cost'=>500]]];
    [$code,$saved]=invoiceHttp('purchase_orders/save_purchase_order_invoice.php',$body);
    invoiceAssert($code===200 && $saved['status']==='success','Save failed: '.json_encode($saved));
    invoiceAssert((float)$saved['invoice']['items'][0]['invoice_qty']===8.0 && (float)$saved['invoice']['supplier_invoice_total']===4000.0,'Invoice must use the recorded supplier invoice quantity.');
    [$code,$order]=invoiceHttp('purchase_orders/get_purchase_order.php?po_id='.$poIds[0]);
    invoiceAssert($code===200 && (float)$order['purchase_order']['total_amount']===4000.0,'PO total must use invoice: '.json_encode($order));
    $suggestion=supplierInvoicePricingSuggestions($pdo,$product['product_id']);
    invoiceAssert(abs($suggestion['suggestions'][0]['cost_per_selling_unit']-50)<0.00001,'Box conversion must yield 50 per selling unit.');
    invoiceAssert($suggestion['requires_approval']===true,'Approval required.');
    [$code,$details]=invoiceHttp('products/get_product_details.php?product_id='.$product['product_id']);
    invoiceAssert($code===200 && isset($details['data']['supplier_invoice_pricing']['suggestions'][0]),'Product details must expose invoice pricing: '.json_encode($details));
    foreach ([0,-1,'Infinity',null] as $invalid) {
        $bad=$body; $bad['items'][0]['unit_cost']=$invalid;
        [$code]=invoiceHttp('purchase_orders/save_purchase_order_invoice.php',$bad); invoiceAssert($code===422,'Invalid cost must fail.');
    }
    $bad=$body; $bad['items'][0]['po_item_id']=$itemIds[1];
    [$code]=invoiceHttp('purchase_orders/save_purchase_order_invoice.php',$bad); invoiceAssert($code===422,'Foreign PO line must fail.');
    $bad=$body; $bad['invoice_date']='2026-02-30';
    [$code]=invoiceHttp('purchase_orders/save_purchase_order_invoice.php',$bad); invoiceAssert($code===422,'Invalid date must fail.');
    $body['items'][0]['invoice_qty']=7.5; $body['supplier_invoice_total']=3750;
    [$code,$edited]=invoiceHttp('purchase_orders/save_purchase_order_invoice.php',$body);
    invoiceAssert($code===200 && $edited['invoice']['invoice_id']===$saved['invoice']['invoice_id'],'Edit must reuse invoice.');
    invoiceAssert((float)$edited['payment']['total_paid']===0.0 && (float)$edited['payment']['remaining_balance']===3750.0,'Invoice edit must recalculate the unpaid balance.');
    [$code]=invoiceHttp('purchase_orders/save_purchase_order_invoice.php',$body); invoiceAssert($code===200,'Restore edited invoice.');
    [$code,$payment]=invoiceHttp('purchase_orders/record_purchase_order_payment.php',['po_id'=>$poIds[0],'amount'=>1000,'payment_method'=>'cash','payment_date'=>'2026-09-01','payment_request_key'=>newUuid($pdo)]);
    invoiceAssert($code===200 && $payment['payment_timing']==='Prepaid' && $payment['payment_type']==='Advance Payment','Payment before delivery must be stored as an advance payment.');
    [$code,$paymentDetails]=invoiceHttp('purchase_orders/get_purchase_order_payment_details.php?po_id='.$poIds[0]);
    invoiceAssert($code===200 && ($paymentDetails['payment_details']['payment_type']??'')==='Advance Payment' && ($paymentDetails['payment_details']['receiving']['delivery_status']??'')==='Not Yet Received','Payment details must expose the automatic pre-delivery context.');
    $body['po_id']=$poIds[1]; $body['invoice_number']='REGRESSION-2'; $body['invoice_date']='2026-09-02'; $body['items'][0]=['po_item_id'=>$itemIds[1],'invoice_qty'=>1,'unit_cost'=>550]; $body['supplier_invoice_total']=550;
    [$code]=invoiceHttp('purchase_orders/save_purchase_order_invoice.php',$body); invoiceAssert($code===200,'Second PO invoice failed.');
    $suggestion=supplierInvoicePricingSuggestions($pdo,$product['product_id']);
    invoiceAssert($suggestion['latest_invoice']['invoice_number']==='REGRESSION-2' && (float)$suggestion['suggestions'][0]['cost_per_selling_unit']===55.0,'Latest invoice cost must win.');
    [$code,$old]=invoiceHttp('purchase_orders/get_purchase_order_invoice.php?po_id='.$poIds[0]);
    invoiceAssert((float)$old['invoice']['items'][0]['unit_cost']===500.0,'Older invoice cost must remain historical.');
    [$code,$finalPayment]=invoiceHttp('purchase_orders/record_purchase_order_payment.php',['po_id'=>$poIds[0],'amount'=>2750,'payment_method'=>'cash','payment_date'=>'2026-09-02','payment_request_key'=>newUuid($pdo)]);
    invoiceAssert($code===200 && ($finalPayment['payment_status']??'')==='Paid','Invoice fixture must be fully paid before testing the edit lock.');
    $paidEdit=$body; $paidEdit['po_id']=$poIds[0]; $paidEdit['invoice_number']='REGRESSION-PAID-EDIT'; $paidEdit['invoice_date']='2026-09-03'; $paidEdit['items'][0]=['po_item_id'=>$itemIds[0],'invoice_qty'=>1,'unit_cost'=>500]; $paidEdit['supplier_invoice_total']=500;
    [$code]=invoiceHttp('purchase_orders/save_purchase_order_invoice.php',$paidEdit); invoiceAssert($code===409,'A fully paid supplier invoice must be read-only.');
    $price=$pdo->prepare('SELECT price FROM product WHERE product_id=?'); $price->execute([$product['product_id']]);
    invoiceAssert((float)$price->fetchColumn()===(float)$product['price'],'Invoice must not change selling price.');
    [$code]=invoiceHttp('purchase_orders/get_purchase_order_invoice.php?po_id='.newUuid($pdo)); invoiceAssert($code===404,'Unknown PO must return 404.');
    echo "Supplier invoice workflow passed: save, edit, quantities, totals, validation, conversion, history, unchanged selling price.\n";
} finally {
    foreach ($poIds as $id) {
        $pdo->prepare('DELETE FROM activity_logs WHERE reference_id=?')->execute([$id]);
        $pdo->prepare('DELETE FROM purchase_order_payments WHERE po_id=?')->execute([$id]);
        $pdo->prepare('DELETE FROM purchase_order_invoices WHERE po_id=?')->execute([$id]);
        $pdo->prepare('DELETE FROM purchase_order_items WHERE po_id=?')->execute([$id]);
        $pdo->prepare('DELETE FROM purchase_orders WHERE po_id=?')->execute([$id]);
    }
    $pdo->prepare('DELETE FROM auth_sessions WHERE auth_session_id=?')->execute([$authId]);
    if (isset($fixtureProduct)) $pdo->prepare('DELETE FROM product WHERE product_id=?')->execute([$fixtureProduct]);
    if (isset($fixtureSupplier)) $pdo->prepare('DELETE FROM suppliers WHERE supplier_id=?')->execute([$fixtureSupplier]);
}
