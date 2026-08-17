<?php
require_once '../../config/db_connection.php';

$allowedRoles = ['super_admin', 'admin', 'manager', 'ro-super-admin', 'ro-admin', 'ro-manager'];
require_once '../../config/require_auth.php';
require_once 'sales_helpers.php';

function historyDateParam(string $value): string
{
    return preg_match('/^\d{4}-\d{2}-\d{2}$/', $value) ? $value : '';
}

try {
    $search = trim((string) ($_GET['search'] ?? ''));
    $status = trim((string) ($_GET['status'] ?? 'all'));
    $cashierId = trim((string) ($_GET['cashier_id'] ?? 'all'));
    $salesClerkId = trim((string) ($_GET['sales_clerk_id'] ?? 'all'));
    $paymentMethod = trim((string) ($_GET['payment_method'] ?? 'all'));
    $paidOnly = filter_var($_GET['paid_only'] ?? false, FILTER_VALIDATE_BOOLEAN);
    $dateFrom = historyDateParam(trim((string) ($_GET['date_from'] ?? '')));
    $dateTo = historyDateParam(trim((string) ($_GET['date_to'] ?? '')));
    $page = max(1, (int) ($_GET['page'] ?? 1));
    $perPage = min(20, max(10, (int) ($_GET['per_page'] ?? 10)));
    $offset = ($page - 1) * $perPage;

    $where = ['1=1'];
    $params = [];

    if ($status !== 'all' && $status !== '') {
        if ($status === 'cancelled') {
            $where[] = "o.status IN ('cancelled', 'rejected')";
        } else {
            $where[] = 'o.status = :status';
            $params[':status'] = $status;
        }
    }
    if ($cashierId !== 'all' && $cashierId !== '') {
        $where[] = 'COALESCE(o.assigned_cashier_id, r.cashier_id, p.cashier_id) = :cashier_id';
        $params[':cashier_id'] = $cashierId;
    }
    if ($salesClerkId !== 'all' && $salesClerkId !== '') {
        $where[] = 'o.sales_clerk_id = :sales_clerk_id';
        $params[':sales_clerk_id'] = $salesClerkId;
    }
    if ($paymentMethod !== 'all' && $paymentMethod !== '') {
        $where[] = 'COALESCE(p.payment_method, r.payment_method, "") = :payment_method';
        $params[':payment_method'] = $paymentMethod;
    }
    if ($paidOnly) {
        $where[] = 'p.order_id IS NOT NULL';
    }
    if ($dateFrom !== '') {
        $where[] = 'DATE(COALESCE(o.completed_at, p.paid_at, r.printed_at, o.cancelled_at, o.sent_to_cashier_at, o.created_at)) >= :date_from';
        $params[':date_from'] = $dateFrom;
    }
    if ($dateTo !== '') {
        $where[] = 'DATE(COALESCE(o.completed_at, p.paid_at, r.printed_at, o.cancelled_at, o.sent_to_cashier_at, o.created_at)) <= :date_to';
        $params[':date_to'] = $dateTo;
    }
    if ($search !== '') {
        $searchColumns = ['o.order_no', 'r.receipt_no', 'o.customer_name', 'sc.full_name', 'sc.username', 'ca.full_name', 'ca.username'];
        $searchParts = [];
        foreach ($searchColumns as $index => $column) {
            $key = ':search_' . $index;
            $searchParts[] = $column . ' LIKE ' . $key;
            $params[$key] = '%' . $search . '%';
        }
        $where[] = '(' . implode(' OR ', $searchParts) . ')';
    }

    $countStmt = $pdo->prepare(
        "SELECT COUNT(DISTINCT o.order_id)
         FROM sales_orders o
         LEFT JOIN users sc ON sc.user_id = o.sales_clerk_id
         LEFT JOIN sales_payments p ON p.order_id = o.order_id AND p.payment_status = 'paid'
         LEFT JOIN sales_receipts r ON r.order_id = o.order_id
         LEFT JOIN users ca ON ca.user_id = COALESCE(o.assigned_cashier_id, r.cashier_id, p.cashier_id)
         WHERE " . implode(' AND ', $where)
    );
    $countStmt->execute($params);
    $totalRows = (int) $countStmt->fetchColumn();

    $sql = "SELECT
            o.order_id,
            o.order_no,
            COALESCE(NULLIF(o.customer_name, ''), 'Walk-in Customer') AS customer_name,
            COALESCE(NULLIF(sc.full_name, ''), sc.username, 'Unassigned') AS sales_clerk_name,
            COALESCE(NULLIF(ca.full_name, ''), ca.username, '') AS cashier_name,
            COALESCE(items.total_items, 0) AS total_items,
            COALESCE(p.final_amount, p.total_amount, o.total_amount) AS total_amount,
            COALESCE(p.sales_clerk_discount, o.discount, 0) + COALESCE(p.cashier_discount_amount, 0) AS discount,
            COALESCE(p.payment_method, r.payment_method, '') AS payment_method,
            o.status,
            o.created_at,
            o.sent_to_cashier_at,
            o.completed_at,
            o.cancelled_at,
            r.receipt_no
        FROM sales_orders o
        LEFT JOIN users sc ON sc.user_id = o.sales_clerk_id
        LEFT JOIN sales_payments p ON p.order_id = o.order_id AND p.payment_status = 'paid'
        LEFT JOIN sales_receipts r ON r.order_id = o.order_id
        LEFT JOIN users ca ON ca.user_id = COALESCE(o.assigned_cashier_id, r.cashier_id, p.cashier_id)
        LEFT JOIN (
            SELECT order_id, SUM(COALESCE(NULLIF(selected_quantity, 0), quantity)) AS total_items
            FROM sales_order_items
            GROUP BY order_id
        ) items ON items.order_id = o.order_id
        WHERE " . implode(' AND ', $where) . "
        ORDER BY COALESCE(o.completed_at, p.paid_at, r.printed_at, o.cancelled_at, o.sent_to_cashier_at, o.created_at) DESC, o.order_id DESC
        LIMIT :limit OFFSET :offset";

    $stmt = $pdo->prepare($sql);
    foreach ($params as $key => $value) {
        $stmt->bindValue($key, $value);
    }
    $stmt->bindValue(':limit', $perPage, PDO::PARAM_INT);
    $stmt->bindValue(':offset', $offset, PDO::PARAM_INT);
    $stmt->execute();
    $orders = array_map(static function (array $row): array {
        $date = $row['completed_at'] ?? $row['cancelled_at'] ?? $row['sent_to_cashier_at'] ?? $row['created_at'] ?? null;
        return [
            'order_id' => (string) $row['order_id'],
            'date' => $date,
            'receipt_no' => salesDisplayValue($row['receipt_no'], '-'),
            'order_no' => salesDisplayValue($row['order_no'], (string) $row['order_id']),
            'customer_name' => salesDisplayValue($row['customer_name'], 'Walk-in Customer'),
            'sales_clerk_name' => salesDisplayValue($row['sales_clerk_name'], 'Unassigned'),
            'cashier_name' => salesDisplayValue($row['cashier_name'], '-'),
            'total_items' => (int) ($row['total_items'] ?? 0),
            'total_amount' => salesMoneyValue($row['total_amount'] ?? 0),
            'discount' => salesMoneyValue($row['discount'] ?? 0),
            'payment_method' => salesDisplayValue(ucwords(str_replace('_', ' ', (string) ($row['payment_method'] ?? ''))), '-'),
            'status_code' => (string) ($row['status'] ?? ''),
            'status' => salesStatusLabel((string) ($row['status'] ?? '')),
        ];
    }, $stmt->fetchAll(PDO::FETCH_ASSOC));

    $summary = $pdo->query(
        "SELECT
            COUNT(DISTINCT o.order_id) AS total_transactions,
            SUM(o.status = 'completed' AND DATE(o.completed_at) = CURDATE()) AS completed_today,
            SUM(o.status IN ('cancelled', 'rejected') AND DATE(o.cancelled_at) = CURDATE()) AS cancelled_today,
            COALESCE(SUM(CASE WHEN o.status = 'completed' AND DATE(o.completed_at) = CURDATE() THEN COALESCE(p.final_amount, p.total_amount, o.total_amount) ELSE 0 END), 0) AS total_sales_today
         FROM sales_orders o
         LEFT JOIN sales_payments p ON p.order_id = o.order_id AND p.payment_status = 'paid'"
    )->fetch(PDO::FETCH_ASSOC) ?: [];

    $shiftWhere = ["COALESCE(o.assigned_cashier_id, p.cashier_id, o.cancelled_by) IS NOT NULL"];
    $shiftParams = [];
    $shiftDateExpr = "DATE(COALESCE(o.completed_at, p.paid_at, o.cancelled_at, o.updated_at))";
    if ($dateFrom !== '') {
        $shiftWhere[] = "{$shiftDateExpr} >= :shift_date_from";
        $shiftParams[':shift_date_from'] = $dateFrom;
    }
    if ($dateTo !== '') {
        $shiftWhere[] = "{$shiftDateExpr} <= :shift_date_to";
        $shiftParams[':shift_date_to'] = $dateTo;
    }
    if ($dateFrom === '' && $dateTo === '') {
        $shiftWhere[] = "{$shiftDateExpr} = CURDATE()";
    }
    if ($cashierId !== 'all' && $cashierId !== '') {
        $shiftWhere[] = 'COALESCE(o.assigned_cashier_id, p.cashier_id, o.cancelled_by) = :shift_cashier_id';
        $shiftParams[':shift_cashier_id'] = $cashierId;
    }
    if ($paymentMethod !== 'all' && $paymentMethod !== '') {
        $shiftWhere[] = 'COALESCE(p.payment_method, "") = :shift_payment_method';
        $shiftParams[':shift_payment_method'] = $paymentMethod;
    }

    $shiftStmt = $pdo->prepare(
        "SELECT
            COALESCE(o.assigned_cashier_id, p.cashier_id, o.cancelled_by) AS cashier_id,
            COALESCE(NULLIF(ca.full_name, ''), ca.username, 'Unassigned Cashier') AS cashier_name,
            COALESCE(SUM(CASE WHEN o.status = 'completed' THEN COALESCE(p.final_amount, p.total_amount, o.total_amount) ELSE 0 END), 0) AS total_sales,
            COALESCE(SUM(CASE WHEN o.status = 'completed' THEN p.amount_paid ELSE 0 END), 0) AS cash_received,
            COALESCE(SUM(CASE WHEN o.status = 'completed' THEN p.change_amount ELSE 0 END), 0) AS change_given,
            SUM(CASE WHEN o.status = 'completed' THEN 1 ELSE 0 END) AS completed_transactions,
            SUM(CASE WHEN o.status IN ('cancelled', 'rejected') THEN 1 ELSE 0 END) AS cancelled_voided_transactions,
            MIN(CASE WHEN o.status = 'completed' THEN COALESCE(o.completed_at, p.paid_at) END) AS first_transaction_time,
            MAX(CASE WHEN o.status = 'completed' THEN COALESCE(o.completed_at, p.paid_at) END) AS last_transaction_time
         FROM sales_orders o
         LEFT JOIN sales_payments p ON p.order_id = o.order_id AND p.payment_status = 'paid'
         LEFT JOIN users ca ON ca.user_id = COALESCE(o.assigned_cashier_id, p.cashier_id, o.cancelled_by)
         WHERE " . implode(' AND ', $shiftWhere) . "
         GROUP BY cashier_id, cashier_name
         ORDER BY cashier_name ASC"
    );
    $shiftStmt->execute($shiftParams);
    $cashierShiftReports = array_map(static function (array $row): array {
        return [
            'cashier_id' => (string) ($row['cashier_id'] ?? ''),
            'cashier_name' => salesDisplayValue($row['cashier_name'], 'Unassigned Cashier'),
            'total_sales' => salesMoneyValue($row['total_sales'] ?? 0),
            'cash_received' => salesMoneyValue($row['cash_received'] ?? 0),
            'change_given' => salesMoneyValue($row['change_given'] ?? 0),
            'completed_transactions' => (int) ($row['completed_transactions'] ?? 0),
            'cancelled_voided_transactions' => (int) ($row['cancelled_voided_transactions'] ?? 0),
            'first_transaction_time' => $row['first_transaction_time'] ?? null,
            'last_transaction_time' => $row['last_transaction_time'] ?? null,
        ];
    }, $shiftStmt->fetchAll(PDO::FETCH_ASSOC));

    $cashiers = $pdo->query(
        "SELECT DISTINCT u.user_id, COALESCE(NULLIF(u.full_name, ''), u.username) AS name
         FROM users u
         INNER JOIN sales_orders o ON o.assigned_cashier_id = u.user_id
         WHERE u.user_id IS NOT NULL
         ORDER BY name ASC"
    )->fetchAll(PDO::FETCH_ASSOC);

    $salesClerks = $pdo->query(
        "SELECT DISTINCT u.user_id, COALESCE(NULLIF(u.full_name, ''), u.username) AS name
         FROM users u
         INNER JOIN sales_orders o ON o.sales_clerk_id = u.user_id
         WHERE u.user_id IS NOT NULL
         ORDER BY name ASC"
    )->fetchAll(PDO::FETCH_ASSOC);

    $paymentMethods = $pdo->query(
        "SELECT DISTINCT p.payment_method
         FROM sales_payments p
         WHERE p.payment_status = 'paid'
           AND p.payment_method IS NOT NULL
           AND p.payment_method <> ''
         ORDER BY p.payment_method ASC"
    )->fetchAll(PDO::FETCH_COLUMN);
    $paymentMethods = array_values(array_filter(array_map('strval', $paymentMethods)));
    if (!in_array('cash', array_map('strtolower', $paymentMethods), true)) {
        array_unshift($paymentMethods, 'cash');
    }

    echo json_encode([
        'status' => 'success',
        'data' => [
            'orders' => $orders,
            'summary' => [
                'total_transactions' => (int) ($summary['total_transactions'] ?? 0),
                'completed_today' => (int) ($summary['completed_today'] ?? 0),
                'cancelled_today' => (int) ($summary['cancelled_today'] ?? 0),
                'total_sales_today' => salesMoneyValue($summary['total_sales_today'] ?? 0),
            ],
            'cashier_shift_reports' => $cashierShiftReports,
            'pagination' => [
                'page' => $page,
                'per_page' => $perPage,
                'total' => $totalRows,
            ],
            'filters' => [
                'cashiers' => $cashiers,
                'sales_clerks' => $salesClerks,
                'payment_methods' => $paymentMethods,
            ],
        ],
    ]);
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode([
        'status' => 'error',
        'message' => 'Unable to load sales history.',
        'error' => $e->getMessage(),
    ]);
}

?>
