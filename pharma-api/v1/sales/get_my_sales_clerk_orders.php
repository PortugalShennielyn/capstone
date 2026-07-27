<?php
require_once '../../config/db_connection.php';

$allowedRoles = ['salesclerk', 'Sales Clerk', 'ro-sales-clerk', 'ro_sales_clerk', 'admin', 'Admin', 'ro-admin'];
require_once '../../config/require_auth.php';
require_once 'sales_helpers.php';
require_once 'sales_pos_helpers.php';

try {
    $userId = salesCurrentUserId();
    $search = trim((string) ($_GET['search'] ?? ''));
    $tab = trim((string) ($_GET['status'] ?? $_GET['tab'] ?? 'waiting_cashier'));
    $statusGroups = [
        'draft' => ['draft'],
        'waiting_cashier' => ['waiting_cashier'],
        'processing' => ['accepted_by_cashier', 'processing_payment', 'processing'],
        'completed' => ['completed', 'paid'],
        'cancelled' => ['cancelled', 'rejected'],
    ];
    if (!isset($statusGroups[$tab])) {
        $tab = 'waiting_cashier';
    }

    $params = [':sales_clerk_id' => $userId];
    $placeholders = [];
    foreach ($statusGroups[$tab] as $index => $status) {
        $key = ':status' . $index;
        $placeholders[] = $key;
        $params[$key] = $status;
    }

    $where = [
        'o.sales_clerk_id = :sales_clerk_id',
        'o.status IN (' . implode(', ', $placeholders) . ')',
    ];
    if ($search !== '') {
        $where[] = '(o.order_no LIKE :search OR o.customer_name LIKE :search)';
        $params[':search'] = '%' . $search . '%';
    }

    $sql = "SELECT
                o.order_id,
                o.order_no,
                COALESCE(NULLIF(o.customer_name, ''), 'Walk-in Customer') AS customer_name,
                COALESCE(NULLIF(sc.full_name, ''), sc.username, 'Sales Clerk') AS sales_clerk_name,
                COALESCE(NULLIF(ca.full_name, ''), ca.username, '') AS cashier_name,
                COALESCE(items.item_count, 0) AS item_count,
                COALESCE(items.total_quantity, 0) AS total_quantity,
                o.subtotal,
                o.discount,
                o.vat,
                o.total_amount,
                o.status,
                o.created_at,
                o.updated_at,
                o.completed_at
            FROM sales_orders o
            LEFT JOIN users sc ON sc.user_id = o.sales_clerk_id
            LEFT JOIN users ca ON ca.user_id = o.assigned_cashier_id
            LEFT JOIN (
                SELECT order_id, COUNT(*) AS item_count, SUM(quantity) AS total_quantity
                FROM sales_order_items
                GROUP BY order_id
            ) items ON items.order_id = o.order_id
            WHERE " . implode(' AND ', $where) . "
            ORDER BY COALESCE(o.updated_at, o.created_at) DESC
            LIMIT 100";
    error_log('[DRP_DEBUG] sales_clerk_orders context=' . json_encode([
        'user_id' => $userId,
        'role' => $_SESSION['role'] ?? '',
        'roles' => $_SESSION['roles'] ?? [],
        'role_identifiers' => $_SESSION['role_identifiers'] ?? [],
        'tab' => $tab,
    ]));
    error_log('[DRP_DEBUG] sales_clerk_orders sql=' . preg_replace('/\s+/', ' ', $sql) . ' params=' . json_encode($params));
    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
    $orderRows = $stmt->fetchAll(PDO::FETCH_ASSOC);
    error_log('[DRP_DEBUG] sales_clerk_orders result_count=' . count($orderRows));

    $orders = array_map(static function (array $row): array {
        return [
            'order_id' => (string) $row['order_id'],
            'order_no' => salesDisplayValue($row['order_no'], (string) $row['order_id']),
            'customer_name' => salesDisplayValue($row['customer_name'], 'Walk-in Customer'),
            'sales_clerk_name' => salesDisplayValue($row['sales_clerk_name'], 'Sales Clerk'),
            'cashier_name' => salesDisplayValue($row['cashier_name']),
            'items' => (int) ($row['item_count'] ?? 0),
            'total_quantity' => (int) ($row['total_quantity'] ?? 0),
            'subtotal' => salesMoneyValue($row['subtotal'] ?? 0),
            'discount' => salesMoneyValue($row['discount'] ?? 0),
            'vat' => salesMoneyValue($row['vat'] ?? 0),
            'total_amount' => salesMoneyValue($row['total_amount'] ?? 0),
            'status_code' => salesClerkStatusGroup((string) ($row['status'] ?? '')),
            'raw_status_code' => (string) ($row['status'] ?? ''),
            'status' => salesClerkStatusLabel((string) ($row['status'] ?? '')),
            'created_at' => $row['created_at'],
            'updated_at' => $row['updated_at'],
            'completed_at' => $row['completed_at'],
        ];
    }, $orderRows);

    $summaryStmt = $pdo->prepare(
        "SELECT
            SUM(status = 'draft') AS draft_count,
            SUM(status = 'waiting_cashier') AS waiting_cashier_count,
            SUM(status IN ('accepted_by_cashier', 'processing_payment', 'processing')) AS processing_count,
            SUM(status IN ('completed', 'paid')) AS completed_count,
            SUM(status IN ('cancelled', 'rejected')) AS cancelled_count
         FROM sales_orders
         WHERE sales_clerk_id = :sales_clerk_id"
    );
    error_log('[DRP_DEBUG] sales_clerk_orders summary_sql=' . preg_replace('/\s+/', ' ', $summaryStmt->queryString) . ' params=' . json_encode([':sales_clerk_id' => $userId]));
    $summaryStmt->execute([':sales_clerk_id' => $userId]);
    $summaryRow = $summaryStmt->fetch(PDO::FETCH_ASSOC) ?: [];

    echo json_encode([
        'status' => 'success',
        'data' => [
            'orders' => $orders,
            'summary' => [
                'draft' => (int) ($summaryRow['draft_count'] ?? 0),
                'waiting_cashier' => (int) ($summaryRow['waiting_cashier_count'] ?? 0),
                'processing' => (int) ($summaryRow['processing_count'] ?? 0),
                'completed' => (int) ($summaryRow['completed_count'] ?? 0),
                'cancelled' => (int) ($summaryRow['cancelled_count'] ?? 0),
            ],
        ],
    ]);
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode([
        'status' => 'error',
        'message' => 'Unable to load your sales clerk orders.',
        'error' => $e->getMessage(),
    ]);
}

?>
