<?php
declare(strict_types=1);

require_once __DIR__ . '/../pharma-api/v1/purchase_requests/purchase_request_helpers.php';

function fixedUnitAssert(bool $condition, string $message): void
{
    if (!$condition) throw new RuntimeException($message);
}

function fixedUnitRejects(callable $callback, string $message): void
{
    try { $callback(); } catch (InvalidArgumentException $exception) { return; }
    throw new RuntimeException($message);
}

$moxylor = supplierPurchasingConversion([
    'purchase_unit' => 'Box', 'inventory_unit' => 'Bottle',
    'hierarchy_levels' => [['unit' => 'Bottle', 'quantity' => 12]],
]);
$buldak = supplierPurchasingConversion([
    'purchase_unit' => 'Pack', 'inventory_unit' => 'pcs',
    'hierarchy_levels' => [['unit' => 'pcs', 'quantity' => 5]],
]);

fixedUnitAssert(purchaseRequestConfiguredUnit([$moxylor]) === 'Box', 'Moxylor purchase unit is not Box.');
fixedUnitAssert(validatePurchaseRequestPackage([$moxylor], 3, 'Box') === 'Box', 'Moxylor PR unit was not preserved.');
fixedUnitAssert(purchaseRequestExactOrderQuantity(3, 'Box', $moxylor) === 3, 'Moxylor PO quantity was converted twice.');
fixedUnitAssert(inventoryQuantityForPurchaseQuantity(3, $moxylor['base_qty_per_purchase_unit']) === 36, 'Moxylor inventory conversion is not 36 Bottles.');
fixedUnitAssert(purchaseRequestConfiguredUnit([$buldak]) === 'Pack', 'Buldak purchase unit is not Pack.');
fixedUnitAssert(purchaseRequestExactOrderQuantity(2, 'Pack', $buldak) === 2, 'Buldak PO quantity was converted twice.');
fixedUnitAssert(inventoryQuantityForPurchaseQuantity(2, $buldak['base_qty_per_purchase_unit']) === 10, 'Buldak inventory conversion is not 10 pcs.');
fixedUnitRejects(fn() => validatePurchaseRequestPackage([$moxylor], 3, 'Bottle'), 'Base inventory unit was accepted as PR purchase unit.');
fixedUnitRejects(fn() => positivePurchaseRequestQuantity(1.5), 'Fractional PR quantity was accepted.');
fixedUnitRejects(fn() => positivePurchaseRequestQuantity(0), 'Zero PR quantity was accepted.');

$sameSetup = $moxylor;
fixedUnitAssert(purchaseRequestConfiguredUnit([$moxylor, $sameSetup]) === 'Box', 'Matching supplier setups were rejected.');
$differentFactor = supplierPurchasingConversion([
    'purchase_unit' => 'Box', 'inventory_unit' => 'Bottle',
    'hierarchy_levels' => [['unit' => 'Bottle', 'quantity' => 10]],
]);
fixedUnitAssert(purchaseRequestConfiguredUnit([$moxylor, $differentFactor]) === null, 'Conflicting supplier conversions were silently accepted.');
fixedUnitAssert(purchaseRequestConfiguredUnit([$moxylor, $buldak]) === null, 'Conflicting supplier purchase units were silently accepted.');
fixedUnitAssert(purchaseRequestConfiguredUnit([]) === null, 'Missing supplier setup was accepted.');

echo "PASS: fixed Box and Pack units, whole quantities, exact PR-to-PO conversion, and supplier ambiguity guards.\n";
