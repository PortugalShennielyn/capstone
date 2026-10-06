<?php

function reportNormalizeRole(string $role): string
{
    $role = strtolower(trim($role));
    $role = str_replace([' ', '-'], '_', $role);
    return str_replace(['sales_clerk', 'ro_sales_clerk'], ['salesclerk', 'ro_salesclerk'], $role);
}

function reportSessionRoles(): array
{
    $roles = array_merge(
        [$_SESSION['role'] ?? ''],
        is_array($_SESSION['roles'] ?? null) ? $_SESSION['roles'] : [],
        is_array($_SESSION['role_identifiers'] ?? null) ? $_SESSION['role_identifiers'] : []
    );
    return array_values(array_unique(array_filter(array_map('reportNormalizeRole', $roles))));
}

function reportRoleContext(): array
{
    $roles = reportSessionRoles();
    $management = count(array_intersect($roles, ['super_admin', 'admin', 'manager', 'ro_super_admin', 'ro_admin', 'ro_manager'])) > 0;
    $cashier = count(array_intersect($roles, ['cashier', 'ro_cashier'])) > 0;
    $clerk = count(array_intersect($roles, ['salesclerk', 'ro_salesclerk'])) > 0;
    $supervisor = count(array_intersect($roles, ['supervisor', 'ro_supervisor'])) > 0;
    return [
        'management' => $management,
        'cashier' => $cashier,
        'sales_clerk' => $clerk,
        'supervisor' => $supervisor,
        'user_id' => (string) ($_SESSION['user_id'] ?? ''),
        'user_name' => (string) ($_SESSION['full_name'] ?? $_SESSION['username'] ?? 'User'),
        'available_categories' => $management
            ? ['overview', 'sales', 'inventory', 'purchases', 'expiry', 'supplier', 'products', 'staff']
            : ($supervisor ? ['overview', 'inventory', 'purchases', 'expiry', 'products']
            : ($cashier ? ['sales', 'staff'] : ['sales', 'products', 'staff'])),
    ];
}

function reportApplyConfiguredTimezone(PDO $pdo): string
{
    $row = reportRow($pdo, 'SELECT timezone FROM system_settings ORDER BY setting_id LIMIT 1');
    $timezone = trim((string) ($row['timezone'] ?? 'Asia/Manila')) ?: 'Asia/Manila';
    try {
        $zone = new DateTimeZone($timezone);
    } catch (Throwable $error) {
        $timezone = 'Asia/Manila';
        $zone = new DateTimeZone($timezone);
    }
    date_default_timezone_set($timezone);
    $offset = (new DateTime('now', $zone))->format('P');
    $pdo->exec('SET time_zone = ' . $pdo->quote($offset));
    return $timezone;
}

function reportDate(string $key, string $fallback): string
{
    $value = trim((string) ($_GET[$key] ?? $fallback));
    $date = DateTime::createFromFormat('Y-m-d', $value);
    if (!$date || $date->format('Y-m-d') !== $value) {
        throw new InvalidArgumentException('Invalid date filter.');
    }
    return $value;
}

function reportFilters(): array
{
    $start = reportDate('start_date', date('Y-m-01'));
    $end = reportDate('end_date', date('Y-m-d'));
    if ($start > $end) throw new InvalidArgumentException('Start date cannot be after end date.');
    $days = (new DateTime($start))->diff(new DateTime($end))->days;
    if ($days > 3660) throw new InvalidArgumentException('Date range cannot exceed ten years.');

    $page = max(1, (int) ($_GET['page'] ?? 1));
    $pageSize = min(100, max(10, (int) ($_GET['page_size'] ?? 20)));
    return [
        'start_date' => $start,
        'end_date' => $end,
        'date_end_exclusive' => date('Y-m-d', strtotime($end . ' +1 day')),
        'category_id' => trim((string) ($_GET['category_id'] ?? '')),
        'type_id' => trim((string) ($_GET['type_id'] ?? '')),
        'product_id' => trim((string) ($_GET['product_id'] ?? '')),
        'brand' => mb_substr(trim((string) ($_GET['brand'] ?? '')), 0, 100),
        'supplier_id' => trim((string) ($_GET['supplier_id'] ?? '')),
        'cashier_id' => trim((string) ($_GET['cashier_id'] ?? '')),
        'sales_clerk_id' => trim((string) ($_GET['sales_clerk_id'] ?? '')),
        'payment_method' => strtolower(trim((string) ($_GET['payment_method'] ?? ''))),
        'po_status' => trim((string) ($_GET['po_status'] ?? '')),
        'payment_state' => strtolower(trim((string) ($_GET['payment_state'] ?? ''))),
        'stock_status' => strtolower(trim((string) ($_GET['stock_status'] ?? ''))),
        'rx_filter' => in_array(strtolower(trim((string) ($_GET['rx_filter'] ?? ''))), ['rx','otc'], true) ? strtolower(trim((string) $_GET['rx_filter'])) : '',
        'expiry_days' => min(3650, max(0, (int) ($_GET['expiry_days'] ?? 30))),
        'report_view' => mb_substr(trim((string) ($_GET['report_view'] ?? '')), 0, 80),
        'group_by' => strtolower(trim((string) ($_GET['group_by'] ?? 'day'))),
        'search' => mb_substr(trim((string) ($_GET['search'] ?? '')), 0, 100),
        'page' => $page,
        'page_size' => $pageSize,
        'offset' => ($page - 1) * $pageSize,
        'sort' => trim((string) ($_GET['sort'] ?? '')),
        'direction' => strtolower((string) ($_GET['direction'] ?? 'desc')) === 'asc' ? 'ASC' : 'DESC',
    ];
}

