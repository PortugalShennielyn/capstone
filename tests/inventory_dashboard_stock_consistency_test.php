<?php

declare(strict_types=1);

require_once __DIR__ . '/../pharma-api/config/db_connection.php';
require_once __DIR__ . '/../pharma-api/v1/inventory/inventory_stock_summary.php';

function inventoryStockAssert(bool $condition, string $message): void
{
    if (!$condition) {
        throw new RuntimeException($message);
    }
}

$stockSql = inventoryStockSummarySql();
$rows = $pdo->query(
    "SELECT
        p.product_id,
        p.status AS product_status,
        stock.storage_quantity,
        stock.shelf_quantity,
        stock.total_quantity,
        stock.reorder_level,
        stock.stock_status
     FROM ({$stockSql}) stock
     INNER JOIN product p ON p.product_id = stock.product_id"
)->fetchAll(PDO::FETCH_ASSOC);

$trackedProductCount = (int) $pdo->query('SELECT COUNT(DISTINCT product_id) FROM inventory_batches')->fetchColumn();
$masterProductCount = (int) $pdo->query('SELECT COUNT(*) FROM product')->fetchColumn();
$uniqueProductIds = array_unique(array_column($rows, 'product_id'));

inventoryStockAssert(count($rows) === $trackedProductCount, 'The stock summary must contain every tracked product exactly once.');
inventoryStockAssert(count($rows) === count($uniqueProductIds), 'Duplicate batch rows must not duplicate products in the stock summary.');
inventoryStockAssert(count($rows) <= $masterProductCount, 'The stock summary cannot contain products outside Product Master.');

$dashboardDocument = new DOMDocument();
libxml_use_internal_errors(true);
$dashboardDocument->loadHTML((string) file_get_contents(__DIR__ . '/../pharma-frontend/dashboard.html'));
libxml_clear_errors();
$dashboardXPath = new DOMXPath($dashboardDocument);
$outOfStockCard = $dashboardXPath->query("//*[@id='kpiOutOfStock']/ancestor::button[@data-kpi-detail='out_stock'][1]")->item(0);
$lowStockCard = $dashboardXPath->query("//*[@id='kpiLowStock']/ancestor::button[@data-kpi-detail='low_stock'][1]")->item(0);
$expiringSoonCard = $dashboardXPath->query("//*[@id='kpiExpiringSoon']/ancestor::button[@data-kpi-detail='expiring_soon'][1]")->item(0);
inventoryStockAssert($outOfStockCard instanceof DOMElement, 'The Out of Stock card must open the reusable detail modal.');
inventoryStockAssert($lowStockCard instanceof DOMElement, 'The Low Stock card must open the reusable detail modal.');
inventoryStockAssert($expiringSoonCard instanceof DOMElement, 'The Expiring Soon card must open the reusable detail modal.');

$dashboardHtml = (string) file_get_contents(__DIR__ . '/../pharma-frontend/dashboard.html');
inventoryStockAssert(substr_count($dashboardHtml, 'id="dashboardAlertDetailModal"') === 1, 'Dashboard must keep one reusable alert detail modal.');
inventoryStockAssert(str_contains($dashboardHtml, 'moduleHref: "inventory.html?stock_status=out_of_stock"'), 'The Out of Stock modal has the wrong Inventory destination.');
inventoryStockAssert(str_contains($dashboardHtml, 'moduleHref: "inventory.html?stock_status=low_stock"'), 'The Low Stock modal has the wrong Inventory destination.');
inventoryStockAssert(str_contains($dashboardHtml, 'moduleHref: "expiry_monitoring.html"'), 'The Expiring Soon modal has the wrong destination.');
inventoryStockAssert(str_contains($dashboardHtml, 'fetchDashboardDetailResource("inventory", `${API_BASE_URL}/inventory/get_inventory.php`'), 'Stock detail rows must use the Inventory API.');

$inventoryScript = (string) file_get_contents(__DIR__ . '/../pharma-frontend/js/modules/inventory.js');
inventoryStockAssert(str_contains($inventoryScript, "inventoryQuery.get('stock_status')"), 'Inventory must read the dashboard stock-status query parameter.');
inventoryStockAssert(str_contains($inventoryScript, 'stockStatusFilter.value = requestedStockStatus'), 'Inventory must select the requested stock-status filter.');

