<?php
require_once __DIR__ . '/../pharma-api/v1/products/product_selling_options.php';

function expectSellingUnit(int $actual, int $expected, string $label): void
{
    if ($actual !== $expected) throw new RuntimeException("{$label}: expected {$expected}, got {$actual}");
}

// Grocery: 27 packets, with packet and five-pack retail units.
$shelf = 27;
$packetPrice = 70;
$fivePackPrice = 320;
if ($fivePackPrice === 5 * $packetPrice) throw new RuntimeException('Bulk price must remain independent of the packet price.');
expectSellingUnit(sellingUnitAvailability($shelf, 1), 27, 'Packet availability');
expectSellingUnit(sellingUnitAvailability($shelf, 5), 5, 'Five-pack availability');
$shelf -= sellingUnitBaseQuantity(1, 5);
expectSellingUnit($shelf, 22, 'Shelf after one five-pack');
expectSellingUnit(1 * $fivePackPrice, 320, 'Five-pack sale total');
$shelf -= sellingUnitBaseQuantity(2, 1);
expectSellingUnit($shelf, 20, 'Shelf after two packets');
$shelf -= sellingUnitBaseQuantity(4, 5);
expectSellingUnit($shelf, 0, 'Shelf after final four five-packs');
expectSellingUnit(sellingUnitAvailability($shelf, 5), 0, 'Unavailable five-pack');
expectSellingUnit(sellingUnitAvailability(3, 5), 0, 'Insufficient shelf stock');

// Medicine: all allocations remain in tablets regardless of selling unit.
$shelf = 235;
expectSellingUnit(sellingUnitAvailability($shelf, 10), 23, 'Blister availability');
expectSellingUnit(sellingUnitAvailability($shelf, 100), 2, 'Box availability');
$shelf -= sellingUnitBaseQuantity(1, 10);
expectSellingUnit($shelf, 225, 'Shelf after one blister');
$shelf -= sellingUnitBaseQuantity(1, 100);
expectSellingUnit($shelf, 125, 'Shelf after one box');

foreach ([0, -1] as $invalid) {
    try {
        sellingUnitBaseQuantity(1, $invalid);
        throw new RuntimeException('Invalid conversion was accepted.');
    } catch (InvalidArgumentException $expected) {
    }
}
try {
    sellingUnitBaseQuantity(PHP_INT_MAX, 5);
    throw new RuntimeException('Overflowing conversion was accepted.');
} catch (InvalidArgumentException $expected) {
}
echo "Selling unit regression scenarios passed.\n";
