<?php
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');

require_once '../../config/db_connection.php';

/*
 * Sales Clerk Reports
 * - Sales Clerk only
 * - Uses the logged-in user's sales_clerk_id
 * - Reads from the existing sales_orders, sales_order_items,
 *   sales_payments, and users tables.
 */

$allowedRoles = [
    'salesclerk',
    'sales_clerk',
    'sales clerk',
    'ro-sales-clerk',
    'ro_sales_clerk',
    'ro sales clerk',
    'ro_salesclerk'
];

require_once '../../config/require_auth.php';

try {
    $userId = trim((string)($_SESSION['user_id'] ?? ''));

    // This page/API is exclusively for Sales Clerks.
    if ($userId === '' || (
        !currentSessionHasRbacRole('salesclerk')
        && !currentSessionHasRbacRole('ro_sales_clerk')
    )) {
        http_response_code(403);
        echo json_encode([
            'success' => false,
            'message' => 'Access denied. Sales Clerk Reports is only available to Sales Clerks.'
        ]);
        exit;
    }

    /*
     * Resolve the logged-in Sales Clerk name from the existing users table.
     */
    $clerkStmt = $pdo->prepare("
        SELECT full_name, username
        FROM users
        WHERE user_id = :user_id
        LIMIT 1
    ");
    $clerkStmt->execute([':user_id' => $userId]);
    $clerk = $clerkStmt->fetch(PDO::FETCH_ASSOC);

    if (!$clerk) {
        http_response_code(401);
        echo json_encode([
            'success' => false,
            'message' => 'Sales Clerk account could not be found.'
        ]);
        exit;
    }

    /*
     * Date filter.
     *
     * Completed sales are dated using completed_at when available,
     * with created_at as the fallback.
     */
    $period = strtolower(trim((string)($_GET['period'] ?? 'today')));

    $startDate = null;
    $endDate = null;

    switch ($period) {
        case 'yesterday':
            $startDate = date('Y-m-d', strtotime('-1 day'));
            $endDate = $startDate;
            break;

        case 'week':
            $startDate = date('Y-m-d', strtotime('monday this week'));
            $endDate = date('Y-m-d');
            break;

        case 'month':
            $startDate = date('Y-m-01');
            $endDate = date('Y-m-d');
            break;

        case 'custom':
            $startDate = trim((string)($_GET['start_date'] ?? ''));
            $endDate = trim((string)($_GET['end_date'] ?? ''));

            $validStart = DateTime::createFromFormat('Y-m-d', $startDate);
            $validEnd = DateTime::createFromFormat('Y-m-d', $endDate);

            if (
                !$validStart ||
                !$validEnd ||
                $validStart->format('Y-m-d') !== $startDate ||
                $validEnd->format('Y-m-d') !== $endDate
            ) {
                http_response_code(400);
                echo json_encode([
                    'success' => false,
                    'message' => 'Invalid custom date range.'
                ]);
                exit;
            }

            if ($startDate > $endDate) {
                http_response_code(400);
                echo json_encode([
                    'success' => false,
                    'message' => 'Start date cannot be later than end date.'
                ]);
                exit;
            }
            break;

        case 'today':
        default:
            $period = 'today';
            $startDate = date('Y-m-d');
            $endDate = date('Y-m-d');
            break;
    }

    /*
     * Completed sales only.
     * Use a half-open datetime range:
     * >= start 00:00:00 and < day-after-end 00:00:00
     */
    $endExclusive = date('Y-m-d', strtotime($endDate . ' +1 day'));

    $baseWhere = "
        so.sales_clerk_id = :user_id
        AND so.status = 'completed'
        AND COALESCE(so.completed_at, so.created_at) >= :start_datetime
        AND COALESCE(so.completed_at, so.created_at) < :end_exclusive
        AND EXISTS (
            SELECT 1 FROM sales_payments paid_payment
            WHERE paid_payment.order_id = so.order_id
              AND paid_payment.payment_status = 'paid'
        )
    ";

    $baseParams = [
        ':user_id' => $userId,
        ':start_datetime' => $startDate . ' 00:00:00',
        ':end_exclusive' => $endExclusive . ' 00:00:00'
    ];

    // One row per order, using the same net paid-sales rule as the system
    // reports: completed paid amount less any recorded refunds.
    $paidPaymentsSql = "
        SELECT order_id,
            MAX(CASE WHEN payment_status = 'paid' THEN payment_method END) AS payment_method,
            GREATEST(
                MAX(CASE WHEN payment_status = 'paid' THEN final_amount ELSE 0 END)
                - SUM(CASE WHEN payment_status = 'refunded' THEN final_amount ELSE 0 END),
                0
            ) AS net_final_amount,
            SUM(CASE WHEN payment_status = 'refunded' THEN final_amount ELSE 0 END) AS refund_amount,
            MAX(CASE WHEN payment_status = 'paid' THEN final_amount END) AS paid_final_amount,
            MAX(CASE WHEN payment_status = 'paid' THEN paid_at END) AS paid_at
        FROM sales_payments
        WHERE payment_status IN ('paid', 'refunded')
        GROUP BY order_id
        HAVING SUM(payment_status = 'paid') > 0
    ";

    /*
     * Summary
     */
    $summaryStmt = $pdo->prepare("
        SELECT
            COALESCE(SUM(pay.net_final_amount), 0) AS total_sales,
            COUNT(DISTINCT so.order_id) AS total_transactions,
            COALESCE(SUM(item_counts.items_count), 0) AS items_sold
        FROM sales_orders so
        INNER JOIN ({$paidPaymentsSql}) pay ON pay.order_id = so.order_id
        LEFT JOIN (
            SELECT order_id, SUM(quantity) AS items_count
            FROM sales_order_items
            GROUP BY order_id
        ) item_counts ON item_counts.order_id = so.order_id
        WHERE {$baseWhere}
    ");

    $summaryStmt->execute($baseParams);

    $summary = $summaryStmt->fetch(PDO::FETCH_ASSOC) ?: [
        'total_sales' => 0,
        'total_transactions' => 0,
        'items_sold' => 0
    ];

    $totalSales = (float)$summary['total_sales'];
    $totalTransactions = (int)$summary['total_transactions'];
    $itemsSold = (int)$summary['items_sold'];

    // The schema has cancelled/rejected lifecycle states rather than a
    // separate "voided" status; count those orders once for this clerk.
    $voidedStmt = $pdo->prepare("
        SELECT COUNT(DISTINCT so.order_id)
        FROM sales_orders so
        WHERE so.sales_clerk_id = :user_id
          AND so.status IN ('cancelled', 'rejected')
          AND COALESCE(so.cancelled_at, so.updated_at, so.created_at) >= :start_datetime
          AND COALESCE(so.cancelled_at, so.updated_at, so.created_at) < :end_exclusive
    ");
    $voidedStmt->execute($baseParams);
    $voidedTransactions = (int)$voidedStmt->fetchColumn();

    $summaryData = [
        'total_sales' => $totalSales,
        'total_transactions' => $totalTransactions,
        'items_sold' => $itemsSold,
        'average_transaction' => $totalTransactions > 0
            ? $totalSales / $totalTransactions
            : 0,
        'voided_transactions' => $voidedTransactions
    ];

    /*
     * Payment method summary.
     *
     * Only completed orders with a paid payment record are included.
     */
    $paymentStmt = $pdo->prepare("
        SELECT
            COALESCE(pay.payment_method, 'unknown') AS payment_method,
            COUNT(DISTINCT so.order_id) AS transaction_count,
            COALESCE(SUM(pay.net_final_amount), 0) AS total_amount
        FROM sales_orders so
        INNER JOIN ({$paidPaymentsSql}) pay ON pay.order_id = so.order_id
        WHERE {$baseWhere}
        GROUP BY COALESCE(pay.payment_method, 'unknown')
        ORDER BY total_amount DESC
    ");

    $paymentStmt->execute($baseParams);
    $paymentMethods = $paymentStmt->fetchAll(PDO::FETCH_ASSOC);

    foreach ($paymentMethods as &$payment) {
        $payment['transaction_count'] = (int)$payment['transaction_count'];
        $payment['total_amount'] = (float)$payment['total_amount'];
    }
    unset($payment);

    /*
     * Best-selling products.
     */
    $bestProductsStmt = $pdo->prepare("
        SELECT
            soi.product_id,
            soi.product_name,
            COALESCE(soi.brand_name, '') AS brand_name,
            COALESCE(SUM(soi.quantity), 0) AS quantity_sold,
            COALESCE(SUM(soi.line_total), 0) AS total_sales
        FROM sales_order_items soi
        INNER JOIN sales_orders so
            ON so.order_id = soi.order_id
        INNER JOIN ({$paidPaymentsSql}) pay
            ON pay.order_id = so.order_id
        WHERE {$baseWhere}
        GROUP BY
            soi.product_id,
            soi.product_name,
            soi.brand_name
        ORDER BY quantity_sold DESC, total_sales DESC
        LIMIT 10
    ");

    $bestProductsStmt->execute($baseParams);
    $bestProducts = $bestProductsStmt->fetchAll(PDO::FETCH_ASSOC);

    foreach ($bestProducts as &$product) {
        $product['quantity_sold'] = (int)$product['quantity_sold'];
        $product['total_sales'] = (float)$product['total_sales'];
    }
    unset($product);

    /*
     * Sales trend.
     *
     * Today: grouped by hour.
     * Week / month / custom: grouped by date.
     */
    if ($period === 'today') {
        $trendStmt = $pdo->prepare("
            SELECT
                HOUR(COALESCE(so.completed_at, so.created_at)) AS hour_value,
                COALESCE(SUM(pay.net_final_amount), 0) AS amount
            FROM sales_orders so
            INNER JOIN ({$paidPaymentsSql}) pay ON pay.order_id = so.order_id
            WHERE {$baseWhere}
            GROUP BY HOUR(COALESCE(so.completed_at, so.created_at))
            ORDER BY hour_value
        ");
        $trendStmt->execute($baseParams);

        $trendRows = $trendStmt->fetchAll(PDO::FETCH_ASSOC);

        $salesTrend = [];
        foreach ($trendRows as $row) {
            $hour = (int)$row['hour_value'];
            $salesTrend[] = [
                'label' => date('g A', strtotime(sprintf('%02d:00:00', $hour))),
                'amount' => (float)$row['amount']
            ];
        }

        $trendLabel = 'Sales activity by hour for today';
    } else {
        $trendStmt = $pdo->prepare("
            SELECT
                DATE(COALESCE(so.completed_at, so.created_at)) AS sale_date,
                COALESCE(SUM(pay.net_final_amount), 0) AS amount
            FROM sales_orders so
            INNER JOIN ({$paidPaymentsSql}) pay ON pay.order_id = so.order_id
            WHERE {$baseWhere}
            GROUP BY DATE(COALESCE(so.completed_at, so.created_at))
            ORDER BY sale_date
        ");
        $trendStmt->execute($baseParams);

        $trendRows = $trendStmt->fetchAll(PDO::FETCH_ASSOC);

        $salesTrend = [];
        foreach ($trendRows as $row) {
            $salesTrend[] = [
                'label' => date('M j', strtotime($row['sale_date'])),
                'amount' => (float)$row['amount']
            ];
        }

        $trendLabel = 'Sales activity by day for the selected period';
    }

    /* Transactions are one row per order; cancelled/rejected orders are
     * shown for void tracking but never contribute to sales totals. */
    $page = min(1000000, max(1, (int)($_GET['page'] ?? 1)));
    $pageSize = 50;
    $offset = ($page - 1) * $pageSize;
    $transactionsWhere = "
        so.sales_clerk_id = :user_id
        AND (
            (so.status = 'completed'
                AND pay.order_id IS NOT NULL
                AND COALESCE(so.completed_at, so.created_at) >= :start_datetime
                AND COALESCE(so.completed_at, so.created_at) < :end_exclusive)
            OR
            (so.status IN ('cancelled', 'rejected')
                AND COALESCE(so.cancelled_at, so.updated_at, so.created_at) >= :void_start_datetime
                AND COALESCE(so.cancelled_at, so.updated_at, so.created_at) < :void_end_exclusive)
        )
    ";
    $countStmt = $pdo->prepare("
        SELECT COUNT(*)
        FROM sales_orders so
        LEFT JOIN ({$paidPaymentsSql}) pay ON pay.order_id = so.order_id
        WHERE {$transactionsWhere}
    ");
    $countStmt->execute($baseParams + [
        ':void_start_datetime' => $startDate . ' 00:00:00',
        ':void_end_exclusive' => $endExclusive . ' 00:00:00'
    ]);
    $transactionTotal = (int)$countStmt->fetchColumn();
    $pageCount = max(1, (int)ceil($transactionTotal / $pageSize));
    $page = min($page, $pageCount);
    $offset = ($page - 1) * $pageSize;

    $transactionsStmt = $pdo->prepare("
        SELECT
            so.order_id,
            so.order_no,
            so.customer_name,
            so.sales_clerk_id,
            u.full_name AS sales_clerk_name,
            CASE WHEN so.status = 'completed'
                THEN COALESCE(so.completed_at, so.created_at)
                ELSE COALESCE(so.cancelled_at, so.updated_at, so.created_at)
            END AS transaction_date,
            so.subtotal,
            so.discount,
            so.vat,
            CASE WHEN so.status = 'completed' THEN pay.net_final_amount ELSE so.total_amount END AS total_amount,
            so.status,
            COALESCE(item_counts.items_count, 0) AS items_count,
            COALESCE(pay.payment_method, 'unknown') AS payment_method,
            CASE WHEN pay.refund_amount > 0 THEN 'refunded'
                 WHEN pay.order_id IS NOT NULL THEN 'paid'
                 ELSE 'unpaid' END AS payment_status,
            pay.net_final_amount AS final_amount
        FROM sales_orders so
        LEFT JOIN users u
            ON u.user_id = so.sales_clerk_id
        LEFT JOIN ({$paidPaymentsSql}) pay
            ON pay.order_id = so.order_id
        LEFT JOIN (
            SELECT
                order_id,
                SUM(quantity) AS items_count
            FROM sales_order_items
            GROUP BY order_id
        ) item_counts
            ON item_counts.order_id = so.order_id
        WHERE {$transactionsWhere}
        ORDER BY transaction_date DESC, so.order_id DESC
        LIMIT :limit OFFSET :offset
    ");

    $transactionsStmt->bindValue(':user_id', $userId);
    $transactionsStmt->bindValue(':start_datetime', $startDate . ' 00:00:00');
    $transactionsStmt->bindValue(':end_exclusive', $endExclusive . ' 00:00:00');
    $transactionsStmt->bindValue(':void_start_datetime', $startDate . ' 00:00:00');
    $transactionsStmt->bindValue(':void_end_exclusive', $endExclusive . ' 00:00:00');
    $transactionsStmt->bindValue(':limit', $pageSize, PDO::PARAM_INT);
    $transactionsStmt->bindValue(':offset', $offset, PDO::PARAM_INT);
    $transactionsStmt->execute();
    $transactions = $transactionsStmt->fetchAll(PDO::FETCH_ASSOC);

    foreach ($transactions as &$transaction) {
        $transaction['order_id'] = (int)$transaction['order_id'];
        $transaction['subtotal'] = (float)$transaction['subtotal'];
        $transaction['discount'] = (float)$transaction['discount'];
        $transaction['vat'] = (float)$transaction['vat'];
        $transaction['total_amount'] = (float)$transaction['total_amount'];
        $transaction['final_amount'] = $transaction['final_amount'] !== null
            ? (float)$transaction['final_amount']
            : null;
        $transaction['items_count'] = (int)$transaction['items_count'];

        $transaction['items'] = [];
    }
    unset($transaction);

    /*
     * Load item details for the transactions shown above.
     */
    if (!empty($transactions)) {
        $orderIds = array_column($transactions, 'order_id');

        $placeholders = [];
        $itemParams = [];

        foreach ($orderIds as $index => $orderId) {
            $key = ':order_' . $index;
            $placeholders[] = $key;
            $itemParams[$key] = $orderId;
        }

        $itemsStmt = $pdo->prepare("
            SELECT
                order_id,
                product_id,
                product_name,
                brand_name,
                specification,
                quantity,
                unit_price,
                line_total
            FROM sales_order_items
            WHERE order_id IN (" . implode(',', $placeholders) . ")
            ORDER BY order_id DESC, order_item_id ASC
        ");

        $itemsStmt->execute($itemParams);
        $itemRows = $itemsStmt->fetchAll(PDO::FETCH_ASSOC);

        $itemsByOrder = [];

        foreach ($itemRows as $item) {
            $orderId = (int)$item['order_id'];

            $itemsByOrder[$orderId][] = [
                'product_id' => $item['product_id'],
                'product_name' => $item['product_name'],
                'brand_name' => $item['brand_name'],
                'specification' => $item['specification'],
                'quantity' => (int)$item['quantity'],
                'unit_price' => (float)$item['unit_price'],
                'line_total' => (float)$item['line_total']
            ];
        }

        foreach ($transactions as &$transaction) {
            $orderId = (int)$transaction['order_id'];
            $transaction['items'] = $itemsByOrder[$orderId] ?? [];
            $transaction['transaction_date'] = date(
                'M j, Y g:i A',
                strtotime((string)$transaction['transaction_date'])
            );
        }
        unset($transaction);
    }

    echo json_encode([
        'success' => true,
        'message' => 'Sales Clerk reports loaded.',
        'data' => [
            'clerk_id' => $userId,
            'clerk_name' => $clerk['full_name'] ?: $clerk['username'],
            'period' => $period,
            'start_date' => $startDate,
            'end_date' => $endDate,
            'trend_label' => $trendLabel,
            'summary' => $summaryData,
            'sales_trend' => $salesTrend,
            'payment_methods' => $paymentMethods,
            'best_products' => $bestProducts,
            'transactions' => $transactions,
            'transactions_pagination' => [
                'page' => $page,
                'page_size' => $pageSize,
                'total' => $transactionTotal,
                'pages' => $pageCount
            ]
        ]
    ], JSON_UNESCAPED_UNICODE);

} catch (Throwable $e) {
    error_log('Sales Clerk Reports Error: ' . $e->getMessage());

    http_response_code(500);
    echo json_encode([
        'success' => false,
        'message' => 'Unable to load Sales Clerk reports.'
    ]);
}
?>
