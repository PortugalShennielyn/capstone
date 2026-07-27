<?php

declare(strict_types=1);

require_once __DIR__ . '/../pharma-api/config/db_connection.php';
require_once __DIR__ . '/../pharma-api/v1/purchase_orders/purchase_order_helpers.php';

function assertSameValue($expected, $actual, string $message): void
{
    if ($expected !== $actual) {
        throw new RuntimeException($message . ' Expected ' . var_export($expected, true) . ', got ' . var_export($actual, true) . '.');
    }
}

$statement = $pdo->prepare(
    "SELECT sp.product_id, sp.supplier_cost_price, sp.purchase_unit, sp.units_per_purchase_unit
     FROM supplier_products sp
     INNER JOIN suppliers s ON s.supplier_id = sp.supplier_id
     INNER JOIN product p ON p.product_id = sp.product_id
     LEFT JOIN grocery_details gd ON gd.product_id = p.product_id
     WHERE LOWER(s.supplier_name) = 'rose pharmacy'
       AND LOWER(p.product_name) = 'tuna'
       AND LOWER(COALESCE(gd.variant, '')) = 'hot & spicy'
       AND COALESCE(gd.net_weight, 0) = 100
       AND LOWER(COALESCE(gd.unit, '')) = 'g'
       AND LOWER(COALESCE(gd.package_type, '')) = 'can'
     LIMIT 1"
);
$statement->execute();
$tuna = $statement->fetch(PDO::FETCH_ASSOC);
if (!$tuna) {
    throw new RuntimeException('The Rose pharmacy Tuna — Hot & Spicy • 100 g • Can supplier-product fixture was not found.');
}

assertSameValue('20.00', (string) $tuna['supplier_cost_price'], 'Supplier cost must be per can.');
assertSameValue('Box', (string) $tuna['purchase_unit'], 'Purchase unit must be Box.');
assertSameValue(100, (int) $tuna['units_per_purchase_unit'], 'A box must contain 100 cans.');

$cases = [
    ['label' => 'Test A', 'purchase_qty' => 1, 'units_per_purchase_unit' => 100, 'price' => 20, 'base_units' => 100, 'line_total' => 2000.0],
    ['label' => 'Screenshot / Test D', 'purchase_qty' => 2, 'units_per_purchase_unit' => 100, 'price' => 20, 'base_units' => 200, 'line_total' => 4000.0],
    ['label' => 'Test B', 'purchase_qty' => 3, 'units_per_purchase_unit' => 100, 'price' => 20, 'base_units' => 300, 'line_total' => 6000.0],
    ['label' => 'Test C', 'purchase_qty' => 5, 'units_per_purchase_unit' => 1, 'price' => 20, 'base_units' => 5, 'line_total' => 100.0],
];

foreach ($cases as $case) {
    $calculation = calculatedPurchaseOrderItemAmounts($case);
    assertSameValue($case['base_units'], $calculation['inventory_qty_ordered'], $case['label'] . ' base-unit quantity mismatch.');
    assertSameValue($case['line_total'], $calculation['line_total'], $case['label'] . ' line-total mismatch.');
}

$validItem = [
    'product_id' => $tuna['product_id'],
    'purchase_qty' => 2,
    'purchase_unit' => 'Box',
    'units_per_purchase_unit' => 100,
    'price' => 20,
    'line_total' => 4000,
];
assertSameValue(4000.0, validateSubmittedPurchaseOrderTotals(
    ['subtotal' => 4000, 'grand_total' => 4000],
    [$validItem]
), 'Valid submitted total must pass server validation.');

$tamperedRejected = false;
try {
    validateSubmittedPurchaseOrderTotals(
        ['subtotal' => 40, 'grand_total' => 40],
        [array_merge($validItem, ['line_total' => 40])]
    );
} catch (InvalidArgumentException $error) {
    $tamperedRejected = true;
}
assertSameValue(true, $tamperedRejected, 'A manipulated frontend total must be rejected.');

echo "Purchase-order calculation tests passed.\n";

