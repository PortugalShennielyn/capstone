<?php

declare(strict_types=1);

require_once __DIR__ . '/../pharma-api/config/db_connection.php';
require_once __DIR__ . '/../pharma-api/v1/products/product_status_schema.php';
require_once __DIR__ . '/../pharma-api/v1/sales/sales_pos_helpers.php';
require_once __DIR__ . '/../pharma-api/v1/cashier/cashier_helpers.php';
require_once __DIR__ . '/../pharma-api/v1/purchase_orders/purchase_order_helpers.php';

function statusAssert($expected, $actual, string $message): void
{
    if ($expected !== $actual) {
        throw new RuntimeException(
            $message . ' Expected ' . var_export($expected, true) . ', got ' . var_export($actual, true) . '.'
        );
    }
}

ensureProductStatusColumn($pdo);

$pampersStatement = $pdo->query(
    "SELECT
        p.product_id,
        p.status,
        COALESCE(SUM(ib.storage_qty), 0) AS storage_qty,
        COALESCE(SUM(selling.shelf_qty), 0) AS shelf_qty,
        COALESCE(SUM(ib.damaged_qty), 0) AS damaged_qty,
        COALESCE(SUM(ib.returned_qty), 0) AS returned_qty
     FROM product p
     LEFT JOIN inventory_batches ib ON ib.product_id = p.product_id
     LEFT JOIN (
        SELECT source_batch_id, SUM(quantity_remaining) AS shelf_qty
        FROM product_selling_stock
        WHERE source_batch_id IS NOT NULL
        GROUP BY source_batch_id
     ) selling ON selling.source_batch_id = ib.batch_id
     WHERE LOWER(p.product_name) = 'pampers'
     GROUP BY p.product_id, p.status
     LIMIT 1"
);
$pampers = $pampersStatement->fetch(PDO::FETCH_ASSOC);
if (!$pampers) {
    throw new RuntimeException('The Pampers fixture was not found.');
}

statusAssert('Inactive', $pampers['status'], 'Pampers must finish the test inactive.');
statusAssert(40, (int) $pampers['storage_qty'], 'Pampers storage quantity changed.');
statusAssert(44, (int) $pampers['shelf_qty'], 'Pampers shelf quantity changed.');
statusAssert(84, (int) $pampers['storage_qty'] + (int) $pampers['shelf_qty'], 'Pampers on-hand quantity changed.');
statusAssert(10, (int) $pampers['damaged_qty'], 'Pampers damaged quantity changed.');
statusAssert(0, (int) $pampers['returned_qty'], 'Pampers returned quantity changed.');

$salesProducts = salesLoadProductsByIds($pdo, [$pampers['product_id']]);
[$sellable, $salesMessage] = salesValidateCartStock(
    [['product_id' => $pampers['product_id'], 'quantity' => 1]],
    $salesProducts
);
statusAssert(false, $sellable, 'The POS backend accepted inactive Pampers.');
statusAssert(
    'Pampers is now inactive. Remove it from the order before continuing.',
    $salesMessage,
    'The inactive POS validation message is incorrect.'
);

$historicalPampersSale = $pdo->prepare(
    "SELECT i.order_id
     FROM sales_order_items i
     WHERE i.product_id = :product_id
     ORDER BY i.order_id
     LIMIT 1"
);
$historicalPampersSale->execute([':product_id' => $pampers['product_id']]);
$historicalPampersOrderId = (int) $historicalPampersSale->fetchColumn();
if ($historicalPampersOrderId > 0) {
    $checkoutRejected = false;
    $pdo->beginTransaction();
    try {
        cashierAssertOrderProductsActive($pdo, $historicalPampersOrderId);
    } catch (RuntimeException $error) {
        $checkoutRejected = $error->getMessage()
            === 'Pampers is now inactive. Remove it from the order before continuing.';
    } finally {
        $pdo->rollBack();
    }
    statusAssert(true, $checkoutRejected, 'Cashier checkout validation accepted inactive Pampers.');
}

$poFixtureStatement = $pdo->prepare(
    "SELECT sp.supplier_id, poi.po_id, poi.po_item_id
     FROM supplier_products sp
     LEFT JOIN purchase_order_items poi ON poi.product_id = sp.product_id
     WHERE sp.product_id = :product_id
     ORDER BY poi.po_item_id IS NULL, poi.po_item_id
     LIMIT 1"
);
$poFixtureStatement->execute([':product_id' => $pampers['product_id']]);
$poFixture = $poFixtureStatement->fetch(PDO::FETCH_ASSOC);
if (!$poFixture) {
    throw new RuntimeException('The Pampers supplier assignment fixture was not found.');
}

$newPoRejected = false;
try {
    validateProductsForSupplier(
        $pdo,
        (string) $poFixture['supplier_id'],
        [['product_id' => $pampers['product_id']]]
    );
} catch (InvalidArgumentException $error) {
    $newPoRejected = $error->getMessage() === 'Inactive products cannot be added to a new purchase order.';
}
statusAssert(true, $newPoRejected, 'The PO backend accepted inactive Pampers as a new line.');

if (!empty($poFixture['po_id']) && !empty($poFixture['po_item_id'])) {
    validateProductsForSupplier(
        $pdo,
        (string) $poFixture['supplier_id'],
        [[
            'product_id' => $pampers['product_id'],
            'po_item_id' => $poFixture['po_item_id'],
        ]],
        (string) $poFixture['po_id']
    );
}

echo "Product active/inactive behavior tests passed.\n";
