<?php

declare(strict_types=1);

require_once __DIR__ . '/../pharma-api/config/db_connection.php';

function newbornUnitAssert(bool $condition, string $message): void
{
    if (!$condition) throw new RuntimeException($message);
}

$statement = $pdo->query(
    "SELECT p.price, inventory.unit_name AS inventory_unit,
            MAX(CASE WHEN LOWER(TRIM(ps.specification_name))='variant' THEN psv.value_text END) AS variant_name,
            MAX(CASE WHEN LOWER(TRIM(ps.specification_name))='pack content' THEN psv.value_number END) AS pack_content,
            MAX(CASE WHEN LOWER(TRIM(ps.specification_name))='pack content' THEN content_unit.unit_symbol END) AS pack_content_unit
     FROM product p
     INNER JOIN product_measurement_units inventory ON inventory.measurement_unit_id=p.inventory_unit_id
     INNER JOIN product_specification_values psv ON psv.product_id=p.product_id
     INNER JOIN product_specifications ps ON ps.specification_id=psv.specification_id
     LEFT JOIN product_measurement_units content_unit ON content_unit.measurement_unit_id=psv.measurement_unit_id
     WHERE p.product_name='EQ Dry Disposable Baby Diapers'
       AND LOWER(TRIM(inventory.unit_name))='pack'
     GROUP BY p.product_id,p.price,inventory.unit_name
     HAVING LOWER(TRIM(variant_name))='new born'"
);
$newborn = $statement->fetch(PDO::FETCH_ASSOC);
newbornUnitAssert(is_array($newborn), 'The New Born diaper SKU was not found.');
newbornUnitAssert((float)$newborn['price'] === 110.0, 'New Born selling price must be 110 per Pack.');
newbornUnitAssert(strcasecmp((string)$newborn['inventory_unit'], 'Pack') === 0, 'New Born stock/POS base unit must be Pack.');
newbornUnitAssert((float)$newborn['pack_content'] === 44.0, 'New Born Pack Content must be 44.');
newbornUnitAssert(strcasecmp((string)$newborn['pack_content_unit'], 'pcs') === 0, 'New Born Pack Content must describe 44 pcs, not 44 Packs.');

$sellingOptions = (string)file_get_contents(__DIR__ . '/../pharma-api/v1/products/product_selling_options.php');
$automaticPo = (string)file_get_contents(__DIR__ . '/../pharma-api/v1/purchase_requests/automatic_purchase_order_helpers.php');
newbornUnitAssert(str_contains($sellingOptions, 'p.inventory_unit_id') && str_contains($sellingOptions, 'pso.base_quantity = 1'), 'POS selling options are not based on one Product Master unit.');
newbornUnitAssert(str_contains($automaticPo, 'units_per_purchase_unit'), 'PO quantities are not based on supplier purchase-unit conversion.');

echo "EQ New Born Pack unit flow test passed.\n";
