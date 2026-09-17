<?php

declare(strict_types=1);

require_once __DIR__ . '/../pharma-api/config/db_connection.php';
require_once __DIR__ . '/../pharma-api/v1/products/product_customization_schema.php';
require_once __DIR__ . '/../pharma-api/v1/suppliers/purchasing_conversion.php';

function productUnitAssert(bool $condition, string $message): void
{
    if (!$condition) throw new RuntimeException($message);
}

$column = $pdo->query(
    "SELECT is_nullable FROM information_schema.columns
     WHERE table_schema=DATABASE() AND table_name='product' AND column_name='inventory_unit_id'"
)->fetchColumn();
productUnitAssert($column === 'NO', 'Product inventory_unit_id must be permanent and non-null.');
productUnitAssert((int)$pdo->query('SELECT COUNT(*) FROM product WHERE inventory_unit_id IS NULL')->fetchColumn() === 0, 'Existing products were not fully migrated.');
productUnitAssert((int)$pdo->query(
    "SELECT COUNT(*) FROM product p
     LEFT JOIN product_measurement_units pmu ON pmu.measurement_unit_id=p.inventory_unit_id
     WHERE pmu.measurement_unit_id IS NULL OR pmu.measurement_group<>'Count' OR pmu.is_active<>1"
)->fetchColumn() === 0, 'A Product Master base unit is missing or is not an active Count unit.');
productUnitAssert((int)$pdo->query(
    "SELECT COUNT(*) FROM product_type_specifications pts
     INNER JOIN product_specifications ps ON ps.specification_id=pts.specification_id
     WHERE LOWER(TRIM(ps.specification_name))='inventory unit'"
)->fetchColumn() === 0, 'Legacy optional Inventory Unit is still assigned to a Product Type.');

$drift = (int)$pdo->query(
    "SELECT COUNT(*) FROM supplier_products sp
     INNER JOIN product p ON p.product_id=sp.product_id
     INNER JOIN product_measurement_units pmu ON pmu.measurement_unit_id=p.inventory_unit_id
     WHERE LOWER(TRIM(sp.inventory_unit))<>LOWER(TRIM(pmu.unit_name))"
)->fetchColumn();
productUnitAssert($drift === 0, 'Supplier compatibility snapshots drifted from Product Master.');

$missingBaseConversions = (int)$pdo->query(
    "SELECT COUNT(*) FROM supplier_products sp
     LEFT JOIN supplier_product_unit_conversions c
       ON c.supplier_product_id=sp.supplier_product_id AND c.base_quantity=1
     WHERE c.conversion_id IS NULL"
)->fetchColumn();
productUnitAssert($missingBaseConversions === 0, 'A supplier hierarchy is missing its normalized base conversion.');

$productsJs = (string)file_get_contents(__DIR__ . '/../pharma-frontend/js/modules/products.js');
$supplierJs = (string)file_get_contents(__DIR__ . '/../pharma-frontend/js/modules/suppliers.js');
$productUpdate = (string)file_get_contents(__DIR__ . '/../pharma-api/v1/products/update_product.php');
productUnitAssert(str_contains($productsJs, 'Selling / Inventory Unit') && str_contains($productsJs, 'edit-var-inventory-unit'), 'Product SKU Details does not expose the permanent unit field.');
productUnitAssert(str_contains($productsJs, "dynamicUnitOptions('Count'"), 'Product base units are not sourced from the active Count-unit master.');
productUnitAssert(str_contains($supplierJs, 'inventoryUnit.disabled = true'), 'Supplier purchasing setup still allows Product Base Unit edits.');
productUnitAssert(str_contains($productUpdate, 'multi-unit Purchase Unit') && str_contains($productUpdate, 'multi-unit Inner Unit'), 'Product edits do not protect supplier hierarchy labels from collapsing into the base unit.');

echo "Product inventory unit authority test passed.\n";
