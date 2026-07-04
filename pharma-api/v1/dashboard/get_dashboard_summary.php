<?php
require_once '../../config/db_connection.php';
require_once '../../config/require_auth.php';
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
    if (!dashboardTableExists($pdo, 'sales')) {
        $missing[] = 'sales table';
        if (!dashboardTableExists($pdo, 'sale_details')) {
            $missing[] = 'sale_details table';
        }

        return [
            'today_sales' => 0,
            'transactions_today' => 0,
            'sales_trend' => [],
            'top_selling_products' => []
        ];
    }

    $dateColumn = dashboardColumnExists($pdo, 'sales', 'created_at') ? 'created_at' : null;
    foreach (['sale_date', 'sales_date', 'transaction_date'] as $candidate) {
        if (!$dateColumn && dashboardColumnExists($pdo, 'sales', $candidate)) {
            $dateColumn = $candidate;
        }
    }

    $amountColumn = dashboardColumnExists($pdo, 'sales', 'total_amount') ? 'total_amount' : null;
    foreach (['grand_total', 'total', 'amount_paid', 'net_total'] as $candidate) {
        if (!$amountColumn && dashboardColumnExists($pdo, 'sales', $candidate)) {
            $amountColumn = $candidate;
        }
    }

    $statusColumn = dashboardColumnExists($pdo, 'sales', 'status') ? 'status' : null;
    $completedFilter = $statusColumn ? " AND {$statusColumn} IN ('Completed', 'Paid', 'complete', 'paid')" : '';

    if (!$dateColumn) {
        $missing[] = 'sales date column';
    }
    if (!$amountColumn) {
        $missing[] = 'sales amount column';
    }

    $todaySales = 0;
    $transactionsToday = 0;
    $trend = [];

    if ($dateColumn && $amountColumn) {
        $todaySales = (float) dashboardScalar(
            $pdo,
            "SELECT COALESCE(SUM({$amountColumn}), 0)
             FROM sales
             WHERE DATE({$dateColumn}) = CURDATE()
             {$completedFilter}"
        );
        $transactionsToday = (int) dashboardScalar(
            $pdo,
            "SELECT COUNT(*)
             FROM sales
             WHERE DATE({$dateColumn}) = CURDATE()
             {$completedFilter}"
        );
        $trend = dashboardRows(
            $pdo,
            "SELECT DATE({$dateColumn}) AS sale_date, COALESCE(SUM({$amountColumn}), 0) AS total_sales
             FROM sales
             WHERE DATE({$dateColumn}) >= DATE_SUB(CURDATE(), INTERVAL 6 DAY)
             {$completedFilter}
             GROUP BY DATE({$dateColumn})
             ORDER BY DATE({$dateColumn}) ASC"
        );
        foreach ($trend as &$row) {
            $row['total_sales'] = (float) $row['total_sales'];
        }
        unset($row);
    }

    $topSelling = [];
    if (dashboardTableExists($pdo, 'sale_details')) {
        $saleIdColumn = dashboardColumnExists($pdo, 'sales', 'sale_id') ? 'sale_id' : null;
        $detailsSaleIdColumn = dashboardColumnExists($pdo, 'sale_details', 'sale_id') ? 'sale_id' : null;
        $detailsProductColumn = dashboardColumnExists($pdo, 'sale_details', 'product_id') ? 'product_id' : null;
        $detailsQtyColumn = dashboardColumnExists($pdo, 'sale_details', 'quantity') ? 'quantity' : null;
        $detailsAmountColumn = dashboardColumnExists($pdo, 'sale_details', 'line_total') ? 'line_total' : null;

        foreach (['total_amount', 'subtotal', 'amount'] as $candidate) {
            if (!$detailsAmountColumn && dashboardColumnExists($pdo, 'sale_details', $candidate)) {
                $detailsAmountColumn = $candidate;
            }
        }

        if ($saleIdColumn && $detailsSaleIdColumn && $detailsProductColumn && $detailsQtyColumn && $detailsAmountColumn && $dateColumn) {
            $topSelling = dashboardRows(
                $pdo,
                "SELECT
                    p.product_name,
                    p.brand_name,
                    SUM(sd.{$detailsQtyColumn}) AS quantity_sold,
                    SUM(sd.{$detailsAmountColumn}) AS total_sales
                 FROM sale_details sd
                 INNER JOIN sales s ON s.{$saleIdColumn} = sd.{$detailsSaleIdColumn}
                 INNER JOIN product p ON p.product_id = sd.{$detailsProductColumn}
                 WHERE DATE(s.{$dateColumn}) >= DATE_SUB(CURDATE(), INTERVAL 6 DAY)
                 {$completedFilter}
                 GROUP BY p.product_id, p.product_name, p.brand_name
                 ORDER BY quantity_sold DESC, total_sales DESC
                 LIMIT 5"
            );
            foreach ($topSelling as &$row) {
                $row['quantity_sold'] = (int) $row['quantity_sold'];
                $row['total_sales'] = (float) $row['total_sales'];
            }
            unset($row);
        } else {
            $missing[] = 'sale_details reporting columns';
        }
    } else {
        $missing[] = 'sale_details table';
    }

    return [
        'today_sales' => $todaySales,
        'transactions_today' => $transactionsToday,
        'sales_trend' => $trend,
        'top_selling_products' => $topSelling
    ];
}

