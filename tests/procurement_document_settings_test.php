<?php
declare(strict_types=1);

require_once __DIR__ . '/../pharma-api/config/db_connection.php';

function documentSettingsAssert(bool $condition, string $message): void
{
    if (!$condition) throw new RuntimeException($message);
}

function documentSettingsRequest(string $method, string $path, string $sessionId, string $tabToken, ?array $payload = null): array
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
    documentSettingsAssert($body !== false, 'HTTP request failed: ' . $error);
    return ['status' => $status, 'body' => json_decode((string) $body, true) ?: []];
}

$original = $pdo->query('SELECT pr_prepared_name,pr_prepared_role,pr_reviewed_name,pr_reviewed_role,po_prepared_name,po_prepared_role,po_approved_name,po_approved_role FROM system_settings ORDER BY setting_id LIMIT 1')->fetch(PDO::FETCH_ASSOC);
$authSessionId = newUuid($pdo);
$phpSessionId = 'codexdocumentsettings' . bin2hex(random_bytes(8));
$tabToken = bin2hex(random_bytes(32));

try {
    $user = $pdo->query("SELECT user_id,username,full_name,role,status FROM users WHERE role IN ('admin','super_admin') AND status='Active' LIMIT 1")->fetch(PDO::FETCH_ASSOC);
    documentSettingsAssert((bool) $user, 'An active admin fixture is required.');
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
    $pdo->prepare("INSERT INTO auth_sessions (auth_session_id,php_session_id,user_id,session_token_hash,expires_at,ip_address,user_agent) VALUES (:id,:php,:user,:token,DATE_ADD(NOW(),INTERVAL 10 MINUTE),'127.0.0.1','Codex procurement settings test')")
        ->execute([':id' => $authSessionId, ':php' => $phpSessionId, ':user' => $user['user_id'], ':token' => hash('sha256', $tabToken)]);

    $custom = [
        'prPreparedName' => 'Dr. Juan Dela Cruz',
        'prPreparedRole' => 'Pharmacy Manager',
        'prReviewedName' => 'Maria Santos',
        'prReviewedRole' => 'Inventory Supervisor',
        'poPreparedName' => 'Dr. Juan Dela Cruz',
        'poPreparedRole' => 'Purchasing Manager',
        'poApprovedName' => 'Maria Santos',
        'poApprovedRole' => 'Operations Supervisor',
    ];
    $saved = documentSettingsRequest('POST', 'settings/save_procurement_signatories.php', $phpSessionId, $tabToken, $custom);
    documentSettingsAssert($saved['status'] === 200 && ($saved['body']['procurementDocumentSettings'] ?? []) === $custom, 'Role settings must save through the existing settings API.');
    $loaded = documentSettingsRequest('GET', 'settings/get_admin_settings.php', $phpSessionId, $tabToken);
    documentSettingsAssert($loaded['status'] === 200 && ($loaded['body']['procurementDocumentSettings'] ?? []) === $custom, 'Saved role settings must persist after reload.');

    $poId = $pdo->query('SELECT po_id FROM purchase_orders ORDER BY created_at DESC LIMIT 1')->fetchColumn();
    if (is_string($poId) && $poId !== '') {
        $po = documentSettingsRequest('GET', 'purchase_orders/get_purchase_order.php?po_id=' . rawurlencode($poId), $phpSessionId, $tabToken);
        documentSettingsAssert(($po['body']['purchase_order']['print_roles'] ?? []) === ['preparedName' => $custom['poPreparedName'], 'preparedRole' => $custom['poPreparedRole'], 'approvedName' => $custom['poApprovedName'], 'approvedRole' => $custom['poApprovedRole']], 'PO preview API must load the configured names and role labels.');
    }

    $prId = $pdo->query('SELECT pr_id FROM purchase_requests ORDER BY created_at DESC LIMIT 1')->fetchColumn();
    if (is_string($prId) && $prId !== '') {
        $pr = documentSettingsRequest('GET', 'purchase_requests/get_purchase_requests.php?pr_id=' . rawurlencode($prId), $phpSessionId, $tabToken);
        documentSettingsAssert(($pr['body']['data']['procurementDocumentSettings'] ?? []) === ['prPreparedName' => $custom['prPreparedName'], 'prPreparedRole' => $custom['prPreparedRole'], 'prReviewedName' => $custom['prReviewedName'], 'prReviewedRole' => $custom['prReviewedRole']], 'PR preview API must load the configured names and role labels.');
    }

    $prRenderer = file_get_contents(__DIR__ . '/../pharma-frontend/js/modules/pr_document_renderer.js');
    $poRenderer = file_get_contents(__DIR__ . '/../pharma-frontend/js/modules/purchase_order_document.js');
    documentSettingsAssert(str_contains($prRenderer, 'signature-name') && str_contains($prRenderer, 'signature-line'), 'PR renderer must print configured names above blank physical signature lines.');
    documentSettingsAssert(str_contains($prRenderer, 'roles.prPreparedName') && str_contains($prRenderer, 'roles.prReviewedName') && !str_contains($prRenderer, 'request.requested_by_name') && !str_contains($prRenderer, 'request.supervisor_name'), 'PR printed signatory names must come only from Procurement document settings.');
    documentSettingsAssert(str_contains($prRenderer, 'request.supervisor_user_id && request.decided_at') && !str_contains($prRenderer, "request.status === 'Approved'"), 'PR reviewer visibility must be gated by the immutable approval audit and survive downstream statuses.');
    documentSettingsAssert(str_contains($prRenderer, '<th>Requested Qty</th><th>Approved Qty</th>') && !str_contains($prRenderer, 'Requested / Approved Qty'), 'PR document must render requested and approved quantities in separate columns.');
    documentSettingsAssert(str_contains($prRenderer, "formatQuantity(item.approved_qty)") && !str_contains($prRenderer, 'Requested:') && !str_contains($prRenderer, 'Approved:'), 'PR approved quantity must come from the saved approved_qty value without repeated cell labels.');
    documentSettingsAssert(str_contains($poRenderer, 'signature-name') && str_contains($poRenderer, 'signature-line'), 'PO renderer must print configured names above blank physical signature lines.');

    echo "PR/PO document name/role settings and configured-name signature-line tests passed.\n";
} finally {
    if ($original) {
        $pdo->prepare('UPDATE system_settings SET pr_prepared_name=:pr_prepared_name,pr_prepared_role=:pr_prepared,pr_reviewed_name=:pr_reviewed_name,pr_reviewed_role=:pr_reviewed,po_prepared_name=:po_prepared_name,po_prepared_role=:po_prepared,po_approved_name=:po_approved_name,po_approved_role=:po_approved ORDER BY setting_id LIMIT 1')
            ->execute([
                ':pr_prepared_name' => $original['pr_prepared_name'],
                ':pr_prepared' => $original['pr_prepared_role'], ':pr_reviewed' => $original['pr_reviewed_role'],
                ':pr_reviewed_name' => $original['pr_reviewed_name'],
                ':po_prepared_name' => $original['po_prepared_name'],
                ':po_prepared' => $original['po_prepared_role'], ':po_approved' => $original['po_approved_role'],
                ':po_approved_name' => $original['po_approved_name'],
            ]);
    }
    $pdo->prepare('DELETE FROM auth_sessions WHERE auth_session_id=:id')->execute([':id' => $authSessionId]);
}
