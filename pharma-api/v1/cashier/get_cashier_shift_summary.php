<?php
require_once '../../config/db_connection.php';
$allowedRoles = ['super_admin', 'admin', 'manager', 'Cashier', 'cashier', 'ro-super-admin', 'ro-admin', 'ro-manager', 'ro-cashier', 'ro_super_admin', 'ro_admin', 'ro_manager', 'ro_cashier'];
require_once '../../config/require_auth.php';
require_once 'cashier_helpers.php';

function shiftSummaryDate(string $value): ?string
{
    $value = trim($value);
    if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $value)) {
        return null;
    }

    $date = DateTimeImmutable::createFromFormat('!Y-m-d', $value);
    return $date && $date->format('Y-m-d') === $value ? $value : null;
}

function shiftSummaryEmptyData(
    string $startDate,
    string $endDate,
    bool $isAdmin,
    array $cashiers,
    string $cashierId = '',
    string $cashierName = ''
): array {
    return [
        'selected_date' => $startDate,
        'selected_start_date' => $startDate,
        'selected_end_date' => $endDate,
        'is_single_day' => $startDate === $endDate,
        'selected_cashier_id' => $cashierId,
        'cashier_name' => $cashierName,
        'is_admin_view' => $isAdmin,
        'cashiers' => $isAdmin ? $cashiers : [],
        'has_records' => false,
        'summary' => [
            'total_completed_sales' => 0.0,
            'cash_tendered' => 0.0,
            'change_given' => 0.0,
            'net_cash_sales' => 0.0,
            'cash_paid_sales' => 0.0,
            'cash_variance' => 0.0,
            'completed_transactions' => 0,
            'cancelled_voided_transactions' => 0,
            'refunded_transactions' => 0,
        ],
        'activity' => [
            'first_transaction_time' => null,
            'last_transaction_time' => null,
            'completed_transaction_count' => 0,
            'active_days' => 0,
        ],
        'payment_breakdown' => [],
        'sales_breakdown' => [
            'gross_completed_sales' => 0.0,
            'discounts' => 0.0,
            'refunds' => 0.0,
            'refunds_supported' => true,
            'net_completed_sales' => 0.0,
            'average_transaction_value' => 0.0,
        ],
        'recent_transactions' => [],
    ];
}