try {
    ensurePurchaseOrderSchema($pdo);
    ensureProductCategorySchema($pdo);

    $missing = [];
    $sales = dashboardSalesPayload($pdo, $missing);

    $pendingPo = (int) dashboardScalar($pdo, "SELECT COUNT(*) FROM purchase_orders WHERE status = 'Pending'");

    $stockSummary = dashboardRows(
        $pdo,
        "SELECT
            p.product_id,
            p.product_name,
            p.brand_name,
            COALESCE(storage.storage_quantity, 0) AS storage_quantity,
            COALESCE(shelf.shelf_quantity, 0) AS shelf_quantity,
            COALESCE(storage.storage_quantity, 0) + COALESCE(shelf.shelf_quantity, 0) AS current_stock,
            storage.nearest_expiry_date,
            CASE
                WHEN storage.nearest_expiry_date IS NULL THEN NULL
                ELSE DATEDIFF(storage.nearest_expiry_date, CURDATE())
            END AS days_until_expiry
         FROM product p
         LEFT JOIN (
            SELECT
                product_id,
                SUM(quantity_remaining) AS storage_quantity,
                MIN(CASE WHEN quantity_remaining > 0 AND expiration_date IS NOT NULL THEN expiration_date END) AS nearest_expiry_date
            FROM product_inventory
            GROUP BY product_id
         ) storage ON storage.product_id = p.product_id
         LEFT JOIN (
            SELECT product_id, SUM(quantity_remaining) AS shelf_quantity
            FROM product_selling_stock
            GROUP BY product_id
         ) shelf ON shelf.product_id = p.product_id
         ORDER BY p.product_name ASC, p.brand_name ASC"
    );

    $lowStockProducts = [];
    $outOfStockProducts = [];
    $expiringProducts = [];

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
        }

        if ($daysUntilExpiry !== null && $daysUntilExpiry >= 0 && $daysUntilExpiry <= 30) {
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

    $recentActivities = [];

    foreach (dashboardRows(
        $pdo,
        "SELECT po_number, status, created_at
         FROM purchase_orders
         ORDER BY created_at DESC
         LIMIT 5"
    ) as $row) {
        $recentActivities[] = [
            'type' => 'Purchase Order',
            'message' => 'PO ' . $row['po_number'] . ' is ' . $row['status'],
            'status' => $row['status'],
            'created_at' => $row['created_at']
        ];
    }

    foreach (dashboardRows(
        $pdo,
        "SELECT
            p.product_name,
            p.brand_name,
            s.quantity_stocked,
            s.created_at
         FROM product_selling_stock s
         INNER JOIN product p ON p.product_id = s.product_id
         ORDER BY s.created_at DESC
         LIMIT 5"
    ) as $row) {
        $recentActivities[] = [
            'type' => 'Inventory',
            'message' => $row['quantity_stocked'] . ' moved to shelf: ' . trim((string) $row['product_name']),
            'status' => 'Moved to Shelf',
            'created_at' => $row['created_at'],
            'brand_name' => trim((string) $row['brand_name'])
        ];
    }

    foreach (dashboardRows(
        $pdo,
        "SELECT
            p.product_name,
            p.brand_name,
            inv.quantity_stocked,
            inv.created_at
         FROM product_inventory inv
         INNER JOIN product p ON p.product_id = inv.product_id
         ORDER BY inv.created_at DESC
         LIMIT 5"
    ) as $row) {
        $recentActivities[] = [
            'type' => 'Inventory',
            'message' => $row['quantity_stocked'] . ' received into storage: ' . trim((string) $row['product_name']),
            'status' => 'Received',
            'created_at' => $row['created_at'],
            'brand_name' => trim((string) $row['brand_name'])
        ];
    }

    usort($recentActivities, static function ($left, $right) {
        return strcmp((string) ($right['created_at'] ?? ''), (string) ($left['created_at'] ?? ''));
    });
    $recentActivities = array_slice($recentActivities, 0, 8);

    echo json_encode([
        'status' => 'success',
        'today_sales' => (float) $sales['today_sales'],
        'transactions_today' => (int) $sales['transactions_today'],
        'pending_po' => $pendingPo,
        'low_stock' => count($lowStockProducts),
        'expiring_soon' => count($expiringProducts),
        'out_of_stock' => count($outOfStockProducts),
        'sales_trend' => $sales['sales_trend'],
        'po_summary' => $poSummary,
        'inventory_health' => [
            'low_stock' => array_slice($lowStockProducts, 0, 5),
            'expiring_soon' => array_slice($expiringProducts, 0, 5),
            'out_of_stock' => array_slice($outOfStockProducts, 0, 5)
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
