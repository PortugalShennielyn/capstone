<?php

declare(strict_types=1);

require_once __DIR__ . '/../pharma-api/v1/suppliers/purchasing_conversion.php';

function stopRuleAssert(bool $condition, string $message): void
{
    if (!$condition) throw new RuntimeException($message);
}

function factors(array $conversion): array
{
    $result = [];
    foreach ($conversion['absolute_levels'] as $level) {
        $result[$level['unit']] = (int)$level['base_quantity'];
    }
    return $result;
}

$battery = supplierPurchasingConversion([
    'purchase_unit' => 'Carton',
    'inventory_unit' => 'Blister Pack',
    'hierarchy_levels' => [
        ['unit' => 'Box', 'quantity' => 5],
        ['unit' => 'Blister Pack', 'quantity' => 10],
    ],
]);
stopRuleAssert(factors($battery) === ['Blister Pack' => 1, 'Box' => 10, 'Carton' => 50], 'Battery conversion must stop at Blister Pack.');
stopRuleAssert(!array_key_exists('Piece', factors($battery)), 'Battery package content must not become an operational Piece unit.');
stopRuleAssert(inventoryQuantityForPurchaseQuantity(2, $battery['base_qty_per_purchase_unit']) === 100, 'Battery receiving must convert Cartons to Blister Packs.');

$mask = supplierPurchasingConversion([
    'purchase_unit' => 'Carton',
    'inventory_unit' => 'Piece',
    'hierarchy_levels' => [
        ['unit' => 'Box', 'quantity' => 20],
        ['unit' => 'Piece', 'quantity' => 50],
    ],
]);
stopRuleAssert(factors($mask) === ['Piece' => 1, 'Box' => 50, 'Carton' => 1000], 'Mask conversion must reach Piece.');

$diaper = supplierPurchasingConversion([
    'purchase_unit' => 'Carton',
    'inventory_unit' => 'Pack',
    'hierarchy_levels' => [['unit' => 'Pack', 'quantity' => 20]],
]);
stopRuleAssert(factors($diaper) === ['Pack' => 1, 'Carton' => 20], 'Diaper conversion must stop at Pack.');
stopRuleAssert(!array_key_exists('Piece', factors($diaper)), 'Diapers inside a Pack are display-only content.');

$tablet = supplierPurchasingConversion([
    'purchase_unit' => 'Box',
    'inventory_unit' => 'Tablet',
    'hierarchy_levels' => [
        ['unit' => 'Blister', 'quantity' => 10],
        ['unit' => 'Tablet', 'quantity' => 10],
    ],
]);
stopRuleAssert(factors($tablet) === ['Tablet' => 1, 'Blister' => 10, 'Box' => 100], 'Tablet conversion must reach Tablet.');

try {
    supplierPurchasingConversion([
        'purchase_unit' => 'Carton',
        'inventory_unit' => 'Pack',
        'hierarchy_levels' => [['unit' => 'Box', 'quantity' => 10]],
    ]);
    throw new RuntimeException('An incomplete conversion was accepted.');
} catch (InvalidArgumentException $error) {
    stopRuleAssert(str_contains($error->getMessage(), 'converts to Pack'), 'Incomplete conversion error must name the Product Master unit.');
}

$sellingOptionsSource = (string)file_get_contents(__DIR__ . '/../pharma-api/v1/products/product_selling_options.php');
$saveSellingSource = (string)file_get_contents(__DIR__ . '/../pharma-api/v1/inventory/save_selling_options.php');
stopRuleAssert(str_contains($sellingOptionsSource, 'productSellableUnitCandidates'), 'POS selling candidates must be product-specific configured units.');
stopRuleAssert(str_contains($saveSellingSource, '$candidateUnits'), 'POS writes must validate selling units against product-specific configured units.');
stopRuleAssert(!str_contains($saveSellingSource, '$baseQuantity !== 1'), 'POS writes must no longer force only the canonical base unit.');

echo "Inventory-unit conversion stopping-rule tests passed.\n";
