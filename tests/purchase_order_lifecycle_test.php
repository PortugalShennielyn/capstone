<?php
declare(strict_types=1);

require_once __DIR__ . '/../pharma-api/config/db_connection.php';
require_once __DIR__ . '/../pharma-api/v1/purchase_orders/purchase_order_helpers.php';
require_once __DIR__ . '/../pharma-api/v1/purchase_orders/purchase_order_invoice_helpers.php';

function lifecycleAssert(bool $condition, string $message): void
{
    if (!$condition) throw new RuntimeException($message);
}

function lifecycleRequest(string $method, string $path, string $sessionId, string $tabToken, ?array $payload = null): array
{
    $curl = curl_init('http://127.0.0.1/PharmacySystem_for_DocR/pharma-api/v1/' . $path);
    $options = [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_CUSTOMREQUEST => $method,
        CURLOPT_COOKIE => 'PHPSESSID=' . $sessionId,
        CURLOPT_HTTPHEADER => ['Content-Type: application/json', 'X-Tab-Token: ' . $tabToken],
        CURLOPT_TIMEOUT => 20,
    ];
    if ($payload !== null) $options[CURLOPT_POSTFIELDS] = json_encode($payload);
    curl_setopt_array($curl, $options);
    $body = curl_exec($curl);
    $status = (int) curl_getinfo($curl, CURLINFO_RESPONSE_CODE);
    $error = curl_error($curl);
    curl_close($curl);
    lifecycleAssert($body !== false, 'HTTP request failed: ' . $error);
    return ['status' => $status, 'body' => json_decode((string) $body, true) ?: []];
}

ensurePurchaseOrderSchema($pdo);
$poId = newUuid($pdo);
$poItemId = newUuid($pdo);
$secondPoItemId = newUuid($pdo);
$authSessionId = newUuid($pdo);
$phpSessionId = 'codexpolifecycle' . bin2hex(random_bytes(8));
$tabToken = bin2hex(random_bytes(32));

