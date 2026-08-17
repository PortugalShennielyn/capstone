<?php

declare(strict_types=1);

require_once __DIR__ . '/../pharma-api/config/db_connection.php';
require_once __DIR__ . '/../pharma-api/v1/suppliers/purchasing_conversion.php';

function supplierUnitAssert(bool $condition, string $message): void
{
    if (!$condition) throw new RuntimeException($message);
}

ensureSupplierPurchasingConversionSchema($pdo);
$row = $pdo->query(
    "SELECT sp.supplier_product_id,sp.product_id,sp.inventory_unit,pmu.unit_name product_inventory_unit
     FROM supplier_products sp
     INNER JOIN product p ON p.product_id=sp.product_id
     INNER JOIN product_measurement_units pmu ON pmu.measurement_unit_id=p.inventory_unit_id
     ORDER BY sp.supplier_product_id LIMIT 1"
)->fetch(PDO::FETCH_ASSOC);
supplierUnitAssert((bool)$row, 'A supplier-product assignment with a Product Master unit is required.');
supplierUnitAssert(strcasecmp((string)$row['inventory_unit'], (string)$row['product_inventory_unit']) === 0, 'Supplier base-unit snapshot drifted from Product Master.');

$resolved = productInventoryUnitForSupplier($pdo, (string)$row['product_id']);
supplierUnitAssert(strcasecmp((string)$resolved['unit_name'], (string)$row['product_inventory_unit']) === 0, 'Supplier setup did not resolve its base unit from Product Master.');

$base = $pdo->prepare('SELECT base_quantity FROM supplier_product_unit_conversions WHERE supplier_product_id=? AND LOWER(TRIM(unit_name))=LOWER(TRIM(?)) LIMIT 1');
$base->execute([$row['supplier_product_id'], $row['product_inventory_unit']]);
supplierUnitAssert((int)$base->fetchColumn() === 1, 'Normalized supplier conversions do not contain the Product Master base unit at factor 1.');

$assignSource = (string)file_get_contents(__DIR__ . '/../pharma-api/v1/suppliers/assign_product.php');
$updateSource = (string)file_get_contents(__DIR__ . '/../pharma-api/v1/suppliers/update_supplier_assignment.php');
supplierUnitAssert(str_contains($assignSource, 'productInventoryUnitForSupplier'), 'Supplier assignment does not enforce Product Master as unit authority.');
supplierUnitAssert(str_contains($updateSource, 'productInventoryUnitForSupplier'), 'Supplier purchasing updates do not enforce Product Master as unit authority.');

echo "Supplier Product Master unit authority test passed.\n";