$pdo->beginTransaction();
try {
    $fixtureProductId = (string) $pdo->query('SELECT UUID()')->fetchColumn();
    $typeId = (string) $pdo->query('SELECT type_id FROM product_types ORDER BY type_id LIMIT 1')->fetchColumn();
    inventoryStockAssert($typeId !== '', 'A product type is required for the stock consistency fixture.');

    $pdo->prepare(
        "INSERT INTO product (product_id, barcode, brand_name, product_name, price, type_id, status)
         VALUES (:product_id, :barcode, 'Stock Test', 'Dashboard Inventory Fixture', 1, :type_id, 'Active')"
    )->execute([
        ':product_id' => $fixtureProductId,
        ':barcode' => 'stock-test-' . $fixtureProductId,
        ':type_id' => $typeId,
    ]);

    $fixtureStock = $pdo->prepare("SELECT * FROM ({$stockSql}) stock WHERE stock.product_id = :product_id");
    $fixtureStock->execute([':product_id' => $fixtureProductId]);
    inventoryStockAssert($fixtureStock->fetch() === false, 'A catalog-only product must not be treated as inventory stock.');

    $insertBatch = $pdo->prepare(
        "INSERT INTO inventory_batches (batch_id, product_id, received_qty, storage_qty, shelf_qty, batch_status)
         VALUES (:batch_id, :product_id, :received_qty, :storage_qty, 0, 'active')"
    );
    $insertBatch->execute([
        ':batch_id' => (string) $pdo->query('SELECT UUID()')->fetchColumn(),
        ':product_id' => $fixtureProductId,
        ':received_qty' => 0,
        ':storage_qty' => 0,
    ]);
    $fixtureStock->execute([':product_id' => $fixtureProductId]);
    $zeroStock = $fixtureStock->fetch(PDO::FETCH_ASSOC);
    inventoryStockAssert($zeroStock && $zeroStock['stock_status'] === 'Out of Stock', 'A tracked zero-quantity product must be Out of Stock.');

    $insertBatch->execute([
        ':batch_id' => (string) $pdo->query('SELECT UUID()')->fetchColumn(),
        ':product_id' => $fixtureProductId,
        ':received_qty' => 4,
        ':storage_qty' => 4,
    ]);
    $fixtureStock->execute([':product_id' => $fixtureProductId]);
    $lowStock = $fixtureStock->fetchAll(PDO::FETCH_ASSOC);
    inventoryStockAssert(count($lowStock) === 1, 'Multiple batches must aggregate to one inventory product.');
    inventoryStockAssert((int) $lowStock[0]['total_quantity'] === 4 && $lowStock[0]['stock_status'] === 'Low Stock', 'Positive stock at the threshold must be Low Stock.');

    $pdo->prepare("UPDATE product SET status = 'Inactive' WHERE product_id = :product_id")
        ->execute([':product_id' => $fixtureProductId]);
    $activeFixture = $pdo->prepare(
        "SELECT COUNT(*)
         FROM ({$stockSql}) stock
         INNER JOIN product p ON p.product_id = stock.product_id
         WHERE COALESCE(NULLIF(TRIM(p.status), ''), 'Active') <> 'Inactive'
           AND stock.product_id = :product_id"
    );
    $activeFixture->execute([':product_id' => $fixtureProductId]);
    inventoryStockAssert((int) $activeFixture->fetchColumn() === 0, 'Inactive products must be excluded from dashboard stock alerts.');
} finally {
    $pdo->rollBack();
}

$activeOutOfStock = 0;
$activeLowStock = 0;
foreach ($rows as $row) {
    $onHand = (int) $row['storage_quantity'] + (int) $row['shelf_quantity'];
    $threshold = (int) $row['reorder_level'];
    $expectedStatus = match (true) {
        $onHand === 0 => 'Out of Stock',
        $onHand > 0 && $onHand <= $threshold => 'Low Stock',
        $onHand > $threshold => 'In Stock',
        default => 'Inventory Data Issue',
    };

    inventoryStockAssert($onHand === (int) $row['total_quantity'], 'On hand must equal storage plus shelf.');
    inventoryStockAssert($expectedStatus === $row['stock_status'], 'The shared stock status does not match the business rule.');

    if (strcasecmp((string) $row['product_status'], 'Inactive') !== 0) {
        $activeOutOfStock += $row['stock_status'] === 'Out of Stock' ? 1 : 0;
        $activeLowStock += $row['stock_status'] === 'Low Stock' ? 1 : 0;
    }
}

echo "Inventory/dashboard stock consistency tests passed.\n";
echo "Tracked products: " . count($rows) . "; catalog-only products excluded: " . ($masterProductCount - count($rows)) . ".\n";
echo "Active out of stock: {$activeOutOfStock}; active low stock: {$activeLowStock}.\n";
