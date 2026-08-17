<?php
declare(strict_types=1);

require_once __DIR__ . '/../pharma-api/config/db_connection.php';
require_once __DIR__ . '/../pharma-api/v1/purchase_orders/purchase_order_helpers.php';

function grnAssert(bool $condition, string $message): void
{
    if (!$condition) throw new RuntimeException($message);
}

function grnRequest(string $method, string $path, string $sessionId, string $tabToken, ?array $payload = null): array
{
    $curl = curl_init('http://127.0.0.1/PharmacySystem_for_DocR/pharma-api/v1/' . $path);
    $options = [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_CUSTOMREQUEST => $method,
        CURLOPT_COOKIE => 'PHPSESSID=' . $sessionId,
        CURLOPT_HTTPHEADER => ['Content-Type: application/json', 'X-Tab-Token: ' . $tabToken],
        CURLOPT_TIMEOUT => 20,
    ];
    if ($payload !== null) $options[CURLOPT_POSTFIELDS] = json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    curl_setopt_array($curl, $options);
    $body = curl_exec($curl);
    $status = (int) curl_getinfo($curl, CURLINFO_RESPONSE_CODE);
    $error = curl_error($curl);
    curl_close($curl);
    grnAssert($body !== false, 'GRN settings HTTP request failed: ' . $error);
    return ['status' => $status, 'body' => json_decode((string) $body, true) ?: []];
}

$authSessionId = newUuid($pdo);
$phpSessionId = 'codexgrn' . bin2hex(random_bytes(8));
$tabToken = bin2hex(random_bytes(32));
$original = $pdo->query('SELECT grn_received_by_name, grn_approved_by_name FROM system_settings ORDER BY setting_id LIMIT 1')->fetch(PDO::FETCH_ASSOC) ?: [];

try {
    $user = $pdo->query("SELECT user_id,username,full_name,role,status FROM users WHERE role='admin' AND status='Active' LIMIT 1")->fetch(PDO::FETCH_ASSOC);
    grnAssert((bool) $user, 'An active admin fixture is required.');

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

    $pdo->prepare(
        "INSERT INTO auth_sessions
            (auth_session_id,php_session_id,user_id,session_token_hash,expires_at,ip_address,user_agent)
         VALUES (:id,:php,:user,:token,DATE_ADD(NOW(),INTERVAL 10 MINUTE),'127.0.0.1','Codex GRN settings test')"
    )->execute([
        ':id' => $authSessionId, ':php' => $phpSessionId, ':user' => $user['user_id'],
        ':token' => hash('sha256', $tabToken),
    ]);

    $save = grnRequest('POST', 'settings/save_grn_settings.php', $phpSessionId, $tabToken, [
        'receivedByName' => 'Juan Dela Cruz',
        'approvedByName' => 'Dr. Santos',
    ]);
    grnAssert($save['status'] === 200, 'Saving GRN settings failed: ' . json_encode($save));

    $get = grnRequest('GET', 'settings/get_admin_settings.php', $phpSessionId, $tabToken);
    grnAssert($get['status'] === 200, 'Loading GRN settings failed: ' . json_encode($get));
    grnAssert(($get['body']['grn']['receivedByName'] ?? '') === 'Juan Dela Cruz', 'Received By setting was not persisted.');
    grnAssert(($get['body']['grn']['approvedByName'] ?? '') === 'Dr. Santos', 'Approved By setting was not persisted.');

    $poId = (string) ($pdo->query(
        'SELECT por.po_id FROM purchase_order_receiving por
         WHERE EXISTS (SELECT 1 FROM purchase_order_receiving_items i WHERE i.receiving_id=por.receiving_id)
         ORDER BY por.received_date DESC LIMIT 1'
    )->fetchColumn() ?: '');
    if ($poId !== '') {
        $receiving = grnRequest('GET', 'purchase_orders/get_receiving_details.php?po_id=' . rawurlencode($poId), $phpSessionId, $tabToken);
        grnAssert($receiving['status'] === 200, 'Loading receiving details with GRN settings failed.');
        grnAssert(($receiving['body']['receiving']['grn_settings']['received_by_name'] ?? '') === 'Juan Dela Cruz', 'GRN Received By setting was not connected to receiving details.');
        grnAssert(($receiving['body']['receiving']['grn_settings']['approved_by_name'] ?? '') === 'Dr. Santos', 'GRN Approved By setting was not connected to receiving details.');
    }

    $blank = grnRequest('POST', 'settings/save_grn_settings.php', $phpSessionId, $tabToken, [
        'receivedByName' => '',
        'approvedByName' => '',
    ]);
    grnAssert($blank['status'] === 200, 'Blank GRN settings were not accepted.');
    $blankRow = $pdo->query('SELECT grn_received_by_name, grn_approved_by_name FROM system_settings WHERE setting_id=1')->fetch(PDO::FETCH_ASSOC) ?: [];
    grnAssert(($blankRow['grn_received_by_name'] ?? null) === null, 'Blank Received By should be stored as NULL.');
    grnAssert(($blankRow['grn_approved_by_name'] ?? null) === null, 'Blank Approved By should be stored as NULL.');

} finally {
    $pdo->prepare('UPDATE system_settings SET grn_received_by_name=:received_by, grn_approved_by_name=:approved_by WHERE setting_id=1')->execute([
        ':received_by' => $original['grn_received_by_name'] ?? null,
        ':approved_by' => $original['grn_approved_by_name'] ?? null,
    ]);
    $pdo->prepare('DELETE FROM auth_sessions WHERE auth_session_id=:id')->execute([':id' => $authSessionId]);
}

echo "GRN settings test passed\n";
