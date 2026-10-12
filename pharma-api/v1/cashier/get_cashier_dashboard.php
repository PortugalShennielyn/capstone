<?php
require_once '../../config/db_connection.php';
$allowedRoles = ['super_admin', 'admin', 'cashier', 'ro-super-admin', 'ro-admin', 'ro-cashier'];
require_once '../../config/require_auth.php';
require_once 'cashier_helpers.php';

try {
    $userId = cashierCurrentUserId();
    $isAdmin = cashierIsAdminSession();
    $today = (string) $pdo->query('SELECT CURDATE()')->fetchColumn();
    $todayDate = DateTimeImmutable::createFromFormat('!Y-m-d', $today);
    if (!$todayDate || $todayDate->format('Y-m-d') !== $today) {
        throw new RuntimeException('Unable to determine the business date.');
    }

    $tomorrow = $todayDate->modify('+1 day')->format('Y-m-d');
    $weekStart = $todayDate->modify('-' . ((int) $todayDate->format('N') - 1) . ' days')->format('Y-m-d');
    $monthStart = $todayDate->modify('first day of this month')->format('Y-m-d');
    $scope = $isAdmin ? '' : ' AND COALESCE(o.assigned_cashier_id, p.cashier_id) = :cashier_id';
    $paymentScope = $isAdmin ? '' : ' AND COALESCE(o.assigned_cashier_id, p.cashier_id) = :cashier_id';

    $paidPayments = "SELECT order_id,
                            MAX(CASE WHEN payment_status = 'paid' THEN cashier_id END) AS cashier_id,
                            MAX(CASE WHEN payment_status = 'paid' THEN payment_method END) AS payment_method,
                            MAX(CASE WHEN payment_status = 'paid' THEN amount_paid END) AS amount_paid,
                            MAX(CASE WHEN payment_status = 'paid' THEN change_amount END) AS change_amount,
                            GREATEST(
                                MAX(CASE WHEN payment_status = 'paid' THEN COALESCE(NULLIF(final_amount, 0), total_amount) ELSE 0 END)
                                - SUM(CASE WHEN payment_status = 'refunded' THEN COALESCE(NULLIF(final_amount, 0), total_amount) ELSE 0 END),
                                0
                            ) AS net_sales,
                            GREATEST(
                                MAX(CASE WHEN payment_status = 'paid' AND LOWER(payment_method) = 'cash' THEN amount_paid - change_amount ELSE 0 END)
                                - SUM(CASE WHEN payment_status = 'refunded' AND LOWER(payment_method) = 'cash' THEN COALESCE(NULLIF(final_amount, 0), total_amount) ELSE 0 END),
                                0
                            ) AS cash_received
                     FROM sales_payments
                     WHERE payment_status IN ('paid', 'refunded')
                     GROUP BY order_id
                     HAVING SUM(payment_status = 'paid') > 0";

    $summaryStmt = $pdo->prepare(
        "SELECT COUNT(DISTINCT o.order_id) AS transactions,
                COALESCE(SUM(p.net_sales), 0) AS total_sales,
                COALESCE(SUM(CASE WHEN p.net_sales > 0 THEN COALESCE(items.units_sold, 0) ELSE 0 END), 0) AS units_sold,
                COALESCE(SUM(p.cash_received), 0) AS cash_received
         FROM sales_orders o
         INNER JOIN ({$paidPayments}) p ON p.order_id = o.order_id
         LEFT JOIN (
             SELECT order_id, SUM(quantity) AS units_sold
             FROM sales_order_items
             GROUP BY order_id
         ) items ON items.order_id = o.order_id
         WHERE o.status = 'completed'
           AND o.completed_at >= :day_start
           AND o.completed_at < :day_end{$scope}"
    );
    $summaryParams = [':day_start' => $today . ' 00:00:00', ':day_end' => $tomorrow . ' 00:00:00'];
    if (!$isAdmin) $summaryParams[':cashier_id'] = $userId;
    $summaryStmt->execute($summaryParams);
    $summaryRow = $summaryStmt->fetch(PDO::FETCH_ASSOC) ?: [];
    $totalSales = cashierMoney($summaryRow['total_sales'] ?? 0);
    $transactions = (int) ($summaryRow['transactions'] ?? 0);
    $unitsSold = (int) ($summaryRow['units_sold'] ?? 0);
    $cashReceived = cashierMoney($summaryRow['cash_received'] ?? 0);

    $queueStmt = $pdo->prepare(
        "SELECT
            COALESCE(SUM(status = 'waiting_cashier'), 0) AS waiting_orders,
            COALESCE(SUM(status IN ('accepted_by_cashier', 'processing_payment') AND (:is_admin = 1 OR assigned_cashier_id = :cashier_id)), 0) AS processing_orders
         FROM sales_orders
         WHERE status IN ('waiting_cashier', 'accepted_by_cashier', 'processing_payment')"
    );
    $queueStmt->execute([':is_admin' => $isAdmin ? 1 : 0, ':cashier_id' => $userId]);
    $queue = $queueStmt->fetch(PDO::FETCH_ASSOC) ?: [];

    $returnsStmt = $pdo->prepare(
        "SELECT COUNT(DISTINCT p.payment_id)
         FROM sales_payments p
         INNER JOIN sales_orders o ON o.order_id = p.order_id
         WHERE p.payment_status = 'refunded'
           AND p.created_at >= :day_start
           AND p.created_at < :day_end{$paymentScope}"
    );
    $returnsParams = [':day_start' => $today . ' 00:00:00', ':day_end' => $tomorrow . ' 00:00:00'];
    if (!$isAdmin) $returnsParams[':cashier_id'] = $userId;
    $returnsStmt->execute($returnsParams);
    $returnsToday = (int) $returnsStmt->fetchColumn();

    $recentStmt = $pdo->prepare(
        "SELECT o.order_id, o.order_no,
                COALESCE(NULLIF(o.customer_name, ''), 'Walk-in Customer') AS customer_name,
                p.net_sales AS amount, p.payment_method, o.completed_at,
                COALESCE(r.receipt_no, o.order_no) AS receipt_no,
                'Completed' AS status
         FROM sales_orders o
         INNER JOIN ({$paidPayments}) p ON p.order_id = o.order_id
         LEFT JOIN (
             SELECT order_id, MAX(receipt_no) AS receipt_no
             FROM sales_receipts
             GROUP BY order_id
         ) r ON r.order_id = o.order_id
         WHERE o.status = 'completed'
           AND o.completed_at >= :day_start
           AND o.completed_at < :day_end{$scope}
         ORDER BY o.completed_at DESC, o.order_id DESC
         LIMIT 8"
    );
    $recentParams = [':day_start' => $today . ' 00:00:00', ':day_end' => $tomorrow . ' 00:00:00'];
    if (!$isAdmin) $recentParams[':cashier_id'] = $userId;
    $recentStmt->execute($recentParams);

    $chartStmt = $pdo->prepare(
        "SELECT DATE(o.completed_at) AS sales_date,
                HOUR(o.completed_at) AS sales_hour,
                COALESCE(SUM(p.net_sales), 0) AS amount
         FROM sales_orders o
         INNER JOIN ({$paidPayments}) p ON p.order_id = o.order_id
         WHERE o.status = 'completed'
           AND o.completed_at >= :range_start
           AND o.completed_at < :range_end{$scope}
         GROUP BY DATE(o.completed_at), HOUR(o.completed_at)
         ORDER BY sales_date, sales_hour"
    );
    $chartParams = [':range_start' => $monthStart . ' 00:00:00', ':range_end' => $tomorrow . ' 00:00:00'];
    if (!$isAdmin) $chartParams[':cashier_id'] = $userId;
    $chartStmt->execute($chartParams);
    $todaySeries = [];
    $weekSeries = [];
    $monthSeries = [];
    foreach ($chartStmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
        $date = (string) $row['sales_date'];
        $amount = cashierMoney($row['amount'] ?? 0);
        $hour = (string) (int) $row['sales_hour'];
        $monthSeries[$date] = cashierMoney(($monthSeries[$date] ?? 0) + $amount);
        if ($date >= $weekStart) {
            $weekSeries[$date] = cashierMoney(($weekSeries[$date] ?? 0) + $amount);
        }
        if ($date === $today) {
            $todaySeries[$hour] = cashierMoney(($todaySeries[$hour] ?? 0) + $amount);
        }
    }

    $averageSale = $transactions > 0 ? cashierMoney($totalSales / $transactions) : 0.0;
    echo json_encode([
        'status' => 'success',
        'data' => [
            'business_date' => $today,
            'summary' => [
                'waiting_orders' => (int) ($queue['waiting_orders'] ?? 0),
                'processing_orders' => (int) ($queue['processing_orders'] ?? 0),
                'total_sales_today' => $totalSales,
                'completed_today' => $transactions,
                'transactions_today' => $transactions,
                'units_sold_today' => $unitsSold,
                'cash_received_today' => $cashReceived,
                'cash_collected_today' => $cashReceived,
                'returns_today' => $returnsToday,
                'average_sale_today' => $averageSale,
            ],
            'recent_transactions' => $recentStmt->fetchAll(PDO::FETCH_ASSOC),
            'charts' => [
                'today' => array_map(static fn(string $hour, float $amount): array => ['bucket' => $hour, 'amount' => $amount], array_keys($todaySeries), array_values($todaySeries)),
                'week' => array_map(static fn(string $date, float $amount): array => ['bucket' => $date, 'amount' => $amount], array_keys($weekSeries), array_values($weekSeries)),
                'month' => array_map(static fn(string $date, float $amount): array => ['bucket' => $date, 'amount' => $amount], array_keys($monthSeries), array_values($monthSeries)),
            ],
        ],
    ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
} catch (Throwable $e) {
    error_log('Cashier dashboard query failed: ' . $e->getMessage());
    http_response_code(500);
    echo json_encode(['status' => 'error', 'message' => 'Unable to load cashier dashboard. Please retry.']);
}
?>
