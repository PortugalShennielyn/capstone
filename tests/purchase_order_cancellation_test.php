<?php
require_once __DIR__ . '/../pharma-api/config/db_connection.php';
function cancelAssert($ok, $message) { if (!$ok) throw new RuntimeException($message); }
$ids = [];
$authId = newUuid($pdo);
$sessionId = 'pocancel' . bin2hex(random_bytes(12));
$token = bin2hex(random_bytes(32));
function cancelRequest($path, $body = null) {
    global $sessionId, $token;
    $c = curl_init('http://127.0.0.1/PharmacySystem_for_DocR/pharma-api/v1/purchase_orders/' . $path);
    curl_setopt_array($c, [CURLOPT_RETURNTRANSFER => true, CURLOPT_COOKIE => 'PHPSESSID=' . $sessionId,
        CURLOPT_HTTPHEADER => ['Content-Type: application/json', 'X-Tab-Token: ' . $token], CURLOPT_TIMEOUT => 20]);
    if ($body !== null) curl_setopt_array($c, [CURLOPT_POST => true, CURLOPT_POSTFIELDS => json_encode($body)]);
    $raw = curl_exec($c); $code = curl_getinfo($c, CURLINFO_RESPONSE_CODE); curl_close($c);
    return [$code, json_decode($raw, true)];
}
try {
    $user = $pdo->query("SELECT * FROM users WHERE role IN ('admin','super_admin') AND status='Active' LIMIT 1")->fetch();
    $supplier = $pdo->query('SELECT supplier_id FROM suppliers LIMIT 1')->fetchColumn();
    cancelAssert($user && $supplier, 'Admin and supplier fixtures required.');
    if (session_status() === PHP_SESSION_ACTIVE) session_write_close();
    session_id($sessionId); session_start();
    $_SESSION = ['user_id'=>$user['user_id'], 'username'=>$user['username'], 'full_name'=>$user['full_name'],
        'role'=>$user['role'], 'roles'=>[$user['role']], 'role_identifiers'=>['ro-admin'], 'user_status'=>'Active',
        'auth_session_id'=>$authId, 'tab_token_hash'=>hash('sha256',$token)];
    session_write_close();
    $pdo->prepare("INSERT INTO auth_sessions(auth_session_id,php_session_id,user_id,session_token_hash,expires_at,ip_address,user_agent) VALUES(?,?,?,?,DATE_ADD(NOW(),INTERVAL 10 MINUTE),'127.0.0.1','PO cancellation test')")
        ->execute([$authId,$sessionId,$user['user_id'],hash('sha256',$token)]);
    foreach (['Draft','Pending','Arrived','Delivered'] as $status) {
        $id = newUuid($pdo); $ids[] = $id;
        $pdo->prepare("INSERT INTO purchase_orders(po_id,po_number,supplier_id,status,approval_status) VALUES(?,?,?,?,'Approved')")
            ->execute([$id,'TEST-CANCEL-' . bin2hex(random_bytes(6)),$supplier,$status]);
        [$code] = cancelRequest('update_purchase_order_status.php', ['po_id'=>$id,'status'=>'Cancelled','reason'=>'   ']);
        cancelAssert($code === 400, 'Blank reason must be rejected.');
        $reason = 'Supplier cannot fulfil the order';
        [$code,$result] = cancelRequest('update_purchase_order_status.php', ['po_id'=>$id,'status'=>'Cancelled','reason'=>$reason]);
        cancelAssert($code === ($status === 'Delivered' ? 400 : 200), $status . ': ' . json_encode($result));
        $q = $pdo->prepare('SELECT status FROM purchase_orders WHERE po_id=?'); $q->execute([$id]);
        cancelAssert($q->fetchColumn() === ($status === 'Delivered' ? 'Delivered' : 'Cancelled'), 'Wrong persisted status.');
        if ($status !== 'Delivered') {
            $q = $pdo->prepare("SELECT reason FROM purchase_order_approval_audit WHERE po_id=? AND action='cancel'"); $q->execute([$id]);
            cancelAssert($q->fetchColumn() === $reason, 'Cancellation reason must be saved.');
        }
        [$code] = cancelRequest('cancel_purchase_order.php', ['po_id'=>$id]);
        cancelAssert($code === 400, 'Legacy endpoint must not bypass cancellation checks.');
    }
    [$code,$list] = cancelRequest('get_purchase_orders.php?status=Cancelled');
    cancelAssert($code === 200, 'Cancel filter must load.');
    $listed = array_column($list['purchase_orders'], 'po_id');
    foreach (array_slice($ids,0,3) as $id) cancelAssert(in_array($id,$listed,true), 'Cancelled PO must remain visible.');
    cancelAssert($list['status_counts']['Cancelled'] >= 3, 'Summary must count cancellations.');
    echo "PASS: Draft/Pending/Arrived cancellation, required reason, Delivered protection, audit reason, filter and counts.\n";
} finally {
    foreach ($ids as $id) {
        $pdo->prepare('DELETE FROM activity_logs WHERE reference_id=?')->execute([$id]);
        $pdo->prepare('DELETE FROM purchase_order_approval_audit WHERE po_id=?')->execute([$id]);
        $pdo->prepare('DELETE FROM purchase_orders WHERE po_id=?')->execute([$id]);
    }
    $pdo->prepare('DELETE FROM auth_sessions WHERE auth_session_id=?')->execute([$authId]);
}
