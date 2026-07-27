<?php
require_once '../../config/db_connection.php';
$allowedRoles = ['super_admin', 'admin', 'cashier', 'ro-super-admin', 'ro-admin', 'ro-cashier'];
require_once '../../config/require_auth.php';
require_once 'cashier_helpers.php';

try {
    ensureSalesOrderCashSchema($pdo);
    ensureCashierPaymentDiscountSchema($pdo);
    ensureActivityLogSchema($pdo);

    $userId = cashierCurrentUserId();
    $isAdmin = cashierIsAdminSession();
    $completedScope = $isAdmin ? '' : ' AND o.assigned_cashier_id = :completed_cashier_id';
    $salesScope = $isAdmin ? '' : ' AND o.assigned_cashier_id = :sales_cashier_id';
    $paymentScope = $isAdmin ? '' : ' AND cashier_id = :cashier_id';

    $summaryStmt = $pdo->prepare(
        "SELECT
            SUM(CASE WHEN o.status = 'waiting_cashier' THEN 1 ELSE 0 END) AS waiting_orders,
            SUM(CASE WHEN o.status IN ('accepted_by_cashier', 'processing_payment', 'processing') THEN 1 ELSE 0 END) AS processing_orders,
            SUM(CASE WHEN o.status IN ('completed', 'paid') AND DATE(COALESCE(o.completed_at, p.paid_at, o.updated_at)) = CURDATE(){$completedScope} THEN 1 ELSE 0 END) AS completed_today,
            SUM(CASE WHEN o.status IN ('completed', 'paid') AND DATE(COALESCE(o.completed_at, p.paid_at, o.updated_at)) = CURDATE(){$salesScope} THEN COALESCE(p.final_amount, p.total_amount, o.total_amount) ELSE 0 END) AS total_sales_today
         FROM sales_orders o
         LEFT JOIN sales_payments p ON p.order_id = o.order_id AND p.payment_status = 'paid'"
    );
    $summaryParams = $isAdmin ? [] : [
        ':completed_cashier_id' => $userId,
        ':sales_cashier_id' => $userId,
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
                'cash_collected_today' => $cashCollected,
            ],
            'activities' => $activityStmt->fetchAll(PDO::FETCH_ASSOC),
        ],
    ]);
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode(['status' => 'error', 'message' => 'Unable to load cashier dashboard.', 'error' => $e->getMessage()]);
}

?>
