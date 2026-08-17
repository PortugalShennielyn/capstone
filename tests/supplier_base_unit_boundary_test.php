<?php
require_once __DIR__ . '/../pharma-api/v1/suppliers/purchasing_conversion.php';

function boundaryAssert(bool $condition, string $message): void
{
    if (!$condition) throw new RuntimeException($message);
}

$eveready = supplierPurchasingConversion([
    'purchase_unit'=>'Carton','inventory_unit'=>'Blister Pack',
    'hierarchy_levels'=>[['unit'=>'Box','quantity'=>10],['unit'=>'Blister Pack','quantity'=>10]],
]);
$evereadyCost = supplierPurchasingCost(['supplier_cost_input'=>500,'supplier_cost_basis'=>'purchase'], $eveready);
boundaryAssert($eveready['summary'] === '1 Carton = 10 Boxes = 100 Blister Packs', 'Eveready must stop at Blister Pack.');
boundaryAssert($eveready['base_qty_per_purchase_unit'] === 100, 'Eveready Carton must contain 100 base Blister Packs.');
boundaryAssert(abs($evereadyCost['supplier_cost_per_inventory_unit'] - 5) < 0.0001, 'Eveready normalized base cost must remain internal only.');
boundaryAssert(inventoryQuantityForPurchaseQuantity(2, $eveready['base_qty_per_purchase_unit']) === 200, 'Two Eveready Cartons must receive 200 Blister Packs.');

$milo = supplierPurchasingConversion([
    'purchase_unit'=>'Box','inventory_unit'=>'Sachet',
    'hierarchy_levels'=>[['unit'=>'Pack','quantity'=>10],['unit'=>'Sachet','quantity'=>12]],
]);
boundaryAssert($milo['summary'] === '1 Box = 10 Packs = 120 Sachets', 'Milo hierarchy is incorrect.');

$medicine = supplierPurchasingConversion([
    'purchase_unit'=>'Box','inventory_unit'=>'Tablet',
    'hierarchy_levels'=>[['unit'=>'Strip','quantity'=>20],['unit'=>'Tablet','quantity'=>10]],
]);
boundaryAssert($medicine['summary'] === '1 Box = 20 Strips = 200 Tablets', 'Medicine hierarchy is incorrect.');

$cartonMedicine = supplierPurchasingConversion([
    'purchase_unit'=>'Carton','inventory_unit'=>'Tablet',
    'hierarchy_levels'=>[['unit'=>'Box','quantity'=>5],['unit'=>'Strip','quantity'=>20],['unit'=>'Tablet','quantity'=>10]],
]);
boundaryAssert($cartonMedicine['summary'] === '1 Carton = 5 Boxes = 100 Strips = 1,000 Tablets', 'Carton medicine hierarchy is incorrect.');

$same = supplierPurchasingConversion([
    'purchase_unit'=>'Pack','inventory_unit'=>'Pack',
    'hierarchy_levels'=>[['unit'=>'Pack','quantity'=>1]],
]);
boundaryAssert($same['base_qty_per_purchase_unit'] === 1 && $same['summary'] === '1 Pack = 1 Pack', 'Equal Purchase/Base Unit must be 1:1.');

$invalidCases = [
    ['purchase_unit'=>'Box','inventory_unit'=>'Pack','hierarchy_levels'=>[['unit'=>'Pack','quantity'=>50],['unit'=>'Piece','quantity'=>2]]],
    ['purchase_unit'=>'Box','inventory_unit'=>'Pack','hierarchy_levels'=>[['unit'=>'Pack','quantity'=>1],['unit'=>'Pack','quantity'=>2]]],
    ['purchase_unit'=>'Pack','inventory_unit'=>'Pack','hierarchy_levels'=>[['unit'=>'Pack','quantity'=>2]]],
    ['purchase_unit'=>'Box','inventory_unit'=>'Tablet','hierarchy_levels'=>[['unit'=>'Strip','quantity'=>0],['unit'=>'Tablet','quantity'=>10]]],
];
foreach ($invalidCases as $case) {
    $rejected = false;
    try { supplierPurchasingConversion($case); } catch (InvalidArgumentException $error) { $rejected = true; }
    boundaryAssert($rejected, 'Invalid or below-base hierarchy was accepted.');
}

echo "Supplier Product Base Unit boundary tests passed.\n";
