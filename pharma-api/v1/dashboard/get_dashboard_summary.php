<?php
require_once '../../config/db_connection.php';
$allowedRoles = ['super_admin', 'admin', 'manager', 'supervisor', 'ro-admin', 'ro-super-admin', 'ro-manager', 'ro-supervisor'];
require_once '../../config/require_auth.php';
require_once '../activity_log_helpers.php';
require_once '../purchase_orders/purchase_order_helpers.php';
require_once '../products/product_category_schema.php';
require_once '../inventory/inventory_stock_summary.php';

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    http_response_code(405);
    echo json_encode(['status' => 'error', 'message' => 'Only GET requests are allowed.']);
    exit();
}

function dashboardTableExists(PDO $pdo, string $tableName): bool
{
    $statement = $pdo->prepare(
        "SELECT COUNT(*)
         FROM information_schema.TABLES
         WHERE TABLE_SCHEMA = DATABASE()
           AND TABLE_NAME = :table_name"
    );
    $statement->execute([':table_name' => $tableName]);
    return (int) $statement->fetchColumn() > 0;
}

function dashboardColumnExists(PDO $pdo, string $tableName, string $columnName): bool
{
    $statement = $pdo->prepare(
        "SELECT COUNT(*)
         FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE()
           AND TABLE_NAME = :table_name
           AND COLUMN_NAME = :column_name"
    );
    $statement->execute([
        ':table_name' => $tableName,
        ':column_name' => $columnName
    ]);
    return (int) $statement->fetchColumn() > 0;
}

function dashboardScalar(PDO $pdo, string $sql, array $params = [], $fallback = 0)
{
    $statement = $pdo->prepare($sql);
    $statement->execute($params);
    $value = $statement->fetchColumn();
    return $value === false || $value === null ? $fallback : $value;
}

function dashboardRows(PDO $pdo, string $sql, array $params = []): array
{
    $statement = $pdo->prepare($sql);
    $statement->execute($params);
    return $statement->fetchAll(PDO::FETCH_ASSOC);
}

function dashboardTableReadable(PDO $pdo, string $tableName): bool
{
    if (!preg_match('/^[a-zA-Z0-9_]+$/', $tableName)) {
        return false;
    }
    try {
        $pdo->query("SELECT 1 FROM `{$tableName}` LIMIT 1");
        return true;
    } catch (PDOException $error) {
        error_log("Dashboard source {$tableName} is unavailable: " . $error->getMessage());
        return false;
    }
}

