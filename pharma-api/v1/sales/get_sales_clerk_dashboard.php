<?php
require_once '../../config/db_connection.php';

$allowedRoles = ['super_admin', 'admin', 'manager', 'salesclerk', 'Admin', 'Sales Clerk', 'ro-admin', 'ro-super-admin', 'ro-manager', 'ro-sales-clerk'];
require_once '../../config/require_auth.php';

$userId = $_SESSION['user_id'] ?? '';
$role = strtolower((string) ($_SESSION['role'] ?? ''));
$isSalesClerk = in_array($role, ['salesclerk', 'sales clerk'], true);

$whereClerk = $isSalesClerk ? ' AND sales_clerk_id = :user_id' : '';
$params = $isSalesClerk ? [':user_id' => $userId] : [];

function dashboardCount(PDO $pdo, string $sql, array $params = []): int
{
    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
    return (int) $stmt->fetchColumn();
}

$todayForwarded = dashboardCount(
    $pdo,
    "SELECT COUNT(*) FROM sales_orders
     WHERE DATE(COALESCE(sent_to_cashier_at, created_at)) = CURDATE()
       AND status IN ('waiting_cashier','accepted_by_cashier','processing_payment','completed')
       {$whereClerk}",
    $params
);
$pendingForCashier = dashboardCount(
    $pdo,
    "SELECT COUNT(*) FROM sales_orders
     WHERE status = 'waiting_cashier'
       {$whereClerk}",
    $params
);
$completedTransactions = dashboardCount(
    $pdo,
    "SELECT COUNT(*) FROM sales_orders
     WHERE status = 'completed'
       AND DATE(COALESCE(completed_at, updated_at, created_at)) = CURDATE()
       {$whereClerk}",
    $params
);
$itemsStmt = $pdo->prepare(
    "SELECT COALESCE(SUM(soi.quantity), 0)
     FROM sales_order_items soi
     INNER JOIN sales_orders so ON so.order_id = soi.order_id
     WHERE so.status = 'completed'
       AND DATE(COALESCE(so.completed_at, so.updated_at, so.created_at)) = CURDATE()
       {$whereClerk}"
);
$itemsStmt->execute($params);

echo json_encode([
    'success' => true,
    'message' => 'Sales Clerk dashboard loaded.',
    'data' => [
        'today_forwarded_orders' => $todayForwarded,
        'pending_for_cashier' => $pendingForCashier,
        'completed_transactions' => $completedTransactions,
        'total_items_sold_today' => (int) $itemsStmt->fetchColumn(),
    ],
]);
?>
