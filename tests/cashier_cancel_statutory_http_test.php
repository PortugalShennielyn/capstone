<?php
declare(strict_types=1);
require_once __DIR__ . '/../pharma-api/config/db_connection.php';

function cashierFeatureAssert(bool $ok, string $message): void {
    if (!$ok) throw new RuntimeException($message);
}
function cashierFeatureSession(PDO $pdo, array $user): array {
    if (session_status() === PHP_SESSION_ACTIVE) session_write_close();
    $id = 'codexfeature' . bin2hex(random_bytes(8));
    $token = bin2hex(random_bytes(32));
    $authId = newUuid($pdo);
    session_id($id);
    session_start();
    $_SESSION = [
        'user_id'=>$user['user_id'], 'username'=>$user['username'], 'full_name'=>$user['full_name'],
        'role'=>$user['role'], 'roles'=>[$user['role']], 'role_identifiers'=>['ro-'.$user['role']],
        'user_status'=>$user['status'], 'auth_session_id'=>$authId, 'tab_token_hash'=>hash('sha256', $token),
    ];
    session_write_close();
    $pdo->prepare("INSERT INTO auth_sessions (auth_session_id,php_session_id,user_id,session_token_hash,expires_at,ip_address,user_agent)
        VALUES (:id,:session,:user,:token,DATE_ADD(NOW(),INTERVAL 15 MINUTE),'127.0.0.1','Codex cashier feature test')")
        ->execute([':id'=>$authId,':session'=>$id,':user'=>$user['user_id'],':token'=>hash('sha256', $token)]);
    return ['auth_id'=>$authId,'session'=>$id,'token'=>$token];
}
function cashierFeatureRequest(string $path, array $session, ?array $payload = null): array {
    $curl = curl_init('http://127.0.0.1/PharmacySystem_for_DocR/pharma-api/v1/' . $path);
    curl_setopt_array($curl, [
        CURLOPT_RETURNTRANSFER=>true, CURLOPT_COOKIE=>'PHPSESSID='.$session['session'],
        CURLOPT_HTTPHEADER=>['Accept: application/json','Content-Type: application/json','X-Tab-Token: '.$session['token']],
        CURLOPT_TIMEOUT=>30,
    ]);
    if ($payload !== null) {
        curl_setopt($curl, CURLOPT_POST, true);
        curl_setopt($curl, CURLOPT_POSTFIELDS, json_encode($payload));
    }
    $body = curl_exec($curl);
    $status = (int) curl_getinfo($curl, CURLINFO_RESPONSE_CODE);
    $error = curl_error($curl);
    curl_close($curl);
    cashierFeatureAssert($body !== false, 'HTTP failed: '.$error);
    return ['status'=>$status,'body'=>json_decode((string)$body, true) ?: []];
}

$clerk = $pdo->query("SELECT user_id,username,full_name,role,status FROM users WHERE role='salesclerk' AND status='Active' LIMIT 1")->fetch(PDO::FETCH_ASSOC);
$cashier = $pdo->query("SELECT user_id,username,full_name,role,status FROM users WHERE role='cashier' AND status='Active' LIMIT 1")->fetch(PDO::FETCH_ASSOC);
cashierFeatureAssert((bool)$clerk && (bool)$cashier, 'Active clerk and cashier required.');
$product = $pdo->query("SELECT p.product_id,d.unit_name,d.selling_price FROM product p
    JOIN product_categories pc ON pc.category_id=p.category_id AND LOWER(TRIM(pc.category_name))='medicine'
    JOIN product_selling_options d ON d.product_id=p.product_id AND d.is_default=1 AND d.is_active=1 AND d.pos_enabled=1
    JOIN product_selling_stock s ON s.product_id=p.product_id AND s.quantity_remaining-s.expiry_quarantined_qty>1
    WHERE p.status='Active' AND (s.expiration_date IS NULL OR s.expiration_date>CURDATE()) AND d.selling_price>0
    GROUP BY p.product_id,d.unit_name,d.selling_price LIMIT 1")->fetch(PDO::FETCH_ASSOC);
cashierFeatureAssert((bool)$product, 'An active medicine with shelf stock required.');
$stockStmt = $pdo->prepare('SELECT selling_stock_id,quantity_remaining FROM product_selling_stock WHERE product_id=:id ORDER BY selling_stock_id');
$stockStmt->execute([':id'=>$product['product_id']]);
$stockBefore = $stockStmt->fetchAll(PDO::FETCH_KEY_PAIR);
$clerkSession = cashierFeatureSession($pdo,$clerk);
$cashierSession = cashierFeatureSession($pdo,$cashier);
$orders = [];
try {
    $makeOrder = static function(float $clerkDiscount=0) use (&$orders,$product,$clerkSession,$cashierSession): int {
        $response = cashierFeatureRequest('sales/sales_order_send_to_cashier.php',$clerkSession,[
            'customer_name'=>'Codex Cashier Feature Test',
            'items'=>[['product_id'=>$product['product_id'],'quantity'=>1,'unit'=>$product['unit_name']]],
            'discount'=>$clerkDiscount,
        ]);
        cashierFeatureAssert($response['status']===200,'Order creation failed: '.json_encode($response));
        $id=(int)($response['body']['data']['order_id']??0);
        cashierFeatureAssert($id>0,'Order ID missing.');
        $orders[]=$id;
        $accepted=cashierFeatureRequest('cashier/accept_order.php',$cashierSession,['order_id'=>$id]);
        cashierFeatureAssert($accepted['status']===200,'Acceptance failed: '.json_encode($accepted));
        return $id;
    };
    $cancelId=$makeOrder();
    $cancel=cashierFeatureRequest('cashier/cancel_order.php',$cashierSession,['order_id'=>$cancelId,'reason'=>'Customer cancelled at cashier.']);
    cashierFeatureAssert($cancel['status']===200,'Cashier cancellation failed: '.json_encode($cancel));
    $row=$pdo->query("SELECT o.status,q.queue_status FROM sales_orders o JOIN cashier_queue q ON q.order_id=o.order_id WHERE o.order_id={$cancelId}")->fetch(PDO::FETCH_ASSOC);
    cashierFeatureAssert($row['status']==='cancelled' && $row['queue_status']==='cancelled','Cancelled order still active.');
    $queue=cashierFeatureRequest('cashier/get_cashier_orders.php?tab=processing',$cashierSession);
    cashierFeatureAssert($queue['status']===200,'Queue failed.');
    cashierFeatureAssert(!in_array($cancelId,array_map(static fn($o)=>(int)$o['order_id'],$queue['body']['data']['orders']??[]),true),'Cancelled order remains in queue.');

    $paidId=$makeOrder();
    $detail=cashierFeatureRequest('cashier/get_cashier_order.php?order_id='.$paidId,$cashierSession);
    cashierFeatureAssert($detail['status']===200 && ($detail['body']['data']['items'][0]['discount_eligible']??false),'Medicine eligibility missing.');
    $gross=(float)$detail['body']['data']['subtotal'];
    $base=round($gross/1.12,2);
    $expected=round($base-round($base*0.20,2),2);
    $missingId=cashierFeatureRequest('cashier/complete_payment.php',$cashierSession,[
        'order_id'=>$paidId,'amount_paid'=>ceil($gross),'cashier_discount_type'=>'senior',
    ]);
    cashierFeatureAssert($missingId['status']===400,'Beneficiary ID validation missing.');
    $paid=cashierFeatureRequest('cashier/complete_payment.php',$cashierSession,[
        'order_id'=>$paidId,'amount_paid'=>ceil($gross),'cashier_discount_type'=>'senior',
        'beneficiary_name'=>'Test Beneficiary','beneficiary_id'=>'TEST-ID-123',
    ]);
    cashierFeatureAssert($paid['status']===200,'Statutory payment failed: '.json_encode($paid));
    $saved=$pdo->query("SELECT p.final_amount,p.cashier_discount_amount,p.vat_exempt_sales,p.vat_exemption_amount,p.beneficiary_name,p.beneficiary_id,o.vat
        FROM sales_payments p JOIN sales_orders o ON o.order_id=p.order_id WHERE p.order_id={$paidId}")->fetch(PDO::FETCH_ASSOC);
    cashierFeatureAssert(abs((float)$saved['final_amount']-$expected)<0.005,'Incorrect statutory total.');
    cashierFeatureAssert((float)$saved['vat']===0.0 && (float)$saved['vat_exempt_sales']===$base,'Eligible medicine should be VAT exempt.');
    cashierFeatureAssert($saved['beneficiary_id']==='TEST-ID-123','Beneficiary ID not saved.');
    $cancelPaid=cashierFeatureRequest('cashier/cancel_order.php',$cashierSession,['order_id'=>$paidId,'reason'=>'Too late']);
    cashierFeatureAssert($cancelPaid['status']===400,'Paid order was cancellable.');

    $pwdId=$makeOrder(0.50);
    $pwd=cashierFeatureRequest('cashier/complete_payment.php',$cashierSession,[
        'order_id'=>$pwdId,'amount_paid'=>ceil($gross),'cashier_discount_type'=>'pwd',
        'beneficiary_name'=>'Test PWD','beneficiary_id'=>'PWD-TEST-123',
    ]);
    cashierFeatureAssert($pwd['status']===200,'PWD payment failed: '.json_encode($pwd));
    $pwdSaved=$pdo->query("SELECT p.cashier_discount_type,p.sales_clerk_discount,o.discount,p.final_amount FROM sales_payments p JOIN sales_orders o ON o.order_id=p.order_id WHERE p.order_id={$pwdId}")->fetch(PDO::FETCH_ASSOC);
    cashierFeatureAssert($pwdSaved['cashier_discount_type']==='pwd' && (float)$pwdSaved['sales_clerk_discount']===0.0 && (float)$pwdSaved['discount']===0.0,'PWD discount did not replace the clerk discount.');
    cashierFeatureAssert(abs((float)$pwdSaved['final_amount']-$expected)<0.005,'Incorrect PWD total.');
    echo "Cashier cancellation and Senior Citizen/PWD medicine payments passed.\n";
} finally {
    foreach ($orders as $id) {
        foreach (['sales_receipts','sales_payments','cashier_queue','sales_order_status_history','sales_order_items','sales_orders'] as $table) {
            $pdo->prepare("DELETE FROM {$table} WHERE order_id=:id")->execute([':id'=>$id]);
        }
    }
    foreach ($stockBefore as $stockId=>$quantity) {
        $pdo->prepare('UPDATE product_selling_stock SET quantity_remaining=:qty WHERE selling_stock_id=:id')->execute([':qty'=>$quantity,':id'=>$stockId]);
    }
    $pdo->prepare('DELETE FROM auth_sessions WHERE auth_session_id IN (?,?)')->execute([$clerkSession['auth_id'],$cashierSession['auth_id']]);
}