function reportRows(PDO $pdo, string $sql, array $params = []): array
{
    $stmt = $pdo->prepare($sql);
    foreach ($params as $key => $value) {
        $stmt->bindValue($key, $value, is_int($value) ? PDO::PARAM_INT : PDO::PARAM_STR);
    }
    $stmt->execute();
    return $stmt->fetchAll(PDO::FETCH_ASSOC);
}

function reportRow(PDO $pdo, string $sql, array $params = []): array
{
    return reportRows($pdo, $sql, $params)[0] ?? [];
}

function reportPagination(int $total, array $filters): array
{
    return [
        'page' => $filters['page'],
        'page_size' => $filters['page_size'],
        'total' => $total,
        'pages' => max(1, (int) ceil($total / $filters['page_size'])),
    ];
}

function reportPaidSalesSubquery(): string
{
    return "SELECT order_id,
                   MAX(CASE WHEN payment_status='paid' THEN cashier_id END) AS cashier_id,
                   MAX(CASE WHEN payment_status='paid' THEN payment_method END) AS payment_method,
                   GREATEST(MAX(CASE WHEN payment_status='paid' THEN final_amount ELSE 0 END)-SUM(CASE WHEN payment_status='refunded' THEN final_amount ELSE 0 END),0) AS final_amount,
                   SUM(CASE WHEN payment_status='refunded' THEN final_amount ELSE 0 END) AS refund_amount,
                   MAX(CASE WHEN payment_status='paid' THEN total_amount ELSE 0 END) AS payment_total,
                   MAX(CASE WHEN payment_status='paid' THEN sales_clerk_discount ELSE 0 END) AS sales_clerk_discount,
                   MAX(CASE WHEN payment_status='paid' THEN cashier_discount_amount ELSE 0 END) AS cashier_discount_amount,
                   MAX(CASE WHEN payment_status='paid' THEN paid_at END) AS paid_at
            FROM sales_payments
            WHERE payment_status IN ('paid','refunded')
            GROUP BY order_id
            HAVING SUM(payment_status='paid') > 0";
}

function reportSalesWhere(array $filters, array $role, string $alias = 'o'): array
{
    $where = ["{$alias}.status = 'completed'", "{$alias}.completed_at >= :start_date", "{$alias}.completed_at < :end_date"];
    $params = [':start_date' => $filters['start_date'], ':end_date' => $filters['date_end_exclusive']];
    if (!$role['management'] && empty($role['supervisor'])) {
        if ($role['cashier']) {
            $where[] = "COALESCE({$alias}.assigned_cashier_id, pay.cashier_id) = :scope_user";
        } else {
            $where[] = "{$alias}.sales_clerk_id = :scope_user";
        }
        $params[':scope_user'] = $role['user_id'];
    } elseif ($filters['cashier_id'] !== '') {
        $where[] = "COALESCE({$alias}.assigned_cashier_id, pay.cashier_id) = :cashier_id";
        $params[':cashier_id'] = $filters['cashier_id'];
    }
    if ($role['management'] && $filters['sales_clerk_id'] !== '') {
        $where[] = "{$alias}.sales_clerk_id = :sales_clerk_id";
        $params[':sales_clerk_id'] = $filters['sales_clerk_id'];
    }
    if ($filters['payment_method'] !== '') {
        $where[] = 'LOWER(pay.payment_method) = :payment_method';
        $params[':payment_method'] = $filters['payment_method'];
    }
    $itemWhere = [];
    foreach (['category_id', 'type_id', 'product_id'] as $key) {
        if ($filters[$key] !== '') {
            $itemWhere[] = "filter_product.{$key} = :sales_filter_{$key}";
            $params[":sales_filter_{$key}"] = $filters[$key];
        }
    }
    if ($filters['brand'] !== '') {
        $itemWhere[] = 'filter_product.brand_name = :sales_filter_brand';
        $params[':sales_filter_brand'] = $filters['brand'];
    }
    if ($itemWhere) {
        $where[] = "EXISTS (SELECT 1 FROM sales_order_items filter_item INNER JOIN product filter_product ON filter_product.product_id = filter_item.product_id WHERE filter_item.order_id = {$alias}.order_id AND " . implode(' AND ', $itemWhere) . ')';
    }
    return [implode(' AND ', $where), $params];
}

