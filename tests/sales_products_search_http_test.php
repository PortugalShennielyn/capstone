<?php
declare(strict_types=1);

require_once __DIR__ . '/../pharma-api/config/db_connection.php';

$user = $pdo->query("SELECT user_id,username,full_name,role,status FROM users WHERE role='admin' AND status='Active' LIMIT 1")
    ->fetch(PDO::FETCH_ASSOC);
if (!$user) throw new RuntimeException('An active admin is required for the POS search test.');

$authId = newUuid($pdo);
$sessionId = 'codexpos' . bin2hex(random_bytes(8));
$tabToken = bin2hex(random_bytes(32));

try {
    if (session_status() === PHP_SESSION_ACTIVE) session_write_close();
    session_id($sessionId);
    session_start();
    $_SESSION = [
        'user_id' => $user['user_id'], 'username' => $user['username'], 'full_name' => $user['full_name'],
        'role' => $user['role'], 'roles' => [$user['role']], 'role_identifiers' => ['ro-admin'],
        'user_status' => $user['status'], 'auth_session_id' => $authId,
        'tab_token_hash' => hash('sha256', $tabToken),
    ];
    session_write_close();
    $pdo->prepare("INSERT INTO auth_sessions
        (auth_session_id,php_session_id,user_id,session_token_hash,expires_at,ip_address,user_agent)
        VALUES (:id,:session,:user,:token,DATE_ADD(NOW(),INTERVAL 10 MINUTE),'127.0.0.1','Codex POS search test')")
        ->execute([':id'=>$authId,':session'=>$sessionId,':user'=>$user['user_id'],':token'=>hash('sha256', $tabToken)]);

    foreach (['', '?search=codex-no-matching-product'] as $query) {
        $curl = curl_init('http://127.0.0.1/PharmacySystem_for_DocR/pharma-api/v1/sales/sales_products_search.php' . $query);
        curl_setopt_array($curl, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_COOKIE => 'PHPSESSID=' . $sessionId,
            CURLOPT_HTTPHEADER => ['Accept: application/json', 'X-Tab-Token: ' . $tabToken],
            CURLOPT_TIMEOUT => 20,
        ]);
        $body = curl_exec($curl);
        $status = (int) curl_getinfo($curl, CURLINFO_RESPONSE_CODE);
        $error = curl_error($curl);
        curl_close($curl);
        if ($body === false) throw new RuntimeException('POS search HTTP request failed: ' . $error);
        $result = json_decode((string) $body, true);
        if ($status !== 200 || ($result['status'] ?? null) !== 'success' || !is_array($result['data'] ?? null)) {
            throw new RuntimeException("POS search returned HTTP {$status}: " . (string) $body);
        }
    }
    echo "Sales Clerk POS product search passed.\n";
} finally {
    $pdo->prepare('DELETE FROM auth_sessions WHERE auth_session_id=:id')->execute([':id'=>$authId]);
}
