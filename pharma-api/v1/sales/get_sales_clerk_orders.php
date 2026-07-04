<?php
require_once '../../config/db_connection.php';
require_once '../../config/require_auth.php';
require_once 'sales_helpers.php';
require_once 'sales_pos_helpers.php';

try {
    $search = trim((string) ($_GET['search'] ?? ''));
    $status = trim((string) ($_GET['status'] ?? 'waiting_cashier'));
    $allowedStatuses = ['draft', 'waiting_cashier', 'accepted_by_cashier', 'processing_payment', 'completed', 'cancelled', 'rejected', 'all'];
    if (!in_array($status, $allowedStatuses, true)) {
        $status = 'waiting_cashier';
    }

    $where = [];
    $params = [];
    if ($status !== 'all') {
        $where[] = 'o.status = :status';
        $params[':status'] = $status;
    }
    if ($search !== '') {
        $where[] = '(o.order_no LIKE :search OR o.customer_name LIKE :search OR sc.full_name LIKE :search OR sc.username LIKE :search)';
        $params[':search'] = '%' . $search . '%';
    }
    $whereSql = $where ? 'WHERE ' . implode(' AND ', $where) : '';

    $sql = "SELECT
                o.order_id,
                o.order_no,
                COALESCE(NULLIF(o.customer_name, ''), 'Walk-in Customer') AS customer_name,
                COALESCE(NULLIF(sc.full_name, ''), sc.username, 'Unassigned') AS sales_clerk_name,
                COALESCE(NULLIF(ca.full_name, ''), ca.username, '') AS cashier_name,
                COALESCE(items.total_items, 0) AS total_items,
                o.total_amount,
                o.status,
                o.created_at,
                o.sent_to_cashier_at
            FROM sales_orders o
            LEFT JOIN users sc ON sc.user_id = o.sales_clerk_id
            LEFT JOIN users ca ON ca.user_id = o.assigned_cashier_id
            LEFT JOIN (
                SELECT order_id, SUM(quantity) AS total_items
                FROM sales_order_items
                GROUP BY order_id
            ) items ON items.order_id = o.order_id
            {$whereSql}
            ORDER BY COALESCE(o.sent_to_cashier_at, o.created_at) DESC
            LIMIT 100";
    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);

    $orders = array_map(static function (array $row): array {
        return [
            'order_id' => (string) $row['order_id'],
            'order_no' => salesDisplayValue($row['order_no'], (string) $row['order_id']),
            'customer_name' => salesDisplayValue($row['customer_name'], 'Walk-in Customer'),
            'sales_clerk_name' => salesDisplayValue($row['sales_clerk_name'], 'Unassigned'),
            'cashier_name' => salesDisplayValue($row['cashier_name']),
            'total_items' => (int) ($row['total_items'] ?? 0),
            'total_amount' => salesMoneyValue($row['total_amount'] ?? 0),
            'status' => salesStatusLabel((string) ($row['status'] ?? 'waiting_cashier')),
            'status_code' => (string) ($row['status'] ?? ''),
            'created_at' => $row['created_at'],
            'sent_to_cashier_at' => $row['sent_to_cashier_at'],
            'notes' => '',
        ];
    }, $stmt->fetchAll(PDO::FETCH_ASSOC));

    $summaryStmt = $pdo->query(
        "SELECT
            SUM(status = 'draft') AS waiting_count,
            SUM(status IN ('waiting_cashier', 'accepted_by_cashier', 'processing_payment')) AS cashier_queue_count,
            SUM(status = 'completed' AND DATE(completed_at) = CURDATE()) AS completed_today_count,
            SUM(status = 'cancelled' AND DATE(cancelled_at) = CURDATE()) AS cancelled_today_count,
            COALESCE(SUM(CASE WHEN status = 'completed' AND DATE(completed_at) = CURDATE() THEN total_amount ELSE 0 END), 0) AS total_sales_today,
            SUM(status = 'completed' AND DATE(completed_at) = CURDATE()) AS total_sales_orders_today,
            COALESCE(SUM(CASE WHEN status = 'draft' THEN total_amount ELSE 0 END), 0) AS waiting_total
         FROM sales_orders"
    );
    $summaryRow = $summaryStmt->fetch(PDO::FETCH_ASSOC) ?: [];
    $summary = [
        'waiting_count' => (int) ($summaryRow['waiting_count'] ?? 0),
        'cashier_queue_count' => (int) ($summaryRow['cashier_queue_count'] ?? 0),
        'completed_today_count' => (int) ($summaryRow['completed_today_count'] ?? 0),
        'cancelled_today_count' => (int) ($summaryRow['cancelled_today_count'] ?? 0),
        'total_sales_today' => salesMoneyValue($summaryRow['total_sales_today'] ?? 0),
        'total_sales_orders_today' => (int) ($summaryRow['total_sales_orders_today'] ?? 0),
        'waiting_total' => salesMoneyValue($summaryRow['waiting_total'] ?? 0),
    ];

    echo json_encode([
        'status' => 'success',
        'data' => [
            'orders' => $orders,
            'summary' => $summary,
        ],
    ]);
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode([
        'status' => 'error',
        'message' => 'Unable to load sales clerk orders.',
        'error' => $e->getMessage(),
    ]);
}

?>
