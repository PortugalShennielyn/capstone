<?php
$allowedRoles = ['admin', 'ro_admin', 'ro-admin', 'super_admin', 'ro_super_admin', 'ro-super-admin', 'Admin'];
require_once __DIR__ . '/../../config/db_connection.php';
require_once __DIR__ . '/../../config/require_auth.php';
require_once __DIR__ . '/../../config/audit_log.php';

function auditParam(string $key, string $default = ''): string
{
    return trim((string) ($_GET[$key] ?? $default));
}

function auditDateRangeSql(array &$params): string
{
    $sql = '';
    $from = auditParam('date_from');
    $to = auditParam('date_to');
    if ($from !== '') {
        $parsedFrom = DateTimeImmutable::createFromFormat('!Y-m-d', $from);
        if (!$parsedFrom || $parsedFrom->format('Y-m-d') !== $from) {
            throw new InvalidArgumentException('Enter a valid start date.');
        }
        $sql .= ' AND DATE(al.created_at) >= :date_from';
        $params[':date_from'] = $from;
    }
    if ($to !== '') {
        $parsedTo = DateTimeImmutable::createFromFormat('!Y-m-d', $to);
        if (!$parsedTo || $parsedTo->format('Y-m-d') !== $to) {
            throw new InvalidArgumentException('Enter a valid end date.');
        }
        if ($from !== '' && $from > $to) {
            throw new InvalidArgumentException('Date From must be on or before Date To.');
        }
        $sql .= ' AND DATE(al.created_at) <= :date_to';
        $params[':date_to'] = $to;
    }
    if ($sql !== '') {
        return $sql;
    }
    $range = strtolower(str_replace([' ', '_'], '-', auditParam('date_range', 'all')));
    if ($range === 'today') return ' AND DATE(al.created_at) = CURDATE()';
    if ($range === 'last-7-days') return ' AND al.created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)';
    if ($range === 'last-30-days') return ' AND al.created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)';
    return '';
}

function auditStoredDateRange(string $column, array &$params, string $prefix): string
{
    $sql = '';
    $from = auditParam('date_from');
    $to = auditParam('date_to');
    if ($from !== '') {
        $sql .= " AND {$column} >= :{$prefix}_from";
        $params[":" . $prefix . '_from'] = $from . ' 00:00:00';
    }
    if ($to !== '') {
        $sql .= " AND {$column} < DATE_ADD(:{$prefix}_to, INTERVAL 1 DAY)";
        $params[":" . $prefix . '_to'] = $to . ' 00:00:00';
    }
    return $sql;
}

function auditMaskSession(?string $reference): string
{
    $reference = trim((string) $reference);
    return $reference === '' ? 'Not recorded' : '****' . strtoupper(substr($reference, -4));
}

function auditDeviceLabel(?string $userAgent): string
{
    $agent = (string) $userAgent;
    $browser = 'Browser';
    foreach (['Edg' => 'Edge', 'Chrome' => 'Chrome', 'Firefox' => 'Firefox', 'Safari' => 'Safari'] as $needle => $label) {
        if (stripos($agent, $needle) !== false) {
            $browser = $label;
            break;
        }
    }
    $os = stripos($agent, 'Windows') !== false ? 'Windows'
        : (stripos($agent, 'Mac OS') !== false ? 'macOS'
        : (stripos($agent, 'Android') !== false ? 'Android'
        : (stripos($agent, 'iPhone') !== false || stripos($agent, 'iPad') !== false ? 'iOS' : 'Device')));
    return $browser . ' / ' . $os;
}

