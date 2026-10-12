<?php
declare(strict_types=1);

error_reporting(E_ERROR | E_PARSE);
require_once __DIR__ . '/../pharma-api/config/db_connection.php';
require_once __DIR__ . '/../pharma-api/v1/activity_log_helpers.php';

function inventoryAuditAssert(bool $condition, string $message): void
{
    if (!$condition) throw new RuntimeException($message);
}

$actor = $pdo->query("SELECT user_id, username, role FROM users WHERE status='Active' AND role IN ('admin','super_admin','manager','supervisor') ORDER BY FIELD(role,'admin','super_admin','manager','supervisor') LIMIT 1")->fetch(PDO::FETCH_ASSOC);
inventoryAuditAssert((bool) $actor, 'An active inventory manager/admin fixture is required.');

$_SESSION['user_id'] = $actor['user_id'];
$_SESSION['username'] = $actor['username'];
$_SESSION['role'] = $actor['role'];
$_SESSION['auth_session_id'] = 'inventory-audit-test-' . bin2hex(random_bytes(8));

ensureAuditLogSchema($pdo);
$requestId = auditRequestId();
$testProductId = 'audit-test-' . bin2hex(random_bytes(8));
$pdo->beginTransaction();
try {
    recordInventoryAudit($pdo, 'STOCK_ADJUSTED', 'Audit transaction test: stock changed from 12 to 10. Difference: -2.', $testProductId, [
        'product_id' => $testProductId, 'product_name' => 'Audit transaction test item',
        'previous_stock' => 12, 'new_stock' => 10, 'difference' => -2,
    ]);
    $find = $pdo->prepare('SELECT user_id, user_name, role, action, module, event_status, target_id, details FROM audit_logs WHERE request_id=:request_id LIMIT 1');
    $find->execute([':request_id' => $requestId]);
    $event = $find->fetch(PDO::FETCH_ASSOC);
    inventoryAuditAssert((bool) $event, 'The inventory audit event was not written inside the transaction.');
    inventoryAuditAssert($event['user_id'] === $actor['user_id'] && $event['role'] === $actor['role'], 'Trusted session identity was not captured.');
    inventoryAuditAssert($event['action'] === 'STOCK_ADJUSTED' && $event['module'] === 'Inventory' && $event['event_status'] === 'Success', 'Inventory event fields were incorrect.');
    inventoryAuditAssert($event['target_id'] === $testProductId && str_contains((string) $event['details'], '"difference":-2'), 'Product reference or stock difference was incorrect.');
} finally {
    $pdo->rollBack();
}

$check = $pdo->prepare('SELECT COUNT(*) FROM audit_logs WHERE request_id=:request_id');
$check->execute([':request_id' => $requestId]);
inventoryAuditAssert((int) $check->fetchColumn() === 0, 'A rolled-back inventory transaction left a successful audit event behind.');
echo "Inventory audit transaction test passed.\n";
