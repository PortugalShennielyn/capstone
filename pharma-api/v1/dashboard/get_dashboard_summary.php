<?php
require_once '../../config/db_connection.php';
$allowedRoles = ['super_admin', 'admin', 'manager', 'supervisor', 'ro-admin', 'ro-super-admin', 'ro-manager', 'ro-supervisor'];
require_once '../../config/require_auth.php';
require_once '../activity_log_helpers.php';
require_once '../purchase_orders/purchase_order_helpers.php';
require_once '../products/product_category_schema.php';
require_once '../inventory/inventory_stock_summary.php';
require_once '../inventory/expiry_status_helpers.php';

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
    $preset = strtolower(trim((string) ($_GET['preset'] ?? 'today')));
    $allowedPresets = ['today', 'this_week', 'this_month', 'this_year', 'custom'];
    if (!in_array($preset, $allowedPresets, true)) {
        throw new InvalidArgumentException('Invalid reporting period.');
    }

    $dateFromValue = trim((string) ($_GET['date_from'] ?? ($_GET['start_date'] ?? '')));
    $dateToValue = trim((string) ($_GET['date_to'] ?? ($_GET['end_date'] ?? '')));
    $requestedStartDate = null;
    $requestedEndDate = null;
    if ($dateFromValue !== '' || $dateToValue !== '') {
        $requestedStartDate = DateTimeImmutable::createFromFormat('!Y-m-d', $dateFromValue) ?: null;
        $requestedEndDate = DateTimeImmutable::createFromFormat('!Y-m-d', $dateToValue) ?: null;
        if (!$requestedStartDate || !$requestedEndDate
            || $requestedStartDate->format('Y-m-d') !== $dateFromValue
            || $requestedEndDate->format('Y-m-d') !== $dateToValue) {
            throw new InvalidArgumentException('date_from and date_to must use YYYY-MM-DD.');
        }
        if ($requestedStartDate > $requestedEndDate) {
            throw new InvalidArgumentException('date_from cannot be later than date_to.');
        }
        if ((int) $requestedStartDate->diff($requestedEndDate)->days + 1 > 3660) {
            throw new InvalidArgumentException('Dashboard date ranges cannot exceed 10 years.');
        }
    }

    switch ($preset) {
        case 'today':
            $startDate = $today;
            $endDate = $today;
            $defaultGrouping = 'hourly';
            break;
        case 'this_week':
            $startDate = $today->modify('monday this week');
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
            $endDate = $today;
            $defaultGrouping = 'monthly';
            break;
        case 'custom':
            if (!$requestedStartDate || !$requestedEndDate) {
                throw new InvalidArgumentException('Custom ranges require date_from and date_to.');
            }
            $startDate = $requestedStartDate;
            $endDate = $requestedEndDate;
            $rangeDays = (int) $startDate->diff($endDate)->days + 1;
            $defaultGrouping = $rangeDays <= 45 ? 'daily' : ($rangeDays <= 180 ? 'weekly' : 'monthly');
            break;
        default:
            $startDate = $today;
            $endDate = $today;
            $defaultGrouping = 'hourly';
            break;
    }

    if ($requestedStartDate && $requestedEndDate) {
        $startDate = $requestedStartDate;
        $endDate = $requestedEndDate;
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

    // Sales Analytics is intentionally daily for every dashboard date range.
    $bucketExpression = 'DATE(o.completed_at)';
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
    $cursor = $startDate;
    while ($cursor <= $endDate) {
        $key = $cursor->format('Y-m-d');
        $salesTrend[] = array_merge([
            'label' => $cursor->format('M j'), 'date' => $key,
        ], $trendIndex[$key] ?? ['revenue' => 0.0, 'transactions' => 0, 'units_sold' => 0]);
        $cursor = $cursor->modify('+1 day');
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
        ORDER BY quantity_sold DESC, total_sales DESC LIMIT 10", $params) : [];
    foreach ($topSelling as &$row) {
        $row['quantity_sold'] = (int) $row['quantity_sold'];
        $row['total_sales'] = (float) $row['total_sales'];
    }
    unset($row);

    $transferActivity = dashboardTableExists($pdo, 'inventory_transfers') ? dashboardRows(
        $pdo,
        "SELECT DATE(it.created_at) AS transfer_date,
                it.product_id,
                COALESCE(NULLIF(TRIM(p.product_name), ''), 'Unknown product') AS product_name,
                COALESCE(NULLIF(TRIM(p.brand_name), ''), 'No brand') AS brand_name,
                COUNT(*) AS transfer_count,
                COALESCE(SUM(it.base_quantity), 0) AS units_transferred
         FROM inventory_transfers it
         LEFT JOIN product p ON p.product_id = it.product_id
         WHERE it.movement_type = 'STORAGE_TO_SHELF'
           AND it.created_at >= :analytics_start AND it.created_at < :analytics_end
         GROUP BY DATE(it.created_at), it.product_id,
                  COALESCE(NULLIF(TRIM(p.product_name), ''), 'Unknown product'),
                  COALESCE(NULLIF(TRIM(p.brand_name), ''), 'No brand')
         ORDER BY transfer_date, product_name",
        $params
    ) : [];
    $transferIndex = [];
    foreach ($transferActivity as $transferRow) {
        $transferDate = (string) $transferRow['transfer_date'];
        if (!isset($transferIndex[$transferDate])) {
            $transferIndex[$transferDate] = [
                'transfer_count' => 0,
                'units_transferred' => 0.0,
                'products' => [],
            ];
        }
        $productUnits = (float) $transferRow['units_transferred'];
        $productTransfers = (int) $transferRow['transfer_count'];
        $transferIndex[$transferDate]['transfer_count'] += $productTransfers;
        $transferIndex[$transferDate]['units_transferred'] += $productUnits;
        $transferIndex[$transferDate]['products'][] = [
            'product_id' => (string) $transferRow['product_id'],
            'product_name' => (string) $transferRow['product_name'],
            'brand_name' => (string) $transferRow['brand_name'],
            'quantity_transferred' => $productUnits,
            'transfer_count' => $productTransfers,
        ];
    }
    $transferActivity = [];
    $transferCursor = $startDate;
    while ($transferCursor <= $endDate) {
        $transferDate = $transferCursor->format('Y-m-d');
        $transferActivity[] = array_merge(
            ['transfer_date' => $transferDate],
            $transferIndex[$transferDate] ?? ['transfer_count' => 0, 'units_transferred' => 0.0, 'products' => []]
        );
        $transferCursor = $transferCursor->modify('+1 day');
    }

    $invoiceAvailable = dashboardTableReadable($pdo, 'purchase_order_invoices');
    $invoiceSummaryRow = $invoiceAvailable ? (dashboardRows($pdo, "SELECT COUNT(*) AS total_invoices,
            COALESCE(SUM(CASE WHEN LOWER(COALESCE(po.payment_status, '')) = 'paid' THEN 1 ELSE 0 END), 0) AS paid_invoices,
            COALESCE(SUM(i.supplier_invoice_total), 0) AS invoice_value
        FROM purchase_order_invoices i
        INNER JOIN purchase_orders po ON po.po_id = i.po_id
        WHERE i.invoice_date >= :analytics_start AND i.invoice_date < :analytics_end", $params)[0] ?? []) : [];
    $supplierInvoiceSummary = [
        'total_invoices' => (int) ($invoiceSummaryRow['total_invoices'] ?? 0),
        'paid_invoices' => (int) ($invoiceSummaryRow['paid_invoices'] ?? 0),
        'unpaid_invoices' => max(0, (int) ($invoiceSummaryRow['total_invoices'] ?? 0) - (int) ($invoiceSummaryRow['paid_invoices'] ?? 0)),
        'invoice_value' => round((float) ($invoiceSummaryRow['invoice_value'] ?? 0), 2),
    ];
    $topSuppliers = dashboardTableReadable($pdo, 'purchase_orders') ? dashboardRows($pdo, "SELECT s.supplier_id, s.supplier_name,
            COUNT(DISTINCT po.po_id) AS po_count,
            COALESCE(SUM(COALESCE(
                NULLIF(po.final_payment, 0),
                NULLIF(po.total_amount, 0),
                NULLIF(invoices.invoice_total, 0),
                items.item_total,
                0
            )), 0) AS purchase_value
        FROM purchase_orders po
        INNER JOIN suppliers s ON s.supplier_id = po.supplier_id
        LEFT JOIN (
            SELECT po_id, MAX(supplier_invoice_total) AS invoice_total
            FROM purchase_order_invoices
            GROUP BY po_id
        ) invoices ON invoices.po_id = po.po_id
        LEFT JOIN (
            SELECT po_id, SUM(line_total) AS item_total
            FROM purchase_order_items
            GROUP BY po_id
        ) items ON items.po_id = po.po_id
        WHERE po.created_at >= :analytics_start AND po.created_at < :analytics_end
        GROUP BY s.supplier_id, s.supplier_name
        ORDER BY purchase_value DESC, po_count DESC, s.supplier_name
        LIMIT 5", $params) : [];
    foreach ($topSuppliers as &$supplierRow) {
        $supplierRow['po_count'] = (int) $supplierRow['po_count'];
        $supplierRow['purchase_value'] = round((float) $supplierRow['purchase_value'], 2);
    }
    unset($supplierRow);

    $inventoryValue = dashboardTableReadable($pdo, 'inventory_batches') ? (float) dashboardScalar($pdo, "SELECT
            COALESCE(SUM((ib.storage_qty + COALESCE(selling.shelf_qty, 0)) * ib.unit_cost), 0)
        FROM inventory_batches ib
        LEFT JOIN (SELECT source_batch_id, SUM(quantity_remaining) AS shelf_qty FROM product_selling_stock GROUP BY source_batch_id) selling
          ON selling.source_batch_id = ib.batch_id
        WHERE ib.batch_status = 'active' AND ib.storage_qty + COALESCE(selling.shelf_qty, 0) > 0") : 0.0;

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
        'transfer_activity' => $transferActivity,
        'supplier_invoice_summary' => $supplierInvoiceSummary,
        'top_suppliers' => $topSuppliers,
        'inventory_value' => round($inventoryValue, 2),
    ];
}

try {
    try {
        $configuredTimezone = (string) dashboardScalar($pdo, 'SELECT timezone FROM system_settings ORDER BY setting_id LIMIT 1', [], 'Asia/Manila');
        $dashboardTimezone = new DateTimeZone($configuredTimezone ?: 'Asia/Manila');
    } catch (Throwable $timezoneError) {
        $configuredTimezone = 'Asia/Manila';
        $dashboardTimezone = new DateTimeZone($configuredTimezone);
    }
    date_default_timezone_set($configuredTimezone);
    $pdo->exec('SET time_zone = ' . $pdo->quote((new DateTime('now', $dashboardTimezone))->format('P')));

    // Keep the shared alerts menu independent from the heavier dashboard report.
    // This lets alerts load even when unrelated sales or activity sources are unavailable.
    if (($_GET['scope'] ?? '') === 'alerts') {
        $inventoryStockSql = inventoryStockSummarySql();
        $stockRows = dashboardRows(
            $pdo,
            "SELECT stock.stock_status, COUNT(*) AS total
             FROM ({$inventoryStockSql}) stock
             INNER JOIN product p ON p.product_id = stock.product_id
             WHERE COALESCE(NULLIF(TRIM(p.status), ''), 'Active') <> 'Inactive'
             GROUP BY stock.stock_status"
        );
        $lowStock = 0;
        $outOfStock = 0;
        foreach ($stockRows as $stockRow) {
            if (($stockRow['stock_status'] ?? '') === 'Low Stock') $lowStock = (int) $stockRow['total'];
            if (($stockRow['stock_status'] ?? '') === 'Out of Stock') $outOfStock = (int) $stockRow['total'];
        }

        $expiringRows = dashboardRows(
            $pdo,
            "SELECT ib.expiry_date,
                    COALESCE(ib.expiry_alert_days, pi.expiry_alert_days, 30) AS expiry_alert_days,
                    DATEDIFF(ib.expiry_date, CURDATE()) AS days_left
             FROM inventory_batches ib
             INNER JOIN product p ON p.product_id = ib.product_id
             LEFT JOIN product_inventory pi ON pi.inventory_id = ib.legacy_inventory_id
             LEFT JOIN (
                 SELECT source_batch_id, SUM(quantity_remaining) AS shelf_qty
                 FROM product_selling_stock GROUP BY source_batch_id
             ) selling ON selling.source_batch_id = ib.batch_id
             WHERE ib.batch_status = 'active'
               AND ib.storage_qty + COALESCE(selling.shelf_qty, 0) > 0"
        );
        $expiringSoon = 0;
        foreach ($expiringRows as $expiryRow) {
            if (inventoryExpiryStatus(
                $expiryRow['expiry_date'] ?? null,
                $expiryRow['days_left'] ?? null,
                (int) ($expiryRow['expiry_alert_days'] ?? 30)
            ) === 'Expiring Soon') $expiringSoon++;
        }

        echo json_encode([
            'status' => 'success',
            'out_of_stock' => $outOfStock,
            'low_stock' => $lowStock,
            'expiring_soon' => $expiringSoon,
            'pending_po' => (int) dashboardScalar($pdo, "SELECT COUNT(*) FROM purchase_orders WHERE status = 'Pending'")
        ]);
        exit();
    }

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
            'transfer_activity' => $sales['transfer_activity'],
            'supplier_invoice_summary' => $sales['supplier_invoice_summary'],
            'top_suppliers' => $sales['top_suppliers'],
            'inventory_value' => $sales['inventory_value'],
        ]);
        exit();
    }

    $todaySales = dashboardRows($pdo, "SELECT COALESCE(SUM(pay.final_amount), 0) AS revenue,
            COUNT(DISTINCT o.order_id) AS transactions,
            COALESCE(SUM(items.units_sold), 0) AS units_sold
        FROM sales_orders o
        INNER JOIN (SELECT order_id, MAX(final_amount) AS final_amount FROM sales_payments WHERE payment_status = 'paid' GROUP BY order_id) pay ON pay.order_id = o.order_id
        LEFT JOIN (SELECT order_id, SUM(quantity) AS units_sold FROM sales_order_items GROUP BY order_id) items ON items.order_id = o.order_id
        WHERE o.status = 'completed' AND o.completed_at >= CURDATE() AND o.completed_at < DATE_ADD(CURDATE(), INTERVAL 1 DAY)");
    $todayPerformance = $todaySales[0] ?? ['revenue' => 0, 'transactions' => 0, 'units_sold' => 0];

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
            COALESCE(NULLIF(pmu.unit_symbol, ''), pmu.unit_name, 'unit') AS inventory_unit,
            stock.storage_quantity,
            stock.shelf_quantity,
            stock.current_storage_quantity,
            stock.current_shelf_quantity,
            stock.current_stock_quantity AS current_stock,
            stock.reorder_level,
            stock.shelf_minimum,
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
         LEFT JOIN product_measurement_units pmu ON pmu.measurement_unit_id = p.inventory_unit_id
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

    $shelfHealth = ['In Stock' => 0, 'Low Stock' => 0, 'Out of Stock' => 0];
    $storageHealth = ['In Stock' => 0, 'Depleted' => 0];
    $lowShelfProducts = [];
    $reorderNeeded = 0;
    foreach ($stockSummary as $row) {
        $shelfQuantity = (int) ($row['current_shelf_quantity'] ?? 0);
        $storageQuantity = (int) ($row['current_storage_quantity'] ?? 0);
        $onHand = $shelfQuantity + $storageQuantity;
        $shelfMinimum = (int) ($row['shelf_minimum'] ?? INVENTORY_SHELF_MINIMUM_THRESHOLD);
        $reorderPoint = (int) ($row['reorder_level'] ?? INVENTORY_LOW_STOCK_THRESHOLD);
        if ($shelfQuantity <= 0) {
            $shelfHealth['Out of Stock']++;
        } elseif ($shelfQuantity <= $shelfMinimum) {
            $shelfHealth['Low Stock']++;
        } else {
            $shelfHealth['In Stock']++;
        }
        $storageHealth[$storageQuantity > 0 ? 'In Stock' : 'Depleted']++;
        if ($onHand > 0 && $shelfQuantity <= $shelfMinimum) {
            $lowShelfProducts[] = [
                'product_id' => (string) $row['product_id'],
                'product_name' => trim((string) $row['product_name']),
                'brand_name' => trim((string) $row['brand_name']),
                'shelf_quantity' => $shelfQuantity,
                'shelf_minimum' => $shelfMinimum,
                'inventory_unit' => (string) ($row['inventory_unit'] ?? 'unit'),
            ];
        }
        if ($onHand > 0 && $onHand <= $reorderPoint) $reorderNeeded++;
    }
    usort($lowShelfProducts, static fn(array $left, array $right): int => $left['shelf_quantity'] <=> $right['shelf_quantity']);

    $prSummary = [];
    $pendingPr = 0;
    if (dashboardTableExists($pdo, 'purchase_requests')) {
        foreach (dashboardRows($pdo, 'SELECT status, COUNT(*) AS total FROM purchase_requests GROUP BY status ORDER BY status') as $row) {
            $prSummary[] = ['status' => (string) $row['status'], 'count' => (int) $row['total']];
            if ((string) $row['status'] === 'Pending Supervisor Approval') $pendingPr += (int) $row['total'];
        }
    }

    $transferActivity = $sales['transfer_activity'];

    $receivingSummary = dashboardTableExists($pdo, 'purchase_order_receiving') ? dashboardRows(
        $pdo,
        "SELECT inspection_status AS status, COUNT(*) AS count
         FROM (
             SELECT po.po_id,
                    COALESCE(receiving.inspection_status,
                        CASE WHEN po.status = 'Arrived' THEN 'Awaiting Inspection' ELSE NULL END) AS inspection_status
             FROM purchase_orders po
             LEFT JOIN (
                 SELECT po_id, MAX(inspection_status) AS inspection_status
                 FROM purchase_order_receiving
                 GROUP BY po_id
             ) receiving ON receiving.po_id = po.po_id
             WHERE po.status = 'Arrived' OR receiving.po_id IS NOT NULL
         ) receiving_workflow
         WHERE inspection_status IS NOT NULL
         GROUP BY inspection_status
         ORDER BY inspection_status"
    ) : [];
    foreach ($receivingSummary as &$receivingRow) $receivingRow['count'] = (int) $receivingRow['count'];
    unset($receivingRow);

    $returnDamageSummary = dashboardTableExists($pdo, 'supplier_claims') ? dashboardRows(
        $pdo,
        "SELECT claim_status AS status, COUNT(*) AS count
         FROM supplier_claims
         GROUP BY claim_status
         ORDER BY claim_status"
    ) : [];
    foreach ($returnDamageSummary as &$claimRow) $claimRow['count'] = (int) $claimRow['count'];
    unset($claimRow);

    $awaitingInspection = array_sum(array_map(
        static fn(array $row): int => str_starts_with(strtolower((string) ($row['status'] ?? '')), 'awaiting') ? (int) $row['count'] : 0,
        $receivingSummary
    ));
    $replacementPending = (int) dashboardScalar($pdo, "SELECT COUNT(*) FROM supplier_claims
        WHERE (resolution_type = 'Replacement' OR claim_status LIKE '%Replacement%')
          AND claim_status NOT IN ('Resolved', 'Resolved / Credit Issued', 'Replacement Received / Resolved', 'Completed')");
    $supplierCreditPending = (int) dashboardScalar($pdo, "SELECT COUNT(*) FROM supplier_claims
        WHERE (resolution_type IN ('Next PO Credit', 'Credit', 'Supplier Credit') OR claim_status LIKE '%Credit%')
          AND claim_status NOT IN ('Resolved', 'Resolved / Credit Issued', 'Replacement Received / Resolved', 'Completed')");

    $expiryRows = dashboardRows(
        $pdo,
        "SELECT ib.batch_id, p.product_name, p.brand_name, ib.expiry_date,
                COALESCE(ib.expiry_alert_days, pi.expiry_alert_days, 30) AS expiry_alert_days,
                DATEDIFF(ib.expiry_date, CURDATE()) AS days_left,
                ib.storage_qty + COALESCE(selling.shelf_qty, 0) AS on_hand
         FROM inventory_batches ib
         INNER JOIN product p ON p.product_id = ib.product_id
         LEFT JOIN product_inventory pi ON pi.inventory_id = ib.legacy_inventory_id
         LEFT JOIN (
             SELECT source_batch_id, SUM(quantity_remaining) AS shelf_qty
             FROM product_selling_stock GROUP BY source_batch_id
         ) selling ON selling.source_batch_id = ib.batch_id
         WHERE ib.batch_status = 'active'
           AND ib.storage_qty + COALESCE(selling.shelf_qty, 0) > 0
         ORDER BY ib.expiry_date IS NULL, ib.expiry_date, p.product_name"
    );
    $expiryStatusCounts = ['Safe' => 0, 'Expiring Soon' => 0, 'Expired' => 0, 'Not Recorded' => 0];
    $nextBatchesToExpire = [];
    $expiredBatches = [];
    $nearExpiryIndex = [];
    $nearExpiryStart = new DateTimeImmutable('first day of this month');
    for ($month = 0; $month < 4; $month++) {
        $monthDate = $nearExpiryStart->modify("+{$month} months");
        $nearExpiryIndex[$monthDate->format('Y-m')] = [
            'month' => $monthDate->format('Y-m'),
            'label' => $monthDate->format('M'),
            'batch_count' => 0,
            'quantity_affected' => 0,
        ];
    }
    foreach ($expiryRows as $row) {
        $status = inventoryExpiryStatus($row['expiry_date'] ?? null, $row['days_left'] ?? null, (int) ($row['expiry_alert_days'] ?? 30));
        if (array_key_exists($status, $expiryStatusCounts)) $expiryStatusCounts[$status]++;
        if (!empty($row['expiry_date']) && (int) $row['days_left'] >= 0) {
            $nextBatchesToExpire[] = [
                'batch_id' => (string) $row['batch_id'],
                'product_name' => (string) $row['product_name'],
                'brand_name' => (string) $row['brand_name'],
                'expiry_date' => (string) $row['expiry_date'],
                'days_left' => (int) $row['days_left'],
                'status' => $status,
            ];
            $monthKey = substr((string) $row['expiry_date'], 0, 7);
            if (isset($nearExpiryIndex[$monthKey])) {
                $nearExpiryIndex[$monthKey]['batch_count']++;
                $nearExpiryIndex[$monthKey]['quantity_affected'] += (int) ($row['on_hand'] ?? 0);
            }
        } elseif (!empty($row['expiry_date']) && (int) $row['days_left'] < 0 && count($expiredBatches) < 5) {
            $expiredBatches[] = [
                'batch_id' => (string) $row['batch_id'],
                'product_name' => (string) $row['product_name'],
                'brand_name' => (string) $row['brand_name'],
                'expiry_date' => (string) $row['expiry_date'],
                'on_hand' => (int) ($row['on_hand'] ?? 0),
            ];
        }
    }
    $nextBatchesToExpire = array_slice($nextBatchesToExpire, 0, 5);
    $nearExpiryMonths = array_values($nearExpiryIndex);

    $inventoryByCategory = dashboardRows($pdo, "SELECT COALESCE(NULLIF(pc.category_name, ''), 'Uncategorized') AS category_name,
            COUNT(*) AS product_count
        FROM product p
        LEFT JOIN product_categories pc ON pc.category_id = p.category_id
        WHERE COALESCE(NULLIF(TRIM(p.status), ''), 'Active') <> 'Inactive'
        GROUP BY pc.category_id, COALESCE(NULLIF(pc.category_name, ''), 'Uncategorized')
        ORDER BY product_count DESC, category_name");
    foreach ($inventoryByCategory as &$categoryRow) $categoryRow['product_count'] = (int) $categoryRow['product_count'];
    unset($categoryRow);

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

    $recentTransactions = dashboardRows($pdo, "SELECT o.order_id, o.order_no, r.receipt_no,
            o.completed_at, pay.final_amount, pay.payment_method,
            COALESCE(NULLIF(sc.full_name, ''), sc.username, 'Unassigned') AS sales_clerk_name,
            COALESCE(NULLIF(ca.full_name, ''), ca.username, 'Unassigned') AS cashier_name,
            CASE WHEN o.sales_clerk_id = o.assigned_cashier_id THEN 'Cashier POS' ELSE 'Sales Clerk' END AS transaction_source
        FROM sales_orders o
        INNER JOIN (
            SELECT order_id, MAX(payment_id) AS payment_id, MAX(final_amount) AS final_amount,
                   MAX(payment_method) AS payment_method
            FROM sales_payments WHERE payment_status = 'paid' GROUP BY order_id
        ) pay ON pay.order_id = o.order_id
        LEFT JOIN sales_receipts r ON r.order_id = o.order_id
        LEFT JOIN users sc ON sc.user_id = o.sales_clerk_id
        LEFT JOIN users ca ON ca.user_id = o.assigned_cashier_id
        WHERE o.status = 'completed'
        ORDER BY o.completed_at DESC, o.order_id DESC
        LIMIT 8");
    foreach ($recentTransactions as &$transactionRow) {
        $transactionRow['order_id'] = (int) $transactionRow['order_id'];
        $transactionRow['final_amount'] = round((float) $transactionRow['final_amount'], 2);
    }
    unset($transactionRow);

    seedActivityLogsFromExistingDashboardSources($pdo);
    $recentActivityCandidates = dashboardRows(
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
         LIMIT 30"
    );
    $recentActivities = [];
    $activityModuleCounts = [];
    $selectedActivityIds = [];
    foreach ($recentActivityCandidates as $activity) {
        $moduleKey = strtolower(trim((string) ($activity['module'] ?? 'system')));
        if (($activityModuleCounts[$moduleKey] ?? 0) >= 2) continue;
        $recentActivities[] = $activity;
        $activityModuleCounts[$moduleKey] = ($activityModuleCounts[$moduleKey] ?? 0) + 1;
        $selectedActivityIds[(string) $activity['activity_id']] = true;
        if (count($recentActivities) >= 8) break;
    }
    if (count($recentActivities) < 8) {
        foreach ($recentActivityCandidates as $activity) {
            if (isset($selectedActivityIds[(string) $activity['activity_id']])) continue;
            $recentActivities[] = $activity;
            if (count($recentActivities) >= 8) break;
        }
    }
    usort($recentActivities, static function (array $left, array $right): int {
        $timeOrder = strcmp((string) $right['created_at'], (string) $left['created_at']);
        return $timeOrder !== 0 ? $timeOrder : strcmp((string) $right['activity_id'], (string) $left['activity_id']);
    });

    echo json_encode([
        'status' => 'success',
        'business_date' => date('Y-m-d'),
        'today_sales' => round((float) $todayPerformance['revenue'], 2),
        'transactions_today' => (int) $todayPerformance['transactions'],
        'units_sold_today' => (int) $todayPerformance['units_sold'],
        'period' => $sales['period'],
        'summary' => $sales['summary'],
        'pending_po' => $pendingPo,
        'pending_pr' => $pendingPr,
        'outstanding_po_payments' => $outstandingPoPayments,
        'low_stock' => count($lowStockProducts),
        'low_shelf_stock' => count($lowShelfProducts),
        'reorder_needed' => $reorderNeeded,
        'expiring_soon' => $expiryStatusCounts['Expiring Soon'],
        'missing_expiry_dates' => $expiryStatusCounts['Not Recorded'],
        'out_of_stock' => count($outOfStockProducts),
        'awaiting_inspection' => $awaitingInspection,
        'replacement_pending' => $replacementPending,
        'supplier_credit_pending' => $supplierCreditPending,
        'sales_trend' => $sales['sales_trend'],
        'category_sales' => $sales['category_sales'],
        'po_summary' => $poSummary,
        'pr_summary' => $prSummary,
        'shelf_stock_health' => array_map(static fn(string $status, int $count): array => ['status' => $status, 'count' => $count], array_keys($shelfHealth), array_values($shelfHealth)),
        'storage_reserve_health' => array_map(static fn(string $status, int $count): array => ['status' => $status, 'count' => $count], array_keys($storageHealth), array_values($storageHealth)),
        'transfer_activity' => $transferActivity,
        'supplier_invoice_summary' => $sales['supplier_invoice_summary'],
        'top_suppliers' => $sales['top_suppliers'],
        'inventory_value' => $sales['inventory_value'],
        'receiving_summary' => $receivingSummary,
        'return_damage_summary' => $returnDamageSummary,
        'expiry_status_overview' => array_map(static fn(string $status, int $count): array => ['status' => $status, 'count' => $count], array_keys($expiryStatusCounts), array_values($expiryStatusCounts)),
        'next_batches_to_expire' => $nextBatchesToExpire,
        'expired_batches' => $expiredBatches,
        'near_expiry_months' => $nearExpiryMonths,
        'low_shelf_products' => array_slice($lowShelfProducts, 0, 5),
        'inventory_by_category' => $inventoryByCategory,
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
        'recent_transactions' => $recentTransactions,
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
