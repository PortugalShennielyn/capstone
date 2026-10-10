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

    $search = auditParam('search');
    if ($search !== '') {
        $where .= ' AND (al.description LIKE :search OR al.details LIKE :search OR al.target_id LIKE :search OR al.target_type LIKE :search OR al.action LIKE :search OR al.module LIKE :search OR al.ip_address LIKE :search OR al.user_name LIKE :search OR u.full_name LIKE :search OR u.username LIKE :search)';
        $params[':search'] = '%' . $search . '%';
    }

    $user = auditParam('user');
    if ($user !== '') {
        $where .= ' AND (al.user_id = :user_id OR al.user_name LIKE :user_like OR u.username LIKE :user_like OR u.full_name LIKE :user_like)';
        $params[':user_id'] = $user;
        $params[':user_like'] = '%' . $user . '%';
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
    if (in_array($eventStatus, ['Success', 'Failure'], true)) {
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
                al.created_at, al.ip_address, al.user_agent, al.session_reference,
                al.event_status, al.description, al.details, al.target_type, al.target_id,
                u.full_name, u.username
         FROM audit_logs al
         LEFT JOIN users u ON u.user_id = al.user_id
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
        $row['display_name'] = $row['full_name'] ?: ($row['user_name'] ?: 'System / Unknown');
        $row['employee_id'] = $row['employee_id'] ?: ($row['username'] ?: ($row['user_id'] ?: ''));
        $row['description'] = $row['description'] ?: ($row['details'] ?: '');
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
                COALESCE(al.employee_id, u.username, al.user_id, '') employee_id
         FROM audit_logs al
         LEFT JOIN users u ON u.user_id = al.user_id
         ORDER BY display_name"
    )->fetchAll(PDO::FETCH_ASSOC);
    $filters['users'] = $userRows;

    echo json_encode([
        'status' => 'success',
        'data' => $rows,
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
