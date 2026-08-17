<?php
require_once __DIR__ . '/../pharma-api/v1/suppliers/purchasing_conversion.php';

function purchasingHierarchyAssert(bool $condition, string $message): void
{
    if (!$condition) throw new RuntimeException($message);
    echo "PASS: {$message}\n";
}

$scenarios = [
    [
        'label' => 'Carton to Bottles',
        'setup' => ['purchase_unit' => 'Carton', 'purchase_unit_contains' => 24, 'inventory_unit' => 'Bottles', 'units_per_purchase_unit' => 24],
        'requested_purchase_qty' => 3,
        'expected_inventory_qty' => 72,
        'summary' => '1 Carton = 24 Bottles',
    ],
    [
        'label' => 'Box to Stabs',
        'setup' => ['purchase_unit' => 'Box', 'purchase_unit_contains' => 10, 'inventory_unit' => 'Stabs', 'units_per_purchase_unit' => 10],
        'requested_purchase_qty' => 3,
        'expected_inventory_qty' => 30,
        'summary' => '1 Box = 10 Stabs',
    ],
    [
        'label' => 'Box to Stabs to Tablets',
        'setup' => ['purchase_unit' => 'Box', 'purchase_unit_contains' => 10, 'inner_unit' => 'Stabs', 'units_per_inner_unit' => 10, 'inventory_unit' => 'Tablets', 'units_per_purchase_unit' => 100],
        'requested_purchase_qty' => 3,
        'expected_inventory_qty' => 300,
        'summary' => '1 Box = 10 Stabs = 100 Tablets',
    ],
    [
        'label' => 'Case to Packs to Bottles',
        'setup' => ['purchase_unit' => 'Case', 'purchase_unit_contains' => 12, 'inner_unit' => 'Packs', 'units_per_inner_unit' => 6, 'inventory_unit' => 'Bottles', 'units_per_purchase_unit' => 72],
        'requested_purchase_qty' => 3,
        'expected_inventory_qty' => 216,
        'summary' => '1 Case = 12 Packs = 72 Bottles',
    ],
];

foreach ($scenarios as $scenario) {
    $conversion = supplierPurchasingConversion($scenario['setup']);
    $prQuantity = $scenario['requested_purchase_qty'];
    $poQuantity = $prQuantity;
    $receivedPurchaseQuantity = $poQuantity;
    $inventoryQuantity = inventoryQuantityForPurchaseQuantity($receivedPurchaseQuantity, $conversion['base_qty_per_purchase_unit']);

    purchasingHierarchyAssert($conversion['summary'] === $scenario['summary'], "{$scenario['label']} summary is correct");
    purchasingHierarchyAssert($poQuantity === $prQuantity, "{$scenario['label']} keeps PR and PO Purchase Unit quantity unchanged");
    purchasingHierarchyAssert($receivedPurchaseQuantity === $poQuantity, "{$scenario['label']} keeps receiving quantity in Purchase Units");
    purchasingHierarchyAssert($inventoryQuantity === $scenario['expected_inventory_qty'], "{$scenario['label']} posts the correct base inventory quantity");
}

$tabletSetup = $scenarios[2]['setup'];
$conversion = supplierPurchasingConversion($tabletSetup);
$partialReceived = 2;
purchasingHierarchyAssert(inventoryQuantityForPurchaseQuantity($partialReceived, $conversion['base_qty_per_purchase_unit']) === 200, 'Partial receiving of 2 Boxes posts 200 Tablets');
purchasingHierarchyAssert($scenarios[2]['requested_purchase_qty'] - $partialReceived === 1, 'Partial receiving keeps 1 Box as the displayed remainder');
foreach ([
    ['basis' => 'purchase', 'input' => 150, 'base' => 1.5, 'purchase' => 150],
    ['basis' => 'inner', 'input' => 15, 'base' => 1.5, 'purchase' => 150],
    ['basis' => 'inventory', 'input' => 1.5, 'base' => 1.5, 'purchase' => 150],
] as $case) {
    $cost = supplierPurchasingCost(['supplier_cost_input' => $case['input'], 'supplier_cost_basis' => $case['basis']], $conversion);
    purchasingHierarchyAssert(abs($cost['supplier_cost_per_inventory_unit'] - $case['base']) < 0.0001, "{$case['basis']} cost basis normalizes to base-unit cost");
    purchasingHierarchyAssert(abs($cost['estimated_purchase_unit_cost'] - $case['purchase']) < 0.0001, "{$case['basis']} cost basis calculates Purchase Unit cost");
}

$legacy = supplierPurchasingConversion(['purchase_unit' => 'Carton', 'inventory_unit' => 'Pack', 'units_per_purchase_unit' => 10]);
purchasingHierarchyAssert($legacy['base_qty_per_purchase_unit'] === 10 && $legacy['inner_unit'] === null, 'Legacy one-level supplier setups remain direct conversions without an Inner Unit');

$boxPackStab = supplierPurchasingConversion([
    'purchase_unit' => 'Box',
    'purchase_unit_contains' => 10,
    'inner_unit' => 'Pack',
    'units_per_inner_unit' => 10,
    'inventory_unit' => 'Stab',
]);
purchasingHierarchyAssert($boxPackStab['summary'] === '1 Box = 10 Packs = 100 Stabs', 'Box to Pack to Stab hierarchy is displayed in physical order');
$boxCost = supplierPurchasingCost(['supplier_cost_input' => 500, 'supplier_cost_basis' => 'purchase'], $boxPackStab);
purchasingHierarchyAssert(abs($boxCost['estimated_purchase_unit_cost'] - 500) < .0001, 'Supplier Cost remains ₱500 per Box');
purchasingHierarchyAssert(abs((500 / $boxPackStab['contains']) - 50) < .0001, 'Derived cost is ₱50 per Pack');
purchasingHierarchyAssert(abs($boxCost['supplier_cost_per_inventory_unit'] - 5) < .0001, 'Derived cost is ₱5 per Stab');
purchasingHierarchyAssert(inventoryQuantityForPurchaseQuantity(3, $boxPackStab['base_qty_per_purchase_unit']) === 300, 'Receiving 3 Boxes posts 300 Stabs to inventory');