try {
    ensureAuditLogSchema($pdo);
    $page = max(1, (int) auditParam('page', '1'));
    $perPage = min(100, max(10, (int) auditParam('per_page', '25')));
    $offset = ($page - 1) * $perPage;
    $params = [];
    $where = ' WHERE 1=1';
    $where .= auditDateRangeSql($params);
    $summaryParams = [];
    $summaryWhere = ' WHERE 1=1' . auditDateRangeSql($summaryParams);

    $summaryStmt = $pdo->prepare(
        "SELECT COUNT(*) AS total_activities,
                COALESCE(SUM(al.event_status = 'Success'), 0) AS successful_actions,
                COALESCE(SUM(al.event_status IN ('Failure', 'Denied')), 0) AS failed_actions,
                COALESCE(SUM(
                    al.module IN ('Authentication', 'Authorization', 'Security')
                    OR al.event_status = 'Denied'
                    OR al.action IN (
                        'LOGIN_SUCCESS', 'LOGIN_FAILED', 'LOGOUT',
                        'SESSION_TIMEOUT', 'SESSION_EXPIRED', 'SESSION_REVOKED', 'ACCESS_DENIED'
                    )
                ), 0) AS security_events
         FROM audit_logs al{$summaryWhere}"
    );
    $summaryStmt->execute($summaryParams);
    $summaryRow = $summaryStmt->fetch(PDO::FETCH_ASSOC);
    $summary = [
        'total_activities' => (int) ($summaryRow['total_activities'] ?? 0),
        'successful_actions' => (int) ($summaryRow['successful_actions'] ?? 0),
        'failed_actions' => (int) ($summaryRow['failed_actions'] ?? 0),
        'security_events' => (int) ($summaryRow['security_events'] ?? 0),
    ];

    $salesSummaryParams = [];
    $salesSummaryWhere = " WHERE al.module = 'Sales & Transactions'" . auditDateRangeSql($salesSummaryParams);
    $salesSummaryStmt = $pdo->prepare(
        "SELECT
            COALESCE(SUM(al.action='SALE_COMPLETED' AND al.event_status='Success'),0) AS sale_completed,
            COALESCE(SUM(al.action='REFUND_ISSUED' AND al.event_status='Success'),0) AS refund_issued,
            COALESCE(SUM(al.action='TRANSACTION_CANCELLED' AND al.event_status='Success'),0) AS transaction_cancelled,
            COALESCE(SUM(al.action='DISCOUNT_APPLIED' AND al.event_status='Success'),0) AS discount_applied
         FROM audit_logs al{$salesSummaryWhere}"
    );
    $salesSummaryStmt->execute($salesSummaryParams);
    $salesSummary = $salesSummaryStmt->fetch(PDO::FETCH_ASSOC) ?: [];
    $summary['sales_transactions'] = array_map('intval', $salesSummary);

    $refundCountParams = [];
    $refundCountWhere = " WHERE p.payment_status = 'refunded'" . auditStoredDateRange('COALESCE(p.paid_at, p.created_at)', $refundCountParams, 'refund_count_date');
    $refundCountStmt = $pdo->prepare("SELECT COUNT(DISTINCT p.order_id) FROM sales_payments p{$refundCountWhere}");
    $refundCountStmt->execute($refundCountParams);
    $summary['sales_transactions']['refund_issued'] = (int) $refundCountStmt->fetchColumn();

    $managementSummaryParams = [];
    $managementSummaryWhere = " WHERE al.module = 'System & User Management'" . auditDateRangeSql($managementSummaryParams);
    $managementSummaryStmt = $pdo->prepare(
        "SELECT
            COALESCE(SUM(al.action='ACCOUNT_CREATED' AND al.event_status='Success'),0) AS accounts_created,
            COALESCE(SUM(al.action='ROLE_CHANGED' AND al.event_status='Success'),0) AS role_changes,
            COALESCE(SUM(al.action='SETTINGS_CHANGED' AND al.event_status='Success'),0) AS settings_changed
         FROM audit_logs al{$managementSummaryWhere}"
    );
    $managementSummaryStmt->execute($managementSummaryParams);
    $summary['system_user_management'] = array_map('intval', $managementSummaryStmt->fetch(PDO::FETCH_ASSOC) ?: []);

    $managementType = auditParam('management_type');
    $managementActions = [
        'accounts_created' => ['ACCOUNT_CREATED'],
        'role_changes' => ['ROLE_CHANGED'],
        'settings_changed' => ['SETTINGS_CHANGED'],
    ];
    if ($managementType !== '') {
        if (!isset($managementActions[$managementType])) throw new InvalidArgumentException('Invalid management history type.');
        $where .= " AND al.module = 'System & User Management' AND al.action = :management_action";
        $params[':management_action'] = $managementActions[$managementType][0];
        $managementSearch = auditParam('management_search');
        if ($managementSearch !== '') {
            $where .= ' AND (al.user_name LIKE :management_search_actor OR u.username LIKE :management_search_username OR u.full_name LIKE :management_search_name OR al.description LIKE :management_search_description OR al.details LIKE :management_search_details OR al.target_id LIKE :management_search_target)';
            foreach (['actor', 'username', 'name', 'description', 'details', 'target'] as $key) $params[':management_search_' . $key] = '%' . $managementSearch . '%';
        }
    }

    $salesHistory = auditParam('sales_history');
    $salesHistoryActions = [
        'refunds' => 'REFUND_ISSUED',
        'cancelled' => 'TRANSACTION_CANCELLED',
        'discounts' => 'DISCOUNT_APPLIED',
    ];
    if ($salesHistory !== '') {
        if (!isset($salesHistoryActions[$salesHistory])) throw new InvalidArgumentException('Invalid sales history type.');
        if ($salesHistory !== 'refunds') {
            $where .= " AND al.module = 'Sales & Transactions' AND al.action = :sales_history_action AND al.event_status = 'Success'";
            $params[':sales_history_action'] = $salesHistoryActions[$salesHistory];
        }
        $salesSearch = auditParam('sales_search');
        if ($salesSearch !== '') {
            if ($salesHistory !== 'refunds') {
                $where .= ' AND (al.description LIKE :sales_search_description OR al.details LIKE :sales_search_details OR al.target_id LIKE :sales_search_target OR al.user_name LIKE :sales_search_actor OR u.full_name LIKE :sales_search_full_name OR u.username LIKE :sales_search_username)';
                foreach (['description', 'details', 'target', 'actor', 'full_name', 'username'] as $key) $params[':sales_search_' . $key] = '%' . $salesSearch . '%';
            }
        }
    }

    if ($salesHistory === 'refunds') {
        $refundParams = [];
        $refundWhere = " WHERE p.payment_status = 'refunded'" . auditStoredDateRange('COALESCE(p.paid_at, p.created_at)', $refundParams, 'refund_date');
        if ($salesSearch !== '') {
            $refundWhere .= ' AND (o.order_no LIKE :refund_search_order OR sr.receipt_no LIKE :refund_search_receipt OR u.username LIKE :refund_search_username OR u.full_name LIKE :refund_search_name)';
            foreach (['order', 'receipt', 'username', 'name'] as $key) $refundParams[':refund_search_' . $key] = '%' . $salesSearch . '%';
        }
        $refundBase = " FROM sales_payments p
            INNER JOIN sales_orders o ON o.order_id = p.order_id
            LEFT JOIN (SELECT order_id, MAX(receipt_no) AS receipt_no FROM sales_receipts GROUP BY order_id) sr ON sr.order_id = o.order_id
            LEFT JOIN users u ON u.user_id = p.cashier_id{$refundWhere}";
        $refundCount = $pdo->prepare('SELECT COUNT(DISTINCT o.order_id)' . $refundBase);
        $refundCount->execute($refundParams);
        $total = (int) $refundCount->fetchColumn();
        $totalPages = max(1, (int) ceil($total / $perPage));
        if ($page > $totalPages) $page = $totalPages;
        $offset = ($page - 1) * $perPage;
        $refundRowsStmt = $pdo->prepare(
            "SELECT MIN(p.payment_id) AS audit_id, p.order_id, o.order_no,
                    COALESCE(MAX(sr.receipt_no), o.order_no) AS transaction_id,
                    COALESCE(MAX(u.full_name), MAX(u.username), 'Unknown') AS display_name,
                    MAX(u.role) AS role,
                    MAX(COALESCE(p.paid_at, p.created_at)) AS created_at,
                    SUM(COALESCE(NULLIF(p.final_amount, 0), p.total_amount)) AS refund_amount,
                    'Refunded' AS event_status,
                    '—' AS refund_reason{$refundBase}
             GROUP BY o.order_id, o.order_no
             ORDER BY created_at DESC, o.order_id DESC
             LIMIT :limit OFFSET :offset"
        );
        foreach ($refundParams as $key => $value) $refundRowsStmt->bindValue($key, $value, PDO::PARAM_STR);
        $refundRowsStmt->bindValue(':limit', $perPage, PDO::PARAM_INT);
        $refundRowsStmt->bindValue(':offset', $offset, PDO::PARAM_INT);
        $refundRowsStmt->execute();
        $refundRows = $refundRowsStmt->fetchAll(PDO::FETCH_ASSOC);
        echo json_encode(['status' => 'success', 'data' => $refundRows, 'pagination' => ['page' => $page, 'per_page' => $perPage, 'total' => $total, 'total_pages' => $totalPages]], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        exit();
    }

    $search = auditParam('search');
    if ($search !== '') {
        $searchColumns = [
            'al.description', 'al.details', 'al.target_id', 'al.target_type', 'al.action',
            'al.module', 'al.ip_address', 'al.request_id', 'al.user_name', 'u.full_name', 'u.username',
        ];
        $searchClauses = [];
        foreach ($searchColumns as $index => $column) {
            $placeholder = ':search_' . $index;
            $searchClauses[] = $column . ' LIKE ' . $placeholder;
            $params[$placeholder] = '%' . $search . '%';
        }
        $where .= ' AND (' . implode(' OR ', $searchClauses) . ')';
    }

    $user = auditParam('user');
    if ($user !== '') {
        $where .= ' AND (al.user_id = :user_id OR al.user_name LIKE :user_like_name OR u.username LIKE :user_like_username OR u.full_name LIKE :user_like_full_name)';
        $params[':user_id'] = $user;
        $params[':user_like_name'] = '%' . $user . '%';
        $params[':user_like_username'] = '%' . $user . '%';
        $params[':user_like_full_name'] = '%' . $user . '%';
    }

    $module = auditParam('module');
    if ($module !== '' && strtolower($module) !== 'all modules') {
        $where .= ' AND al.module = :module';
        $params[':module'] = $module;
    }

    $action = auditParam('action');
    if ($action !== '' && strtolower($action) !== 'all actions') {
        if ($action === 'LOGIN_LOGOUT') {
            $where .= " AND al.action IN ('LOGIN_SUCCESS','LOGIN_FAILED','LOGOUT','SESSION_TIMEOUT','SESSION_EXPIRED','SESSION_REVOKED')";
        } else {
            $where .= ' AND al.action = :action';
            $params[':action'] = $action;
        }
    }

    $eventStatus = auditParam('event_status');
    if (in_array($eventStatus, ['Success', 'Failure', 'Denied'], true)) {
        $where .= ' AND al.event_status = :event_status';
        $params[':event_status'] = $eventStatus;
    }

    $countStmt = $pdo->prepare("SELECT COUNT(*) FROM audit_logs al LEFT JOIN users u ON u.user_id = al.user_id{$where}");
    $countStmt->execute($params);
    $total = (int) $countStmt->fetchColumn();
    $totalPages = max(1, (int) ceil($total / $perPage));
    if ($page > $totalPages) {
        $page = $totalPages;
        $offset = ($page - 1) * $perPage;
    }

    $stmt = $pdo->prepare(
        "SELECT al.audit_id, al.user_id, al.employee_id, al.user_name, al.role, al.action, al.module,
                al.created_at, al.ip_address, al.user_agent, al.session_reference, al.request_id,
                al.event_status, al.description, al.details, al.target_type, al.target_id,
                u.full_name, u.username, so.total_amount AS related_transaction_amount,
                so.cancellation_reason AS related_cancellation_reason
         FROM audit_logs al
         LEFT JOIN users u ON u.user_id = al.user_id
         LEFT JOIN sales_orders so ON CAST(so.order_id AS CHAR) = al.target_id
         {$where}
         ORDER BY al.created_at DESC, al.audit_id DESC
         LIMIT :limit OFFSET :offset"
    );
    foreach ($params as $key => $value) {
        $stmt->bindValue($key, $value, PDO::PARAM_STR);
    }
    $stmt->bindValue(':limit', $perPage, PDO::PARAM_INT);
    $stmt->bindValue(':offset', $offset, PDO::PARAM_INT);
    $stmt->execute();

    $rows = array_map(static function (array $row): array {
        $row['session_display'] = auditMaskSession($row['session_reference'] ?? '');
        $row['device'] = auditDeviceLabel($row['user_agent'] ?? '');
        $row['display_name'] = $row['full_name'] ?: ($row['user_name'] ?: (empty($row['user_id']) ? 'Unauthenticated' : 'System / Unknown'));
        $row['employee_id'] = $row['employee_id'] ?: ($row['username'] ?: ($row['user_id'] ?: ''));
        $row['description'] = $row['description'] ?: ($row['details'] ?: '');
        $transactionDetails = json_decode((string) ($row['details'] ?? ''), true);
        if (is_array($transactionDetails)) {
            $row['management_details'] = $transactionDetails;
            $row['transaction_id'] = $transactionDetails['transaction_id'] ?? $transactionDetails['receipt_no'] ?? $transactionDetails['order_no'] ?? null;
            $row['amount'] = $transactionDetails['amount'] ?? $transactionDetails['total_amount'] ?? null;
            $row['refund_amount'] = $transactionDetails['refund_amount'] ?? null;
            $row['discount_type'] = $transactionDetails['discount_type'] ?? null;
            $row['discount_amount'] = $transactionDetails['discount_amount'] ?? null;
            $row['cancellation_reason'] = $transactionDetails['cancellation_reason'] ?? null;
            $row['void_reason'] = $transactionDetails['void_reason'] ?? null;
        }
        if (($row['action'] ?? '') === 'TRANSACTION_CANCELLED') {
            $row['amount'] = $row['amount'] ?? $row['related_transaction_amount'] ?? null;
            $row['cancellation_reason'] = $row['cancellation_reason'] ?? $row['related_cancellation_reason'] ?? null;
        }
        unset($row['user_agent'], $row['session_reference']);
        return $row;
    }, $stmt->fetchAll(PDO::FETCH_ASSOC));

    $facetRows = $pdo->query(
        "SELECT 'module' facet, module value FROM audit_logs GROUP BY module
         UNION ALL SELECT 'action', action FROM audit_logs GROUP BY action
         ORDER BY facet, value"
    )->fetchAll(PDO::FETCH_ASSOC);
    $filters = ['modules' => [], 'actions' => []];
    foreach ($facetRows as $facet) {
        if ($facet['facet'] === 'module') $filters['modules'][] = $facet['value'];
        if ($facet['facet'] === 'action') $filters['actions'][] = $facet['value'];
    }
    $userRows = $pdo->query(
        "SELECT DISTINCT COALESCE(al.user_id, '') user_id,
                COALESCE(u.full_name, al.user_name, 'System / Unknown') display_name,
                COALESCE(al.employee_id, u.username, al.user_id, '') employee_id,
                COALESCE(al.role, u.role, '') role
         FROM audit_logs al
         LEFT JOIN users u ON u.user_id = al.user_id
         ORDER BY display_name"
    )->fetchAll(PDO::FETCH_ASSOC);
    $filters['users'] = $userRows;

    echo json_encode([
        'status' => 'success',
        'data' => $rows,
        'summary' => $summary,
        'filters' => $filters,
        'pagination' => [
            'page' => $page,
            'per_page' => $perPage,
            'total' => $total,
            'total_pages' => $totalPages,
        ],
    ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
} catch (InvalidArgumentException $error) {
    http_response_code(422);
    echo json_encode(['status' => 'error', 'message' => $error->getMessage()]);
} catch (Throwable $error) {
    http_response_code(500);
    echo json_encode(['status' => 'error', 'message' => 'Unable to load audit logs.']);
}

?>