try {
    $isAdminView = cashierIsAdminSession();
    $authenticatedUserId = cashierCurrentUserId();
    $today = new DateTimeImmutable('today');

    $startDate = shiftSummaryDate((string) ($_GET['start_date'] ?? $_GET['date'] ?? ''));
    $endDate = shiftSummaryDate((string) ($_GET['end_date'] ?? $_GET['date'] ?? ''));

    if ($startDate === null || $endDate === null) {
        http_response_code(422);
        echo json_encode(['status' => 'error', 'message' => 'Start Date and End Date are required.']);
        exit();
    }

    $startDateObject = new DateTimeImmutable($startDate);
    $endDateObject = new DateTimeImmutable($endDate);

    if ($endDateObject < $startDateObject) {
        http_response_code(422);
        echo json_encode(['status' => 'error', 'message' => 'End Date cannot be earlier than Start Date.']);
        exit();
    }

    if ($startDateObject > $today || $endDateObject > $today) {
        http_response_code(422);
        echo json_encode(['status' => 'error', 'message' => 'Future report dates are not available.']);
        exit();
    }

    $cashierListStmt = $pdo->prepare(
        "SELECT u.user_id, COALESCE(NULLIF(u.full_name, ''), u.username, 'Cashier') AS name
         FROM users u
         WHERE (
                u.role = 'cashier'
                OR (
                    u.role IN ('admin', 'super_admin', 'manager')
                    AND EXISTS (
                        SELECT 1
                        FROM sales_payments activity_payment
                        WHERE activity_payment.cashier_id = u.user_id
                        LIMIT 1
                    )
                )
           )
           AND u.status = 'Active'
           AND COALESCE(u.is_archived, 0) = 0
           AND COALESCE(u.is_deleted, 0) = 0
         ORDER BY name ASC"
    );
    $cashierListStmt->execute();
    $cashiers = array_map(static function (array $row): array {
        return [
            'user_id' => (string) $row['user_id'],
            'name' => cashierDisplay($row['name'] ?? '', 'Cashier'),
        ];
    }, $cashierListStmt->fetchAll(PDO::FETCH_ASSOC));

    $targetCashierId = $isAdminView
        ? trim((string) ($_GET['cashier_id'] ?? ''))
        : $authenticatedUserId;

    if ($isAdminView && $targetCashierId === '') {
        echo json_encode([
            'status' => 'success',
            'data' => shiftSummaryEmptyData($startDate, $endDate, true, $cashiers),
        ]);
        exit();
    }

    $cashierStmt = $pdo->prepare(
        "SELECT user_id, COALESCE(NULLIF(full_name, ''), username, 'Cashier') AS cashier_name
         FROM users
         WHERE user_id = :user_id
           AND (
                role = 'cashier'
                OR (
                    role IN ('admin', 'super_admin', 'manager')
                    AND EXISTS (
                        SELECT 1
                        FROM sales_payments activity_payment
                        WHERE activity_payment.cashier_id = users.user_id
                        LIMIT 1
                    )
                )
           )
           AND status = 'Active'
           AND COALESCE(is_archived, 0) = 0
           AND COALESCE(is_deleted, 0) = 0
         LIMIT 1"
    );
    $cashierStmt->execute([':user_id' => $targetCashierId]);
    $cashier = $cashierStmt->fetch(PDO::FETCH_ASSOC);
    if (!$cashier) {
        http_response_code($isAdminView ? 422 : 403);
        echo json_encode([
            'status' => 'error',
            'message' => $isAdminView ? 'Please select an active cashier.' : 'Cashier access is required.',
        ]);
        exit();
    }

    $cashierName = cashierDisplay($cashier['cashier_name'] ?? '', 'Cashier');
    $start = $startDate . ' 00:00:00';
    $end = $endDateObject->modify('+1 day')->format('Y-m-d') . ' 00:00:00';
    $completedParams = [
        ':cashier_id' => $targetCashierId,
        ':date_start' => $start,
        ':date_end' => $end,
    ];

    $paidPaymentAggregate =
        "SELECT
            order_id,
            MAX(cashier_id) AS cashier_id,
            COALESCE(NULLIF(MAX(payment_method), ''), 'cash') AS payment_method,
            SUM(amount_paid) AS amount_paid,
            SUM(change_amount) AS change_amount,
            MAX(COALESCE(sales_clerk_discount, 0)) AS sales_clerk_discount,
            MAX(COALESCE(cashier_discount_amount, 0)) AS cashier_discount_amount,
            MAX(paid_at) AS paid_at
         FROM sales_payments
         WHERE payment_status = 'paid'
         GROUP BY order_id";

    $summaryStmt = $pdo->prepare(
        "SELECT
            COUNT(DISTINCT o.order_id) AS completed_transactions,
            COALESCE(SUM(o.total_amount), 0) AS total_completed_sales,
            COALESCE(SUM(o.total_amount + COALESCE(o.discount, 0) + COALESCE(p.cashier_discount_amount, 0)), 0) AS gross_completed_sales,
            COALESCE(SUM(COALESCE(o.discount, 0) + COALESCE(p.cashier_discount_amount, 0)), 0) AS discounts,
            COALESCE(SUM(CASE WHEN LOWER(p.payment_method) = 'cash' THEN p.amount_paid ELSE 0 END), 0) AS cash_tendered,
            COALESCE(SUM(CASE WHEN LOWER(p.payment_method) = 'cash' THEN p.change_amount ELSE 0 END), 0) AS change_given,
            COALESCE(SUM(CASE WHEN LOWER(p.payment_method) = 'cash' THEN o.total_amount ELSE 0 END), 0) AS cash_paid_sales,
            MIN(o.completed_at) AS first_transaction_time,
            MAX(o.completed_at) AS last_transaction_time,
            COUNT(DISTINCT DATE(o.completed_at)) AS active_days
         FROM sales_orders o
         INNER JOIN ($paidPaymentAggregate) p ON p.order_id = o.order_id
         WHERE o.status = 'completed'
           AND o.assigned_cashier_id = :cashier_id
           AND o.completed_at >= :date_start
           AND o.completed_at < :date_end"
    );
    $summaryStmt->execute($completedParams);
    $summary = $summaryStmt->fetch(PDO::FETCH_ASSOC) ?: [];

    $cancelStmt = $pdo->prepare(
        "SELECT COUNT(DISTINCT o.order_id)
         FROM sales_orders o
         WHERE o.status IN ('cancelled', 'rejected')
           AND (o.assigned_cashier_id = :assigned_cashier_id OR o.cancelled_by = :cancelled_by)
           AND COALESCE(o.cancelled_at, o.updated_at) >= :date_start
           AND COALESCE(o.cancelled_at, o.updated_at) < :date_end"
    );
    $cancelStmt->execute([
        ':assigned_cashier_id' => $targetCashierId,
        ':cancelled_by' => $targetCashierId,
        ':date_start' => $start,
        ':date_end' => $end,
    ]);
    $cancelledVoided = (int) $cancelStmt->fetchColumn();

    $refundStmt = $pdo->prepare(
        "SELECT
            COUNT(DISTINCT p.order_id) AS refunded_transactions,
            COALESCE(SUM(COALESCE(NULLIF(p.final_amount, 0), p.total_amount)), 0) AS refunded_amount
         FROM sales_payments p
         INNER JOIN sales_orders o ON o.order_id = p.order_id
         WHERE p.payment_status = 'refunded'
           AND p.cashier_id = :cashier_id
           AND COALESCE(p.paid_at, p.created_at) >= :date_start
           AND COALESCE(p.paid_at, p.created_at) < :date_end"
    );
    $refundStmt->execute($completedParams);
    $refundRow = $refundStmt->fetch(PDO::FETCH_ASSOC) ?: [];
    $refundedTransactions = (int) ($refundRow['refunded_transactions'] ?? 0);
    $refunds = cashierMoney($refundRow['refunded_amount'] ?? 0);

    $paymentStmt = $pdo->prepare(
        "SELECT
            p.payment_method,
            COUNT(DISTINCT o.order_id) AS transaction_count,
            COALESCE(SUM(o.total_amount), 0) AS amount
         FROM sales_orders o
         INNER JOIN ($paidPaymentAggregate) p ON p.order_id = o.order_id
         WHERE o.status = 'completed'
           AND o.assigned_cashier_id = :cashier_id
           AND o.completed_at >= :date_start
           AND o.completed_at < :date_end
         GROUP BY p.payment_method
         ORDER BY p.payment_method ASC"
    );
    $paymentStmt->execute($completedParams);
    $paymentBreakdown = array_map(static function (array $row): array {
        return [
            'payment_method' => cashierDisplay($row['payment_method'] ?? '', 'cash'),
            'transaction_count' => (int) ($row['transaction_count'] ?? 0),
            'amount' => cashierMoney($row['amount'] ?? 0),
        ];
    }, $paymentStmt->fetchAll(PDO::FETCH_ASSOC));

    $recentStmt = $pdo->prepare(
        "SELECT
            o.order_id,
            o.order_no,
            COALESCE(NULLIF(o.customer_name, ''), 'Walk-in Customer') AS customer_name,
            o.total_amount,
            o.status,
            o.completed_at,
            p.payment_method,
            r.receipt_no
         FROM sales_orders o
         INNER JOIN ($paidPaymentAggregate) p ON p.order_id = o.order_id
         LEFT JOIN sales_receipts r ON r.order_id = o.order_id
         WHERE o.status = 'completed'
           AND o.assigned_cashier_id = :cashier_id
           AND o.completed_at >= :date_start
           AND o.completed_at < :date_end
         ORDER BY o.completed_at DESC, o.order_id DESC
         LIMIT 10"
    );
    $recentStmt->execute($completedParams);
    $recentTransactions = array_map(static function (array $row) use ($cashierName): array {
        return [
            'order_id' => (int) $row['order_id'],
            'receipt_no' => cashierDisplay($row['receipt_no'] ?? '', '-'),
            'order_no' => cashierDisplay($row['order_no'] ?? '', (string) $row['order_id']),
            'cashier_name' => $cashierName,
            'customer_name' => cashierDisplay($row['customer_name'] ?? '', 'Walk-in Customer'),
            'payment_method' => cashierDisplay($row['payment_method'] ?? '', 'cash'),
            'total_amount' => cashierMoney($row['total_amount'] ?? 0),
            'status_code' => (string) ($row['status'] ?? ''),
            'status' => salesStatusLabel((string) ($row['status'] ?? '')),
            'completed_at' => $row['completed_at'] ?? null,
        ];
    }, $recentStmt->fetchAll(PDO::FETCH_ASSOC));

    $completedTransactions = (int) ($summary['completed_transactions'] ?? 0);
    $completedSales = cashierMoney($summary['total_completed_sales'] ?? 0);
    $cashTendered = cashierMoney($summary['cash_tendered'] ?? 0);
    $changeGiven = cashierMoney($summary['change_given'] ?? 0);
    $netCashSales = cashierMoney($cashTendered - $changeGiven);
    $cashPaidSales = cashierMoney($summary['cash_paid_sales'] ?? 0);

    $data = shiftSummaryEmptyData($startDate, $endDate, $isAdminView, $cashiers, $targetCashierId, $cashierName);
    $data['has_records'] = $completedTransactions > 0 || $cancelledVoided > 0 || $refundedTransactions > 0 || $refunds > 0;
    $data['summary'] = [
        'total_completed_sales' => $completedSales,
        'cash_tendered' => $cashTendered,
        'change_given' => $changeGiven,
        'net_cash_sales' => $netCashSales,
        'cash_paid_sales' => $cashPaidSales,
        'cash_variance' => cashierMoney($netCashSales - $cashPaidSales),
        'completed_transactions' => $completedTransactions,
        'cancelled_voided_transactions' => $cancelledVoided,
        'refunded_transactions' => $refundedTransactions,
    ];
    $data['activity'] = [
        'first_transaction_time' => $summary['first_transaction_time'] ?? null,
        'last_transaction_time' => $summary['last_transaction_time'] ?? null,
        'completed_transaction_count' => $completedTransactions,
        'active_days' => (int) ($summary['active_days'] ?? 0),
    ];
    $data['payment_breakdown'] = $paymentBreakdown;
    $data['sales_breakdown'] = [
        'gross_completed_sales' => cashierMoney($summary['gross_completed_sales'] ?? 0),
        'discounts' => cashierMoney($summary['discounts'] ?? 0),
        'refunds' => $refunds,
        'refunds_supported' => true,
        'net_completed_sales' => $completedSales,
        'average_transaction_value' => $completedTransactions > 0
            ? cashierMoney($completedSales / $completedTransactions)
            : 0.0,
    ];
    $data['recent_transactions'] = $recentTransactions;

    $settingsStmt = $pdo->query("SELECT pharmacy_name, pharmacy_address, timezone FROM system_settings ORDER BY setting_id ASC LIMIT 1");
    $settings = $settingsStmt->fetch(PDO::FETCH_ASSOC) ?: [];
    $data['pharmacy'] = [
        'name' => cashierDisplay($settings['pharmacy_name'] ?? '', 'Dr. R Pharmacy'),
        'address' => cashierDisplay($settings['pharmacy_address'] ?? '', ''),
        'timezone' => cashierDisplay($settings['timezone'] ?? '', 'Asia/Manila'),
    ];

    echo json_encode(['status' => 'success', 'data' => $data]);
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode(['status' => 'error', 'message' => 'The shift summary could not be loaded. Please try again.']);
}

?>
