<?php
require_once 'product_category_schema.php';

function ensureProductInventoryUnitSchema(PDO $pdo): void
{
    if (!tableHasColumn($pdo, 'product', 'inventory_unit_id')) {
        $pdo->exec("ALTER TABLE product ADD COLUMN inventory_unit_id CHAR(36) NULL AFTER type_id");
    }
}

function requiredProductInventoryUnit(PDO $pdo, $measurementUnitId): array
{
    $unitId = cleanId($measurementUnitId);
    if ($unitId === '') {
        throw new InvalidArgumentException('Selling / Inventory Unit is required for every SKU.');
    }
    $stmt = $pdo->prepare(
        "SELECT measurement_unit_id,unit_name,COALESCE(NULLIF(unit_symbol,''),unit_name) unit_symbol
         FROM product_measurement_units
         WHERE measurement_unit_id=:unit_id AND measurement_group='Count' AND is_active=1 LIMIT 1"
    );
    $stmt->execute([':unit_id'=>$unitId]);
    $unit = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$unit) throw new InvalidArgumentException('Selling / Inventory Unit must be selected from the active Count measurement units.');
    return $unit;
}

function ensureProductCustomizationSchema(PDO $pdo): void
{
    ensureProductCategorySchema($pdo);
    ensureProductTypeUniqueness($pdo);

    if (!tableHasColumn($pdo, 'product_measurement_units', 'unit_symbol')) {
        $pdo->exec("ALTER TABLE product_measurement_units ADD COLUMN unit_symbol VARCHAR(20) NULL AFTER unit_name");
    }
    if (!tableHasColumn($pdo, 'product_measurement_units', 'measurement_group')) {
        $pdo->exec("ALTER TABLE product_measurement_units ADD COLUMN measurement_group VARCHAR(30) NOT NULL DEFAULT 'General Size' AFTER unit_symbol");
    }
    if (!tableHasColumn($pdo, 'product_measurement_units', 'is_active')) {
        $pdo->exec("ALTER TABLE product_measurement_units ADD COLUMN is_active TINYINT(1) NOT NULL DEFAULT 1 AFTER measurement_group");
    }
    if (!tableHasColumn($pdo, 'product_measurement_units', 'is_system')) {
        $pdo->exec("ALTER TABLE product_measurement_units ADD COLUMN is_system TINYINT(1) NOT NULL DEFAULT 1 AFTER is_active");
        $pdo->exec("ALTER TABLE product_measurement_units ALTER COLUMN is_system SET DEFAULT 0");
    }
    ensureProductInventoryUnitSchema($pdo);
    $legacyIndexes = $pdo->query(
        "SELECT index_name FROM information_schema.statistics
         WHERE table_schema = DATABASE() AND table_name = 'product_measurement_units'
         GROUP BY index_name, non_unique
         HAVING non_unique = 0 AND GROUP_CONCAT(column_name ORDER BY seq_in_index) = 'unit_name'"
    )->fetchAll(PDO::FETCH_COLUMN);
    foreach ($legacyIndexes as $indexName) {
        $pdo->exec('ALTER TABLE product_measurement_units DROP INDEX `' . str_replace('`', '``', $indexName) . '`');
    }
    $indexNames = $pdo->query("SELECT DISTINCT index_name FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'product_measurement_units'")->fetchAll(PDO::FETCH_COLUMN);
    if (!in_array('uq_measurement_unit_group_name', $indexNames, true)) {
        $pdo->exec('ALTER TABLE product_measurement_units ADD UNIQUE KEY uq_measurement_unit_group_name (measurement_group, unit_name)');
    }
    if (!in_array('uq_measurement_unit_group_symbol', $indexNames, true)) {
        $pdo->exec('ALTER TABLE product_measurement_units ADD UNIQUE KEY uq_measurement_unit_group_symbol (measurement_group, unit_symbol)');
    }

    $pdo->exec(
        "CREATE TABLE IF NOT EXISTS product_specifications (
            specification_id CHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
            specification_name VARCHAR(80) NOT NULL,
            field_style VARCHAR(30) NOT NULL,
            measurement_group VARCHAR(30) NULL,
            allow_custom_value TINYINT(1) NOT NULL DEFAULT 1,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            UNIQUE KEY uq_product_specification_name (specification_name)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci"
    );
    $pdo->exec(
        "CREATE TABLE IF NOT EXISTS product_type_specifications (
            type_id CHAR(36) NOT NULL,
            specification_id CHAR(36) NOT NULL,
            display_label VARCHAR(80) NULL,
            sort_order INT NOT NULL DEFAULT 0,
            PRIMARY KEY (type_id, specification_id),
            CONSTRAINT fk_type_spec_type FOREIGN KEY (type_id) REFERENCES product_types(type_id) ON DELETE CASCADE ON UPDATE CASCADE,
            CONSTRAINT fk_type_spec_definition FOREIGN KEY (specification_id) REFERENCES product_specifications(specification_id) ON DELETE CASCADE ON UPDATE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci"
    );
    if (!tableHasColumn($pdo, 'product_type_specifications', 'display_label')) {
        $pdo->exec("ALTER TABLE product_type_specifications ADD COLUMN display_label VARCHAR(80) NULL AFTER specification_id");
    }
    $pdo->exec(
        "CREATE TABLE IF NOT EXISTS product_specification_choices (
            choice_id CHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
            specification_id CHAR(36) NOT NULL,
            choice_value VARCHAR(120) NOT NULL,
            sort_order INT NOT NULL DEFAULT 0,
            UNIQUE KEY uq_specification_choice (specification_id, choice_value),
            CONSTRAINT fk_spec_choice_definition FOREIGN KEY (specification_id) REFERENCES product_specifications(specification_id) ON DELETE CASCADE ON UPDATE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci"
    );
    $pdo->exec(
        "CREATE TABLE IF NOT EXISTS product_specification_values (
            product_id CHAR(36) NOT NULL,
            specification_id CHAR(36) NOT NULL,
            value_text VARCHAR(255) NULL,
            value_number DECIMAL(14,4) NULL,
            measurement_unit_id CHAR(36) NULL,
            PRIMARY KEY (product_id, specification_id),
            CONSTRAINT fk_spec_value_product FOREIGN KEY (product_id) REFERENCES product(product_id) ON DELETE CASCADE ON UPDATE CASCADE,
            CONSTRAINT fk_spec_value_definition FOREIGN KEY (specification_id) REFERENCES product_specifications(specification_id) ON DELETE RESTRICT ON UPDATE CASCADE,
            CONSTRAINT fk_spec_value_unit FOREIGN KEY (measurement_unit_id) REFERENCES product_measurement_units(measurement_unit_id) ON DELETE RESTRICT ON UPDATE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci"
    );

    $pdo->exec(
        "DELETE candidate FROM product_measurement_units candidate
         INNER JOIN product_measurement_units existing
             ON LOWER(TRIM(existing.unit_name)) = LOWER(TRIM(candidate.unit_name))
            AND existing.measurement_group <> 'General Size'
         LEFT JOIN product_specification_values used_value ON used_value.measurement_unit_id = candidate.measurement_unit_id
         WHERE candidate.measurement_group = 'General Size' AND used_value.product_id IS NULL"
    );

    seedMeasurementGroups($pdo);
    seedPackageTypes($pdo);
    // Seed the initial catalog once. Re-seeding on every request would recreate
    // definitions that an administrator intentionally deleted.
    if ((int) $pdo->query('SELECT COUNT(*) FROM product_specifications')->fetchColumn() === 0) {
        seedProductSpecifications($pdo);
    }
    migrateTextSpecificationsToSelectionLists($pdo);
    normalizeProductMeasurementUnits($pdo);
    ensureMedicineProductMasterConfiguration($pdo);
    repairLegacyBeverageContentMapping($pdo);
    migrateProductTypeSpecificationLabels($pdo);
}

