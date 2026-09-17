<?php
declare(strict_types=1);

require_once __DIR__ . '/../config/db_connection.php';
require_once __DIR__ . '/../v1/suppliers/purchasing_conversion.php';

try {
    ensureSupplierPurchasingConversionSchema($pdo);
    $pdo->beginTransaction();

    // Every configured parent unit can be selected for transfers because its
    // factor is already normalized to the Product Master inventory unit.
    // Conversion never continues below that unit.
    $pdo->exec(
        'UPDATE supplier_product_unit_conversions
         SET is_transfer_unit = 1,
             is_selling_unit = CASE WHEN base_quantity = 1 THEN 1 ELSE 0 END'
    );

    // Existing base selling options occasionally kept legacy package labels
    // such as "box" or "pack". Stock arithmetic was already base_quantity=1;
    // synchronize only that display label with Product Master authority.
    $pdo->exec(
        "UPDATE product_selling_options pso
         INNER JOIN product p ON p.product_id = pso.product_id
         INNER JOIN product_measurement_units pmu ON pmu.measurement_unit_id = p.inventory_unit_id
         SET pso.unit_name = pmu.unit_name
         WHERE pso.base_quantity = 1"
    );

    // Correct labels on still-open orders created while legacy POS options
    // called a canonical Piece a Box (or a Blister Pack a Pack). Completed
    // receipts remain untouched as immutable audit records.
    $pdo->exec(
        "UPDATE sales_order_items soi
         INNER JOIN sales_orders so ON so.order_id = soi.order_id
         INNER JOIN product p ON p.product_id = soi.product_id
         INNER JOIN product_measurement_units pmu ON pmu.measurement_unit_id = p.inventory_unit_id
         SET soi.selected_unit = pmu.unit_name
         WHERE soi.unit_base_quantity = 1
           AND so.status NOT IN ('completed','cancelled','rejected')"
    );

    $pdo->commit();
    echo "Inventory-unit conversion stopping rule applied.\n";
} catch (Throwable $error) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    throw $error;
}
