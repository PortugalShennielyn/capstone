<?php
declare(strict_types=1);

error_reporting(E_ERROR | E_PARSE);
require_once __DIR__ . '/../pharma-api/config/db_connection.php';
require_once __DIR__ . '/../pharma-api/v1/activity_log_helpers.php';

function managementAuditAssert(bool $condition, string $message): void
{
    if (!$condition) throw new RuntimeException($message);
}

$actor = $pdo->query("SELECT user_id, username, role FROM users WHERE status='Active' AND role IN ('admin','super_admin') ORDER BY FIELD(role,'admin','super_admin') LIMIT 1")->fetch(PDO::FETCH_ASSOC);
managementAuditAssert((bool) $actor, 'An active administrator fixture is required.');
$_SESSION['user_id'] = $actor['user_id'];
$_SESSION['username'] = $actor['username'];
$_SESSION['role'] = $actor['role'];
$_SESSION['auth_session_id'] = 'management-audit-test-' . bin2hex(random_bytes(8));

ensureAuditLogSchema($pdo);
$requestId = auditRequestId();
$pdo->beginTransaction();
try {
    recordManagementAudit($pdo, 'ROLE_CHANGED', 'Management audit transaction test.', 'User Account', 'management-test-account', [
        'affected_username' => 'management-test-account', 'previous_role' => 'cashier', 'new_role' => 'salesclerk',
    ]);
    recordSettingsDiffAudit($pdo, ['pharmacy_name' => 'Doc R Pharmacy', 'tin_license_number' => 'old-value'], ['pharmacy_name' => 'Doc R Pharmacy', 'tin_license_number' => 'new-value'], ['pharmacy_name' => 'Store Name', 'tin_license_number' => 'TIN / License Number'], ['tin_license_number']);
    $query = $pdo->prepare('SELECT user_id, role, action, module, event_status, details FROM audit_logs WHERE request_id = :request_id LIMIT 1');
    $query->execute([':request_id' => $requestId]);
    $event = $query->fetch(PDO::FETCH_ASSOC);
    managementAuditAssert((bool) $event, 'The role-change audit record was not written.');
    managementAuditAssert($event['user_id'] === $actor['user_id'] && $event['role'] === $actor['role'], 'Trusted administrator identity was not captured.');
    managementAuditAssert($event['action'] === 'ROLE_CHANGED' && $event['module'] === 'System & User Management' && $event['event_status'] === 'Success', 'Management event fields were incorrect.');
    managementAuditAssert(str_contains((string) $event['details'], 'cashier') && str_contains((string) $event['details'], 'salesclerk'), 'Before/after role values were not retained.');
    $query = $pdo->prepare("SELECT action, target_id, details FROM audit_logs WHERE request_id = :request_id AND action = 'SETTINGS_CHANGED'");
    $query->execute([':request_id' => $requestId]);
    $settingEvents = $query->fetchAll(PDO::FETCH_ASSOC);
    managementAuditAssert(count($settingEvents) === 1, 'Unchanged settings generated audit rows or changed fields were omitted.');
    managementAuditAssert($settingEvents[0]['target_id'] === 'tin_license_number' && str_contains((string) $settingEvents[0]['details'], '[redacted]'), 'Sensitive setting values were not redacted.');
} finally {
    $pdo->rollBack();
}

$query = $pdo->prepare('SELECT COUNT(*) FROM audit_logs WHERE request_id = :request_id');
$query->execute([':request_id' => $requestId]);
managementAuditAssert((int) $query->fetchColumn() === 0, 'A rolled-back management transaction left an audit record.');
echo "Management audit transaction test passed.\n";
