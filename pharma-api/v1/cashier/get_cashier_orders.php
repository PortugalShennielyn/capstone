<?php
require_once '../../config/db_connection.php';
$allowedRoles = ['super_admin', 'admin', 'Cashier', 'cashier', 'ro-super-admin', 'ro-admin', 'ro-cashier'];
require_once '../../config/require_auth.php';
require_once 'cashier_helpers.php';

try {
    ensureSalesOrderCashSchema($pdo);
    ensureCashierPaymentDiscountSchema($pdo);

    $tab = strtolower(trim((string) ($_GET['tab'] ?? 'waiting')));
    $search = trim((string) ($_GET['search'] ?? ''));
    $userId = cashierCurrentUserId();
    $isAdmin = cashierIsAdminSession();
    $debugContext = [
        'user_id' => $userId,
        'role' => $_SESSION['role'] ?? '',
        'roles' => $_SESSION['roles'] ?? [],
        'role_identifiers' => $_SESSION['role_identifiers'] ?? [],
        'tab' => $tab,
    ];

    $where = [];
    $params = [];

    if ($tab === 'processing') {
        $where[] = "o.status IN ('accepted_by_cashier', 'processing_payment', 'processing')";
    } elseif ($tab === 'completed') {
        $where[] = "(o.status IN ('completed', 'paid') OR p.payment_id IS NOT NULL)";
        $where[] = 'DATE(COALESCE(o.completed_at, p.paid_at, o.updated_at)) = CURDATE()';
        if (!$isAdmin) {
            $where[] = 'o.assigned_cashier_id = :current_cashier_id';
            $params[':current_cashier_id'] = $userId;
        }
    } else {
        $tab = 'waiting';
        $where[] = "o.status = 'waiting_cashier'";
    }

    if ($search !== '') {
        $where[] = "(o.order_no LIKE :search OR o.customer_name LIKE :search OR sc.full_name LIKE :search OR sc.username LIKE :search)";
        $params[':search'] = '%' . $search . '%';
    }

    $sql = "SELECT
            o.order_id,
            o.order_no,
            COALESCE(NULLIF(o.customer_name, ''), 'Walk-in Customer') AS customer_name,
            COALESCE(NULLIF(sc.full_name, ''), sc.username, 'Unassigned') AS sales_clerk_name,
            COALESCE(NULLIF(ca.full_name, ''), ca.username, '') AS cashier_name,
            o.assigned_cashier_id,
            o.subtotal,
            o.discount,
            o.discount AS sales_clerk_discount,
            o.vat,
            o.total_amount,
            o.cash_received,
            o.change_amount,
            o.status,
            o.created_at,
            o.sent_to_cashier_at,
            o.cashier_accepted_at,
            o.completed_at,
            COUNT(soi.order_item_id) AS item_count,
            COALESCE(SUM(soi.quantity), 0) AS total_quantity,
            p.amount_paid,
            p.sales_clerk_discount AS payment_sales_clerk_discount,
            p.cashier_discount_type,
            p.cashier_discount_amount,
            p.final_amount,
            p.change_amount AS payment_change_amount,
            p.payment_method,
            r.receipt_no
         FROM sales_orders o
         LEFT JOIN users sc ON sc.user_id = o.sales_clerk_id
         LEFT JOIN users ca ON ca.user_id = o.assigned_cashier_id
         LEFT JOIN sales_order_items soi ON soi.order_id = o.order_id
         LEFT JOIN sales_payments p ON p.order_id = o.order_id AND p.payment_status = 'paid'
         LEFT JOIN sales_receipts r ON r.order_id = o.order_id
         WHERE " . implode(' AND ', $where) . "
         GROUP BY o.order_id
         ORDER BY
            CASE
                WHEN o.status = 'waiting_cashier' THEN o.sent_to_cashier_at
                WHEN o.status IN ('accepted_by_cashier', 'processing_payment') THEN o.cashier_accepted_at
                ELSE o.completed_at
            END DESC,
            o.order_id DESC
         LIMIT 80";
    error_log('[DRP_DEBUG] cashier_orders context=' . json_encode($debugContext));
    error_log('[DRP_DEBUG] cashier_orders sql=' . preg_replace('/\s+/', ' ', $sql) . ' params=' . json_encode($params));
    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
    $orderRows = $stmt->fetchAll(PDO::FETCH_ASSOC);
    error_log('[DRP_DEBUG] cashier_orders result_count=' . count($orderRows));

    $completedScopeSql = $isAdmin ? '' : ' AND o.assigned_cashier_id = :completed_cashier_id';
    $salesScopeSql = $isAdmin ? '' : ' AND o.assigned_cashier_id = :sales_cashier_id';
    $summaryStmt = $pdo->prepare(
        "SELECT
            SUM(CASE WHEN o.status = 'waiting_cashier' THEN 1 ELSE 0 END) AS waiting_orders,
            SUM(CASE WHEN o.status IN ('accepted_by_cashier', 'processing_payment', 'processing') THEN 1 ELSE 0 END) AS processing_orders,
            SUM(CASE WHEN o.status IN ('completed', 'paid') AND DATE(COALESCE(o.completed_at, p.paid_at, o.updated_at)) = CURDATE(){$completedScopeSql} THEN 1 ELSE 0 END) AS completed_today,
            SUM(CASE WHEN o.status IN ('completed', 'paid') AND DATE(COALESCE(o.completed_at, p.paid_at, o.updated_at)) = CURDATE(){$salesScopeSql} THEN COALESCE(p.final_amount, p.total_amount, o.total_amount) ELSE 0 END) AS total_sales_today
         FROM sales_orders o
         LEFT JOIN sales_payments p ON p.order_id = o.order_id AND p.payment_status = 'paid'"
    );
    $summaryParams = $isAdmin ? [] : [
        ':completed_cashier_id' => $userId,
        ':sales_cashier_id' => $userId,
    ];
    error_log('[DRP_DEBUG] cashier_orders summary_sql=' . preg_replace('/\s+/', ' ', $summaryStmt->queryString) . ' params=' . json_encode($summaryParams));
    $summaryStmt->execute($summaryParams);
    $summary = $summaryStmt->fetch(PDO::FETCH_ASSOC) ?: [];

    echo json_encode([
        'status' => 'success',
        'data' => [
            'active_tab' => $tab,
            'summary' => [
                'waiting_orders' => (int) ($summary['waiting_orders'] ?? 0),
                'processing_orders' => (int) ($summary['processing_orders'] ?? 0),
                'completed_today' => (int) ($summary['completed_today'] ?? 0),
                'total_sales_today' => cashierMoney($summary['total_sales_today'] ?? 0),
            ],
            'orders' => array_map('cashierOrderRow', $orderRows),
        ],
    ]);
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode([
        'status' => 'error',
        'message' => 'Unable to load cashier orders.',
        'error' => $e->getMessage(),
    ]);
}

?>
