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
        'active_shift' => null,
        'shifts' => [],
        'can_manage_shift' => false,
        'reconciliation' => null,
        'has_records' => false,
        'summary' => [
            'total_completed_sales' => 0.0,
            'cash_tendered' => 0.0,
            'change_given' => 0.0,
            'net_cash_sales' => 0.0,
            'cash_paid_sales' => 0.0,
            'gcash_paid_sales' => 0.0,
            'cash_refunds' => 0.0,
            'gcash_refunds' => 0.0,
            'net_cash_collected' => 0.0,
            'net_gcash_collected' => 0.0,
            'total_payments_collected' => 0.0,
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
    ensureCashierShiftSchema($pdo);
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
                    AND (
                        EXISTS (
                            SELECT 1
                            FROM sales_payments activity_payment
                            WHERE activity_payment.cashier_id = u.user_id
                            LIMIT 1
                        )
                        OR EXISTS (
                            SELECT 1
                            FROM cashier_shifts activity_shift
                            WHERE activity_shift.cashier_id = u.user_id
                            LIMIT 1
                        )
                    )
                )
                OR (u.user_id = :authenticated_user_id AND u.role IN ('admin', 'super_admin'))
           )
           AND u.status = 'Active'
           AND COALESCE(u.is_archived, 0) = 0
           AND COALESCE(u.is_deleted, 0) = 0
         ORDER BY name ASC"
    );
    $cashierListStmt->execute([':authenticated_user_id' => $authenticatedUserId]);
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
                     AND (
                         EXISTS (
                             SELECT 1
                             FROM sales_payments activity_payment
                             WHERE activity_payment.cashier_id = users.user_id
                             LIMIT 1
                         )
                         OR EXISTS (
                             SELECT 1
                             FROM cashier_shifts activity_shift
                             WHERE activity_shift.cashier_id = users.user_id
                             LIMIT 1
                         )
                     )
                     OR (user_id = :authenticated_user_id AND role IN ('admin', 'super_admin'))
                )
           )
           AND status = 'Active'
           AND COALESCE(is_archived, 0) = 0
           AND COALESCE(is_deleted, 0) = 0
         LIMIT 1"
    );
    $cashierStmt->execute([
        ':user_id' => $targetCashierId,
        ':authenticated_user_id' => $authenticatedUserId,
    ]);
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
    $activeShiftStmt = $pdo->prepare(
        "SELECT shift_id, status, opening_cash, opened_at
         FROM cashier_shifts
         WHERE active_cashier_id = :cashier_id AND status = 'open'
         LIMIT 1"
    );
    $activeShiftStmt->execute([':cashier_id' => $targetCashierId]);
    $activeShift = $activeShiftStmt->fetch(PDO::FETCH_ASSOC) ?: null;
    $shiftStmt = $pdo->prepare(
        "SELECT s.shift_id, s.status, s.opening_cash, s.expected_cash, s.actual_cash,
                s.cash_variance, s.variance_remarks, s.opened_at, s.closed_at,
                COALESCE(t.completed_transactions, 0) AS completed_transactions,
                COALESCE(t.cash_sales, 0) AS cash_sales,
                COALESCE(t.gcash_sales, 0) AS gcash_sales,
                COALESCE(t.cash_refunds, 0) AS cash_refunds,
                COALESCE(t.gcash_refunds, 0) AS gcash_refunds
         FROM cashier_shifts s
         LEFT JOIN (
            SELECT st.shift_id,
                   COUNT(DISTINCT o.order_id) AS completed_transactions,
                   SUM(CASE WHEN LOWER(p.payment_method) = 'cash' THEN COALESCE(NULLIF(p.final_amount, 0), p.total_amount) ELSE 0 END) AS cash_sales,
                   SUM(CASE WHEN LOWER(p.payment_method) = 'gcash' THEN COALESCE(NULLIF(p.final_amount, 0), p.total_amount) ELSE 0 END) AS gcash_sales,
                   SUM(CASE WHEN LOWER(p.payment_method) = 'cash' AND p.payment_status = 'refunded' THEN COALESCE(NULLIF(p.final_amount, 0), p.total_amount) ELSE 0 END) AS cash_refunds,
                   SUM(CASE WHEN LOWER(p.payment_method) = 'gcash' AND p.payment_status = 'refunded' THEN COALESCE(NULLIF(p.final_amount, 0), p.total_amount) ELSE 0 END) AS gcash_refunds
            FROM cashier_shift_transactions st
            INNER JOIN sales_orders o ON o.order_id = st.order_id AND o.status = 'completed'
            INNER JOIN sales_payments p ON p.order_id = o.order_id
            WHERE p.payment_status IN ('paid', 'refunded')
              AND LOWER(p.payment_method) IN ('cash', 'gcash')
              AND st.shift_id IN (
                  SELECT scoped_shift.shift_id
                  FROM cashier_shifts scoped_shift
                  WHERE scoped_shift.cashier_id = :totals_cashier_id
                    AND ((scoped_shift.opened_at >= :totals_start AND scoped_shift.opened_at < :totals_end) OR scoped_shift.status = 'open')
              )
            GROUP BY st.shift_id
         ) t ON t.shift_id = s.shift_id
         WHERE s.cashier_id = :cashier_id
           AND ((s.opened_at >= :date_start AND s.opened_at < :date_end) OR s.status = 'open')
         ORDER BY s.opened_at DESC, s.shift_id DESC"
    );
    $shiftStmt->execute([
        ':cashier_id' => $targetCashierId,
        ':date_start' => $start,
        ':date_end' => $end,
        ':totals_cashier_id' => $targetCashierId,
        ':totals_start' => $start,
        ':totals_end' => $end,
    ]);
    $shiftRows = $shiftStmt->fetchAll(PDO::FETCH_ASSOC);
    $shifts = array_map(static function (array $row): array {
        $cashSales = cashierMoney($row['cash_sales'] ?? 0);
        $gcashSales = cashierMoney($row['gcash_sales'] ?? 0);
        $cashRefunds = cashierMoney($row['cash_refunds'] ?? 0);
        $gcashRefunds = cashierMoney($row['gcash_refunds'] ?? 0);
        $netCash = cashierMoney($cashSales - $cashRefunds);
        $netGcash = cashierMoney($gcashSales - $gcashRefunds);
        return [
            'shift_id' => (int) $row['shift_id'],
            'status' => (string) $row['status'],
            'opening_cash' => cashierMoney($row['opening_cash']),
            'expected_cash' => $row['expected_cash'] === null ? null : cashierMoney($row['expected_cash']),
            'actual_cash' => $row['actual_cash'] === null ? null : cashierMoney($row['actual_cash']),
            'cash_variance' => $row['cash_variance'] === null ? null : cashierMoney($row['cash_variance']),
            'variance_remarks' => (string) ($row['variance_remarks'] ?? ''),
            'opened_at' => $row['opened_at'],
            'closed_at' => $row['closed_at'],
            'completed_transactions' => (int) $row['completed_transactions'],
            'cash_paid_sales' => $cashSales,
            'gcash_paid_sales' => $gcashSales,
            'cash_refunds' => $cashRefunds,
            'gcash_refunds' => $gcashRefunds,
            'net_cash_collected' => $netCash,
            'net_gcash_collected' => $netGcash,
            'total_payments_collected' => cashierMoney($netCash + $netGcash),
        ];
    }, $shiftRows);
    $dataShift = $activeShift ? [
        'shift_id' => (int) $activeShift['shift_id'],
        'status' => (string) $activeShift['status'],
        'opening_cash' => cashierMoney($activeShift['opening_cash']),
        'opened_at' => $activeShift['opened_at'],
        'closed_at' => null,
    ] : null;
    $sessionRoles = cashierSessionRoles();
    $canManageShift = $targetCashierId === $authenticatedUserId
        && (
            in_array('cashier', $sessionRoles, true)
            || (bool) array_intersect($sessionRoles, ['admin', 'super_admin', 'ro_admin', 'ro_super_admin'])
        );
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
            SUM(CASE WHEN payment_status = 'paid' THEN amount_paid ELSE 0 END) AS amount_paid,
            SUM(CASE WHEN payment_status = 'paid' THEN change_amount ELSE 0 END) AS change_amount,
            MAX(COALESCE(sales_clerk_discount, 0)) AS sales_clerk_discount,
            MAX(COALESCE(cashier_discount_amount, 0)) AS cashier_discount_amount,
            MAX(paid_at) AS paid_at,
            SUM(CASE WHEN payment_status = 'paid' THEN COALESCE(NULLIF(final_amount, 0), total_amount) ELSE 0 END) AS paid_final_amount,
            SUM(CASE WHEN payment_status IN ('paid', 'refunded') THEN COALESCE(NULLIF(final_amount, 0), total_amount) ELSE 0 END) AS collected_sale_amount
         FROM sales_payments
         WHERE payment_status IN ('paid', 'refunded')
           AND LOWER(payment_method) IN ('cash', 'gcash')
         GROUP BY order_id";

    $summaryStmt = $pdo->prepare(
        "SELECT
            COUNT(DISTINCT o.order_id) AS completed_transactions,
            COALESCE(SUM(o.total_amount), 0) AS total_completed_sales,
            COALESCE(SUM(o.total_amount + COALESCE(o.discount, 0) + COALESCE(p.cashier_discount_amount, 0)), 0) AS gross_completed_sales,
            COALESCE(SUM(COALESCE(o.discount, 0) + COALESCE(p.cashier_discount_amount, 0)), 0) AS discounts,
            COALESCE(SUM(CASE WHEN LOWER(p.payment_method) = 'cash' THEN p.amount_paid ELSE 0 END), 0) AS cash_tendered,
            COALESCE(SUM(CASE WHEN LOWER(p.payment_method) = 'cash' THEN p.change_amount ELSE 0 END), 0) AS change_given,
            COALESCE(SUM(CASE WHEN LOWER(p.payment_method) = 'cash' THEN p.collected_sale_amount ELSE 0 END), 0) AS cash_paid_sales,
            COALESCE(SUM(CASE WHEN LOWER(p.payment_method) = 'gcash' THEN p.collected_sale_amount ELSE 0 END), 0) AS gcash_paid_sales,
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
            COALESCE(SUM(COALESCE(NULLIF(p.final_amount, 0), p.total_amount)), 0) AS refunded_amount,
            COALESCE(SUM(CASE WHEN LOWER(p.payment_method) = 'cash' THEN COALESCE(NULLIF(p.final_amount, 0), p.total_amount) ELSE 0 END), 0) AS cash_refunded_amount,
            COALESCE(SUM(CASE WHEN LOWER(p.payment_method) = 'gcash' THEN COALESCE(NULLIF(p.final_amount, 0), p.total_amount) ELSE 0 END), 0) AS gcash_refunded_amount
         FROM sales_payments p
         INNER JOIN sales_orders o ON o.order_id = p.order_id
         WHERE p.payment_status = 'refunded'
           AND LOWER(p.payment_method) IN ('cash', 'gcash')
           AND p.cashier_id = :cashier_id
           AND COALESCE(p.paid_at, p.created_at) >= :date_start
           AND COALESCE(p.paid_at, p.created_at) < :date_end"
    );
    $refundStmt->execute($completedParams);
    $refundRow = $refundStmt->fetch(PDO::FETCH_ASSOC) ?: [];
    $refundedTransactions = (int) ($refundRow['refunded_transactions'] ?? 0);
    $refunds = cashierMoney($refundRow['refunded_amount'] ?? 0);
    $cashRefunds = cashierMoney($refundRow['cash_refunded_amount'] ?? 0);
    $gcashRefunds = cashierMoney($refundRow['gcash_refunded_amount'] ?? 0);

    $paymentStmt = $pdo->prepare(
        "SELECT
            p.payment_method,
            COUNT(DISTINCT o.order_id) AS transaction_count,
            COALESCE(SUM(p.collected_sale_amount), 0) AS amount
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
            o.subtotal,
            o.discount,
            o.total_amount,
            o.status,
            o.completed_at,
            p.payment_method,
            p.cashier_discount_amount,
            r.receipt_no,
            p.paid_final_amount,
            COALESCE(items.item_count, 0) AS item_count,
            COALESCE((SELECT SUM(COALESCE(NULLIF(rp.final_amount, 0), rp.total_amount)) FROM sales_payments rp WHERE rp.order_id = o.order_id AND rp.payment_status = 'refunded' AND LOWER(rp.payment_method) IN ('cash', 'gcash')), 0) AS refund_amount
         FROM sales_orders o
         INNER JOIN ($paidPaymentAggregate) p ON p.order_id = o.order_id
         LEFT JOIN sales_receipts r ON r.order_id = o.order_id
         LEFT JOIN (SELECT order_id, COUNT(*) AS item_count FROM sales_order_items GROUP BY order_id) items ON items.order_id = o.order_id
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
            'gross_amount' => cashierMoney($row['subtotal'] ?? ((float) ($row['total_amount'] ?? 0) + (float) ($row['discount'] ?? 0))),
            'discount_amount' => cashierMoney((float) ($row['discount'] ?? 0) + (float) ($row['cashier_discount_amount'] ?? 0)),
            'refund_amount' => cashierMoney($row['refund_amount'] ?? 0),
            'final_amount' => cashierMoney($row['paid_final_amount'] ?? $row['total_amount'] ?? 0),
            'net_amount' => cashierMoney((float) ($row['total_amount'] ?? 0) - (float) ($row['refund_amount'] ?? 0)),
            'item_count' => (int) ($row['item_count'] ?? 0),
            'status_code' => (string) ($row['status'] ?? ''),
            'status' => salesStatusLabel((string) ($row['status'] ?? '')),
            'completed_at' => $row['completed_at'] ?? null,
        ];
    }, $recentStmt->fetchAll(PDO::FETCH_ASSOC));

    $completedTransactions = (int) ($summary['completed_transactions'] ?? 0);
    $completedSales = cashierMoney($summary['total_completed_sales'] ?? 0);
    $cashTendered = cashierMoney($summary['cash_tendered'] ?? 0);
    $changeGiven = cashierMoney($summary['change_given'] ?? 0);
    $cashPaidSales = cashierMoney($summary['cash_paid_sales'] ?? 0);
    $gcashPaidSales = cashierMoney($summary['gcash_paid_sales'] ?? 0);
    $netCashSales = cashierMoney($cashPaidSales - $cashRefunds);
    $netGcashSales = cashierMoney($gcashPaidSales - $gcashRefunds);

    $data = shiftSummaryEmptyData($startDate, $endDate, $isAdminView, $cashiers, $targetCashierId, $cashierName);
    $data['active_shift'] = $dataShift;
    $data['shifts'] = $shifts;
    $data['can_manage_shift'] = $canManageShift;
    $data['has_records'] = $completedTransactions > 0 || $cancelledVoided > 0 || $refundedTransactions > 0 || $refunds > 0;
    $data['summary'] = [
        'total_completed_sales' => $completedSales,
        'cash_tendered' => $cashTendered,
        'change_given' => $changeGiven,
        'net_cash_sales' => $netCashSales,
        'cash_paid_sales' => $cashPaidSales,
        'gcash_paid_sales' => $gcashPaidSales,
        'cash_refunds' => $cashRefunds,
        'gcash_refunds' => $gcashRefunds,
        'net_gcash_collected' => $netGcashSales,
        'total_payments_collected' => cashierMoney($netCashSales + $netGcashSales),
        'net_cash_collected' => $netCashSales,
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
        'net_completed_sales' => cashierMoney($completedSales - $refunds),
        'average_transaction_value' => $completedTransactions > 0
            ? cashierMoney($completedSales / $completedTransactions)
            : 0.0,
    ];
    $data['recent_transactions'] = $recentTransactions;

    if ($startDate === $endDate) {
        $dailyShifts = array_values(array_filter($shifts, static function (array $shift) use ($start, $end): bool {
            return (string) $shift['opened_at'] >= $start && (string) $shift['opened_at'] < $end;
        }));
        if ($dailyShifts) {
            $beginningCash = 0.0;
            $expectedCash = 0.0;
            $actualCashTotal = 0.0;
            $cashSales = 0.0;
            $cashRefundTotal = 0.0;
            $allShiftsClosed = true;
            $remarks = [];
            $updatedAt = null;
            foreach ($dailyShifts as $shift) {
                $beginningCash += (float) $shift['opening_cash'];
                $cashSales += (float) $shift['cash_paid_sales'];
                $cashRefundTotal += (float) $shift['cash_refunds'];
                $expectedCash += $shift['expected_cash'] === null
                    ? (float) $shift['opening_cash'] + (float) $shift['net_cash_collected']
                    : (float) $shift['expected_cash'];
                if ($shift['status'] !== 'closed' || $shift['actual_cash'] === null) {
                    $allShiftsClosed = false;
                } else {
                    $actualCashTotal += (float) $shift['actual_cash'];
                }
                if ($shift['variance_remarks'] !== '') $remarks[] = '#' . $shift['shift_id'] . ': ' . $shift['variance_remarks'];
                if ($shift['closed_at'] && ($updatedAt === null || $shift['closed_at'] > $updatedAt)) $updatedAt = $shift['closed_at'];
            }
            $beginningCash = cashierMoney($beginningCash);
            $expectedCash = cashierMoney($expectedCash);
            $actualCash = $allShiftsClosed ? cashierMoney($actualCashTotal) : null;
            $data['reconciliation'] = [
                'beginning_cash' => $beginningCash,
                'cash_sales' => cashierMoney($cashSales),
                'cash_in' => 0.0,
                'cash_in_supported' => false,
                'cash_out' => 0.0,
                'cash_out_supported' => false,
                'cash_refunds_paid' => cashierMoney($cashRefundTotal),
                'expected_cash' => $expectedCash,
                'actual_cash' => $actualCash,
                'cash_variance' => $actualCash === null ? null : cashierMoney($actualCash - $expectedCash),
                'variance_remarks' => implode(' | ', $remarks),
                'status' => $allShiftsClosed ? 'count_saved' : 'open',
                'updated_at' => $updatedAt,
                'editable' => false,
            ];
        } else {
            $reconciliationStmt = $pdo->prepare(
                'SELECT beginning_cash, actual_cash, variance_remarks, status, updated_at
                 FROM cashier_shift_reconciliations
                 WHERE cashier_id = :cashier_id AND shift_date = :shift_date
                 LIMIT 1'
            );
            $reconciliationStmt->execute([':cashier_id' => $targetCashierId, ':shift_date' => $startDate]);
            $reconciliation = $reconciliationStmt->fetch(PDO::FETCH_ASSOC) ?: null;
            $beginningCash = $reconciliation ? cashierMoney($reconciliation['beginning_cash']) : null;
            $actualCash = $reconciliation && $reconciliation['actual_cash'] !== null ? cashierMoney($reconciliation['actual_cash']) : null;
            $cashIn = 0.0;
            $cashOut = 0.0;
            $expectedCash = $beginningCash === null ? null : cashierMoney($beginningCash + $cashPaidSales - $cashOut - $cashRefunds);
            $data['reconciliation'] = [
                'beginning_cash' => $beginningCash,
                'cash_sales' => $cashPaidSales,
                'cash_in' => $cashIn,
                'cash_in_supported' => false,
                'cash_out' => $cashOut,
                'cash_out_supported' => false,
                'cash_refunds_paid' => $cashRefunds,
                'expected_cash' => $expectedCash,
                'actual_cash' => $actualCash,
                'cash_variance' => $actualCash === null || $expectedCash === null ? null : cashierMoney($actualCash - $expectedCash),
                'variance_remarks' => $reconciliation['variance_remarks'] ?? '',
                'status' => $reconciliation['status'] ?? 'not_counted',
                'updated_at' => $reconciliation['updated_at'] ?? null,
                'editable' => !$isAdminView && $targetCashierId === $authenticatedUserId,
            ];
        }
    }

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