/** Convert legacy free-text specifications to editable dropdowns once. */
function migrateTextSpecificationsToSelectionLists(PDO $pdo): void
{
    $pdo->exec(
        "CREATE TABLE IF NOT EXISTS product_customization_migrations (
            migration_key VARCHAR(100) NOT NULL PRIMARY KEY,
            applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci"
    );
    $migrationKey = 'text_specifications_selection_lists_v1';
    $check = $pdo->prepare('SELECT migration_key FROM product_customization_migrations WHERE migration_key = :migration_key');
    $check->execute([':migration_key' => $migrationKey]);
    if ($check->fetchColumn()) return;

    $specifications = $pdo->query(
        "SELECT specification_id, specification_name
         FROM product_specifications
         WHERE field_style = 'Text Entry' OR LOWER(TRIM(specification_name)) = 'size'"
    )->fetchAll(PDO::FETCH_ASSOC);
    if (!$specifications) return;

    $pdo->beginTransaction();
    try {
        $update = $pdo->prepare(
            "UPDATE product_specifications
             SET field_style = 'Selection List', measurement_group = NULL, allow_custom_value = 0
             WHERE specification_id = :specification_id"
        );
        $choiceInsert = $pdo->prepare(
            'INSERT IGNORE INTO product_specification_choices
                (choice_id, specification_id, choice_value, sort_order)
             VALUES (:choice_id, :specification_id, :choice_value, :sort_order)'
        );
        $savedValues = $pdo->prepare(
            "SELECT DISTINCT value_text FROM product_specification_values
             WHERE specification_id = :specification_id
               AND value_text IS NOT NULL AND TRIM(value_text) <> ''
             ORDER BY value_text"
        );
        foreach ($specifications as $specification) {
            $specificationId = $specification['specification_id'];
            $update->execute([':specification_id' => $specificationId]);
            $sortOrder = 1;
            if (strcasecmp(trim($specification['specification_name']), 'Size') === 0) {
                foreach (['Small', 'Medium', 'Large', 'XL'] as $choiceValue) {
                    $choiceInsert->execute([
                        ':choice_id' => newUuid($pdo),
                        ':specification_id' => $specificationId,
                        ':choice_value' => $choiceValue,
                        ':sort_order' => $sortOrder++,
                    ]);
                }
            }
            $savedValues->execute([':specification_id' => $specificationId]);
            foreach ($savedValues->fetchAll(PDO::FETCH_COLUMN) as $choiceValue) {
                $choiceInsert->execute([
                    ':choice_id' => newUuid($pdo),
                    ':specification_id' => $specificationId,
                    ':choice_value' => trim((string) $choiceValue),
                    ':sort_order' => $sortOrder++,
                ]);
            }
        }
        $pdo->prepare('INSERT INTO product_customization_migrations (migration_key) VALUES (:migration_key)')
            ->execute([':migration_key' => $migrationKey]);
        $pdo->commit();
    } catch (Throwable $error) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        throw $error;
    }
}

function ensureMedicineProductMasterConfiguration(PDO $pdo): void
{
    $medicineCategoryId = $pdo->query(
        "SELECT category_id FROM product_categories WHERE LOWER(TRIM(category_name)) = 'medicine' LIMIT 1"
    )->fetchColumn();
    if (!$medicineCategoryId) return;

    $classificationId = $pdo->query(
        "SELECT specification_id FROM product_specifications
         WHERE LOWER(TRIM(specification_name)) = 'medicine classification' LIMIT 1"
    )->fetchColumn();
    if (!$classificationId) {
        $classificationId = newUuid($pdo);
        $statement = $pdo->prepare(
            "INSERT INTO product_specifications
                (specification_id, specification_name, field_style, measurement_group, allow_custom_value)
             VALUES (:id, 'Medicine Classification', 'Selection List', NULL, 0)"
        );
        $statement->execute([':id' => $classificationId]);
    }

    $choice = $pdo->prepare(
        'INSERT IGNORE INTO product_specification_choices
            (choice_id, specification_id, choice_value, sort_order)
         VALUES (:choice_id, :specification_id, :choice_value, :sort_order)'
    );
    foreach ([1 => 'Prescription (Rx)', 2 => 'OTC'] as $sortOrder => $choiceValue) {
        $choice->execute([
            ':choice_id' => newUuid($pdo),
            ':specification_id' => $classificationId,
            ':choice_value' => $choiceValue,
            ':sort_order' => $sortOrder,
        ]);
    }

    $strengthDenominatorId = $pdo->query(
        "SELECT specification_id FROM product_specifications
         WHERE LOWER(TRIM(specification_name)) = 'strength denominator' LIMIT 1"
    )->fetchColumn();
    if (!$strengthDenominatorId) {
        $strengthDenominatorId = newUuid($pdo);
        $statement = $pdo->prepare(
            "INSERT INTO product_specifications
                (specification_id, specification_name, field_style, measurement_group, allow_custom_value)
             VALUES (:id, 'Strength Denominator', 'Number with Unit', 'Volume', 0)"
        );
        $statement->execute([':id' => $strengthDenominatorId]);
    }
    $strengthDenominatorWeightId = $pdo->query(
        "SELECT specification_id FROM product_specifications
         WHERE LOWER(TRIM(specification_name)) = 'strength denominator weight' LIMIT 1"
    )->fetchColumn();
    if (!$strengthDenominatorWeightId) {
        $strengthDenominatorWeightId = newUuid($pdo);
        $statement = $pdo->prepare(
            "INSERT INTO product_specifications
                (specification_id, specification_name, field_style, measurement_group, allow_custom_value)
             VALUES (:id, 'Strength Denominator Weight', 'Number with Unit', 'Weight', 0)"
        );
        $statement->execute([':id' => $strengthDenominatorWeightId]);
    }
    $packageTypeId = $pdo->query(
        "SELECT specification_id FROM product_specifications
         WHERE LOWER(TRIM(specification_name)) = 'package type' LIMIT 1"
    )->fetchColumn();
    if (!$packageTypeId) {
        $packageTypeId = newUuid($pdo);
        $statement = $pdo->prepare(
            "INSERT INTO product_specifications
                (specification_id, specification_name, field_style, measurement_group, allow_custom_value)
             VALUES (:id, 'Package Type', 'Selection List', NULL, 1)"
        );
        $statement->execute([':id' => $packageTypeId]);
    }
    $medicineTypes = $pdo->prepare('SELECT type_id FROM product_types WHERE category_id = :category_id');
    $medicineTypes->execute([':category_id' => $medicineCategoryId]);
    $assign = $pdo->prepare(
        'INSERT IGNORE INTO product_type_specifications
            (type_id, specification_id, display_label, sort_order)
         VALUES (:type_id, :specification_id, :display_label, :sort_order)'
    );
    foreach ($medicineTypes->fetchAll(PDO::FETCH_COLUMN) as $typeId) {
        $assign->execute([
            ':type_id' => $typeId,
            ':specification_id' => $classificationId,
            ':display_label' => 'Medicine Classification',
            ':sort_order' => 0,
        ]);
    }
}

function productSpecificationIdByName(PDO $pdo, string $name): string
{
    $statement = $pdo->prepare(
        'SELECT specification_id FROM product_specifications
         WHERE LOWER(TRIM(specification_name)) = LOWER(TRIM(:name)) LIMIT 1'
    );
    $statement->execute([':name' => $name]);
    return cleanId($statement->fetchColumn());
}

