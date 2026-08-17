<?php

declare(strict_types=1);

require_once __DIR__ . '/../pharma-api/config/db_connection.php';
require_once __DIR__ . '/../pharma-api/v1/products/product_customization_schema.php';
require_once __DIR__ . '/../pharma-api/v1/suppliers/supplier_schema.php';

function supplierUnitAssert(bool $condition, string $message): void
{
    if (!$condition) throw new RuntimeException($message);
}

ensureProductCustomizationSchema($pdo);
supplierUnitAssert(supplierPurchasingUnitIsConfigured($pdo, 'Box'), 'A central Count unit must be accepted.');
supplierUnitAssert(!supplierPurchasingUnitIsConfigured($pdo, '123'), 'A numeric unit must be rejected.');
supplierUnitAssert(!supplierPurchasingUnitIsConfigured($pdo, 'Definitely Not A Unit'), 'Arbitrary text must be rejected.');
supplierUnitAssert(supplierPurchasingUnitAllowedForContext($pdo, 'Box', 'purchase'), 'Box must be available as an outer Purchase Unit.');
supplierUnitAssert(supplierPurchasingUnitAllowedForContext($pdo, 'Carton', 'purchase'), 'Carton must be available as an outer Purchase Unit.');
supplierUnitAssert(!supplierPurchasingUnitAllowedForContext($pdo, 'tablet', 'purchase'), 'Tablet must not be available as an outer Purchase Unit.');
supplierUnitAssert(supplierPurchasingUnitAllowedForContext($pdo, 'Stab', 'inner'), 'Stab must be available as an Inner Unit.');
supplierUnitAssert(supplierPurchasingUnitAllowedForContext($pdo, 'tablet', 'inventory'), 'Tablet must be available as an Inventory/Base Unit.');

validateSupplierPurchasingHierarchyUnits($pdo, [
    'purchase_unit' => 'Box',
    'inner_unit' => 'Pack',
    'inventory_unit' => 'tablet',
]);

$legacy = 'Legacy Saved Supplier Unit';
validateSupplierPurchasingUnit($pdo, $legacy, 'Purchase Unit', $legacy);

$numericRejected = false;
try {
    validateSupplierPurchasingUnit($pdo, '100', 'Inventory/Base Unit', '100');
} catch (InvalidArgumentException $error) {
    $numericRejected = true;
}
supplierUnitAssert($numericRejected, 'A saved numeric unit must still be rejected.');

$repeatedRejected = false;
try {
    validateSupplierPurchasingHierarchyUnits($pdo, [
        'purchase_unit' => 'Box',
        'inner_unit' => 'Box',
        'inventory_unit' => 'tablet',
    ]);
} catch (InvalidArgumentException $error) {
    $repeatedRejected = true;
}
supplierUnitAssert($repeatedRejected, 'A newly repeated hierarchy unit must be rejected.');

$invalidPurchaseRejected = false;
try {
    validateSupplierPurchasingHierarchyUnits($pdo, [
        'purchase_unit' => 'Bottle',
        'inventory_unit' => 'Bottle',
        'purchase_unit_contains' => 1,
    ], ['purchase_unit' => 'Bottle', 'inventory_unit' => 'Bottle']);
} catch (InvalidArgumentException $error) {
    $invalidPurchaseRejected = true;
}
supplierUnitAssert($invalidPurchaseRejected, 'A legacy Purchase Unit outside Box or Carton must be rejected.');

echo "Supplier purchasing unit validation tests passed.\n";