function reportProductFilterSql(array $filters, array &$params, string $productAlias = 'p'): string
{
    $parts = [];
    foreach (['category_id', 'type_id', 'product_id'] as $key) {
        if ($filters[$key] !== '') {
            $parts[] = "{$productAlias}.{$key} = :{$key}";
            $params[":{$key}"] = $filters[$key];
        }
    }
    if ($filters['search'] !== '') {
        $parts[] = "({$productAlias}.product_name LIKE :product_search OR {$productAlias}.brand_name LIKE :brand_search)";
        $params[':product_search'] = '%' . $filters['search'] . '%';
        $params[':brand_search'] = '%' . $filters['search'] . '%';
    }
    if ($filters['brand'] !== '') {
        $parts[] = "{$productAlias}.brand_name = :brand";
        $params[':brand'] = $filters['brand'];
    }
    return $parts ? ' AND ' . implode(' AND ', $parts) : '';
}

function reportFilterOptions(PDO $pdo, array $role): array
{
    $options = [
        'categories' => reportRows($pdo, 'SELECT category_id AS id, category_name AS name FROM product_categories ORDER BY category_name'),
        'types' => reportRows($pdo, 'SELECT type_id AS id, type_name AS name, category_id FROM product_types ORDER BY type_name'),
        'products' => reportRows($pdo, 'SELECT product_id AS id, CONCAT(COALESCE(NULLIF(brand_name, \'\'), \'No brand\'), \' - \', product_name) AS name, category_id, type_id, brand_name AS brand FROM product ORDER BY brand_name, product_name'),
        'brands' => array_column(reportRows($pdo, "SELECT DISTINCT brand_name AS name FROM product WHERE brand_name IS NOT NULL AND brand_name <> '' ORDER BY brand_name"), 'name'),
        'suppliers' => reportRows($pdo, 'SELECT supplier_id AS id, supplier_name AS name FROM suppliers WHERE archived_at IS NULL ORDER BY supplier_name'),
        'payment_methods' => ['cash', 'gcash', 'card', 'mixed'],
        'po_statuses' => ['Draft', 'Pending', 'Arrived', 'Delivered', 'Cancelled'],
        'stock_statuses' => ['healthy', 'low', 'out', 'negative'],
        'cashiers' => [],
        'sales_clerks' => [],
    ];
    if ($role['management']) {
        $options['cashiers'] = reportRows($pdo, "SELECT user_id AS id, COALESCE(NULLIF(full_name, ''), username) AS name FROM users WHERE role = 'cashier' AND status = 'Active' AND is_deleted = 0 ORDER BY name");
        $options['sales_clerks'] = reportRows($pdo, "SELECT user_id AS id, COALESCE(NULLIF(full_name, ''), username) AS name FROM users WHERE role = 'salesclerk' AND status = 'Active' AND is_deleted = 0 ORDER BY name");
    }
    return $options;
}

function reportSystem(PDO $pdo, array $role, array $filters): array
{
    $settings = reportRow($pdo, 'SELECT pharmacy_name, timezone FROM system_settings ORDER BY setting_id LIMIT 1');
    return [
        'pharmacy_name' => (string) ($settings['pharmacy_name'] ?? 'Dr. R Pharmacy'),
        'timezone' => (string) ($settings['timezone'] ?? 'Asia/Manila'),
        'generated_at' => date(DATE_ATOM),
        'generated_by' => $role['user_name'],
        'date_range' => ['start' => $filters['start_date'], 'end' => $filters['end_date']],
    ];
}
