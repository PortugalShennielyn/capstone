<?php
require_once __DIR__ . '/../pharma-api/v1/sales/sales_pos_helpers.php';

function expectPos(bool $condition, string $message): void
{
    if (!$condition) throw new RuntimeException($message);
}

$productId = 'ascorbic-test';
$product = [
    'product_id' => $productId,
    'product_name' => 'Ascorbic Acid',
    'status' => 'Active',
    'available_stock' => 7,
    'selling_units' => [
        ['unit' => 'Bottle', 'base_quantity' => 1, 'selling_price' => 100],
        ['unit' => 'Box', 'base_quantity' => 10, 'selling_price' => 950],
    ],
];
expectPos(sellingUnitAvailability(7, 1) === 7, 'Seven bottles should be available.');
expectPos(sellingUnitAvailability(7, 10) === 0, 'A box must be unavailable with seven bottles.');
expectPos(min(array_column($product['selling_units'], 'selling_price')) === 100, 'The displayed starting price must be the Bottle price.');
[$ok] = salesValidateCartStock([['product_id' => $productId, 'quantity' => 1, 'unit' => 'Box']], [$productId => $product]);
expectPos(!$ok, 'A box must be blocked with seven bottles.');

$product['available_stock'] = 12;
expectPos(sellingUnitAvailability(12, 10) === 1, 'A box should become available with twelve bottles.');
$mixed = salesNormalizeCartItems([
    ['product_id' => $productId, 'quantity' => 1, 'unit' => 'Box'],
    ['product_id' => $productId, 'quantity' => 2, 'unit' => 'Bottle'],
]);
expectPos(count($mixed) === 2, 'Different selling units must remain separate cart lines.');
[$ok] = salesValidateCartStock($mixed, [$productId => $product]);
expectPos($ok, 'One box and two bottles should fit twelve bottles of shelf stock.');
$mixed[1]['quantity'] = 3;
[$ok] = salesValidateCartStock($mixed, [$productId => $product]);
expectPos(!$ok, 'Mixed selling units must not overdraw shared shelf stock.');
expectPos(sellingUnitBaseQuantity(2, 10) === 20, 'Two boxes must deduct twenty bottles.');
expectPos(sellingUnitAvailability(27, 5) === 5, 'Grocery five-packs must use packet shelf stock.');
expectPos(sellingUnitAvailability(120, 100) === 1, 'Medicine boxes must use tablet shelf stock.');
expectPos(sellingUnitAvailability(49, 50) === 0, 'A medical-supply box must require fifty pieces.');
echo "Shelf POS selling-unit flow passed.\n";