function withMedicineClassificationSpecification(PDO $pdo, string $categoryName, array $submitted, $classification): array
{
    if (strcasecmp(trim($categoryName), 'Medicine') !== 0) return $submitted;

    $classification = trim((string) $classification);
    if ($classification === '') {
        throw new InvalidArgumentException('Medicine Classification is required for Medicine products.');
    }
    $classificationId = productSpecificationIdByName($pdo, 'Medicine Classification');
    if ($classificationId === '') {
        throw new RuntimeException('Medicine Classification configuration is unavailable.');
    }
    $valid = $pdo->prepare(
        'SELECT choice_value FROM product_specification_choices
         WHERE specification_id = :specification_id
           AND LOWER(TRIM(choice_value)) = LOWER(TRIM(:choice_value)) LIMIT 1'
    );
    $valid->execute([':specification_id' => $classificationId, ':choice_value' => $classification]);
    $canonicalValue = $valid->fetchColumn();
    if (!$canonicalValue) {
        throw new InvalidArgumentException('Medicine Classification must be Prescription (Rx) or OTC.');
    }

    $submitted = array_values(array_filter($submitted, static function ($value) use ($classificationId): bool {
        return !is_array($value) || cleanId($value['specification_id'] ?? null) !== $classificationId;
    }));
    $submitted[] = [
        'specification_id' => $classificationId,
        'value_text' => $canonicalValue,
        'value_number' => null,
        'measurement_unit_id' => null,
    ];
    return $submitted;
}

function normalizedSpecificationValueByName(PDO $pdo, array $values, string $name): ?array
{
    $specificationId = productSpecificationIdByName($pdo, $name);
    if ($specificationId === '') return null;
    foreach ($values as $value) {
        if (cleanId($value['specification_id'] ?? null) === $specificationId) return $value;
    }
    return null;
}

function requiredMedicineGenericName($value): string
{
    $genericName = trim((string) ($value ?? ''));
    $classificationToken = strtolower((string) preg_replace('/[^a-z]+/i', '', $genericName));
    if (
        $genericName === ''
        || strcasecmp($genericName, 'N/A') === 0
        || $genericName === '-'
        || in_array($classificationToken, ['otc', 'rx', 'prescription', 'prescriptionrx'], true)
    ) {
        throw new InvalidArgumentException('Generic Name / Active Ingredient is required for Medicine products and cannot be an Rx/OTC classification.');
    }
    return $genericName;
}

function requiredMedicineDetails(
    PDO $pdo,
    string $categoryName,
    string $typeName,
    array $payload,
    array $variation,
    array $specificationValues,
    string $typeId = ''
): ?array {
    if (strcasecmp(trim($categoryName), 'Medicine') !== 0) return null;

    $genericName = requiredMedicineGenericName($payload['generic_name'] ?? null);

    $strength = normalizedSpecificationValueByName($pdo, $specificationValues, 'Strength');
    $strengthValue = trim((string) ($strength['value_number'] ?? ''));
    $strengthUnitId = cleanId($strength['measurement_unit_id'] ?? null);
    if ($strengthValue === '' || !is_numeric($strengthValue) || (float) $strengthValue <= 0) {
        throw new InvalidArgumentException('Strength is required for Medicine products and must be greater than 0.');
    }
    if ($strengthUnitId === '') {
        throw new InvalidArgumentException('Strength Unit is required for Medicine products.');
    }
    $unitStatement = $pdo->prepare(
        "SELECT COALESCE(NULLIF(unit_symbol, ''), unit_name) FROM product_measurement_units
         WHERE measurement_unit_id = :unit_id AND is_active = 1 LIMIT 1"
    );
    $unitStatement->execute([':unit_id' => $strengthUnitId]);
    $strengthUnit = trim((string) $unitStatement->fetchColumn());
    if ($strengthUnit === '') {
        throw new InvalidArgumentException('Strength Unit must be selected from the active units configured for this dosage form.');
    }
    $dosageForm = trim($typeName);
    if (strcasecmp($dosageForm, 'Medicine') === 0) {
        $dosage = normalizedSpecificationValueByName($pdo, $specificationValues, 'Dosage Form');
        $dosageForm = trim((string) ($dosage['value_text'] ?? ''));
    }
    if ($dosageForm === '') {
        throw new InvalidArgumentException('Dosage Form is required for Medicine products.');
    }

    $denominator = normalizedSpecificationValueByName($pdo, $specificationValues, 'Strength Denominator')
        ?? normalizedSpecificationValueByName($pdo, $specificationValues, 'Strength Denominator Weight');
    $denominatorValue = trim((string) ($denominator['value_number'] ?? ''));
    $denominatorUnit = '';
    $denominatorGroup = '';
    if (!empty($denominator['measurement_unit_id'])) {
        $denominatorUnitStatement = $pdo->prepare(
            "SELECT COALESCE(NULLIF(unit_symbol, ''), unit_name) AS unit_label, measurement_group FROM product_measurement_units
             WHERE measurement_unit_id = :unit_id AND is_active = 1 LIMIT 1"
        );
        $denominatorUnitStatement->execute([':unit_id' => $denominator['measurement_unit_id']]);
        $denominatorUnitRecord = $denominatorUnitStatement->fetch(PDO::FETCH_ASSOC) ?: [];
        $denominatorUnit = trim((string) ($denominatorUnitRecord['unit_label'] ?? ''));
        $denominatorGroup = trim((string) ($denominatorUnitRecord['measurement_group'] ?? ''));
    }
    $configuredSpecifications = $typeId !== '' ? getTypeSpecificationConfiguration($pdo, $typeId) : [];
    $usesConcentration = count(array_filter($configuredSpecifications, static function (array $definition): bool {
        return str_starts_with(strtolower(trim((string) ($definition['specification_name'] ?? ''))), 'strength denominator');
    })) > 0;
    if ($usesConcentration && ($denominatorValue === '' || !is_numeric($denominatorValue) || (float) $denominatorValue <= 0 || $denominatorUnit === '')) {
        throw new InvalidArgumentException('Concentration Strength requires the denominator value and unit configured for this dosage form.');
    }
    $strengthDisplay = trim($strengthValue . ' ' . $strengthUnit);
    if ($denominatorValue !== '' && $denominatorUnit !== '') {
        $strengthDisplay .= ' / ' . $denominatorValue . ' ' . $denominatorUnit;
    }

    $package = normalizedSpecificationValueByName($pdo, $specificationValues, 'Package Type');
    $volume = normalizedSpecificationValueByName($pdo, $specificationValues, 'Volume');
    $volumeUnit = null;
    if (!empty($volume['measurement_unit_id'])) {
        $volumeUnitStatement = $pdo->prepare(
            "SELECT COALESCE(NULLIF(unit_symbol, ''), unit_name) FROM product_measurement_units
             WHERE measurement_unit_id = :unit_id LIMIT 1"
        );
        $volumeUnitStatement->execute([':unit_id' => $volume['measurement_unit_id']]);
        $volumeUnit = $volumeUnitStatement->fetchColumn() ?: null;
    }

    return [
        'generic_name' => $genericName,
        'strength_value' => $strengthValue,
        'strength_unit' => $strengthUnit,
        'strength' => $strengthDisplay,
        'dosage_form' => $dosageForm,
        'package_type' => trim((string) ($package['value_text'] ?? '')) ?: null,
        'net_content_value' => $volume['value_number'] ?? null,
        'net_content_unit' => $volumeUnit,
    ];
}

function ensureProductTypeUniqueness(PDO $pdo): void
{
    $index = $pdo->query(
        "SELECT index_name FROM information_schema.statistics
         WHERE table_schema = DATABASE() AND table_name = 'product_types' AND non_unique = 0
         GROUP BY index_name
         HAVING GROUP_CONCAT(column_name ORDER BY seq_in_index) = 'category_id,type_name'
         LIMIT 1"
    )->fetchColumn();
    if ($index) return;
    $duplicates = (int) $pdo->query(
        "SELECT COUNT(*) FROM (
            SELECT category_id, LOWER(TRIM(type_name)) AS normalized_name
            FROM product_types GROUP BY category_id, LOWER(TRIM(type_name)) HAVING COUNT(*) > 1
         ) duplicate_types"
    )->fetchColumn();
    if ($duplicates === 0) {
        $pdo->exec('ALTER TABLE product_types ADD UNIQUE KEY uniq_product_types_category_id_type_name (category_id, type_name)');
    }
}

