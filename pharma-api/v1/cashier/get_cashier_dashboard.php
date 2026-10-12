<?php
require_once '../../config/db_connection.php';
$allowedRoles = ['super_admin', 'admin', 'cashier', 'ro-super-admin', 'ro-admin', 'ro-cashier'];
require_once '../../config/require_auth.php';
require_once 'cashier_helpers.php';

try {
    $userId = cashierCurrentUserId();
    $isAdmin = cashierIsAdminSession();
    $completedScope = $isAdmin ? '' : ' AND o.assigned_cashier_id = :completed_cashier_id';
    $salesScope = $isAdmin ? '' : ' AND o.assigned_cashier_id = :sales_cashier_id';
    $unitsScope = $isAdmin ? '' : ' AND o.assigned_cashier_id = :units_cashier_id';
    $paymentScope = $isAdmin ? '' : ' AND cashier_id = :cashier_id';
    $paidPaymentAggregate = "SELECT order_id, MAX(payment_method) AS payment_method,
            SUM(amount_paid) AS amount_paid, SUM(change_amount) AS change_amount,
            MAX(final_amount) AS final_amount, MAX(total_amount) AS total_amount,
            MAX(paid_at) AS paid_at
         FROM sales_payments WHERE payment_status = 'paid' GROUP BY order_id";

    $summaryStmt = $pdo->prepare(
        "SELECT
            SUM(CASE WHEN o.status = 'waiting_cashier' THEN 1 ELSE 0 END) AS waiting_orders,
            SUM(CASE WHEN o.status IN ('accepted_by_cashier', 'processing_payment', 'processing') THEN 1 ELSE 0 END) AS processing_orders,
            SUM(CASE WHEN o.status IN ('completed', 'paid') AND DATE(COALESCE(o.completed_at, p.paid_at, o.updated_at)) = CURDATE(){$completedScope} THEN 1 ELSE 0 END) AS completed_today,
                SUM(CASE WHEN o.status IN ('completed', 'paid') AND DATE(COALESCE(o.completed_at, p.paid_at, o.updated_at)) = CURDATE(){$salesScope} THEN COALESCE(p.final_amount, p.total_amount, o.total_amount) ELSE 0 END) AS total_sales_today,
                SUM(CASE WHEN o.status IN ('completed', 'paid') AND DATE(COALESCE(o.completed_at, p.paid_at, o.updated_at)) = CURDATE(){$unitsScope} THEN COALESCE(items.total_units, 0) ELSE 0 END) AS units_sold_today
         FROM sales_orders o
            LEFT JOIN ($paidPaymentAggregate) p ON p.order_id = o.order_id
            LEFT JOIN (
                SELECT order_id, SUM(COALESCE(NULLIF(selected_quantity, 0), quantity)) AS total_units
                FROM sales_order_items GROUP BY order_id
            ) items ON items.order_id = o.order_id"
    );
    $summaryParams = $isAdmin ? [] : [
        ':completed_cashier_id' => $userId,
        ':sales_cashier_id' => $userId,
          ':units_cashier_id' => $userId,
    ];
    $summaryStmt->execute($summaryParams);
    $summary = $summaryStmt->fetch(PDO::FETCH_ASSOC) ?: [];

    $cashStmt = $pdo->prepare(
        "SELECT COALESCE(SUM(amount_paid), 0)
         FROM sales_payments
         WHERE payment_status = 'paid'
           AND DATE(paid_at) = CURDATE(){$paymentScope}"
    );
    $cashStmt->execute($isAdmin ? [] : [':cashier_id' => $userId]);
    $cashCollected = cashierMoney($cashStmt->fetchColumn());

        $cashReceivedStmt = $pdo->prepare(
                "SELECT COALESCE(SUM(amount_paid), 0)
                 FROM sales_payments
                 WHERE payment_status = 'paid'
                     AND LOWER(payment_method) = 'cash'
                     AND DATE(paid_at) = CURDATE(){$paymentScope}"
        );
        $cashReceivedStmt->execute($isAdmin ? [] : [':cashier_id' => $userId]);
        $cashReceived = cashierMoney($cashReceivedStmt->fetchColumn());

        $refundStmt = $pdo->prepare(
                "SELECT COUNT(DISTINCT order_id)
                 FROM sales_payments
                 WHERE payment_status = 'refunded'
                     AND DATE(COALESCE(paid_at, created_at)) = CURDATE(){$paymentScope}"
        );
        $refundStmt->execute($isAdmin ? [] : [':cashier_id' => $userId]);
        $returnsToday = (int) $refundStmt->fetchColumn();

        $recentStmt = $pdo->prepare(
                "SELECT o.order_id, o.order_no,
                        COALESCE(NULLIF(o.customer_name, ''), 'Walk-in Customer') AS customer_name,
                        COALESCE(p.final_amount, p.total_amount, o.total_amount) AS amount,
                        p.payment_method, o.completed_at, o.status, r.receipt_no
                 FROM sales_orders o
                 INNER JOIN ($paidPaymentAggregate) p ON p.order_id = o.order_id
                 LEFT JOIN sales_receipts r ON r.order_id = o.order_id
                 WHERE o.status IN ('completed', 'paid'){$salesScope}
                 ORDER BY COALESCE(o.completed_at, p.paid_at) DESC, o.order_id DESC
                 LIMIT 8"
        );
        $recentStmt->execute($isAdmin ? [] : [':sales_cashier_id' => $userId]);

        $todayChartStmt = $pdo->prepare(
                "SELECT HOUR(o.completed_at) AS bucket,
                        SUM(COALESCE(p.final_amount, p.total_amount, o.total_amount)) AS amount
                 FROM sales_orders o
                 INNER JOIN ($paidPaymentAggregate) p ON p.order_id = o.order_id
                 WHERE o.status IN ('completed', 'paid') AND DATE(o.completed_at) = CURDATE(){$salesScope}
                 GROUP BY HOUR(o.completed_at) ORDER BY bucket"
        );
        $todayChartStmt->execute($isAdmin ? [] : [':sales_cashier_id' => $userId]);

        $weekChartStmt = $pdo->prepare(
                "SELECT DATE(o.completed_at) AS bucket,
                        SUM(COALESCE(p.final_amount, p.total_amount, o.total_amount)) AS amount
                 FROM sales_orders o
                 INNER JOIN ($paidPaymentAggregate) p ON p.order_id = o.order_id
                 WHERE o.status IN ('completed', 'paid')
                     AND o.completed_at >= DATE_SUB(CURDATE(), INTERVAL WEEKDAY(CURDATE()) DAY)
                     AND o.completed_at < DATE_ADD(DATE_SUB(CURDATE(), INTERVAL WEEKDAY(CURDATE()) DAY), INTERVAL 7 DAY){$salesScope}
                 GROUP BY DATE(o.completed_at) ORDER BY bucket"
        );
        $weekChartStmt->execute($isAdmin ? [] : [':sales_cashier_id' => $userId]);

        $monthChartStmt = $pdo->prepare(
                "SELECT DATE(o.completed_at) AS bucket,
                        SUM(COALESCE(p.final_amount, p.total_amount, o.total_amount)) AS amount
                 FROM sales_orders o
                 INNER JOIN ($paidPaymentAggregate) p ON p.order_id = o.order_id
                 WHERE o.status IN ('completed', 'paid')
                     AND o.completed_at >= DATE_FORMAT(CURDATE(), '%Y-%m-01')
                     AND o.completed_at < DATE_ADD(DATE_FORMAT(CURDATE(), '%Y-%m-01'), INTERVAL 1 MONTH){$salesScope}
                 GROUP BY DATE(o.completed_at) ORDER BY bucket"
        );
        $monthChartStmt->execute($isAdmin ? [] : [':sales_cashier_id' => $userId]);

    $activityWhere = $isAdmin ? "module = 'Cashier'" : "module = 'Cashier' AND user_id = :user_id";
    $activityStmt = $pdo->prepare(
        "SELECT activity_id, module, action, description, reference_id, created_at
         FROM activity_logs
         WHERE {$activityWhere}
         ORDER BY created_at DESC
         LIMIT 8"
    );
    $activityStmt->execute($isAdmin ? [] : [':user_id' => $userId]);

    echo json_encode([
        'status' => 'success',
        'data' => [
            'summary' => [
                'waiting_orders' => (int) ($summary['waiting_orders'] ?? 0),
                'processing_orders' => (int) ($summary['processing_orders'] ?? 0),
                'completed_today' => (int) ($summary['completed_today'] ?? 0),
                'total_sales_today' => cashierMoney($summary['total_sales_today'] ?? 0),
                'units_sold_today' => (int) ($summary['units_sold_today'] ?? 0),
                'average_sale_today' => (int) ($summary['completed_today'] ?? 0) > 0
                    ? cashierMoney(($summary['total_sales_today'] ?? 0) / (int) $summary['completed_today'])
                    : 0.0,
                'cash_collected_today' => $cashCollected,
                'cash_received_today' => $cashReceived,
                'returns_today' => $returnsToday,
            ],
            'activities' => $activityStmt->fetchAll(PDO::FETCH_ASSOC),
            'recent_transactions' => $recentStmt->fetchAll(PDO::FETCH_ASSOC),
            'charts' => [
                'today' => $todayChartStmt->fetchAll(PDO::FETCH_ASSOC),
                'week' => $weekChartStmt->fetchAll(PDO::FETCH_ASSOC),
                'month' => $monthChartStmt->fetchAll(PDO::FETCH_ASSOC),
            ],
        ],
    ]);
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode(['status' => 'error', 'message' => 'Unable to load cashier dashboard.', 'error' => $e->getMessage()]);
}

?>
