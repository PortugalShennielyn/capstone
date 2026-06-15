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
            category_id INT AUTO_INCREMENT PRIMARY KEY,
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
            type_id INT AUTO_INCREMENT PRIMARY KEY,
            category_id INT NULL,
            type_name VARCHAR(80) NOT NULL UNIQUE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4"
    );

    if (!productTypeTableHasColumn($pdo, 'category_id')) {
        $pdo->exec("ALTER TABLE product_types ADD COLUMN category_id INT NULL AFTER type_id");
    }

    $pdo->exec("ALTER TABLE product_types MODIFY type_name VARCHAR(80) NOT NULL");

    $pdo->exec(
        "CREATE TABLE IF NOT EXISTS product_measurement_units (
            measurement_unit_id INT AUTO_INCREMENT PRIMARY KEY,
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
        'Lotion',
        'Solution',
        'Injection',
        'Inhaler',
        'Nebulizer',
        'Suppository',
        'Patch',
        'Powder',
        'Vitamins/Supplements',
        'First Aid',
        'Medical Supply',
        'Personal Protective Equipment',
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
    foreach (['mg', 'mcg', 'g', 'IU', '%', 'mL', 'L', 'oz', 'kg', 'pcs', 'tablet', 'capsule', 'pack', 'box', 'bottle', 'sachet', 'can', 'tube', 'N/A'] as $unitName) {
        $unitSeed->execute([':unit_name' => $unitName]);
    }

    if (!productTableHasColumn($pdo, 'category_id')) {
        $pdo->exec("ALTER TABLE product ADD COLUMN category_id INT NULL AFTER product_id");
    }

    if (!productTableHasColumn($pdo, 'type_id')) {
        $pdo->exec("ALTER TABLE product ADD COLUMN type_id INT NULL AFTER category_id");
    }

    if (!productTableHasColumn($pdo, 'generic_name')) {
        $pdo->exec("ALTER TABLE product ADD COLUMN generic_name VARCHAR(150) NULL AFTER product_name");
    }

    if (!productTableHasColumn($pdo, 'measurement_unit_id')) {
        $afterColumn = productTableHasColumn($pdo, 'type_id') ? 'type_id' : 'category_id';
        $pdo->exec("ALTER TABLE product ADD COLUMN measurement_unit_id INT NULL AFTER {$afterColumn}");
    }

    if (!productTableHasColumn($pdo, 'image_url')) {
        $afterImageColumn = productTableHasColumn($pdo, 'price') ? 'price' : 'product_name';
        $pdo->exec("ALTER TABLE product ADD COLUMN image_url VARCHAR(255) NULL AFTER {$afterImageColumn}");
    }

    if (productTableHasColumn($pdo, 'unit')) {
        $pdo->exec("ALTER TABLE product MODIFY unit VARCHAR(50) NULL");
    }

    $pdo->exec(
        "CREATE TABLE IF NOT EXISTS supplier_products (
            supplier_product_id INT AUTO_INCREMENT PRIMARY KEY,
            supplier_id INT NOT NULL,
            product_id INT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE KEY unique_supplier_product (supplier_id, product_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4"
    );

    $pdo->exec(
        "CREATE TABLE IF NOT EXISTS product_variations (
            variation_id INT AUTO_INCREMENT PRIMARY KEY,
            product_id INT NOT NULL,
            variant_name VARCHAR(150) NULL,
            strength_value VARCHAR(50) NULL,
            strength_unit VARCHAR(20) NULL,
            volume_value VARCHAR(50) NULL,
            volume_unit VARCHAR(20) NULL,
            size_value VARCHAR(100) NULL,
            size_unit VARCHAR(40) NULL,
            weight_value VARCHAR(50) NULL,
            weight_unit VARCHAR(20) NULL,
            unit VARCHAR(50) NULL,
            packaging VARCHAR(100) NULL,
            pack_content_qty INT NULL,
            pack_content_unit VARCHAR(50) NULL,
            price DECIMAL(12,2) NOT NULL DEFAULT 0.00,
            barcode VARCHAR(100) NULL,
            sku VARCHAR(100) NULL,
            is_default TINYINT(1) NOT NULL DEFAULT 0,
            stock INT NOT NULL DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE KEY unique_product_variation_barcode (barcode),
            KEY idx_product_variations_product (product_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4"
    );

    foreach ([
        'variant_name VARCHAR(150) NULL',
        'strength_value VARCHAR(50) NULL',
        'strength_unit VARCHAR(20) NULL',
        'volume_value VARCHAR(50) NULL',
        'volume_unit VARCHAR(20) NULL',
        'size_value VARCHAR(100) NULL',
        'size_unit VARCHAR(40) NULL',
        'weight_value VARCHAR(50) NULL',
        'weight_unit VARCHAR(20) NULL',
        'unit VARCHAR(50) NULL',
        'packaging VARCHAR(100) NULL',
        'pack_content_qty INT NULL',
        'pack_content_unit VARCHAR(50) NULL',
        'price DECIMAL(12,2) NOT NULL DEFAULT 0.00',
        'barcode VARCHAR(100) NULL',
        'sku VARCHAR(100) NULL',
        'is_default TINYINT(1) NOT NULL DEFAULT 0',
        'stock INT NOT NULL DEFAULT 0',
        'created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP'
    ] as $definition) {
        [$column] = explode(' ', $definition, 2);
        if (!tableHasColumn($pdo, 'product_variations', $column)) {
            $pdo->exec("ALTER TABLE product_variations ADD COLUMN {$definition}");
        }
    }

    $pdo->exec(
        "CREATE TABLE IF NOT EXISTS product_inventory (
            inventory_id INT AUTO_INCREMENT PRIMARY KEY,
            product_id INT NOT NULL,
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
    if (!tableHasColumn($pdo, 'product_inventory', 'variation_id')) {
        $pdo->exec("ALTER TABLE product_inventory ADD COLUMN variation_id INT NULL AFTER product_id");
    }

    $pdo->exec(
        "CREATE TABLE IF NOT EXISTS product_selling_stock (
            selling_stock_id INT AUTO_INCREMENT PRIMARY KEY,
            product_id INT NOT NULL,
            source_inventory_id INT NULL,
            batch_number VARCHAR(80) NULL,
            quantity_stocked INT NOT NULL DEFAULT 0,
            quantity_remaining INT NOT NULL DEFAULT 0,
            expiration_date DATE NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4"
    );
    if (!tableHasColumn($pdo, 'product_selling_stock', 'variation_id')) {
        $pdo->exec("ALTER TABLE product_selling_stock ADD COLUMN variation_id INT NULL AFTER product_id");
    }

    if (tableHasColumn($pdo, 'purchase_order_items', 'product_id') && !tableHasColumn($pdo, 'purchase_order_items', 'variation_id')) {
        $pdo->exec("ALTER TABLE purchase_order_items ADD COLUMN variation_id INT NULL AFTER product_id");
    }

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
               AND supplier_id > 0"
        );
    }

    migrateProductRowsToVariations($pdo);
}

function migrateProductRowsToVariations(PDO $pdo): void
{
    $unitIdColumn = getMeasurementUnitIdColumn($pdo);
    $column = static function (string $name, string $alias) use ($pdo): string {
        return productTableHasColumn($pdo, $name) ? "p.{$name} AS {$alias}" : "NULL AS {$alias}";
    };
    $measurementJoin = productTableHasColumn($pdo, 'measurement_unit_id')
        ? "LEFT JOIN product_measurement_units pmu ON pmu.{$unitIdColumn} = p.measurement_unit_id"
        : "";
    $measurementSelect = productTableHasColumn($pdo, 'measurement_unit_id')
        ? "pmu.unit_name AS measurement_unit_name"
        : "NULL AS measurement_unit_name";
    $statement = $pdo->query(
        "SELECT
            p.product_id,
            " . $column('barcode', 'barcode') . ",
            " . (productTableHasColumn($pdo, 'price') ? 'p.price AS price' : '0 AS price') . ",
            " . $column('variant_flavor', 'variant_flavor') . ",
            " . $column('strength_value', 'strength_value') . ",
            " . $column('strength_unit', 'strength_unit') . ",
            " . $column('volume_value', 'volume_value') . ",
            " . $column('volume_unit', 'volume_unit') . ",
            " . $column('display_size', 'display_size') . ",
            " . $column('size_value', 'size_value') . ",
            " . $column('weight_volume_value', 'weight_volume_value') . ",
            " . $column('weight_volume_unit', 'weight_volume_unit') . ",
            " . $column('product_unit', 'product_unit') . ",
            " . $column('packaging', 'packaging') . ",
            {$measurementSelect}
         FROM product p
         {$measurementJoin}
         LEFT JOIN product_variations pv ON pv.product_id = p.product_id
         WHERE pv.variation_id IS NULL"
    );

    $insert = $pdo->prepare(
        "INSERT INTO product_variations (
            product_id,
            variant_name,
            strength_value,
            strength_unit,
            volume_value,
            volume_unit,
            size_value,
            size_unit,
            weight_value,
            weight_unit,
            unit,
            packaging,
            pack_content_qty,
            pack_content_unit,
            price,
            barcode,
            sku,
            is_default,
            stock
        ) VALUES (
            :product_id,
            :variant_name,
            :strength_value,
            :strength_unit,
            :volume_value,
            :volume_unit,
            :size_value,
            :size_unit,
            :weight_value,
            :weight_unit,
            :unit,
            :packaging,
            NULL,
            NULL,
            :price,
            :barcode,
            NULL,
            1,
            0
        )"
    );

    foreach ($statement->fetchAll(PDO::FETCH_ASSOC) as $row) {
        $insert->execute([
            ':product_id' => (int) $row['product_id'],
            ':variant_name' => $row['variant_flavor'] ?: null,
            ':strength_value' => $row['strength_value'] ?: null,
            ':strength_unit' => $row['strength_unit'] ?: null,
            ':volume_value' => $row['volume_value'] ?: null,
            ':volume_unit' => $row['volume_unit'] ?: null,
            ':size_value' => $row['display_size'] ?: ($row['size_value'] ?: null),
            ':size_unit' => null,
            ':weight_value' => $row['weight_volume_value'] ?: null,
            ':weight_unit' => $row['weight_volume_unit'] ?: null,
            ':unit' => $row['product_unit'] ?: ($row['measurement_unit_name'] ?: null),
            ':packaging' => $row['packaging'] ?: null,
            ':price' => (float) ($row['price'] ?? 0),
            ':barcode' => $row['barcode'] ?: ('AUTO-' . strtoupper(bin2hex(random_bytes(6))))
        ]);
    }
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

function getProductCategoryId(PDO $pdo, string $categoryName): int
{
    $statement = $pdo->prepare(
        "SELECT category_id
         FROM product_categories
         WHERE category_name = :category_name
         LIMIT 1"
    );
    $statement->execute([':category_name' => $categoryName]);

    return (int) $statement->fetchColumn();
}

function getProductTypeId(PDO $pdo, int $categoryId, int $typeId): ?int
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
    $validTypeId = (int) $statement->fetchColumn();

    return $validTypeId > 0 ? $validTypeId : null;
}

function getMeasurementUnitId(PDO $pdo, int $measurementUnitId): ?int
{
    $unitIdColumn = getMeasurementUnitIdColumn($pdo);
    $statement = $pdo->prepare(
        "SELECT {$unitIdColumn}
         FROM product_measurement_units
         WHERE {$unitIdColumn} = :measurement_unit_id
         LIMIT 1"
    );
    $statement->execute([':measurement_unit_id' => $measurementUnitId]);
    $validUnitId = (int) $statement->fetchColumn();

    return $validUnitId > 0 ? $validUnitId : null;
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

function getProductTypesByCategory(PDO $pdo, int $categoryId): array
{
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