function migrateProductTypeSpecificationLabels(PDO $pdo): void
{
    $pdo->exec(
        "UPDATE product_type_specifications pts
         INNER JOIN product_specifications ps ON ps.specification_id = pts.specification_id
         SET pts.display_label = NULL
         WHERE ps.specification_name = 'Package Type' AND LOWER(TRIM(COALESCE(pts.display_label, ''))) = 'container type'"
    );
    $pdo->exec(
        "UPDATE product_type_specifications pts
         INNER JOIN product_types pt ON pt.type_id = pts.type_id
         INNER JOIN product_specifications ps ON ps.specification_id = pts.specification_id
         SET pts.display_label = 'Net Content'
         WHERE pt.type_name = 'Beverage' AND ps.specification_name = 'Volume'
           AND LOWER(TRIM(COALESCE(pts.display_label, ''))) IN ('', 'liquid content')"
    );
    $pdo->exec(
        "UPDATE product_type_specifications pts
         INNER JOIN product_types pt ON pt.type_id = pts.type_id
         INNER JOIN product_specifications ps ON ps.specification_id = pts.specification_id
         SET pts.sort_order = CASE ps.specification_name WHEN 'Flavor' THEN 1 WHEN 'Volume' THEN 2 WHEN 'Package Type' THEN 3 ELSE pts.sort_order END
         WHERE pt.type_name = 'Beverage'"
    );
}

