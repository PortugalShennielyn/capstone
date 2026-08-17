<?php
require_once '../../config/db_connection.php';
$allowedRoles = ['super_admin', 'admin', 'manager', 'cashier', 'ro-super-admin', 'ro-admin', 'ro-manager', 'ro-cashier', 'ro_super_admin', 'ro_admin', 'ro_manager', 'ro_cashier'];
require_once '../../config/require_auth.php';
require_once 'cashier_helpers.php';

try {
    $type = strtolower(trim((string) ($_GET['type'] ?? 'completed')));
    $search = trim((string) ($_GET['search'] ?? ''));
    $dateStart = trim((string) ($_GET['date_start'] ?? ''));
    $dateEnd = trim((string) ($_GET['date_end'] ?? ''));
    $paymentMethod = trim((string) ($_GET['payment_method'] ?? ''));
    $page = max(1, (int) ($_GET['page'] ?? 1));
    $perPage = min(20, max(10, (int) ($_GET['per_page'] ?? 10)));
    $offset = ($page - 1) * $perPage;
    $userId = cashierCurrentUserId();
    $isAdmin = cashierIsAdminSession();
    $requestedCashierId = trim((string) ($_GET['cashier_id'] ?? ''));
    $params = [];

    if ($isAdmin && $requestedCashierId !== '') {
        $cashierStmt = $pdo->prepare(
            "SELECT COUNT(*)
             FROM users
             WHERE user_id = :user_id
               AND (
                    role = 'cashier'
                    OR (
                        role IN ('admin', 'super_admin')
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
               AND COALESCE(is_deleted, 0) = 0"
        );
        $cashierStmt->execute([':user_id' => $requestedCashierId]);
        if ((int) $cashierStmt->fetchColumn() !== 1) {
            http_response_code(422);
            echo json_encode(['status' => 'error', 'message' => 'Please select an active cashier.']);
            exit();
        }
    }

    if ($type === 'cancelled') {
        $where = ["o.status IN ('cancelled', 'rejected')"];
        if (!$isAdmin) {
            $where[] = '(o.assigned_cashier_id = :assigned_cashier_id OR o.cancelled_by = :cancelled_cashier_id)';
            $params[':assigned_cashier_id'] = $userId;
            $params[':cancelled_cashier_id'] = $userId;
        } elseif ($requestedCashierId !== '') {
            $where[] = '(o.assigned_cashier_id = :selected_cashier_id OR o.cancelled_by = :selected_cancelled_by)';
            $params[':selected_cashier_id'] = $requestedCashierId;
            $params[':selected_cancelled_by'] = $requestedCashierId;
        }
        if ($search !== '') {
            $where[] = '(o.order_no LIKE :search OR o.customer_name LIKE :search OR o.cancellation_reason LIKE :search OR sc.full_name LIKE :search)';
            $params[':search'] = '%' . $search . '%';
        }
        $stmt = $pdo->prepare(
            "SELECT
                o.order_id, o.order_no, COALESCE(NULLIF(o.customer_name, ''), 'Walk-in Customer') AS customer_name,
                COALESCE(NULLIF(sc.full_name, ''), sc.username, 'Unassigned') AS sales_clerk_name,
                COALESCE(NULLIF(ca.full_name, ''), ca.username, '') AS cashier_name,
                COALESCE(NULLIF(cb.full_name, ''), cb.username, '') AS cancelled_by_name,
                o.total_amount, o.cancellation_reason, o.cancelled_at, o.status
             FROM sales_orders o
             LEFT JOIN users sc ON sc.user_id = o.sales_clerk_id
             LEFT JOIN users ca ON ca.user_id = o.assigned_cashier_id
             LEFT JOIN users cb ON cb.user_id = o.cancelled_by
             WHERE " . implode(' AND ', $where) . "
             ORDER BY o.cancelled_at DESC, o.updated_at DESC
             LIMIT 120"
        );
        $stmt->execute($params);
        echo json_encode(['status' => 'success', 'data' => ['rows' => $stmt->fetchAll(PDO::FETCH_ASSOC)]]);
        exit();
    }

    $where = ["o.status = 'completed'"];
    if (!$isAdmin) {
        $where[] = 'o.assigned_cashier_id = :cashier_id';
        $params[':cashier_id'] = $userId;
    } elseif ($requestedCashierId !== '') {
        $where[] = 'o.assigned_cashier_id = :selected_cashier_id';
        $params[':selected_cashier_id'] = $requestedCashierId;
    }
    if ($search !== '') {
        $searchColumns = ['o.order_no', 'r.receipt_no', 'o.customer_name'];
        if ($isAdmin) {
            $searchColumns[] = 'sc.full_name';
            $searchColumns[] = 'ca.full_name';
        }
        $searchParts = [];
        foreach ($searchColumns as $index => $column) {
            $key = ':search_' . $index;
            $searchParts[] = $column . ' LIKE ' . $key;
            $params[$key] = '%' . $search . '%';
        }
        $where[] = '(' . implode(' OR ', $searchParts) . ')';
    }
    if ($dateStart !== '' && preg_match('/^\d{4}-\d{2}-\d{2}$/', $dateStart)) {
        $where[] = 'COALESCE(o.completed_at, p.paid_at, r.printed_at) >= :date_start';
        $params[':date_start'] = $dateStart . ' 00:00:00';
    }
    if ($dateEnd !== '' && preg_match('/^\d{4}-\d{2}-\d{2}$/', $dateEnd)) {
        $where[] = 'COALESCE(o.completed_at, p.paid_at, r.printed_at) <= :date_end';
        $params[':date_end'] = $dateEnd . ' 23:59:59';
    }
    if ($paymentMethod !== '') {
        $where[] = 'p.payment_method = :payment_method';
        $params[':payment_method'] = $paymentMethod;
    }

    $paymentWhere = ["o.status = 'completed'", "p.payment_status = 'paid'", "p.payment_method IS NOT NULL", "p.payment_method <> ''"];
    $paymentParams = [];
    if (!$isAdmin) {
        $paymentWhere[] = 'o.assigned_cashier_id = :payment_cashier_id';
        $paymentParams[':payment_cashier_id'] = $userId;
    } elseif ($requestedCashierId !== '') {
        $paymentWhere[] = 'o.assigned_cashier_id = :payment_cashier_id';
        $paymentParams[':payment_cashier_id'] = $requestedCashierId;
    }
    $paymentStmt = $pdo->prepare(
        "SELECT DISTINCT p.payment_method
         FROM sales_orders o
         INNER JOIN sales_payments p ON p.order_id = o.order_id
         WHERE " . implode(' AND ', $paymentWhere) . "
         ORDER BY p.payment_method ASC"
    );
    $paymentStmt->execute($paymentParams);
    $paymentMethods = array_values(array_filter(array_map('strval', $paymentStmt->fetchAll(PDO::FETCH_COLUMN))));
    if (!in_array('cash', array_map('strtolower', $paymentMethods), true)) {
        array_unshift($paymentMethods, 'cash');
    }

    $countStmt = $pdo->prepare(
        "SELECT COUNT(DISTINCT o.order_id)
         FROM sales_orders o
         LEFT JOIN users sc ON sc.user_id = o.sales_clerk_id
         LEFT JOIN users ca ON ca.user_id = o.assigned_cashier_id
         LEFT JOIN sales_payments p ON p.order_id = o.order_id AND p.payment_status = 'paid'
         LEFT JOIN sales_receipts r ON r.order_id = o.order_id
         WHERE " . implode(' AND ', $where)
    );
    $countStmt->execute($params);
    $totalRows = (int) $countStmt->fetchColumn();

    $stmt = $pdo->prepare(
        "SELECT
            o.order_id, o.order_no, COALESCE(NULLIF(o.customer_name, ''), 'Walk-in Customer') AS customer_name,
            COALESCE(NULLIF(sc.full_name, ''), sc.username, 'Unassigned') AS sales_clerk_name,
            COALESCE(NULLIF(ca.full_name, ''), ca.username, '') AS cashier_name,
            COALESCE(items.item_count, 0) AS item_count,
            o.total_amount, o.cash_received, o.change_amount, o.completed_at,
            p.payment_method, p.amount_paid, p.change_amount AS payment_change_amount, p.paid_at,
            r.receipt_no, r.printed_at
         FROM sales_orders o
         LEFT JOIN users sc ON sc.user_id = o.sales_clerk_id
         LEFT JOIN users ca ON ca.user_id = o.assigned_cashier_id
         LEFT JOIN sales_payments p ON p.order_id = o.order_id AND p.payment_status = 'paid'
         LEFT JOIN sales_receipts r ON r.order_id = o.order_id
         LEFT JOIN (
             SELECT order_id, COUNT(*) AS item_count
             FROM sales_order_items
             GROUP BY order_id
         ) items ON items.order_id = o.order_id
         WHERE " . implode(' AND ', $where) . "
         ORDER BY COALESCE(o.completed_at, p.paid_at, r.printed_at) DESC, o.order_id DESC
         LIMIT :limit OFFSET :offset"
    );
    foreach ($params as $key => $value) {
        $stmt->bindValue($key, $value);
    }
    $stmt->bindValue(':limit', $perPage, PDO::PARAM_INT);
    $stmt->bindValue(':offset', $offset, PDO::PARAM_INT);
    $stmt->execute();
    echo json_encode([
        'status' => 'success',
        'data' => [
            'rows' => $stmt->fetchAll(PDO::FETCH_ASSOC),
            'payment_methods' => $paymentMethods,
            'pagination' => [
                'page' => $page,
                'per_page' => $perPage,
                'total' => $totalRows,
            ],
        ],
    ]);
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode(['status' => 'error', 'message' => 'Unable to load cashier report.', 'error' => $e->getMessage()]);
}

?>