try {
    $fixtures = $pdo->query("SELECT sp.supplier_id,sp.product_id,COALESCE(NULLIF(sp.purchase_unit,''),'Box') purchase_unit,COALESCE(sp.units_per_purchase_unit,1) units_per_purchase_unit FROM supplier_products sp INNER JOIN suppliers s ON s.supplier_id=sp.supplier_id WHERE s.archived_at IS NULL AND sp.supplier_id=(SELECT sp2.supplier_id FROM supplier_products sp2 WHERE NOT EXISTS (SELECT 1 FROM purchase_order_items source_item INNER JOIN supplier_claims sc ON sc.po_item_id=source_item.po_item_id INNER JOIN supplier_credits cr ON cr.claim_id=sc.claim_id WHERE source_item.po_id IN (SELECT po_id FROM purchase_orders WHERE supplier_id=sp2.supplier_id) AND sc.resolution_type='Next PO Credit' AND cr.credit_status IN ('Available','Partially Applied')) GROUP BY sp2.supplier_id HAVING COUNT(*)>=2 LIMIT 1) LIMIT 2")->fetchAll(PDO::FETCH_ASSOC);
    $supplierId = $fixtures[0]['supplier_id'] ?? null;
    $user = $pdo->query("SELECT user_id,username,full_name,role,status FROM users WHERE role IN ('admin','manager','super_admin') AND status='Active' LIMIT 1")->fetch(PDO::FETCH_ASSOC);
    lifecycleAssert(is_string($supplierId) && $supplierId !== '', 'An active supplier fixture is required.');
    lifecycleAssert((bool) $user, 'An active management user fixture is required.');

    $pdo->prepare("INSERT INTO purchase_orders (po_id,po_number,supplier_id,status,approval_status,total_amount,payment_terms) VALUES (:id,:number,:supplier,'Draft','Approved',NULL,'Cash')")
        ->execute([':id' => $poId, ':number' => 'TEST-LIFECYCLE-' . substr(str_replace('-', '', $poId), 0, 10), ':supplier' => $supplierId]);
    lifecycleAssert(count($fixtures) === 2, 'Two supplier-product fixtures are required.');
    $insertItem=$pdo->prepare('INSERT INTO purchase_order_items(po_item_id,po_id,product_id,quantity,purchase_qty,purchase_unit_snapshot,units_per_purchase_unit_snapshot,inventory_qty_ordered,unit_price_snapshot,line_total) VALUES(:item,:po,:product,:quantity,:purchase_qty,:unit,:contains,:inventory_quantity,NULL,NULL)');
    foreach ([[$poItemId,$fixtures[0],5],[$secondPoItemId,$fixtures[1],3]] as [$itemId,$fixture,$purchaseQty]) {
        $inventoryQuantity=$purchaseQty*(int)$fixture['units_per_purchase_unit'];
        $insertItem->execute([':item'=>$itemId,':po'=>$poId,':product'=>$fixture['product_id'],':quantity'=>$inventoryQuantity,':purchase_qty'=>$purchaseQty,':inventory_quantity'=>$inventoryQuantity,':unit'=>$fixture['purchase_unit'],':contains'=>(int)$fixture['units_per_purchase_unit']]);
    }

    if (session_status() === PHP_SESSION_ACTIVE) session_write_close();
    session_id($phpSessionId);
    session_start();
    $_SESSION = [
        'user_id' => $user['user_id'], 'username' => $user['username'], 'full_name' => $user['full_name'],
        'role' => $user['role'], 'roles' => [$user['role']], 'role_identifiers' => ['ro-admin'],
        'user_status' => $user['status'], 'auth_session_id' => $authSessionId,
        'tab_token_hash' => hash('sha256', $tabToken),
    ];
    session_write_close();
    $pdo->prepare("INSERT INTO auth_sessions (auth_session_id,php_session_id,user_id,session_token_hash,expires_at,ip_address,user_agent) VALUES (:id,:php,:user,:token,DATE_ADD(NOW(),INTERVAL 10 MINUTE),'127.0.0.1','Codex PO lifecycle test')")
        ->execute([':id' => $authSessionId, ':php' => $phpSessionId, ':user' => $user['user_id'], ':token' => hash('sha256', $tabToken)]);

    $legacyPaidId = (string) $pdo->query("SELECT po.po_id FROM purchase_orders po LEFT JOIN purchase_order_invoices invoice ON invoice.po_id=po.po_id LEFT JOIN purchase_order_payments payment ON payment.po_id=po.po_id WHERE invoice.invoice_id IS NULL AND po.status IN ('Pending','Delivered') AND po.approval_status<>'Rejected' AND COALESCE(NULLIF(po.final_payment,0),po.total_amount,0)>0 GROUP BY po.po_id,po.final_payment,po.total_amount HAVING ROUND(COALESCE(SUM(payment.amount),0),2)>=ROUND(COALESCE(NULLIF(po.final_payment,0),po.total_amount,0),2) LIMIT 1")->fetchColumn();
    if ($legacyPaidId !== '') {
        $currentPaidFilter = lifecycleRequest('GET', 'purchase_orders/get_purchase_orders.php?payment_status=Paid', $phpSessionId, $tabToken);
        lifecycleAssert(in_array($legacyPaidId, array_column($currentPaidFilter['body']['purchase_orders'] ?? [], 'po_id'), true), 'A historical fully paid PO with a valid PO total must appear under Paid.');
        $currentAllPayments = lifecycleRequest('GET', 'purchase_orders/get_purchase_orders.php', $phpSessionId, $tabToken);
        lifecycleAssert(in_array($legacyPaidId, array_column($currentAllPayments['body']['purchase_orders'] ?? [], 'po_id'), true), 'Clearing the payment filter must restore the paid PO under All Payments.');
    }
    $invoicedUnpaidId = (string) $pdo->query("SELECT po.po_id FROM purchase_orders po INNER JOIN purchase_order_invoices invoice ON invoice.po_id=po.po_id LEFT JOIN purchase_order_payments payment ON payment.po_id=po.po_id WHERE po.status IN ('Pending','Delivered') AND po.approval_status<>'Rejected' AND invoice.supplier_invoice_total>0 GROUP BY po.po_id,invoice.supplier_invoice_total HAVING ROUND(COALESCE(SUM(payment.amount),0),2)<ROUND(invoice.supplier_invoice_total,2) LIMIT 1")->fetchColumn();
    if ($invoicedUnpaidId !== '') {
        $currentUnpaidFilter = lifecycleRequest('GET', 'purchase_orders/get_purchase_orders.php?payment_status=Unpaid', $phpSessionId, $tabToken);
        lifecycleAssert(in_array($invoicedUnpaidId, array_column($currentUnpaidFilter['body']['purchase_orders'] ?? [], 'po_id'), true), 'An invoiced PO with money still owed must appear under Unpaid.');
    }

    $pending = lifecycleRequest('POST', 'purchase_orders/update_purchase_order_status.php', $phpSessionId, $tabToken, ['po_id' => $poId, 'status' => 'Pending']);
    lifecycleAssert($pending['status'] === 200, 'Draft must transition directly to Pending.');
    $awaitingInvoicePayment = lifecycleRequest('GET', 'purchase_orders/get_purchase_order_payment_details.php?po_id=' . rawurlencode($poId), $phpSessionId, $tabToken);
    lifecycleAssert($awaitingInvoicePayment['status'] === 422 && str_contains((string) ($awaitingInvoicePayment['body']['message'] ?? ''), 'Record Supplier Invoice first'), 'A Pending PO without a supplier invoice must not expose a payable balance.');
    $awaitingInvoiceUnpaidFilter = lifecycleRequest('GET', 'purchase_orders/get_purchase_orders.php?status=Pending&payment_status=Unpaid', $phpSessionId, $tabToken);
    lifecycleAssert(!in_array($poId, array_column($awaitingInvoiceUnpaidFilter['body']['purchase_orders'] ?? [], 'po_id'), true), 'Awaiting Invoice must not appear under the Unpaid payment filter.');

    $emptyInvoice = lifecycleRequest('POST', 'purchase_orders/save_purchase_order_invoice.php', $phpSessionId, $tabToken, [
        'po_id'=>$poId,'invoice_number'=>'INV-EMPTY','invoice_date'=>date('Y-m-d'),'discount'=>0,'other_charges'=>0,'supplier_invoice_total'=>0,
        'items'=>[['po_item_id'=>$poItemId,'unit_cost'=>0],['po_item_id'=>$secondPoItemId,'unit_cost'=>0]]
    ]);
    lifecycleAssert($emptyInvoice['status'] === 422, 'An empty zero-value supplier invoice must be rejected by the API.');

    $mismatchedInvoice = lifecycleRequest('POST', 'purchase_orders/save_purchase_order_invoice.php', $phpSessionId, $tabToken, [
        'po_id'=>$poId,'invoice_number'=>'INV-MISMATCH','invoice_date'=>date('Y-m-d'),'discount'=>100,'other_charges'=>50,'supplier_invoice_total'=>9999,
        'items'=>[['po_item_id'=>$poItemId,'unit_cost'=>850],['po_item_id'=>$secondPoItemId,'unit_cost'=>780]]
    ]);
    lifecycleAssert($mismatchedInvoice['status'] === 422, 'The API must reject a browser-supplied invoice total that does not match its line calculation.');

    $invoice = lifecycleRequest('POST', 'purchase_orders/save_purchase_order_invoice.php', $phpSessionId, $tabToken, [
        'po_id'=>$poId,'invoice_number'=>'INV-TEST-6540','invoice_date'=>date('Y-m-d'),'discount'=>100,'other_charges'=>50,'supplier_invoice_total'=>6540,
        'items'=>[['po_item_id'=>$poItemId,'invoice_qty'=>5,'unit_cost'=>850],['po_item_id'=>$secondPoItemId,'invoice_qty'=>3,'unit_cost'=>780]]
    ]);
    lifecycleAssert($invoice['status'] === 200 && ($invoice['body']['invoice']['match_status'] ?? '') === 'Matched', 'Pending PO must accept a matched line-level supplier invoice: '.json_encode($invoice));
    lifecycleAssert((float)$invoice['body']['invoice']['subtotal']===6590.0 && (float)$invoice['body']['invoice']['calculated_total']===6540.0 && (float)$invoice['body']['invoice']['difference']===0.0, 'Invoice totals must be derived as 5x850 + 3x780 - 100 + 50 = 6540.');
    $details=lifecycleRequest('GET','purchase_orders/get_purchase_order.php?po_id='.rawurlencode($poId),$phpSessionId,$tabToken);
    lifecycleAssert($details['status']===200 && (float)($details['body']['purchase_order']['total_amount']??0)===6540.0 && ($details['body']['purchase_order']['total_source']??'')==='supplier_invoice','PO details must source the new total from the supplier invoice.');
    $pricedLines=$pdo->prepare('SELECT unit_price_snapshot,line_total FROM purchase_order_items WHERE po_id=:id'); $pricedLines->execute([':id'=>$poId]);
    foreach($pricedLines->fetchAll(PDO::FETCH_ASSOC) as $priced) lifecycleAssert($priced['line_total']===null && $priced['unit_price_snapshot']===null, 'Invoice capture must not copy transactional supplier prices into PO lines.');
    $storedCosts=$pdo->prepare('SELECT unit_cost FROM purchase_order_invoice_items WHERE invoice_id=:id ORDER BY unit_cost DESC'); $storedCosts->execute([':id'=>$invoice['body']['invoice']['invoice_id']]);
    lifecycleAssert(array_map('floatval',$storedCosts->fetchAll(PDO::FETCH_COLUMN))===[850.0,780.0], 'Invoice items must store only the supplier unit costs for referenced PO lines.');

    $paymentDetails = lifecycleRequest('GET', 'purchase_orders/get_purchase_order_payment_details.php?po_id=' . rawurlencode($poId), $phpSessionId, $tabToken);
    lifecycleAssert($paymentDetails['status'] === 200 && ($paymentDetails['body']['payment_details']['invoice_number'] ?? '') === 'INV-TEST-6540' && (float) ($paymentDetails['body']['payment_details']['payment']['remaining_balance'] ?? 0) === 6540.0, 'Pending invoiced PO payment details must load without a receiving record.');

    $payment = lifecycleRequest('POST', 'purchase_orders/record_purchase_order_payment.php', $phpSessionId, $tabToken, ['po_id'=>$poId,'amount'=>500,'payment_method'=>'cash','payment_date'=>date('Y-m-d'),'payment_request_key'=>'test-'.bin2hex(random_bytes(12)),'expected_remaining_balance'=>6540]);
    lifecycleAssert($payment['status']===200 && ($payment['body']['payment_status']??'')==='Unpaid' && ($payment['body']['payment_timing']??'')==='Prepaid' && ($payment['body']['payment_type']??'')==='Advance Payment', 'Pending PO must support partial advance payment without changing delivery status.');
    $partiallyPaidUnpaidFilter = lifecycleRequest('GET', 'purchase_orders/get_purchase_orders.php?status=Pending&payment_status=Unpaid', $phpSessionId, $tabToken);
    lifecycleAssert(in_array($poId, array_column($partiallyPaidUnpaidFilter['body']['purchase_orders'] ?? [], 'po_id'), true), 'Pending + Unpaid must include a partially paid invoiced PO.');
    $finalPayment = lifecycleRequest('POST', 'purchase_orders/record_purchase_order_payment.php', $phpSessionId, $tabToken, ['po_id'=>$poId,'amount'=>6040,'payment_method'=>'cash','payment_date'=>date('Y-m-d'),'payment_request_key'=>'test-'.bin2hex(random_bytes(12)),'expected_remaining_balance'=>6040]);
    lifecycleAssert($finalPayment['status']===200 && ($finalPayment['body']['payment_status']??'')==='Paid' && ($finalPayment['body']['payment_timing']??'')==='Prepaid' && ($finalPayment['body']['payment_type']??'')==='Advance Payment', 'A Pending invoiced PO must be payable in full before delivery.');
    $duplicateFullPayment = lifecycleRequest('POST', 'purchase_orders/record_purchase_order_payment.php', $phpSessionId, $tabToken, ['po_id'=>$poId,'amount'=>1,'payment_method'=>'cash','payment_date'=>date('Y-m-d'),'payment_request_key'=>'test-'.bin2hex(random_bytes(12)),'expected_remaining_balance'=>0]);
    lifecycleAssert($duplicateFullPayment['status']===409, 'A second payment must be rejected after the PO is fully paid.');
    $paidPending = $pdo->prepare('SELECT status,payment_status FROM purchase_orders WHERE po_id=:id'); $paidPending->execute([':id'=>$poId]); $paidPendingRow=$paidPending->fetch(PDO::FETCH_ASSOC);
    lifecycleAssert($paidPendingRow['status']==='Pending' && $paidPendingRow['payment_status']==='Paid', 'Payment status must not change the Pending delivery lifecycle status.');
    $pendingPaidFilter = lifecycleRequest('GET', 'purchase_orders/get_purchase_orders.php?status=Pending&payment_status=Paid', $phpSessionId, $tabToken);
    lifecycleAssert(in_array($poId, array_column($pendingPaidFilter['body']['purchase_orders'] ?? [], 'po_id'), true), 'Pending + Paid must include a prepaid Pending PO.');
    $pendingUnpaidFilter = lifecycleRequest('GET', 'purchase_orders/get_purchase_orders.php?status=Pending&payment_status=Unpaid', $phpSessionId, $tabToken);
    lifecycleAssert(!in_array($poId, array_column($pendingUnpaidFilter['body']['purchase_orders'] ?? [], 'po_id'), true), 'Pending + Unpaid must exclude a fully prepaid PO.');
    lifecycleAssert((int)$pdo->query("SELECT COUNT(*) FROM inventory_batches WHERE po_item_id IN (".$pdo->quote($poItemId).','.$pdo->quote($secondPoItemId).')')->fetchColumn()===0, 'Invoice capture and prepayment must not create inventory.');

    $arrived = lifecycleRequest('POST', 'purchase_orders/update_purchase_order_status.php', $phpSessionId, $tabToken, ['po_id' => $poId, 'status' => 'Arrived']);
    lifecycleAssert($arrived['status'] === 200, 'Pending must transition directly to Arrived without coupling physical arrival to invoice capture.');
    $stored = $pdo->prepare('SELECT status,total_amount FROM purchase_orders WHERE po_id=:id');
    $stored->execute([':id' => $poId]);
    $row = $stored->fetch(PDO::FETCH_ASSOC);
    lifecycleAssert($row['status'] === 'Arrived' && $row['total_amount'] === null, 'Arrival must not duplicate the supplier invoice total on the PO header.');

    $visible = lifecycleRequest('GET', 'purchase_orders/get_purchase_orders.php', $phpSessionId, $tabToken);
    lifecycleAssert(!in_array($poId, array_column($visible['body']['purchase_orders'] ?? [], 'po_id'), true), 'Arrived PO must be excluded from the normal PO list.');
    $inspection = lifecycleRequest('GET', 'purchase_orders/get_purchase_orders.php?status=Arrived', $phpSessionId, $tabToken);
    lifecycleAssert(in_array($poId, array_column($inspection['body']['purchase_orders'] ?? [], 'po_id'), true), 'Arrived PO must be available to Inspect Deliveries.');

    $pdo->prepare("UPDATE purchase_orders SET status='Delivered' WHERE po_id=:id")->execute([':id' => $poId]);
    $delivered = lifecycleRequest('GET', 'purchase_orders/get_purchase_orders.php', $phpSessionId, $tabToken);
    $deliveredRows = array_values(array_filter($delivered['body']['purchase_orders'] ?? [], static fn(array $order): bool => $order['po_id'] === $poId));
    lifecycleAssert(count($deliveredRows) === 1 && (float)$deliveredRows[0]['total_amount'] === 6540.0 && ($deliveredRows[0]['total_source']??'')==='supplier_invoice', 'Delivered PO must return to the normal list with its recorded invoice total.');
    lifecycleAssert(($deliveredRows[0]['payment_status'] ?? '') === 'Paid' && (float) ($deliveredRows[0]['total_paid'] ?? 0) === 6540.0, 'Receiving and delivery must preserve the original paid amount and Paid status.');
    $deliveredUnpaidFilter = lifecycleRequest('GET', 'purchase_orders/get_purchase_orders.php?status=Delivered&payment_status=Unpaid', $phpSessionId, $tabToken);
    lifecycleAssert(!in_array($poId, array_column($deliveredUnpaidFilter['body']['purchase_orders'] ?? [], 'po_id'), true), 'Delivered + Unpaid must exclude a fully paid Delivered PO.');

    echo "Purchase Order Draft-to-Delivered lifecycle tests passed.\n";
} finally {
    $pdo->prepare('DELETE FROM auth_sessions WHERE auth_session_id=:id')->execute([':id' => $authSessionId]);
    $pdo->prepare('DELETE FROM purchase_order_payments WHERE po_id=:id')->execute([':id'=>$poId]);
    $pdo->prepare('DELETE FROM supplier_credit_applications WHERE po_id=:id')->execute([':id'=>$poId]);
    $invoiceId=$pdo->prepare('SELECT invoice_id FROM purchase_order_invoices WHERE po_id=:id');$invoiceId->execute([':id'=>$poId]);$savedInvoiceId=$invoiceId->fetchColumn();
    if($savedInvoiceId){$pdo->prepare('DELETE FROM purchase_order_invoice_items WHERE invoice_id=:id')->execute([':id'=>$savedInvoiceId]);$pdo->prepare('DELETE FROM purchase_order_invoices WHERE invoice_id=:id')->execute([':id'=>$savedInvoiceId]);}
    $pdo->prepare('DELETE FROM purchase_order_items WHERE po_id=:id')->execute([':id'=>$poId]);
    $pdo->prepare('DELETE FROM purchase_orders WHERE po_id=:id')->execute([':id' => $poId]);
}
