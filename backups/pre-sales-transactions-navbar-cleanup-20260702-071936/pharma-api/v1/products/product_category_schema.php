<?php

function productTableHasColumn(PDO $pdo, string $columnName): bool
{
    $statement = $pdo->prepare(
        "SELECT COUNT(*)
         FROM INFORMATION_SCHEMA.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE()
           AND TABLE_NAME = 'product'
           AND COLUMN_NAME = :column_name"
    );
    $statement->execute([':column_name' => $columnName]);

    return (int) $statement->fetchColumn() > 0;
}

function tableHasColumn(PDO $pdo, string $tableName, string $columnName): bool
{
    $statement = $pdo->prepare(
        "SELECT COUNT(*)
         FROM INFORMATION_SCHEMA.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE()
           AND TABLE_NAME = :table_name
           AND COLUMN_NAME = :column_name"
    );
    $statement->execute([
        ':table_name' => $tableName,
        ':column_name' => $columnName
    ]);

    return (int) $statement->fetchColumn() > 0;
}

function ensureProductCategorySchema(PDO $pdo): void
{
    $pdo->exec(
        "CREATE TABLE IF NOT EXISTS product_categories (
            category_id CHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
            category_name VARCHAR(50) NOT NULL UNIQUE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4"
    );

    $categorySeed = $pdo->prepare(
        "INSERT INTO product_categories (category_name)
         VALUES (:category_name)
         ON DUPLICATE KEY UPDATE category_name = VALUES(category_name)"
    );
    foreach (['Medicine', 'Grocery'] as $categoryName) {
        $categorySeed->execute([':category_name' => $categoryName]);
    }

    $pdo->exec(
        "CREATE TABLE IF NOT EXISTS product_types (
            type_id CHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
            category_id CHAR(36) NULL,
            type_name VARCHAR(80) NOT NULL UNIQUE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4"
    );

    if (!productTypeTableHasColumn($pdo, 'category_id')) {
        $pdo->exec("ALTER TABLE product_types ADD COLUMN category_id CHAR(36) NULL AFTER type_id");
    }

    $pdo->exec("ALTER TABLE product_types MODIFY type_name VARCHAR(80) NOT NULL");

    $pdo->exec(
        "CREATE TABLE IF NOT EXISTS product_measurement_units (
            measurement_unit_id CHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
            unit_name VARCHAR(40) NOT NULL UNIQUE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4"
    );

    $typeSeed = $pdo->prepare(
        "INSERT INTO product_types (category_id, type_name)
         VALUES (:category_id, :type_name)
         ON DUPLICATE KEY UPDATE category_id = VALUES(category_id), type_name = VALUES(type_name)"
    );

    $medicineCategoryId = getProductCategoryId($pdo, 'Medicine');
    $groceryCategoryId = getProductCategoryId($pdo, 'Grocery');

    $medicineTypes = [
        'Tablet',
        'Capsule',
        'Syrup',
        'Suspension',
        'Drops',
        'Ointment',
        'Cream',
        'Gel',
        'Solution',
        'Injection',
        'Inhaler',
        'Nebulizer',
        'Suppository',
        'Patch',
        'Powder',
        'First Aid',
        'Medical Supply',
        'Device/Equipment'
    ];

    foreach ($medicineTypes as $typeName) {
        $typeSeed->execute([
            ':category_id' => $medicineCategoryId,
            ':type_name' => $typeName
        ]);
    }

    $groceryTypes = [
        'Canned Goods',
        'Beverage',
        'Snacks',
        'Biscuits',
        'Noodles',
        'Condiments',
        'Dairy',
        'Bread/Bakery',
        'Personal Care',
        'Hygiene Product',
        'Baby Care',
        'Household Item'
    ];

    foreach ($groceryTypes as $typeName) {
        $typeSeed->execute([
            ':category_id' => $groceryCategoryId,
            ':type_name' => $typeName
        ]);
    }

    $unitSeed = $pdo->prepare(
        "INSERT INTO product_measurement_units (unit_name)
         VALUES (:unit_name)
         ON DUPLICATE KEY UPDATE unit_name = VALUES(unit_name)"
    );
    foreach (['%', 'mg', 'mcg', 'g', 'kg', 'mL', 'L', 'oz', 'lb', 'IU', 'mg/mL', 'mg/5mL', 'cc', 'pcs', 'tablet', 'capsule', 'box', 'bottle', 'can', 'pack', 'blister pack', 'sachet', 'tube', 'vial', 'ampule', 'jar', 'roll', 'strip', 'plastic pack', 'carton', 'pouch'] as $unitName) {
        $unitSeed->execute([':unit_name' => $unitName]);
    }
    $pdo->exec("DELETE FROM product_measurement_units WHERE unit_name IN ('N/A', 'Select category first...')");

    if (!productTableHasColumn($pdo, 'category_id')) {
        $pdo->exec("ALTER TABLE product ADD COLUMN category_id CHAR(36) NULL AFTER product_id");
    }

    if (!productTableHasColumn($pdo, 'type_id')) {
        $pdo->exec("ALTER TABLE product ADD COLUMN type_id CHAR(36) NULL AFTER category_id");
    }

    // The normalized product table must stay limited to shared product columns.
    // Medicine, grocery, supplier, and stock data live in their own tables.

    if (productTableHasColumn($pdo, 'unit')) {
        $pdo->exec("ALTER TABLE product MODIFY unit VARCHAR(50) NULL");
    }

    $pdo->exec(
        "CREATE TABLE IF NOT EXISTS supplier_products (
            supplier_product_id CHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
            supplier_id CHAR(36) NOT NULL,
            product_id CHAR(36) NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE KEY unique_supplier_product (supplier_id, product_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4"
    );

    // Each product row is now its own sellable SKU. SKU-specific attributes
    // live in medicine_details or grocery_details.

    $pdo->exec(
        "CREATE TABLE IF NOT EXISTS product_inventory (
            inventory_id CHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
            product_id CHAR(36) NOT NULL,
            batch_number VARCHAR(80) NULL,
            quantity_stocked INT NOT NULL DEFAULT 0,
            quantity_remaining INT NOT NULL DEFAULT 0,
            expiration_date DATE NULL,
            status VARCHAR(30) DEFAULT 'Available',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4"
    );
    if (!tableHasColumn($pdo, 'product_inventory', 'created_at')) {
        $pdo->exec("ALTER TABLE product_inventory ADD COLUMN created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP");
    }

    $pdo->exec(
        "CREATE TABLE IF NOT EXISTS product_selling_stock (
            selling_stock_id CHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
            product_id CHAR(36) NOT NULL,
            source_inventory_id CHAR(36) NULL,
            batch_number VARCHAR(80) NULL,
            quantity_stocked INT NOT NULL DEFAULT 0,
            quantity_remaining INT NOT NULL DEFAULT 0,
            expiration_date DATE NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4"
    );

    $pdo->exec(
        "CREATE TABLE IF NOT EXISTS lookup_values (
            lookup_id CHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
            lookup_type VARCHAR(80) NOT NULL,
            lookup_code VARCHAR(120) NOT NULL,
            lookup_label VARCHAR(150) NOT NULL,
            sort_order INT NOT NULL DEFAULT 0,
            is_active TINYINT(1) NOT NULL DEFAULT 1,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            UNIQUE KEY uniq_lookup_values_type_code (lookup_type, lookup_code),
            KEY idx_lookup_values_type_active (lookup_type, is_active, sort_order)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4"
    );

    $pdo->exec(
        "CREATE TABLE IF NOT EXISTS entity_dimensions (
            dimension_id CHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
            entity_type VARCHAR(80) NOT NULL,
            entity_id CHAR(36) NOT NULL,
            dimension_type VARCHAR(80) NOT NULL,
            numeric_value DECIMAL(12,4) NULL,
            unit VARCHAR(50) NULL,
            text_value VARCHAR(150) NULL,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            UNIQUE KEY uniq_entity_dimension (entity_type, entity_id, dimension_type, unit, text_value),
            KEY idx_entity_dimensions_entity (entity_type, entity_id),
            KEY idx_entity_dimensions_type (dimension_type, unit)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4"
    );

    if (productTableHasColumn($pdo, 'type_id')) {
        $pdo->exec(
            "UPDATE product p
             INNER JOIN product_types pt ON p.type_id = pt.type_id
             INNER JOIN product_categories pc ON pc.category_name = pt.type_name
             SET p.category_id = pc.category_id
             WHERE p.category_id IS NULL"
        );
    }

    if (productTableHasColumn($pdo, 'strength_size') && productTableHasColumn($pdo, 'strength_size_value')) {
        $pdo->exec(
            "UPDATE product
             SET strength_size_value = strength_size
             WHERE (strength_size_value IS NULL OR strength_size_value = '')
               AND strength_size IS NOT NULL
               AND strength_size <> ''"
        );
    }

    if (productTableHasColumn($pdo, 'strength_value') && productTableHasColumn($pdo, 'strength_size_value')) {
        $pdo->exec(
            "UPDATE product
             SET strength_value = strength_size_value
             WHERE (strength_value IS NULL OR strength_value = '')
               AND strength_size_value IS NOT NULL
               AND strength_size_value <> ''"
        );
    }

    if (productTableHasColumn($pdo, 'variant_flavor') && productTableHasColumn($pdo, 'goods_type')) {
        $pdo->exec(
            "UPDATE product
             SET variant_flavor = goods_type
             WHERE (variant_flavor IS NULL OR variant_flavor = '')
               AND goods_type IS NOT NULL
               AND goods_type <> ''"
        );
    }

    if (productTableHasColumn($pdo, 'size_value') && productTableHasColumn($pdo, 'size_weight')) {
        $pdo->exec(
            "UPDATE product
             SET size_value = size_weight
             WHERE (size_value IS NULL OR size_value = '')
               AND size_weight IS NOT NULL
               AND size_weight <> ''"
        );
    }

    if (productTableHasColumn($pdo, 'display_size') && productTableHasColumn($pdo, 'size_value')) {
        $pdo->exec(
            "UPDATE product
             SET display_size = size_value
             WHERE (display_size IS NULL OR display_size = '')
               AND size_value IS NOT NULL
               AND size_value <> ''"
        );
    }

    if (
        productTableHasColumn($pdo, 'product_unit')
        && productTableHasColumn($pdo, 'measurement_unit_id')
        && productTableHasColumn($pdo, 'unit')
    ) {
        $pdo->exec(
            "UPDATE product p
             LEFT JOIN product_measurement_units pmu ON p.measurement_unit_id = pmu." . getMeasurementUnitIdColumn($pdo) . "
             SET p.product_unit = COALESCE(pmu.unit_name, p.unit)
             WHERE (p.product_unit IS NULL OR p.product_unit = '')
               AND (pmu.unit_name IS NOT NULL OR p.unit IS NOT NULL)"
        );
    }

    if (productTableHasColumn($pdo, 'supplier_id')) {
        $pdo->exec(
            "INSERT IGNORE INTO supplier_products (supplier_id, product_id)
             SELECT supplier_id, product_id
             FROM product
             WHERE supplier_id IS NOT NULL
               AND supplier_id IS NOT NULL
               AND supplier_id <> ''"
        );
    }

    ensureInventoryBatchSchema($pdo);

    // Product rows are now the sellable SKU records.
}

function ensureInventoryBatchSchema(PDO $pdo): void
{
    $pdo->exec(
        "CREATE TABLE IF NOT EXISTS inventory_batches (
            batch_id CHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
            legacy_inventory_id CHAR(36) NULL,
            po_id CHAR(36) NULL,
            po_item_id CHAR(36) NULL,
            product_id CHAR(36) NOT NULL,
            supplier_id CHAR(36) NULL,
            received_date DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            expiry_date DATE NULL,
            received_qty INT NOT NULL DEFAULT 0,
            storage_qty INT NOT NULL DEFAULT 0,
            shelf_qty INT NOT NULL DEFAULT 0,
            damaged_qty INT NOT NULL DEFAULT 0,
            returned_qty INT NOT NULL DEFAULT 0,
            unit_cost DECIMAL(10,2) DEFAULT 0.00,
            batch_status VARCHAR(40) NOT NULL DEFAULT 'active',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE KEY uniq_inventory_batches_legacy_inventory_id (legacy_inventory_id),
            UNIQUE KEY uniq_inventory_batches_po_item (po_id, po_item_id),
            KEY idx_inventory_batches_product_status (product_id, batch_status),
            KEY idx_inventory_batches_fefo (product_id, expiry_date, received_date),
            KEY idx_inventory_batches_po_id (po_id),
            KEY idx_inventory_batches_po_item_id (po_item_id),
            KEY idx_inventory_batches_supplier_id (supplier_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4"
    );

    foreach ([
        'legacy_inventory_id CHAR(36) NULL',
        'po_id CHAR(36) NULL',
        'po_item_id CHAR(36) NULL',
        'supplier_id CHAR(36) NULL',
        'expiry_date DATE NULL',
        'received_qty INT NOT NULL DEFAULT 0',
        'storage_qty INT NOT NULL DEFAULT 0',
        'shelf_qty INT NOT NULL DEFAULT 0',
        'damaged_qty INT NOT NULL DEFAULT 0',
        'returned_qty INT NOT NULL DEFAULT 0',
        'unit_cost DECIMAL(10,2) DEFAULT 0.00',
        "batch_status VARCHAR(40) NOT NULL DEFAULT 'active'",
        'created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP'
    ] as $columnDefinition) {
        $columnName = strtok($columnDefinition, ' ');
        if (!tableHasColumn($pdo, 'inventory_batches', $columnName)) {
            $pdo->exec("ALTER TABLE inventory_batches ADD COLUMN {$columnDefinition}");
        }
    }

    if (!tableHasColumn($pdo, 'product_selling_stock', 'source_batch_id')) {
        $pdo->exec("ALTER TABLE product_selling_stock ADD COLUMN source_batch_id CHAR(36) NULL AFTER source_inventory_id");
    }

    $pdo->exec(
        "INSERT INTO inventory_batches (
            batch_id,
            legacy_inventory_id,
            po_id,
            po_item_id,
            product_id,
            supplier_id,
            received_date,
            expiry_date,
            received_qty,
            storage_qty,
            shelf_qty,
            damaged_qty,
            returned_qty,
            unit_cost,
            batch_status,
            created_at
        )
        SELECT
            UUID(),
            inv.inventory_id,
            po.po_id,
            poi.po_item_id,
            inv.product_id,
            po.supplier_id,
            COALESCE(por.received_date, inv.created_at, CURRENT_TIMESTAMP),
            COALESCE(inv.expiry_date, inv.expiration_date),
            COALESCE(inv.quantity_stocked, 0) + COALESCE(shelf.shelf_qty, 0),
            COALESCE(inv.quantity_remaining, 0),
            COALESCE(shelf.shelf_qty, 0),
            COALESCE(ret.returned_qty, 0),
            0,
            COALESCE(poi.unit_price_snapshot, p.price, 0),
            CASE
                WHEN COALESCE(inv.quantity_remaining, 0) + COALESCE(shelf.shelf_qty, 0) <= 0 THEN 'depleted'
                WHEN COALESCE(inv.expiry_date, inv.expiration_date) IS NOT NULL
                    AND COALESCE(inv.expiry_date, inv.expiration_date) < CURDATE() THEN 'expired'
                ELSE 'active'
            END,
            COALESCE(inv.created_at, CURRENT_TIMESTAMP)
        FROM product_inventory inv
        LEFT JOIN inventory_batches existing ON existing.legacy_inventory_id = inv.inventory_id
        LEFT JOIN purchase_order_items poi ON inv.batch_number LIKE CONCAT('%', poi.po_item_id)
        LEFT JOIN purchase_orders po ON po.po_id = poi.po_id
        LEFT JOIN purchase_order_receiving por ON por.po_id = po.po_id
        LEFT JOIN product p ON p.product_id = inv.product_id
        LEFT JOIN (
            SELECT source_inventory_id, SUM(quantity_remaining) AS shelf_qty
            FROM product_selling_stock
            WHERE source_inventory_id IS NOT NULL
            GROUP BY source_inventory_id
        ) shelf ON shelf.source_inventory_id = inv.inventory_id
        LEFT JOIN (
            SELECT po_item_id, SUM(return_quantity) AS returned_qty
            FROM purchase_order_returns
            GROUP BY po_item_id
        ) ret ON ret.po_item_id = poi.po_item_id
        WHERE existing.batch_id IS NULL"
    );

    $pdo->exec(
        "UPDATE product_selling_stock pss
         INNER JOIN inventory_batches ib ON ib.legacy_inventory_id = pss.source_inventory_id
         SET pss.source_batch_id = ib.batch_id
         WHERE pss.source_batch_id IS NULL"
    );

    $pdo->exec(
        "UPDATE inventory_batches ib
         INNER JOIN product_inventory inv ON inv.inventory_id = ib.legacy_inventory_id
         INNER JOIN purchase_orders po ON inv.batch_number LIKE CONCAT(po.po_number, '%')
         INNER JOIN purchase_order_items poi ON poi.po_id = po.po_id AND poi.product_id = ib.product_id
         LEFT JOIN purchase_order_receiving por ON por.po_id = po.po_id
         LEFT JOIN (
            SELECT po_item_id, SUM(return_quantity) AS damaged_qty
            FROM purchase_order_returns
            GROUP BY po_item_id
         ) ret ON ret.po_item_id = poi.po_item_id
         SET ib.po_id = po.po_id,
             ib.po_item_id = poi.po_item_id,
             ib.supplier_id = po.supplier_id,
             ib.received_date = COALESCE(por.received_date, ib.received_date),
             ib.unit_cost = CASE WHEN ib.unit_cost = 0 THEN COALESCE(poi.unit_price_snapshot, ib.unit_cost) ELSE ib.unit_cost END,
             ib.damaged_qty = CASE WHEN ib.damaged_qty = 0 THEN COALESCE(ret.damaged_qty, 0) ELSE ib.damaged_qty END
         WHERE ib.po_id IS NULL"
    );
}

function migrateProductRowsToVariations(PDO $pdo): void
{
    // Kept as a no-op for older callers. Detail rows are now normalized by
    // category-specific tables.
    return;
}

function productTypeTableHasColumn(PDO $pdo, string $columnName): bool
{
    $statement = $pdo->prepare(
        "SELECT COUNT(*)
         FROM INFORMATION_SCHEMA.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE()
           AND TABLE_NAME = 'product_types'
           AND COLUMN_NAME = :column_name"
    );
    $statement->execute([':column_name' => $columnName]);

    return (int) $statement->fetchColumn() > 0;
}

function getProductCategoryId(PDO $pdo, string $categoryName): string
{
    $statement = $pdo->prepare(
        "SELECT category_id
         FROM product_categories
         WHERE category_name = :category_name
         LIMIT 1"
    );
    $statement->execute([':category_name' => $categoryName]);

    return cleanId($statement->fetchColumn());
}

function getProductTypeId(PDO $pdo, string $categoryId, string $typeId): ?string
{
    $statement = $pdo->prepare(
        "SELECT type_id
         FROM product_types
         WHERE category_id = :category_id
           AND type_id = :type_id
         LIMIT 1"
    );
    $statement->execute([
        ':category_id' => $categoryId,
        ':type_id' => $typeId
    ]);
    $validTypeId = cleanId($statement->fetchColumn());

    return $validTypeId !== '' ? $validTypeId : null;
}

function getMeasurementUnitId(PDO $pdo, string $measurementUnitId): ?string
{
    $unitIdColumn = getMeasurementUnitIdColumn($pdo);
    $statement = $pdo->prepare(
        "SELECT {$unitIdColumn}
         FROM product_measurement_units
         WHERE {$unitIdColumn} = :measurement_unit_id
         LIMIT 1"
    );
    $statement->execute([':measurement_unit_id' => $measurementUnitId]);
    $validUnitId = cleanId($statement->fetchColumn());

    return $validUnitId !== '' ? $validUnitId : null;
}

function getMeasurementUnitIdColumn(PDO $pdo): string
{
    foreach (['measurement_unit_id', 'unit_id', 'id'] as $columnName) {
        if (tableHasColumn($pdo, 'product_measurement_units', $columnName)) {
            return $columnName;
        }
    }

    return 'measurement_unit_id';
}

function requiredProductField(array $payload, string $field): string
{
    $value = trim((string) ($payload[$field] ?? ''));

    if ($value === '') {
        throw new InvalidArgumentException("The {$field} field is required.");
    }

    return $value;
}

function optionalProductField(array $payload, string $field): ?string
{
    $value = trim((string) ($payload[$field] ?? ''));
    return $value === '' ? null : $value;
}

function getProductCategories(PDO $pdo): array
{
    $statement = $pdo->query(
        "SELECT category_id, category_name
         FROM product_categories
         ORDER BY category_name ASC"
    );

    return $statement->fetchAll(PDO::FETCH_ASSOC);
}

function getProductTypesByCategory(PDO $pdo, string $categoryId): array
{
    $categoryStatement = $pdo->prepare(
        "SELECT category_name
         FROM product_categories
         WHERE category_id = :category_id
         LIMIT 1"
    );
    $categoryStatement->execute([':category_id' => $categoryId]);
    $categoryName = (string) $categoryStatement->fetchColumn();

    if (strcasecmp($categoryName, 'Medicine') === 0) {
        $statement = $pdo->prepare(
            "SELECT pt.type_id, pt.category_id, pt.type_name
             FROM product_types pt
             WHERE pt.category_id = :category_id
               AND NOT EXISTS (
                    SELECT 1
                    FROM product_types medical_pt
                    INNER JOIN product_categories medical_pc
                        ON medical_pc.category_id = medical_pt.category_id
                    WHERE medical_pt.type_name = pt.type_name
                      AND medical_pc.category_name IN ('Medical Supply', 'Medical Supplies')
               )
             ORDER BY pt.type_name ASC"
        );
        $statement->execute([':category_id' => $categoryId]);

        return $statement->fetchAll(PDO::FETCH_ASSOC);
    }

    $statement = $pdo->prepare(
        "SELECT type_id, category_id, type_name
         FROM product_types
         WHERE category_id = :category_id
         ORDER BY type_name ASC"
    );
    $statement->execute([':category_id' => $categoryId]);

    return $statement->fetchAll(PDO::FETCH_ASSOC);
}

function getAllProductTypes(PDO $pdo): array
{
    $statement = $pdo->query(
        "SELECT type_id, category_id, type_name
         FROM product_types
         ORDER BY type_name ASC"
    );

    return $statement->fetchAll(PDO::FETCH_ASSOC);
}

function getProductMeasurementUnits(PDO $pdo): array
{
    $unitIdColumn = getMeasurementUnitIdColumn($pdo);
    $statement = $pdo->query(
        "SELECT {$unitIdColumn} AS measurement_unit_id, unit_name
         FROM product_measurement_units
         ORDER BY
            CASE WHEN unit_name = 'N/A' THEN 1 ELSE 0 END,
            unit_name ASC"
    );

    return $statement->fetchAll(PDO::FETCH_ASSOC);
}