function dashboardSalesPayload(PDO $pdo, array &$missing): array
{
    $today = new DateTimeImmutable('today');
    $preset = strtolower(trim((string) ($_GET['preset'] ?? 'last_7_days')));
    $allowedPresets = ['today', 'last_7_days', 'last_30_days', 'this_month', 'this_year', 'custom'];
    if (!in_array($preset, $allowedPresets, true)) {
        throw new InvalidArgumentException('Invalid reporting period.');
    }

    switch ($preset) {
        case 'today':
            $startDate = $today;
            $endDate = $today;
            $defaultGrouping = 'hourly';
            break;
        case 'last_30_days':
            $startDate = $today->modify('-29 days');
            $endDate = $today;
            $defaultGrouping = 'daily';
            break;
        case 'this_month':
            $startDate = $today->modify('first day of this month');
            $endDate = $today;
            $defaultGrouping = 'daily';
            break;
        case 'this_year':
            $startDate = $today->setDate((int) $today->format('Y'), 1, 1);
            $endDate = $today->setDate((int) $today->format('Y'), 12, 31);
            $defaultGrouping = 'monthly';
            break;
        case 'custom':
            $startValue = trim((string) ($_GET['start_date'] ?? ''));
            $endValue = trim((string) ($_GET['end_date'] ?? ''));
            $startDate = DateTimeImmutable::createFromFormat('!Y-m-d', $startValue) ?: null;
            $endDate = DateTimeImmutable::createFromFormat('!Y-m-d', $endValue) ?: null;
            if (!$startDate || !$endDate || $startDate->format('Y-m-d') !== $startValue || $endDate->format('Y-m-d') !== $endValue) {
                throw new InvalidArgumentException('Start date and end date must use YYYY-MM-DD.');
            }
            if ($startDate > $endDate) {
                throw new InvalidArgumentException('Start date cannot be later than end date.');
            }
            $rangeDays = (int) $startDate->diff($endDate)->days + 1;
            if ($rangeDays > 3660) {
                throw new InvalidArgumentException('Custom ranges cannot exceed 10 years.');
            }
            $defaultGrouping = $rangeDays <= 45 ? 'daily' : ($rangeDays <= 180 ? 'weekly' : 'monthly');
            break;
        case 'last_7_days':
        default:
            $startDate = $today->modify('-6 days');
            $endDate = $today;
            $defaultGrouping = 'daily';
            break;
    }

    $grouping = strtolower(trim((string) ($_GET['grouping'] ?? $defaultGrouping)));
    if (!in_array($grouping, ['hourly', 'daily', 'weekly', 'monthly'], true)) {
        throw new InvalidArgumentException('Invalid analytics grouping.');
    }
    if ($preset === 'today') {
        $grouping = 'hourly';
    }

    $startTimestamp = $startDate->format('Y-m-d 00:00:00');
    $endExclusive = $endDate->modify('+1 day')->format('Y-m-d 00:00:00');
    $params = [':analytics_start' => $startTimestamp, ':analytics_end' => $endExclusive];

    // The payment and item subqueries stay one-row-per-order so joins never multiply totals.
    $paidPayments = "SELECT order_id, MAX(final_amount) AS final_amount
                     FROM sales_payments
                     WHERE payment_status = 'paid'
                     GROUP BY order_id";
    $itemTotals = "SELECT order_id, SUM(quantity) AS units_sold, SUM(line_total) AS item_total
                   FROM sales_order_items
                   GROUP BY order_id";

    $salesSources = ['sales_orders', 'sales_order_items', 'sales_payments'];
    $unavailableSalesSources = array_values(array_filter(
        $salesSources,
        static fn(string $tableName): bool => !dashboardTableReadable($pdo, $tableName)
    ));
    $salesAvailable = $unavailableSalesSources === [];
    foreach ($unavailableSalesSources as $tableName) {
        $missing[] = $tableName;
    }

    $bucketExpression = match ($grouping) {
        'hourly' => "DATE_FORMAT(o.completed_at, '%Y-%m-%d %H:00:00')",
        'weekly' => 'DATE_SUB(DATE(o.completed_at), INTERVAL WEEKDAY(o.completed_at) DAY)',
        'monthly' => "DATE_FORMAT(o.completed_at, '%Y-%m-01')",
        default => 'DATE(o.completed_at)',
    };
    $trendRows = $salesAvailable ? dashboardRows($pdo, "SELECT {$bucketExpression} AS bucket_date,
            COALESCE(SUM(pay.final_amount), 0) AS revenue,
            COUNT(DISTINCT o.order_id) AS transactions,
            COALESCE(SUM(items.units_sold), 0) AS units_sold
        FROM sales_orders o
        INNER JOIN ({$paidPayments}) pay ON pay.order_id = o.order_id
        LEFT JOIN ({$itemTotals}) items ON items.order_id = o.order_id
        WHERE o.status = 'completed'
          AND o.completed_at >= :analytics_start AND o.completed_at < :analytics_end
        GROUP BY {$bucketExpression}
        ORDER BY bucket_date", $params) : [];
    $trendIndex = [];
    foreach ($trendRows as $row) {
        $trendIndex[(string) $row['bucket_date']] = [
            'revenue' => (float) $row['revenue'],
            'transactions' => (int) $row['transactions'],
            'units_sold' => (int) $row['units_sold'],
        ];
    }

    $salesTrend = [];
    if ($grouping === 'hourly') {
        for ($hour = 0; $hour < 24; $hour++) {
            $point = $startDate->setTime($hour, 0);
            $key = $point->format('Y-m-d H:00:00');
            $salesTrend[] = array_merge([
                'label' => $point->format('g A'), 'date' => $key,
            ], $trendIndex[$key] ?? ['revenue' => 0.0, 'transactions' => 0, 'units_sold' => 0]);
        }
    } else {
        $cursor = $grouping === 'weekly'
            ? $startDate->modify('monday this week')
            : ($grouping === 'monthly' ? $startDate->modify('first day of this month') : $startDate);
        $step = $grouping === 'weekly' ? '+1 week' : ($grouping === 'monthly' ? '+1 month' : '+1 day');
        while ($cursor <= $endDate) {
            $key = $cursor->format('Y-m-d');
            if ($grouping === 'monthly') {
                $label = $cursor->format('M');
            } elseif ($grouping === 'weekly') {
                $weekEnd = min($cursor->modify('+6 days'), $endDate);
                $label = $cursor->format('M j') . '–' . $weekEnd->format('M j');
            } else {
                $label = $cursor->format('M j');
            }
            $salesTrend[] = array_merge([
                'label' => $label, 'date' => $key,
            ], $trendIndex[$key] ?? ['revenue' => 0.0, 'transactions' => 0, 'units_sold' => 0]);
            $cursor = $cursor->modify($step);
        }
    }

    // Allocate the paid final amount proportionally across saved item line totals. This keeps
    // category revenue consistent with order-level discounts while retaining actual item prices.
    $categoryRows = $salesAvailable ? dashboardRows($pdo, "SELECT
            COALESCE(pc.category_id, '') AS category_id,
            COALESCE(NULLIF(pc.category_name, ''), 'Others') AS category_name,
            COALESCE(SUM(CASE WHEN totals.item_total > 0
                THEN i.line_total * (pay.final_amount / totals.item_total) ELSE 0 END), 0) AS revenue,
            COALESCE(SUM(i.quantity), 0) AS units_sold
        FROM sales_orders o
        INNER JOIN ({$paidPayments}) pay ON pay.order_id = o.order_id
        INNER JOIN sales_order_items i ON i.order_id = o.order_id
        INNER JOIN ({$itemTotals}) totals ON totals.order_id = o.order_id
        LEFT JOIN product p ON p.product_id = i.product_id
        LEFT JOIN product_categories pc ON pc.category_id = p.category_id
        WHERE o.status = 'completed'
          AND o.completed_at >= :analytics_start AND o.completed_at < :analytics_end
        GROUP BY pc.category_id, COALESCE(NULLIF(pc.category_name, ''), 'Others')
        ORDER BY revenue DESC, category_name ASC", $params) : [];
    $categoryTotal = array_sum(array_map(static fn(array $row): float => (float) $row['revenue'], $categoryRows));
    $categorySales = array_map(static function (array $row) use ($categoryTotal): array {
        $revenue = round((float) $row['revenue'], 2);
        return [
            'category_id' => (string) $row['category_id'],
            'category_name' => (string) $row['category_name'],
            'revenue' => $revenue,
            'units_sold' => (int) $row['units_sold'],
            'percentage' => $categoryTotal > 0 ? round(($revenue / $categoryTotal) * 100, 2) : 0.0,
        ];
    }, $categoryRows);

    $summary = [
        'revenue' => round(array_sum(array_column($salesTrend, 'revenue')), 2),
        'transactions' => array_sum(array_column($salesTrend, 'transactions')),
        'units_sold' => array_sum(array_column($salesTrend, 'units_sold')),
    ];
    $topSelling = $salesAvailable ? dashboardRows($pdo, "SELECT i.product_name, i.brand_name,
            SUM(i.quantity) AS quantity_sold,
            SUM(CASE WHEN totals.item_total > 0
                THEN i.line_total * (pay.final_amount / totals.item_total) ELSE 0 END) AS total_sales
        FROM sales_order_items i
        INNER JOIN sales_orders o ON o.order_id = i.order_id
        INNER JOIN ({$paidPayments}) pay ON pay.order_id = o.order_id
        INNER JOIN ({$itemTotals}) totals ON totals.order_id = o.order_id
        WHERE o.status = 'completed'
          AND o.completed_at >= :analytics_start AND o.completed_at < :analytics_end
        GROUP BY i.product_id, i.product_name, i.brand_name
        ORDER BY quantity_sold DESC, total_sales DESC LIMIT 5", $params) : [];
    foreach ($topSelling as &$row) {
        $row['quantity_sold'] = (int) $row['quantity_sold'];
        $row['total_sales'] = (float) $row['total_sales'];
    }
    unset($row);

    return [
        'period' => [
            'preset' => $preset,
            'start_date' => $startDate->format('Y-m-d'),
            'end_date' => $endDate->format('Y-m-d'),
            'grouping' => $grouping,
        ],
        'summary' => $summary,
        'sales_trend' => $salesTrend,
        'category_sales' => $categorySales,
        'top_selling_products' => $topSelling,
    ];
}

try {
    $configuredTimezone = (string) dashboardScalar($pdo, 'SELECT timezone FROM system_settings ORDER BY setting_id LIMIT 1', [], 'Asia/Manila');
    try {
        $dashboardTimezone = new DateTimeZone($configuredTimezone ?: 'Asia/Manila');
    } catch (Throwable $timezoneError) {
        $configuredTimezone = 'Asia/Manila';
        $dashboardTimezone = new DateTimeZone($configuredTimezone);
    }
    date_default_timezone_set($configuredTimezone);
    $pdo->exec('SET time_zone = ' . $pdo->quote((new DateTime('now', $dashboardTimezone))->format('P')));

    $missing = [];
    $sales = dashboardSalesPayload($pdo, $missing);

    if (($_GET['scope'] ?? '') === 'analytics') {
        echo json_encode([
            'status' => 'success',
            'business_date' => date('Y-m-d'),
            'period' => $sales['period'],
            'summary' => $sales['summary'],
            'sales_trend' => $sales['sales_trend'],
            'category_sales' => $sales['category_sales'],
            'top_selling_products' => $sales['top_selling_products'],
        ]);
        exit();
    }

    $pendingPo = (int) dashboardScalar($pdo, "SELECT COUNT(*) FROM purchase_orders WHERE status = 'Pending'");
    $outstandingPoPayments = (int) dashboardScalar(
        $pdo,
        "SELECT COUNT(*)
         FROM purchase_orders po
         LEFT JOIN (SELECT po_id, SUM(amount) AS amount_paid FROM purchase_order_payments GROUP BY po_id) payments ON payments.po_id = po.po_id
              WHERE po.status = 'Delivered'
           AND GREATEST(COALESCE(NULLIF(po.final_payment, 0), po.total_amount) - COALESCE(payments.amount_paid, 0), 0) > 0"
    );

    $inventoryStockSql = inventoryStockSummarySql();
    $stockSummary = dashboardRows(
        $pdo,
        "SELECT
            p.product_id,
            p.product_name,
            p.brand_name,
            stock.storage_quantity,
            stock.shelf_quantity,
            stock.total_quantity AS current_stock,
            stock.reorder_level,
            stock.stock_status,
            stock.nearest_expiry_date,
            stock.nearest_expiring_date,
            CASE
                WHEN stock.nearest_expiry_date IS NULL THEN NULL
                ELSE DATEDIFF(stock.nearest_expiry_date, CURDATE())
            END AS days_until_expiry,
            CASE
                WHEN stock.nearest_expiring_date IS NULL THEN NULL
                ELSE DATEDIFF(stock.nearest_expiring_date, CURDATE())
            END AS days_until_expiring
         FROM ({$inventoryStockSql}) stock
         INNER JOIN product p ON p.product_id = stock.product_id
         WHERE COALESCE(NULLIF(TRIM(p.status), ''), 'Active') <> 'Inactive'
         ORDER BY p.product_name ASC, p.brand_name ASC"
    );

    $lowStockProducts = [];
    $outOfStockProducts = [];
    $expiringProducts = [];
    $expiredProducts = [];
    $healthyProducts = [];

    foreach ($stockSummary as $row) {
        $currentStock = (int) ($row['current_stock'] ?? 0);
        $daysUntilExpiry = $row['days_until_expiry'] === null ? null : (int) $row['days_until_expiry'];
        $daysUntilExpiring = $row['days_until_expiring'] === null ? null : (int) $row['days_until_expiring'];
        $baseItem = [
            'product_name' => trim((string) $row['product_name']),
            'brand_name' => trim((string) $row['brand_name']),
            'current_stock' => $currentStock,
            'days_until_expiry' => $daysUntilExpiry
        ];

        if (($row['stock_status'] ?? '') === 'Out of Stock') {
            $outOfStockProducts[] = $baseItem + ['status' => 'Out of Stock'];
        } elseif (($row['stock_status'] ?? '') === 'Low Stock') {
            $lowStockProducts[] = $baseItem + ['status' => 'Low Stock'];
        } elseif (($row['stock_status'] ?? '') === 'In Stock') {
            $healthyProducts[] = $baseItem + ['status' => 'Healthy'];
        }

        if ($daysUntilExpiry !== null && $daysUntilExpiry < 0) {
            $expiredProducts[] = $baseItem + ['expiry_date' => $row['nearest_expiry_date'], 'status' => 'Expired'];
        }
        if ($daysUntilExpiring !== null) {
            $expiringProducts[] = $baseItem + [
                'expiry_date' => $row['nearest_expiring_date'],
                'days_until_expiry' => $daysUntilExpiring,
                'status' => 'Expiring Soon'
            ];
        }
    }

    usort($lowStockProducts, static fn($left, $right) => $left['current_stock'] <=> $right['current_stock']);
    usort($outOfStockProducts, static fn($left, $right) => strcmp($left['product_name'], $right['product_name']));
    usort($expiringProducts, static fn($left, $right) => ($left['days_until_expiry'] ?? 9999) <=> ($right['days_until_expiry'] ?? 9999));

    $poSummary = [];
    foreach (purchaseOrderStatuses() as $status) {
        $poSummary[] = [
            'status' => $status,
            'count' => 0
        ];
    }
    $poSummaryIndex = array_flip(array_column($poSummary, 'status'));
    foreach (dashboardRows($pdo, 'SELECT status, COUNT(*) AS total FROM purchase_orders GROUP BY status') as $row) {
        if (array_key_exists($row['status'], $poSummaryIndex)) {
            $poSummary[$poSummaryIndex[$row['status']]]['count'] = (int) $row['total'];
        }
    }

    seedActivityLogsFromExistingDashboardSources($pdo);
    $recentActivities = dashboardRows(
        $pdo,
        "SELECT
            activity_id,
            module AS type,
            module,
            action AS status,
            description AS message,
            reference_id,
            created_at
         FROM activity_logs
         ORDER BY created_at DESC, activity_id DESC
         LIMIT 8"
    );

    echo json_encode([
        'status' => 'success',
        'business_date' => date('Y-m-d'),
        'today_sales' => (float) $sales['summary']['revenue'],
        'transactions_today' => (int) $sales['summary']['transactions'],
        'period' => $sales['period'],
        'summary' => $sales['summary'],
        'pending_po' => $pendingPo,
        'outstanding_po_payments' => $outstandingPoPayments,
        'low_stock' => count($lowStockProducts),
        'expiring_soon' => count($expiringProducts),
        'out_of_stock' => count($outOfStockProducts),
        'sales_trend' => $sales['sales_trend'],
        'category_sales' => $sales['category_sales'],
        'po_summary' => $poSummary,
        'inventory_health' => [
            'low_stock' => array_slice($lowStockProducts, 0, 5),
            'expiring_soon' => array_slice($expiringProducts, 0, 5),
            'out_of_stock' => array_slice($outOfStockProducts, 0, 5),
            'expired' => array_slice($expiredProducts, 0, 5),
            'healthy' => array_slice($healthyProducts, 0, 5),
            'counts' => [
                'low_stock' => count($lowStockProducts),
                'out_of_stock' => count($outOfStockProducts),
                'expiring_soon' => count($expiringProducts),
                'expired' => count($expiredProducts),
                'healthy' => count($healthyProducts)
            ]
        ],
        'top_selling_products' => $sales['top_selling_products'],
        'recent_activities' => $recentActivities,
        'missing_sources' => array_values(array_unique($missing))
    ]);
} catch (Throwable $e) {
    $isValidationError = $e instanceof InvalidArgumentException;
    http_response_code($isValidationError ? 422 : 500);
    echo json_encode([
        'status' => 'error',
        'message' => $isValidationError ? $e->getMessage() : 'Unable to load dashboard summary.'
    ]);
}
?>
