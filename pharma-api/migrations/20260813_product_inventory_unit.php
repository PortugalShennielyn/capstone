<?php
declare(strict_types=1);

require_once __DIR__ . '/../config/db_connection.php';

try {
    $columnExists = (int) $pdo->query(
        "SELECT COUNT(*) FROM information_schema.columns
         WHERE table_schema=DATABASE() AND table_name='product' AND column_name='inventory_unit_id'"
    )->fetchColumn() > 0;
    if (!$columnExists) {
        $pdo->exec("ALTER TABLE product ADD COLUMN inventory_unit_id CHAR(36) NULL AFTER type_id");
    }

    $indexExists = (int) $pdo->query(
        "SELECT COUNT(*) FROM information_schema.statistics
         WHERE table_schema=DATABASE() AND table_name='product' AND index_name='idx_product_inventory_unit'"
    )->fetchColumn() > 0;
    if (!$indexExists) {
        $pdo->exec("ALTER TABLE product ADD KEY idx_product_inventory_unit (inventory_unit_id)");
    }

    $foreignKeyExists = (int) $pdo->query(
        "SELECT COUNT(*) FROM information_schema.referential_constraints
         WHERE constraint_schema=DATABASE() AND table_name='product' AND constraint_name='fk_product_inventory_unit'"
    )->fetchColumn() > 0;
    if (!$foreignKeyExists) {
        $pdo->exec("ALTER TABLE product ADD CONSTRAINT fk_product_inventory_unit FOREIGN KEY (inventory_unit_id) REFERENCES product_measurement_units(measurement_unit_id) ON DELETE RESTRICT ON UPDATE CASCADE");
    }

    $eachExists = $pdo->prepare(
        "SELECT measurement_unit_id FROM product_measurement_units
         WHERE measurement_group='Count' AND LOWER(TRIM(unit_name))='each' LIMIT 1"
    );
    $eachExists->execute();
    if (!$eachExists->fetchColumn()) {
        $pdo->exec("INSERT INTO product_measurement_units (measurement_unit_id,unit_name,unit_symbol,measurement_group,is_active,is_system) VALUES (UUID(),'Each','each','Count',1,1)");
    }

    // Migrate an optional legacy value only when it does not conflict with a
    // supplier's existing base-unit setup.
    $pdo->exec(
        "UPDATE product p
         INNER JOIN product_specification_values psv ON psv.product_id=p.product_id
         INNER JOIN product_specifications ps ON ps.specification_id=psv.specification_id
            AND LOWER(TRIM(ps.specification_name))='inventory unit'
         INNER JOIN product_measurement_units pmu ON pmu.measurement_group='Count' AND pmu.is_active=1
            AND (LOWER(TRIM(pmu.unit_name))=LOWER(TRIM(psv.value_text)) OR LOWER(TRIM(COALESCE(pmu.unit_symbol,'')))=LOWER(TRIM(psv.value_text)))
         LEFT JOIN (
            SELECT product_id,COUNT(DISTINCT LOWER(TRIM(inventory_unit))) unit_count,MIN(LOWER(TRIM(inventory_unit))) supplier_unit
            FROM supplier_products WHERE TRIM(COALESCE(inventory_unit,''))<>'' GROUP BY product_id
         ) sp ON sp.product_id=p.product_id
         SET p.inventory_unit_id=pmu.measurement_unit_id
         WHERE p.inventory_unit_id IS NULL
           AND (sp.product_id IS NULL OR (sp.unit_count=1 AND sp.supplier_unit IN (LOWER(TRIM(pmu.unit_name)),LOWER(TRIM(COALESCE(pmu.unit_symbol,''))))))"
    );

    // Existing supplier configuration is a safe migration source when every
    // supplier agrees on the base unit for the SKU.
    $pdo->exec(
        "UPDATE product p
         INNER JOIN (
            SELECT product_id,COUNT(DISTINCT LOWER(TRIM(inventory_unit))) unit_count,MIN(LOWER(TRIM(inventory_unit))) supplier_unit
            FROM supplier_products WHERE TRIM(COALESCE(inventory_unit,''))<>'' GROUP BY product_id
         ) sp ON sp.product_id=p.product_id AND sp.unit_count=1
         INNER JOIN product_measurement_units pmu ON pmu.measurement_group='Count' AND pmu.is_active=1
            AND (LOWER(TRIM(pmu.unit_name))=sp.supplier_unit OR LOWER(TRIM(COALESCE(pmu.unit_symbol,'')))=sp.supplier_unit)
         SET p.inventory_unit_id=pmu.measurement_unit_id
         WHERE p.inventory_unit_id IS NULL"
    );

    // Records without either legacy source need an explicit, reviewable base
    // unit so the new invariant is true for every existing SKU.
    $pdo->exec(
        "UPDATE product p
         INNER JOIN product_measurement_units pmu
            ON pmu.measurement_group='Count' AND LOWER(TRIM(pmu.unit_name))='each'
         SET p.inventory_unit_id=pmu.measurement_unit_id
         WHERE p.inventory_unit_id IS NULL"
    );
    $pdo->exec("ALTER TABLE product MODIFY inventory_unit_id CHAR(36) NOT NULL");

    // The optional specification is no longer assignable. Saved values remain
    // available for audit/migration and are not deleted blindly.
    $pdo->exec(
        "DELETE pts FROM product_type_specifications pts
         INNER JOIN product_specifications ps ON ps.specification_id=pts.specification_id
         WHERE LOWER(TRIM(ps.specification_name))='inventory unit'"
    );

    $pdo->exec(
        "CREATE TABLE IF NOT EXISTS supplier_product_unit_conversions (
            conversion_id CHAR(36) NOT NULL DEFAULT (UUID()),
            supplier_product_id CHAR(36) NOT NULL,
            unit_name VARCHAR(50) NOT NULL,
            base_quantity INT NOT NULL,
            level_order INT NOT NULL DEFAULT 0,
            is_transfer_unit TINYINT(1) NOT NULL DEFAULT 1,
            is_selling_unit TINYINT(1) NOT NULL DEFAULT 1,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (conversion_id),
            UNIQUE KEY uq_supplier_product_unit (supplier_product_id,unit_name),
            KEY idx_supplier_product_unit_factor (supplier_product_id,base_quantity),
            CONSTRAINT fk_supplier_product_unit_supplier_product FOREIGN KEY (supplier_product_id) REFERENCES supplier_products(supplier_product_id) ON DELETE CASCADE,
            CONSTRAINT chk_supplier_product_unit_base CHECK (base_quantity>0)
         ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4"
    );

    // Product Master owns the base unit label. Legacy supplier columns remain
    // synchronized compatibility snapshots for procurement code.
    $pdo->exec(
        "UPDATE supplier_products sp
         INNER JOIN product p ON p.product_id=sp.product_id
         INNER JOIN product_measurement_units pmu ON pmu.measurement_unit_id=p.inventory_unit_id
         SET sp.inventory_unit=pmu.unit_name"
    );
    $pdo->exec("DELETE FROM supplier_product_unit_conversions");
    $pdo->exec(
        "INSERT INTO supplier_product_unit_conversions
            (supplier_product_id,unit_name,base_quantity,level_order,is_transfer_unit,is_selling_unit)
         SELECT supplier_product_id,TRIM(inventory_unit),1,0,1,1 FROM supplier_products WHERE TRIM(COALESCE(inventory_unit,''))<>''"
    );
    $pdo->exec(
        "INSERT INTO supplier_product_unit_conversions
            (supplier_product_id,unit_name,base_quantity,level_order,is_transfer_unit,is_selling_unit)
         SELECT supplier_product_id,TRIM(inner_unit),GREATEST(COALESCE(units_per_inner_unit,1),1),1,1,1
         FROM supplier_products
         WHERE TRIM(COALESCE(inner_unit,''))<>''
           AND LOWER(TRIM(inner_unit))<>LOWER(TRIM(inventory_unit))"
    );
    $pdo->exec(
        "INSERT INTO supplier_product_unit_conversions
            (supplier_product_id,unit_name,base_quantity,level_order,is_transfer_unit,is_selling_unit)
         SELECT supplier_product_id,TRIM(purchase_unit),GREATEST(COALESCE(units_per_purchase_unit,1),1),2,1,1
         FROM supplier_products
         WHERE TRIM(COALESCE(purchase_unit,''))<>''
           AND LOWER(TRIM(purchase_unit))<>LOWER(TRIM(inventory_unit))
           AND (TRIM(COALESCE(inner_unit,''))='' OR LOWER(TRIM(purchase_unit))<>LOWER(TRIM(inner_unit)))"
    );

    echo "Product inventory unit migration completed.\n";
} catch (Throwable $error) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    throw $error;
}
