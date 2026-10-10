<?php
require_once '../../config/db_connection.php';

$allowedRoles = ['super_admin', 'admin', 'manager', 'salesclerk', 'Admin', 'Sales Clerk', 'ro-admin', 'ro-super-admin', 'ro-manager', 'ro-sales-clerk'];
require_once '../../config/require_auth.php';

$userId = $_SESSION['user_id'] ?? '';
$isSalesClerk = currentSessionHasRbacRole('salesclerk') || currentSessionHasRbacRole('ro_sales_clerk');
$legacyDate = trim((string) ($_GET['date'] ?? ''));
$requestedStart = trim((string) ($_GET['start_date'] ?? ($legacyDate ?: date('Y-m-d'))));
$requestedEnd = trim((string) ($_GET['end_date'] ?? ($legacyDate ?: date('Y-m-d'))));
$parsedStart = DateTimeImmutable::createFromFormat('!Y-m-d', $requestedStart);
$parsedEnd = DateTimeImmutable::createFromFormat('!Y-m-d', $requestedEnd);
if (!$parsedStart || $parsedStart->format('Y-m-d') !== $requestedStart ||
    !$parsedEnd || $parsedEnd->format('Y-m-d') !== $requestedEnd || $requestedStart > $requestedEnd) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'Enter a valid date range, with the end date on or after the start date.']);
    exit;
}
$endExclusive = $parsedEnd->modify('+1 day')->format('Y-m-d');

$whereClerk = $isSalesClerk ? ' AND sales_clerk_id = :user_id' : '';
$params = [':dashboard_start' => $requestedStart, ':dashboard_end_exclusive' => $endExclusive];
if ($isSalesClerk) {
    $params[':user_id'] = $userId;
}

function dashboardCount(PDO $pdo, string $sql, array $params = []): int
{
    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
    return (int) $stmt->fetchColumn();
}

$todayForwarded = dashboardCount(
    $pdo,
    "SELECT COUNT(*) FROM sales_orders
     WHERE COALESCE(sent_to_cashier_at, created_at) >= :dashboard_start
       AND COALESCE(sent_to_cashier_at, created_at) < :dashboard_end_exclusive
       AND status IN ('waiting_cashier','accepted_by_cashier','processing_payment','completed')
       {$whereClerk}",
    $params
);
$pendingForCashier = dashboardCount(
    $pdo,
    "SELECT COUNT(*) FROM sales_orders
     WHERE status = 'waiting_cashier'
       AND created_at >= :dashboard_start
       AND created_at < :dashboard_end_exclusive
       {$whereClerk}",
    $params
);
$completedTransactions = dashboardCount(
    $pdo,
    "SELECT COUNT(*) FROM sales_orders
     WHERE status = 'completed'
       AND COALESCE(completed_at, updated_at, created_at) >= :dashboard_start
       AND COALESCE(completed_at, updated_at, created_at) < :dashboard_end_exclusive
       {$whereClerk}",
    $params
);
$todaySalesStmt = $pdo->prepare(
    "SELECT COALESCE(SUM(total_amount), 0)
     FROM sales_orders
     WHERE status = 'completed'
       AND COALESCE(completed_at, updated_at, created_at) >= :dashboard_start
       AND COALESCE(completed_at, updated_at, created_at) < :dashboard_end_exclusive
       {$whereClerk}"
);
$todaySalesStmt->execute($params);
$todaySales = (float) $todaySalesStmt->fetchColumn();
$itemsStmt = $pdo->prepare(
    "SELECT COALESCE(SUM(soi.quantity), 0)
     FROM sales_order_items soi
     INNER JOIN sales_orders so ON so.order_id = soi.order_id
     WHERE so.status = 'completed'
       AND COALESCE(so.completed_at, so.updated_at, so.created_at) >= :dashboard_start
       AND COALESCE(so.completed_at, so.updated_at, so.created_at) < :dashboard_end_exclusive
       {$whereClerk}"
);
$itemsStmt->execute($params);
$totalItemsSold = (int) $itemsStmt->fetchColumn();

echo json_encode([
    'success' => true,
    'message' => 'Sales Clerk dashboard loaded.',
    'data' => [
        'today_forwarded_orders' => $todayForwarded,
        'my_sales_today' => $todaySales,
        'pending_for_cashier' => $pendingForCashier,
        'completed_transactions' => $completedTransactions,
        'start_date' => $requestedStart,
        'end_date' => $requestedEnd,
        'my_sales' => $todaySales,
        'my_sales_today' => $todaySales,
        'total_items_sold' => $totalItemsSold,
        'total_items_sold_today' => $totalItemsSold,
    ],
]);
?>
