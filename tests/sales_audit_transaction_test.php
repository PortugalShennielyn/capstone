<?php
declare(strict_types=1);

error_reporting(E_ERROR | E_PARSE);
require_once __DIR__ . '/../pharma-api/config/db_connection.php';
require_once __DIR__ . '/../pharma-api/v1/activity_log_helpers.php';

function salesAuditAssert(bool $condition, string $message): void
{
    if (!$condition) throw new RuntimeException($message);
}

$source = $pdo->query(
    "SELECT o.order_id,o.order_no,r.receipt_no,p.final_amount,p.payment_method,p.cashier_id,
            u.username,u.full_name,u.role
     FROM sales_orders o
     INNER JOIN sales_payments p ON p.order_id=o.order_id AND p.payment_status='paid'
     INNER JOIN sales_receipts r ON r.order_id=o.order_id
     LEFT JOIN users u ON u.user_id=p.cashier_id
     LIMIT 1"
)->fetch(PDO::FETCH_ASSOC);
salesAuditAssert((bool) $source, 'A paid receipt fixture is required.');

$_SESSION['user_id'] = $source['cashier_id'];
$_SESSION['username'] = $source['username'];
$_SESSION['full_name'] = $source['full_name'];
$_SESSION['role'] = $source['role'];
$_SESSION['auth_session_id'] = 'sales-audit-test-' . bin2hex(random_bytes(8));

ensureAuditLogSchema($pdo);
$requestId = auditRequestId();
$pdo->beginTransaction();
try {
    recordSalesAudit($pdo, 'SALE_COMPLETED', 'Sales audit transaction test.', (int) $source['order_id'], [
        'order_id' => (int) $source['order_id'], 'order_no' => $source['order_no'],
        'transaction_id' => $source['receipt_no'], 'amount' => (float) $source['final_amount'],
        'payment_method' => $source['payment_method'],
    ]);
    $find = $pdo->prepare('SELECT user_id,role,action,module,event_status,target_id,details FROM audit_logs WHERE request_id=:request_id LIMIT 1');
    $find->execute([':request_id' => $requestId]);
    $event = $find->fetch(PDO::FETCH_ASSOC);
    salesAuditAssert((bool) $event, 'The sale audit event was not written.');
    salesAuditAssert($event['user_id'] === $source['cashier_id'] && $event['role'] === $source['role'], 'Sale actor did not match the authenticated cashier context.');
    salesAuditAssert($event['action'] === 'SALE_COMPLETED' && $event['module'] === 'Sales & Transactions' && $event['event_status'] === 'Success', 'Sale event type or outcome was incorrect.');
    salesAuditAssert($event['target_id'] === (string) $source['order_id'] && str_contains((string) $event['details'], $source['receipt_no']), 'Sale event did not retain the actual order and receipt references.');
} finally {
    $pdo->rollBack();
}

$check = $pdo->prepare('SELECT COUNT(*) FROM audit_logs WHERE request_id=:request_id');
$check->execute([':request_id' => $requestId]);
salesAuditAssert((int) $check->fetchColumn() === 0, 'A rolled-back sale transaction left an audit event behind.');
echo "Sales audit transaction test passed.\n";