function seedMeasurementGroups(PDO $pdo): void
{
    $groups = [
        'mg' => ['mg', 'Weight'], 'g' => ['g', 'Weight'], 'kg' => ['kg', 'Weight'], 'oz' => ['oz', 'Weight'], 'lb' => ['lb', 'Weight'],
        'microliter' => ['µL', 'Volume'], 'ml' => ['mL', 'Volume'],
        'centiliter' => ['cL', 'Volume'], 'deciliter' => ['dL', 'Volume'],
        'l' => ['L', 'Volume'], 'cc' => ['cc', 'Volume'],
        'fluid ounce' => ['fl oz', 'Volume'], 'teaspoon' => ['tsp', 'Volume'],
        'tablespoon' => ['tbsp', 'Volume'], 'cup' => ['cup', 'Volume'],
        'pint' => ['pt', 'Volume'], 'quart' => ['qt', 'Volume'], 'gallon' => ['gal', 'Volume'],
        'microgram' => ['mcg', 'Weight'],
        'mcg' => ['mcg', 'Weight'], '%' => ['%', 'General Size'], 'iu' => ['IU', 'General Size'],
        'pcs' => ['pcs', 'Count'], 'patch' => ['patch', 'Count'], 'tablet' => ['tablet', 'Count'], 'capsule' => ['capsule', 'Count'],
        'sachet' => ['sachet', 'Count'], 'strip' => ['strip', 'Count']
    ];
    $packaging = ['ampule', 'blister pack', 'bottle', 'box', 'can', 'carton', 'jar', 'pack', 'plastic pack', 'pouch', 'roll', 'tube', 'vial'];
    $update = $pdo->prepare(
        "UPDATE product_measurement_units candidate
         LEFT JOIN product_measurement_units conflicting
           ON conflicting.measurement_unit_id <> candidate.measurement_unit_id
          AND conflicting.measurement_group = :conflict_group
          AND LOWER(TRIM(COALESCE(conflicting.unit_symbol, ''))) = :conflict_symbol
         SET candidate.unit_symbol = :symbol, candidate.measurement_group = :measurement_group
         WHERE LOWER(TRIM(candidate.unit_name)) = :unit_name
           AND candidate.measurement_group IN ('General Size', :current_group)
           AND conflicting.measurement_unit_id IS NULL"
    );
    foreach ($groups as $name => [$symbol, $group]) {
        $update->execute([
            ':conflict_group' => $group,
            ':conflict_symbol' => strtolower($symbol),
            ':symbol' => $symbol,
            ':measurement_group' => $group,
            ':current_group' => $group,
            ':unit_name' => $name
        ]);
    }
    foreach ($packaging as $name) {
        $update->execute([
            ':conflict_group' => 'Packaging',
            ':conflict_symbol' => $name,
            ':symbol' => $name,
            ':measurement_group' => 'Packaging',
            ':current_group' => 'Packaging',
            ':unit_name' => $name
        ]);
    }
    foreach ($groups as $name => [$symbol, $group]) {
        // A unit may have been given a custom display name while retaining its
        // canonical symbol. Treat either value as the seeded unit so schema
        // initialization remains idempotent and does not violate the unique
        // (measurement_group, unit_symbol) index.
        $exists = $pdo->prepare(
            'SELECT measurement_unit_id
             FROM product_measurement_units
             WHERE measurement_group = :measurement_group
               AND (LOWER(TRIM(unit_name)) = :unit_name OR LOWER(TRIM(COALESCE(unit_symbol, \'\'))) = :unit_symbol)
             LIMIT 1'
        );
        $exists->execute([':measurement_group' => $group, ':unit_name' => $name, ':unit_symbol' => strtolower($symbol)]);
        if (!$exists->fetchColumn()) {
            $insert = $pdo->prepare('INSERT INTO product_measurement_units (measurement_unit_id, unit_name, unit_symbol, measurement_group, is_active, is_system) VALUES (:id, :unit_name, :unit_symbol, :measurement_group, 1, 1)');
            $insert->execute([':id' => newUuid($pdo), ':unit_name' => $symbol, ':unit_symbol' => $symbol, ':measurement_group' => $group]);
        }
    }
    $pdo->exec(
        "UPDATE product_measurement_units
         SET unit_name = 'Microliter', unit_symbol = 'µL', measurement_group = 'Volume'
         WHERE measurement_group = 'Volume' AND is_system = 1 AND unit_symbol = 'µL'"
    );
    foreach (['ampule', 'bag', 'bottle', 'box', 'bundle', 'can', 'carton', 'case', 'jar', 'pack', 'pc', 'piece', 'pouch', 'roll', 'sachet', 'stab', 'strip', 'tray', 'tube', 'vial'] as $name) {
        $exists = $pdo->prepare(
            "SELECT measurement_unit_id FROM product_measurement_units
             WHERE measurement_group = 'Count'
               AND (LOWER(TRIM(unit_name)) = :unit_name OR LOWER(TRIM(COALESCE(unit_symbol, ''))) = :unit_symbol)
             LIMIT 1"
        );
        $exists->execute([':unit_name' => $name, ':unit_symbol' => $name]);
        if (!$exists->fetchColumn()) {
            $insert = $pdo->prepare("INSERT INTO product_measurement_units (measurement_unit_id, unit_name, unit_symbol, measurement_group, is_active, is_system) VALUES (:id, :name, :symbol, 'Count', 1, 1)");
            $insert->execute([':id' => newUuid($pdo), ':name' => ucfirst($name), ':symbol' => $name]);
        }
    }

    // A concentration is a value/unit pair divided by another value/unit
    // pair. Preserve historical rows for foreign keys, but do not expose a
    // compound expression as a reusable measurement unit.
    $pdo->exec(
        "UPDATE product_measurement_units
         SET is_active = 0
         WHERE measurement_group = 'Strength'
           AND (unit_name REGEXP '[0-9]' OR unit_symbol REGEXP '[0-9]' OR unit_name LIKE '%/%' OR unit_symbol LIKE '%/%')"
    );
}

function normalizeProductMeasurementUnits(PDO $pdo): void
{
    $canonicalStatement = $pdo->prepare(
        "SELECT measurement_unit_id FROM product_measurement_units
         WHERE measurement_group = :measurement_group
           AND LOWER(TRIM(COALESCE(NULLIF(unit_symbol, ''), unit_name))) = :symbol
         ORDER BY is_active DESC, is_system DESC LIMIT 1"
    );
    $duplicatesStatement = $pdo->prepare(
        "SELECT measurement_unit_id FROM product_measurement_units
         WHERE measurement_group = :measurement_group
           AND LOWER(TRIM(COALESCE(NULLIF(unit_symbol, ''), unit_name))) = :symbol
           AND measurement_unit_id <> :canonical_id"
    );
    $replaceSpecificationReference = $pdo->prepare(
        'UPDATE product_specification_values SET measurement_unit_id = :canonical_id WHERE measurement_unit_id = :duplicate_id'
    );
    $replaceInventoryReference = $pdo->prepare(
        'UPDATE product SET inventory_unit_id = :canonical_id WHERE inventory_unit_id = :duplicate_id'
    );
    $archive = $pdo->prepare(
        'UPDATE product_measurement_units SET is_active = 0 WHERE measurement_unit_id = :duplicate_id'
    );

    foreach (['mg', 'g', 'mcg'] as $symbol) {
        $canonicalStatement->execute([':measurement_group' => 'Weight', ':symbol' => $symbol]);
        $canonicalId = cleanId($canonicalStatement->fetchColumn());
        if ($canonicalId === '') continue;
        $duplicatesStatement->execute([
            ':measurement_group' => 'Strength',
            ':symbol' => $symbol,
            ':canonical_id' => $canonicalId,
        ]);
        foreach ($duplicatesStatement->fetchAll(PDO::FETCH_COLUMN) as $duplicateId) {
            $replaceSpecificationReference->execute([':canonical_id' => $canonicalId, ':duplicate_id' => $duplicateId]);
            $replaceInventoryReference->execute([':canonical_id' => $canonicalId, ':duplicate_id' => $duplicateId]);
            $archive->execute([':duplicate_id' => $duplicateId]);
        }
    }

    // Repair the historical misspelled milliliter row only after redirecting
    // any normalized foreign-key references to the canonical Volume mL row.
    $canonicalStatement->execute([':measurement_group' => 'Volume', ':symbol' => 'ml']);
    $canonicalMlId = cleanId($canonicalStatement->fetchColumn());
    if ($canonicalMlId !== '') {
        $duplicatesStatement->execute([
            ':measurement_group' => 'Weight',
            ':symbol' => 'ml',
            ':canonical_id' => $canonicalMlId,
        ]);
        foreach ($duplicatesStatement->fetchAll(PDO::FETCH_COLUMN) as $duplicateId) {
            $replaceSpecificationReference->execute([':canonical_id' => $canonicalMlId, ':duplicate_id' => $duplicateId]);
            $replaceInventoryReference->execute([':canonical_id' => $canonicalMlId, ':duplicate_id' => $duplicateId]);
            $archive->execute([':duplicate_id' => $duplicateId]);
        }
    }

    foreach (['iu', '%'] as $symbol) {
        $canonicalStatement->execute([':measurement_group' => 'General Size', ':symbol' => $symbol]);
        $canonicalId = cleanId($canonicalStatement->fetchColumn());
        if ($canonicalId === '') continue;
        $duplicatesStatement->execute([
            ':measurement_group' => 'Strength',
            ':symbol' => $symbol,
            ':canonical_id' => $canonicalId,
        ]);
        foreach ($duplicatesStatement->fetchAll(PDO::FETCH_COLUMN) as $duplicateId) {
            $replaceSpecificationReference->execute([':canonical_id' => $canonicalId, ':duplicate_id' => $duplicateId]);
            $replaceInventoryReference->execute([':canonical_id' => $canonicalId, ':duplicate_id' => $duplicateId]);
            $archive->execute([':duplicate_id' => $duplicateId]);
        }
    }
    $pdo->exec(
        "UPDATE product_specifications SET measurement_group = 'Weight'
         WHERE LOWER(TRIM(specification_name)) = 'strength'"
    );
}

function seedPackageTypes(PDO $pdo): void
{
    $values = ['Ampule', 'Blister Pack', 'Bottle', 'Box', 'Can', 'Carton', 'Jar', 'Pack', 'Plastic Pack', 'Pouch', 'Roll', 'Sachet', 'Strip', 'Tetra Pack', 'Tube', 'Vial'];
    $statement = $pdo->prepare(
        "INSERT INTO lookup_values (lookup_id, lookup_type, lookup_code, lookup_label, sort_order, is_active)
         VALUES (:lookup_id, 'product_package_type', :lookup_code, :lookup_label, :sort_order, 1)
         ON DUPLICATE KEY UPDATE lookup_label = VALUES(lookup_label), is_active = 1"
    );
    foreach ($values as $index => $value) {
        $statement->execute([
            ':lookup_id' => newUuid($pdo),
            ':lookup_code' => strtolower(str_replace(' ', '_', $value)),
            ':lookup_label' => $value,
            ':sort_order' => $index + 1
        ]);
    }
}

function seedProductSpecifications(PDO $pdo): void
{
    $definitions = [
        'Flavor' => ['Selection List', null, 1, ['Original', 'Orange', 'Lemon', 'Grape']],
        'Variant' => ['Selection List', null, 0, []],
        'Volume' => ['Number with Unit', 'Volume', 1, []],
        'Net Weight' => ['Number with Unit', 'Weight', 1, []],
        'Strength' => ['Number with Unit', 'Weight', 1, []],
        'Tablet Count' => ['Number with Unit', 'Count', 1, []],
        'Pack Content' => ['Number with Unit', 'Count', 1, []],
        'Package Type' => ['Selection List', null, 1, []],
        'Size' => ['Selection List', null, 0, ['Small', 'Medium', 'Large', 'XL']],
        'Model' => ['Selection List', null, 0, []],
        'Material' => ['Selection List', null, 0, []],
        'Sterile Status' => ['Selection List', null, 0, ['Sterile', 'Non-sterile']],
        'Sugar Type' => ['Selection List', null, 1, ['Regular', 'Low Sugar', 'Sugar Free']]
    ];
    $ids = [];
    $find = $pdo->prepare('SELECT specification_id FROM product_specifications WHERE LOWER(TRIM(specification_name)) = LOWER(TRIM(:name)) LIMIT 1');
    $insert = $pdo->prepare('INSERT INTO product_specifications (specification_id, specification_name, field_style, measurement_group, allow_custom_value) VALUES (:id, :name, :style, :measurement_group, :allow_custom)');
    $choice = $pdo->prepare('INSERT IGNORE INTO product_specification_choices (choice_id, specification_id, choice_value, sort_order) VALUES (:id, :specification_id, :value, :sort_order)');
    foreach ($definitions as $name => [$style, $group, $allowCustom, $choices]) {
        $find->execute([':name' => $name]);
        $id = cleanId($find->fetchColumn());
        if ($id === '') {
            $id = newUuid($pdo);
            $insert->execute([':id' => $id, ':name' => $name, ':style' => $style, ':measurement_group' => $group, ':allow_custom' => $allowCustom]);
        }
        $ids[$name] = $id;
        foreach ($choices as $index => $value) {
            $choice->execute([':id' => newUuid($pdo), ':specification_id' => $id, ':value' => $value, ':sort_order' => $index + 1]);
        }
    }

    $types = $pdo->query('SELECT type_id FROM product_types ORDER BY type_id')->fetchAll(PDO::FETCH_COLUMN);
    foreach ($types as $typeId) {
        assignSuggestedProductTypeTemplate($pdo, $typeId, $ids);
    }
}

function suggestedProductTypeSpecifications(string $categoryName, string $typeName): array
{
    $category = strtolower(trim($categoryName));
    $type = strtolower(trim($typeName));
    if ($category === 'medicine') {
        $base = [['Medicine Classification', null], ['Strength', null]];
        if (in_array($type, ['powder for suspension', 'syrup', 'suspension', 'solution', 'drops', 'injection'], true)) {
            return array_merge($base, [['Strength Denominator', null], ['Volume', 'Net Content'], ['Package Type', 'Package / Container']]);
        }
        if (in_array($type, ['cream', 'ointment', 'gel', 'lotion'], true)) {
            return array_merge($base, [['Strength Denominator Weight', null], ['Net Weight', 'Net Content'], ['Package Type', 'Package / Container']]);
        }
        if ($type === 'inhaler') {
            return array_merge($base, [['Pack Content', 'Doses / Actuations'], ['Package Type', 'Package / Container']]);
        }
        return array_merge($base, [['Package Type', 'Package / Container']]);
    }
    $grocery = [
        'beverage' => [['Flavor', null], ['Volume', 'Net Content'], ['Package Type', 'Package / Container'], ['Pack Content', null]],
        'biscuits' => [['Flavor', null], ['Net Weight', null], ['Package Type', 'Package / Container'], ['Pack Content', null]],
        'bread/bakery' => [['Variant', null], ['Net Weight', null], ['Package Type', 'Package / Container'], ['Pack Content', null]],
        'canned goods' => [['Flavor', null], ['Net Weight', 'Net Content'], ['Package Type', 'Package / Container'], ['Pack Content', null]],
    ];
    if ($category === 'grocery' && isset($grocery[$type])) return $grocery[$type];
    if ($category === 'grocery') {
        return [['Variant', null], ['Net Weight', 'Net Content'], ['Package Type', 'Package / Container'], ['Pack Content', null]];
    }
    if (in_array($category, ['medical supply', 'medical supplies'], true)) {
        if ($type === 'device/equipment') return [['Model', null], ['Size', null], ['Material', null], ['Package Type', 'Package / Container']];
        if (in_array($type, ['first aid', 'first aid supply'], true)) return [['Variant', null], ['Size', null], ['Pack Content', 'Quantity per Package'], ['Package Type', 'Package / Container']];
        return [['Variant', null], ['Size', null], ['Material', null], ['Sterile Status', null], ['Pack Content', 'Quantity per Package'], ['Package Type', 'Package / Container']];
    }
    return [['Variant', null], ['Package Type', 'Package / Container']];
}

function medicineDosageFormSpecificationPattern(string $pattern): array
{
    $patterns = [
        'simple_strength' => [
            ['Medicine Classification', null], ['Strength', null],
            ['Package Type', 'Package / Container'], ['Pack Content', null],
        ],
        'concentration_ratio' => [
            ['Medicine Classification', null], ['Strength', null], ['Strength Denominator', null],
            ['Volume', 'Net Content'], ['Package Type', 'Package / Container'], ['Flavor', null],
        ],
        'percentage' => [
            ['Medicine Classification', null], ['Strength', null],
            ['Net Weight', 'Net Content'], ['Package Type', 'Package / Container'],
        ],
        'dose_based' => [
            ['Medicine Classification', null], ['Strength', null],
            ['Pack Content', 'Doses / Actuations'], ['Package Type', 'Package / Container'],
        ],
        'custom' => [
            ['Medicine Classification', null], ['Strength', null],
        ],
    ];
    if (!isset($patterns[$pattern])) {
        throw new InvalidArgumentException('Select a valid Specification Pattern.');
    }
    return $patterns[$pattern];
}

function assignMedicineDosageFormPattern(PDO $pdo, string $typeId, string $pattern): void
{
    $definitions = medicineDosageFormSpecificationPattern($pattern);
    $find = $pdo->prepare(
        'SELECT specification_id FROM product_specifications
         WHERE LOWER(TRIM(specification_name)) = LOWER(TRIM(:name)) LIMIT 1'
    );
    $insert = $pdo->prepare(
        'INSERT INTO product_type_specifications
            (type_id, specification_id, display_label, sort_order)
         VALUES (:type_id, :specification_id, :display_label, :sort_order)'
    );

    $pdo->prepare('DELETE FROM product_type_specifications WHERE type_id = :type_id')
        ->execute([':type_id' => $typeId]);
    foreach ($definitions as $index => [$name, $label]) {
        $find->execute([':name' => $name]);
        $specificationId = cleanId($find->fetchColumn());
        if ($specificationId === '') {
            throw new RuntimeException("The {$name} specification is unavailable.");
        }
        $insert->execute([
            ':type_id' => $typeId,
            ':specification_id' => $specificationId,
            ':display_label' => $label,
            ':sort_order' => $index,
        ]);
    }
}

function assignSuggestedProductTypeTemplate(PDO $pdo, string $typeId, ?array $specificationIds = null): bool
{
    $count = $pdo->prepare('SELECT COUNT(*) FROM product_type_specifications WHERE type_id = :type_id');
    $count->execute([':type_id' => $typeId]);
    if ((int) $count->fetchColumn() > 0) {
        return false;
    }
    $type = $pdo->prepare('SELECT pt.type_name, pc.category_name FROM product_types pt INNER JOIN product_categories pc ON pc.category_id = pt.category_id WHERE pt.type_id = :type_id LIMIT 1');
    $type->execute([':type_id' => $typeId]);
    $row = $type->fetch(PDO::FETCH_ASSOC);
    if (!$row) {
        return false;
    }
    if ($specificationIds === null) {
        $specificationIds = [];
        foreach ($pdo->query('SELECT specification_id, specification_name FROM product_specifications')->fetchAll(PDO::FETCH_ASSOC) as $definition) {
            $specificationIds[$definition['specification_name']] = $definition['specification_id'];
        }
    }
    $assign = $pdo->prepare('INSERT IGNORE INTO product_type_specifications (type_id, specification_id, display_label, sort_order) VALUES (:type_id, :specification_id, :display_label, :sort_order)');
    foreach (suggestedProductTypeSpecifications($row['category_name'], $row['type_name']) as $index => [$name, $label]) {
        if (empty($specificationIds[$name])) continue;
        $assign->execute([':type_id' => $typeId, ':specification_id' => $specificationIds[$name], ':display_label' => $label, ':sort_order' => $index + 1]);
    }
    return true;
}

function repairLegacyBeverageContentMapping(PDO $pdo): void
{
    $definitions = [];
    foreach ($pdo->query("SELECT specification_id, specification_name FROM product_specifications WHERE specification_name IN ('Net Weight','Volume','Package Type','Pack Content')")->fetchAll(PDO::FETCH_ASSOC) as $row) {
        $definitions[$row['specification_name']] = $row['specification_id'];
    }
    if (!isset($definitions['Net Weight'], $definitions['Volume'])) return;
    $types = $pdo->query("SELECT type_id FROM product_types WHERE LOWER(TRIM(type_name)) = 'beverage'")->fetchAll(PDO::FETCH_COLUMN);
    foreach ($types as $typeId) {
        $legacy = $pdo->prepare(
            "SELECT pts.sort_order, pts.display_label
             FROM product_type_specifications pts
             WHERE pts.type_id = :type_id AND pts.specification_id = :weight_id
               AND NOT EXISTS (SELECT 1 FROM product_type_specifications volume_map WHERE volume_map.type_id = pts.type_id AND volume_map.specification_id = :volume_id)
               AND EXISTS (
                   SELECT 1 FROM product p
                   INNER JOIN product_specification_values psv ON psv.product_id = p.product_id AND psv.specification_id = pts.specification_id
                   INNER JOIN product_measurement_units pmu ON pmu.measurement_unit_id = psv.measurement_unit_id
                   WHERE p.type_id = pts.type_id AND LOWER(COALESCE(pmu.unit_symbol, pmu.unit_name)) IN ('ml','l','cc')
               ) LIMIT 1"
        );
        $legacy->execute([':type_id' => $typeId, ':weight_id' => $definitions['Net Weight'], ':volume_id' => $definitions['Volume']]);
        $mapping = $legacy->fetch(PDO::FETCH_ASSOC);
        if (!$mapping) continue;
        $pdo->beginTransaction();
        try {
            $values = $pdo->prepare(
                "SELECT psv.product_id, psv.value_number, psv.value_text, COALESCE(pmu.unit_symbol, pmu.unit_name) AS unit_symbol
                 FROM product p INNER JOIN product_specification_values psv ON psv.product_id = p.product_id
                 LEFT JOIN product_measurement_units pmu ON pmu.measurement_unit_id = psv.measurement_unit_id
                 WHERE p.type_id = :type_id AND psv.specification_id = :weight_id"
            );
            $values->execute([':type_id' => $typeId, ':weight_id' => $definitions['Net Weight']]);
            $findUnit = $pdo->prepare("SELECT measurement_unit_id FROM product_measurement_units WHERE measurement_group = 'Volume' AND LOWER(COALESCE(unit_symbol, unit_name)) = LOWER(:symbol) LIMIT 1");
            $upsert = $pdo->prepare("INSERT INTO product_specification_values (product_id, specification_id, value_text, value_number, measurement_unit_id) VALUES (:product_id, :specification_id, :value_text, :value_number, :unit_id) ON DUPLICATE KEY UPDATE value_text=VALUES(value_text), value_number=VALUES(value_number), measurement_unit_id=VALUES(measurement_unit_id)");
            foreach ($values->fetchAll(PDO::FETCH_ASSOC) as $value) {
                $findUnit->execute([':symbol' => $value['unit_symbol']]);
                $unitId = cleanId($findUnit->fetchColumn());
                if ($unitId === '') continue;
                $upsert->execute([':product_id' => $value['product_id'], ':specification_id' => $definitions['Volume'], ':value_text' => $value['value_text'], ':value_number' => $value['value_number'], ':unit_id' => $unitId]);
                $pdo->prepare('DELETE FROM product_specification_values WHERE product_id = :product_id AND specification_id = :weight_id')->execute([':product_id' => $value['product_id'], ':weight_id' => $definitions['Net Weight']]);
            }
            $pdo->prepare('DELETE FROM product_type_specifications WHERE type_id = :type_id AND specification_id = :weight_id')->execute([':type_id' => $typeId, ':weight_id' => $definitions['Net Weight']]);
            $pdo->prepare('INSERT IGNORE INTO product_type_specifications (type_id, specification_id, display_label, sort_order) VALUES (:type_id, :specification_id, :label, :sort_order)')->execute([':type_id' => $typeId, ':specification_id' => $definitions['Volume'], ':label' => 'Net Content', ':sort_order' => $mapping['sort_order']]);
            $maxOrder = (int) $pdo->query('SELECT COALESCE(MAX(sort_order),0) FROM product_type_specifications WHERE type_id = ' . $pdo->quote($typeId))->fetchColumn();
            $append = $pdo->prepare('INSERT IGNORE INTO product_type_specifications (type_id, specification_id, display_label, sort_order) VALUES (:type_id, :specification_id, NULL, :sort_order)');
            foreach (['Package Type', 'Pack Content'] as $name) {
                if (!empty($definitions[$name])) $append->execute([':type_id' => $typeId, ':specification_id' => $definitions[$name], ':sort_order' => ++$maxOrder]);
            }
            $pdo->commit();
        } catch (Throwable $error) {
            if ($pdo->inTransaction()) $pdo->rollBack();
            throw $error;
        }
    }
}

function attachSpecificationChoices(PDO $pdo, array $rows): array
{
    if (!$rows) return [];
    $ids = array_values(array_unique(array_column($rows, 'specification_id')));
    $placeholders = implode(',', array_fill(0, count($ids), '?'));
    $statement = $pdo->prepare("SELECT specification_id, choice_value FROM product_specification_choices WHERE specification_id IN ({$placeholders}) ORDER BY specification_id, sort_order, choice_value");
    $statement->execute($ids);
    $choices = [];
    foreach ($statement->fetchAll(PDO::FETCH_ASSOC) as $choice) $choices[$choice['specification_id']][] = $choice['choice_value'];
    foreach ($rows as &$row) $row['choices'] = $choices[$row['specification_id']] ?? [];
    unset($row);
    return $rows;
}

function normalizeSpecificationChoices($submitted): array
{
    if (!is_array($submitted)) return [];
    $choices = [];
    $seen = [];
    foreach ($submitted as $choice) {
        $value = trim((string) $choice);
        $key = function_exists('mb_strtolower') ? mb_strtolower($value, 'UTF-8') : strtolower($value);
        if ($value === '' || isset($seen[$key])) continue;
        $seen[$key] = true;
        $choices[] = $value;
    }
    return $choices;
}

function getTypeSpecificationConfiguration(PDO $pdo, string $typeId): array
{
    $statement = $pdo->prepare(
        "SELECT ps.specification_id, ps.specification_name,
                COALESCE(NULLIF(pts.display_label, ''), ps.specification_name) AS display_name,
                ps.field_style, ps.measurement_group, ps.allow_custom_value, pts.sort_order,
                (SELECT COUNT(*) FROM product_type_specifications usage_rows WHERE usage_rows.specification_id = ps.specification_id) AS usage_count,
                (SELECT COUNT(*) FROM product_specification_values value_rows WHERE value_rows.specification_id = ps.specification_id) AS value_count
         FROM product_type_specifications pts
         INNER JOIN product_specifications ps ON ps.specification_id = pts.specification_id
          WHERE pts.type_id = :type_id AND LOWER(TRIM(ps.specification_name)) <> 'inventory unit'
         ORDER BY pts.sort_order, ps.specification_name"
    );
    $statement->execute([':type_id' => $typeId]);
    $specifications = attachSpecificationChoices($pdo, $statement->fetchAll());
    foreach ($specifications as &$specification) {
        $specification['allow_custom_value'] = (bool) $specification['allow_custom_value'];
        $specification['usage_count'] = (int) $specification['usage_count'];
        $specification['value_count'] = (int) $specification['value_count'];
        $specification['can_edit_structure'] = $specification['usage_count'] <= 1 && $specification['value_count'] === 0;
        $specification['can_edit_choices'] = $specification['field_style'] === 'Selection List';
    }
    unset($specification);
    return $specifications;
}

function getAllSpecificationDefinitionsForType(PDO $pdo, string $typeId): array
{
    $statement = $pdo->prepare(
        "SELECT ps.specification_id, ps.specification_name,
                COALESCE(NULLIF(pts.display_label, ''), ps.specification_name) AS display_name,
                ps.field_style, ps.measurement_group, ps.allow_custom_value,
                COALESCE(pts.sort_order, 9999) AS sort_order,
                (SELECT COUNT(*) FROM product_type_specifications usage_rows WHERE usage_rows.specification_id = ps.specification_id) AS usage_count,
                (SELECT COUNT(*) FROM product_specification_values value_rows WHERE value_rows.specification_id = ps.specification_id) AS value_count
          FROM product_specifications ps
          LEFT JOIN product_type_specifications pts ON pts.specification_id = ps.specification_id AND pts.type_id = :type_id
          WHERE LOWER(TRIM(ps.specification_name)) <> 'inventory unit'
         ORDER BY COALESCE(pts.sort_order, 9999), ps.specification_name"
    );
    $statement->execute([':type_id' => $typeId]);
    $rows = attachSpecificationChoices($pdo, $statement->fetchAll(PDO::FETCH_ASSOC));
    foreach ($rows as &$row) {
        $row['allow_custom_value'] = (bool) $row['allow_custom_value'];
        $row['usage_count'] = (int) $row['usage_count'];
        $row['value_count'] = (int) $row['value_count'];
        $row['can_edit_structure'] = $row['usage_count'] <= 1 && $row['value_count'] === 0;
        $row['can_edit_choices'] = $row['field_style'] === 'Selection List';
    }
    unset($row);
    return $rows;
}

function validateAndNormalizeSpecificationValues(PDO $pdo, string $typeId, array $submitted, ?string $productId = null): array
{
    $configuration = getTypeSpecificationConfiguration($pdo, $typeId);
    $allowed = [];
    foreach ($configuration as $specification) {
        $allowed[$specification['specification_id']] = $specification;
    }
    $normalized = [];
    foreach ($submitted as $value) {
        if (!is_array($value)) {
            continue;
        }
        $specificationId = cleanId($value['specification_id'] ?? null);
        if ($specificationId === '' || !isset($allowed[$specificationId])) {
            throw new InvalidArgumentException('A submitted specification does not belong to the selected Product Type.');
        }
        $definition = $allowed[$specificationId];
        if (in_array(strtolower(trim((string) ($definition['specification_name'] ?? ''))), ['package type', 'pack content', 'tablet count'], true)) {
            continue;
        }
        $text = trim((string) ($value['value_text'] ?? ''));
        $number = trim((string) ($value['value_number'] ?? ''));
        $unitId = cleanId($value['measurement_unit_id'] ?? null);
        if ($text === '' && $number === '') {
            continue;
        }
        if (in_array($definition['field_style'], ['Number with Unit', 'Number Only'], true)) {
            if ($number === '' || !is_numeric($number)) {
                throw new InvalidArgumentException($definition['specification_name'] . ' must be a valid number.');
            }
        } else {
            $number = '';
        }
        if ($definition['field_style'] === 'Selection List' && !$definition['allow_custom_value']) {
            $validChoice = false;
            foreach ($definition['choices'] as $choice) {
                if (strcasecmp(trim($choice), $text) === 0) {
                    $validChoice = true;
                    break;
                }
            }
            if (!$validChoice) {
                throw new InvalidArgumentException($definition['specification_name'] . ' must use one of its configured choices.');
            }
        }
        $isPackageType = strcasecmp(trim((string) ($definition['specification_name'] ?? '')), 'Package Type') === 0;
        if ($isPackageType) {
            if ($unitId === '' && $text !== '') {
                $packageLookup = $pdo->prepare(
                    "SELECT measurement_unit_id, unit_name FROM product_measurement_units
                     WHERE measurement_group = 'Count' AND is_active = 1
                       AND (LOWER(TRIM(unit_name)) = LOWER(TRIM(:label)) OR LOWER(TRIM(COALESCE(unit_symbol, ''))) = LOWER(TRIM(:symbol)))
                     LIMIT 1"
                );
                $packageLookup->execute([':label' => $text, ':symbol' => $text]);
                $packageUnit = $packageLookup->fetch(PDO::FETCH_ASSOC);
                if ($packageUnit) {
                    $unitId = cleanId($packageUnit['measurement_unit_id']);
                    $text = trim((string) $packageUnit['unit_name']);
                }
            }
            if ($unitId !== '') {
                $packageLookup = $pdo->prepare(
                    "SELECT measurement_unit_id, unit_name FROM product_measurement_units
                     WHERE measurement_unit_id = :unit_id AND measurement_group = 'Count' AND is_active = 1 LIMIT 1"
                );
                $packageLookup->execute([':unit_id' => $unitId]);
                $packageUnit = $packageLookup->fetch(PDO::FETCH_ASSOC);
                if (!$packageUnit) {
                    throw new InvalidArgumentException('Package / Container must be selected from the active Count measurement units.');
                }
                $text = trim((string) $packageUnit['unit_name']);
            }
        } elseif ($definition['field_style'] === 'Number with Unit') {
            if ($unitId === '') {
                throw new InvalidArgumentException($definition['specification_name'] . ' requires a measurement unit when a value is entered.');
            }
            $expectedGroup = trim((string) ($definition['measurement_group'] ?? ''));
            $unit = $pdo->prepare(
                "SELECT pmu.measurement_unit_id
                 FROM product_measurement_units pmu
                 WHERE pmu.measurement_unit_id = :unit_id
                   AND pmu.measurement_group <> 'Packaging'
                   AND (
                       (pmu.is_active = 1 AND pmu.measurement_group = :measurement_group)
                       OR (
                           :product_id <> ''
                           AND EXISTS (
                               SELECT 1
                               FROM product_specification_values saved
                               WHERE saved.product_id = :saved_product_id
                                 AND saved.specification_id = :specification_id
                                 AND saved.measurement_unit_id = pmu.measurement_unit_id
                           )
                       )
                   )
                 LIMIT 1"
            );
            $unit->execute([
                ':unit_id' => $unitId,
                ':measurement_group' => $expectedGroup,
                ':product_id' => cleanId($productId),
                ':saved_product_id' => cleanId($productId),
                ':specification_id' => $specificationId,
            ]);
            if (!$unit->fetchColumn()) {
                throw new InvalidArgumentException('The selected measurement unit is not available.');
            }
        } else {
            $unitId = '';
        }
        $normalized[] = [
            'specification_id' => $specificationId,
            'value_text' => $text === '' ? null : $text,
            'value_number' => $number === '' ? null : $number,
            'measurement_unit_id' => $unitId === '' ? null : $unitId
        ];
    }
    return $normalized;
}

function saveProductSpecificationValues(PDO $pdo, string $productId, array $values): void
{
    $pdo->prepare('DELETE FROM product_specification_values WHERE product_id = :product_id')->execute([':product_id' => $productId]);
    $insert = $pdo->prepare('INSERT INTO product_specification_values (product_id, specification_id, value_text, value_number, measurement_unit_id) VALUES (:product_id, :specification_id, :value_text, :value_number, :measurement_unit_id)');
    foreach ($values as $value) {
        $insert->execute([
            ':product_id' => $productId,
            ':specification_id' => $value['specification_id'],
            ':value_text' => $value['value_text'],
            ':value_number' => $value['value_number'],
            ':measurement_unit_id' => $value['measurement_unit_id']
        ]);
    }
}

function specificationValueSignature(array $values): string
{
    $parts = [];
    foreach ($values as $value) {
        $parts[] = implode('|', [
            strtolower(trim((string) ($value['specification_id'] ?? ''))),
            strtolower(trim((string) ($value['value_text'] ?? ''))),
            trim((string) ($value['value_number'] ?? '')),
            strtolower(trim((string) ($value['measurement_unit_id'] ?? '')))
        ]);
    }
    sort($parts, SORT_STRING);
    return implode('~', $parts);
}

function dynamicProductIdentityExists(PDO $pdo, string $categoryId, string $typeId, string $brandName, string $productName, array $values, string $excludeProductId = ''): bool
{
    $candidateStatement = $pdo->prepare(
        "SELECT product_id FROM product
         WHERE category_id = :category_id AND type_id = :type_id
           AND LOWER(TRIM(brand_name)) = LOWER(TRIM(:brand_name))
           AND LOWER(TRIM(product_name)) = LOWER(TRIM(:product_name))
           AND product_id <> :exclude_product_id"
    );
    $candidateStatement->execute([
        ':category_id' => $categoryId,
        ':type_id' => $typeId,
        ':brand_name' => $brandName,
        ':product_name' => $productName,
        ':exclude_product_id' => $excludeProductId
    ]);
    $valueStatement = $pdo->prepare('SELECT specification_id, value_text, value_number, measurement_unit_id FROM product_specification_values WHERE product_id = :product_id');
    $signature = specificationValueSignature($values);
    foreach ($candidateStatement->fetchAll(PDO::FETCH_COLUMN) as $candidateId) {
        $valueStatement->execute([':product_id' => $candidateId]);
        if (specificationValueSignature($valueStatement->fetchAll()) === $signature) {
            return true;
        }
    }
    return false;
}
?>
