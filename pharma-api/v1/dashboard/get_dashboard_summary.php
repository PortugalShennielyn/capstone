<?php
require_once '../../config/db_connection.php';
$allowedRoles = ['super_admin', 'admin', 'manager', 'ro-admin', 'ro-super-admin', 'ro-manager'];
require_once '../../config/require_auth.php';
require_once '../activity_log_helpers.php';
require_once '../purchase_orders/purchase_order_helpers.php';
require_once '../products/product_category_schema.php';

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

function dashboardSalesPayload(PDO $pdo, array &$missing): array
{
    // One row per order prevents totals from being multiplied by sale item joins.
    $paidPayments = "SELECT order_id, MAX(final_amount) AS final_amount
                     FROM sales_payments
                     WHERE payment_status = 'paid'
                     GROUP BY order_id";
    $today = dashboardRows($pdo, "SELECT COUNT(DISTINCT o.order_id) AS transactions_today,
            COALESCE(SUM(COALESCE(pay.final_amount, o.total_amount)), 0) AS today_sales
        FROM sales_orders o INNER JOIN ({$paidPayments}) pay ON pay.order_id = o.order_id
        WHERE o.status = 'completed' AND DATE(o.completed_at) = CURDATE()")[0] ?? [];
    $trend = dashboardRows($pdo, "SELECT DATE(o.completed_at) AS sale_date,
            COALESCE(SUM(COALESCE(pay.final_amount, o.total_amount)), 0) AS total_sales,
            COUNT(DISTINCT o.order_id) AS transaction_count
        FROM sales_orders o INNER JOIN ({$paidPayments}) pay ON pay.order_id = o.order_id
        WHERE o.status = 'completed' AND DATE(o.completed_at) >= DATE_SUB(CURDATE(), INTERVAL 6 DAY)
        GROUP BY DATE(o.completed_at) ORDER BY sale_date");
    foreach ($trend as &$row) {
        $row['total_sales'] = (float) $row['total_sales'];
        $row['transaction_count'] = (int) $row['transaction_count'];
    }
    unset($row);
    $trendByDate = [];
    foreach ($trend as $row) {
        $trendByDate[$row['sale_date']] = $row;
    }
    $trend = [];
    for ($daysAgo = 6; $daysAgo >= 0; $daysAgo--) {
        $date = date('Y-m-d', strtotime("-{$daysAgo} days"));
        $trend[] = $trendByDate[$date] ?? [
            'sale_date' => $date,
            'total_sales' => 0.0,
            'transaction_count' => 0
        ];
    }
    $topSelling = dashboardRows($pdo, "SELECT p.product_name, p.brand_name,
            SUM(i.quantity) AS quantity_sold, SUM(i.line_total) AS total_sales
        FROM sales_order_items i INNER JOIN sales_orders o ON o.order_id = i.order_id
        INNER JOIN ({$paidPayments}) pay ON pay.order_id = o.order_id
        INNER JOIN product p ON p.product_id = i.product_id
        WHERE o.status = 'completed' AND DATE(o.completed_at) >= DATE_SUB(CURDATE(), INTERVAL 6 DAY)
        GROUP BY p.product_id, p.product_name, p.brand_name
        ORDER BY quantity_sold DESC, total_sales DESC LIMIT 5");
    foreach ($topSelling as &$row) {
        $row['quantity_sold'] = (int) $row['quantity_sold'];
        $row['total_sales'] = (float) $row['total_sales'];
    }
    unset($row);

    return [
        'today_sales' => (float) ($today['today_sales'] ?? 0),
        'transactions_today' => (int) ($today['transactions_today'] ?? 0),
        'sales_trend' => $trend,
        'top_selling_products' => $topSelling
    ];
}

try {
    ensurePurchaseOrderSchema($pdo);
    ensureProductCategorySchema($pdo);
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

    $pendingPo = (int) dashboardScalar($pdo, "SELECT COUNT(*) FROM purchase_orders WHERE status = 'Pending'");
    $outstandingPoPayments = (int) dashboardScalar(
        $pdo,
        "SELECT COUNT(*)
         FROM purchase_orders po
         LEFT JOIN (SELECT po_id, SUM(amount) AS amount_paid FROM purchase_order_payments GROUP BY po_id) payments ON payments.po_id = po.po_id
         WHERE po.status IN ('Delivered', 'Delivered with Return/Damage')
           AND GREATEST(COALESCE(NULLIF(po.final_payment, 0), po.total_amount) - COALESCE(payments.amount_paid, 0), 0) > 0"
    );

    $stockSummary = dashboardRows(
        $pdo,
        "SELECT
            p.product_id,
            p.product_name,
            p.brand_name,
            COALESCE(stock.storage_quantity, 0) AS storage_quantity,
            COALESCE(stock.shelf_quantity, 0) AS shelf_quantity,
            COALESCE(stock.storage_quantity, 0) + COALESCE(stock.shelf_quantity, 0) AS current_stock,
            stock.nearest_expiry_date,
            CASE
                WHEN stock.nearest_expiry_date IS NULL THEN NULL
                ELSE DATEDIFF(stock.nearest_expiry_date, CURDATE())
            END AS days_until_expiry
         FROM product p
         LEFT JOIN (
            SELECT
                product_id,
                SUM(CASE WHEN batch_status = 'active' AND (expiry_date IS NULL OR expiry_date >= CURDATE()) THEN storage_qty ELSE 0 END) AS storage_quantity,
                SUM(CASE WHEN batch_status = 'active' AND (expiry_date IS NULL OR expiry_date >= CURDATE()) THEN shelf_qty ELSE 0 END) AS shelf_quantity,
                MIN(CASE WHEN (storage_qty + shelf_qty) > 0 AND expiry_date IS NOT NULL THEN expiry_date END) AS nearest_expiry_date
            FROM inventory_batches
            GROUP BY product_id
         ) stock ON stock.product_id = p.product_id
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
        $baseItem = [
            'product_name' => trim((string) $row['product_name']),
            'brand_name' => trim((string) $row['brand_name']),
            'current_stock' => $currentStock,
            'days_until_expiry' => $daysUntilExpiry
        ];

        if ($currentStock === 0) {
            $outOfStockProducts[] = $baseItem + ['status' => 'Out of Stock'];
        } elseif ($currentStock <= 10) {
            $lowStockProducts[] = $baseItem + ['status' => 'Low Stock'];
        } else {
            $healthyProducts[] = $baseItem + ['status' => 'Healthy'];
        }

        if ($daysUntilExpiry !== null && $daysUntilExpiry < 0) {
            $expiredProducts[] = $baseItem + ['expiry_date' => $row['nearest_expiry_date'], 'status' => 'Expired'];
        } elseif ($daysUntilExpiry !== null && $daysUntilExpiry <= 30) {
            $expiringProducts[] = $baseItem + [
                'expiry_date' => $row['nearest_expiry_date'],
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
        'today_sales' => (float) $sales['today_sales'],
        'transactions_today' => (int) $sales['transactions_today'],
        'pending_po' => $pendingPo,
        'outstanding_po_payments' => $outstandingPoPayments,
        'low_stock' => count($lowStockProducts),
        'expiring_soon' => count($expiringProducts),
        'out_of_stock' => count($outOfStockProducts),
        'sales_trend' => $sales['sales_trend'],
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
    http_response_code(500);
    echo json_encode([
        'status' => 'error',
        'message' => 'Unable to load dashboard summary.',
        'error' => $e->getMessage()
    ]);
}
?>
