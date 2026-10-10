<?php
declare(strict_types=1);

require_once __DIR__ . '/../pharma-api/config/db_connection.php';

function cancelAssert(bool $condition, string $message): void
{
    if (!$condition) throw new RuntimeException($message);
}

function cancelSession(PDO $pdo, array $user): array
{
    if (session_status() === PHP_SESSION_ACTIVE) session_write_close();
    $phpSession = 'codexcancel' . bin2hex(random_bytes(8));
    $token = bin2hex(random_bytes(32));
    $authId = newUuid($pdo);
    session_id($phpSession);
    session_start();
    $_SESSION = [
        'user_id'=>$user['user_id'], 'username'=>$user['username'], 'full_name'=>$user['full_name'],
        'role'=>$user['role'], 'roles'=>[$user['role']], 'role_identifiers'=>['ro-'.$user['role']],
        'user_status'=>$user['status'], 'auth_session_id'=>$authId, 'tab_token_hash'=>hash('sha256', $token),
    ];
    session_write_close();
    $pdo->prepare("INSERT INTO auth_sessions (auth_session_id,php_session_id,user_id,session_token_hash,expires_at,ip_address,user_agent)
        VALUES (:id,:session,:user,:token,DATE_ADD(NOW(),INTERVAL 10 MINUTE),'127.0.0.1','Codex cancel test')")
        ->execute([':id'=>$authId,':session'=>$phpSession,':user'=>$user['user_id'],':token'=>hash('sha256', $token)]);
    return ['auth_id'=>$authId,'session'=>$phpSession,'token'=>$token];
}

function cancelRequest(string $path, array $session, ?array $payload = null): array
{
    $curl = curl_init('http://127.0.0.1/PharmacySystem_for_DocR/pharma-api/v1/' . $path);
    curl_setopt_array($curl, [
        CURLOPT_RETURNTRANSFER=>true,
        CURLOPT_COOKIE=>'PHPSESSID='.$session['session'],
        CURLOPT_HTTPHEADER=>['Accept: application/json','Content-Type: application/json','X-Tab-Token: '.$session['token']],
        CURLOPT_TIMEOUT=>20,
    ]);
    if ($payload !== null) {
        curl_setopt($curl, CURLOPT_POST, true);
        curl_setopt($curl, CURLOPT_POSTFIELDS, json_encode($payload));
    }
    $body = curl_exec($curl);
    $status = (int) curl_getinfo($curl, CURLINFO_RESPONSE_CODE);
    $error = curl_error($curl);
    curl_close($curl);
    cancelAssert($body !== false, 'HTTP request failed: '.$error);
    return ['status'=>$status,'body'=>json_decode((string)$body, true) ?: []];
}

$clerk = $pdo->query("SELECT user_id,username,full_name,role,status FROM users WHERE role='salesclerk' AND status='Active' LIMIT 1")->fetch(PDO::FETCH_ASSOC);
$cashier = $pdo->query("SELECT user_id,username,full_name,role,status FROM users WHERE role='cashier' AND status='Active' LIMIT 1")->fetch(PDO::FETCH_ASSOC);
cancelAssert((bool)$clerk && (bool)$cashier, 'Active clerk and cashier fixtures are required.');
$product = $pdo->query("SELECT p.product_id,d.unit_name FROM product p
    INNER JOIN product_selling_stock s ON s.product_id=p.product_id
    INNER JOIN product_selling_options d ON d.product_id=p.product_id AND d.is_default=1 AND d.is_active=1 AND d.pos_enabled=1
    WHERE p.status='Active' AND s.quantity_remaining>0 AND (s.expiration_date IS NULL OR s.expiration_date>CURDATE())
    GROUP BY p.product_id,d.unit_name ORDER BY p.product_id LIMIT 1")->fetch(PDO::FETCH_ASSOC);
cancelAssert((bool)$product, 'An active product with shelf stock is required.');
$clerkSession = cancelSession($pdo, $clerk);
$cashierSession = cancelSession($pdo, $cashier);
$orderId = 0;

try {
    $created = cancelRequest('sales/sales_order_send_to_cashier.php', $clerkSession, [
        'customer_name'=>'Codex Cancellation Test',
        'items'=>[['product_id'=>$product['product_id'],'quantity'=>1,'unit'=>$product['unit_name']]],
    ]);
    cancelAssert($created['status'] === 200, 'Could not create order: '.json_encode($created));
    $orderId = (int)($created['body']['data']['order_id'] ?? 0);
    cancelAssert($orderId > 0, 'Order ID missing.');
    $accepted = cancelRequest('cashier/accept_order.php', $cashierSession, ['order_id'=>$orderId]);
    cancelAssert($accepted['status'] === 200, 'Could not accept order: '.json_encode($accepted));

    $cancelled = cancelRequest('sales/cancel_my_sales_clerk_order.php', $clerkSession, [
        'order_id'=>$orderId,'reason'=>'Customer changed their mind.',
    ]);
    cancelAssert($cancelled['status'] === 200, 'Could not cancel processing order: '.json_encode($cancelled));
    $saved = $pdo->query("SELECT o.status,o.cancellation_reason,q.queue_status FROM sales_orders o
        LEFT JOIN cashier_queue q ON q.order_id=o.order_id WHERE o.order_id={$orderId}")->fetch(PDO::FETCH_ASSOC);
    cancelAssert($saved['status'] === 'cancelled' && $saved['queue_status'] === 'cancelled', 'Order and cashier queue were not cancelled together.');
    cancelAssert($saved['cancellation_reason'] === 'Customer changed their mind.', 'Cancellation reason was not saved.');

    $processing = cancelRequest('cashier/get_cashier_orders.php?tab=processing', $cashierSession);
    cancelAssert($processing['status'] === 200, 'Cashier processing queue did not load.');
    $orders = $processing['body']['data']['orders'] ?? [];
    cancelAssert(!in_array($orderId, array_map(static fn($row)=>(int)$row['order_id'], $orders), true), 'Cancelled order remains in the cashier processing queue.');

    $repay = cancelRequest('cashier/complete_payment.php', $cashierSession, ['order_id'=>$orderId,'amount_paid'=>10000]);
    cancelAssert($repay['status'] !== 200, 'Cancelled order was paid.');
    echo "Processing cancellation removed the order from Cashier POS.\n";
} finally {
    if ($orderId > 0) {
        foreach (['sales_receipts','sales_payments','cashier_queue','sales_order_status_history','sales_order_items','sales_orders'] as $table) {
            $pdo->prepare("DELETE FROM {$table} WHERE order_id=:id")->execute([':id'=>$orderId]);
        }
    }
    $pdo->prepare('DELETE FROM auth_sessions WHERE auth_session_id IN (?,?)')->execute([$clerkSession['auth_id'],$cashierSession['auth_id']]);
}
