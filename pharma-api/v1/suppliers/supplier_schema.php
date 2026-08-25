<?php
require_once __DIR__ . '/purchasing_conversion.php';
function ensureSupplierArchiveColumn(PDO $pdo): void
{
    $pdo->exec(
        'ALTER TABLE suppliers
         ADD COLUMN IF NOT EXISTS archived_at TIMESTAMP NULL DEFAULT NULL'
    );
}

function ensureSupplierProductInventoryUnitColumn(PDO $pdo): void
{
    $columnCheck = $pdo->query(
        "SELECT COUNT(*) FROM information_schema.columns
         WHERE table_schema = DATABASE()
           AND table_name = 'supplier_products'
           AND column_name = 'inventory_unit'"
    );
    if ((int) $columnCheck->fetchColumn() === 1) return;

    $pdo->exec(
        'ALTER TABLE supplier_products
         ADD COLUMN inventory_unit VARCHAR(50) NULL AFTER purchase_unit'
    );
    $pdo->exec(
        "UPDATE supplier_products sp
         INNER JOIN product p ON p.product_id = sp.product_id
         LEFT JOIN medicine_details md ON md.product_id = p.product_id
         LEFT JOIN grocery_details gd ON gd.product_id = p.product_id
         LEFT JOIN medical_supply_details msd ON msd.product_id = p.product_id
         SET sp.inventory_unit = CASE
             WHEN LOWER(TRIM(COALESCE(md.dosage_form, ''))) IN ('tablet', 'capsule', 'sachet') THEN LOWER(TRIM(md.dosage_form))
             WHEN LOWER(TRIM(COALESCE(md.dosage_form, ''))) = 'caplet' THEN 'tablet'
             WHEN LOWER(TRIM(COALESCE(md.package_type, gd.package_type, msd.package_type, ''))) IN ('bottle','can','pouch','tube','roll','vial','ampule')
                 THEN LOWER(TRIM(COALESCE(md.package_type, gd.package_type, msd.package_type)))
             ELSE 'pc'
         END
         WHERE sp.inventory_unit IS NULL OR TRIM(sp.inventory_unit) = ''"
    );
}

function normalizedSupplierPurchasingUnit(string $value): string
{
    return strtolower(trim($value));
}

function supplierPurchasingUnitRecord(PDO $pdo, string $value): ?array
{
    $value = trim($value);
    if ($value === '' || preg_match('/^\d+(?:\.\d+)?$/', $value)) return null;
    $columns = $pdo->query("SELECT column_name FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'product_measurement_units'")->fetchAll(PDO::FETCH_COLUMN);
    $hasGroups = in_array('measurement_group', $columns, true);
    $hasActive = in_array('is_active', $columns, true);
    $hasSymbol = in_array('unit_symbol', $columns, true);
    $groupClause = $hasGroups ? " AND measurement_group IN ('Count', 'Packaging')" : '';
    $activeClause = $hasActive ? ' AND is_active = 1' : '';
    $symbolClause = $hasSymbol ? " OR LOWER(TRIM(COALESCE(unit_symbol, ''))) = LOWER(TRIM(:unit_symbol))" : '';
    $selectColumns = 'unit_name' . ($hasSymbol ? ', unit_symbol' : '') . ($hasGroups ? ', measurement_group' : '') . (in_array('is_system', $columns, true) ? ', is_system' : '');
    $statement = $pdo->prepare("SELECT {$selectColumns} FROM product_measurement_units WHERE (LOWER(TRIM(unit_name)) = LOWER(TRIM(:unit_name)){$symbolClause}){$groupClause}{$activeClause} LIMIT 1");
    $parameters = [':unit_name' => $value];
    if ($hasSymbol) $parameters[':unit_symbol'] = $value;
    $statement->execute($parameters);
    $row = $statement->fetch(PDO::FETCH_ASSOC);
    return $row ?: null;
}

function supplierPurchasingUnitIsConfigured(PDO $pdo, string $value): bool
{
    return supplierPurchasingUnitRecord($pdo, $value) !== null;
}

function supplierPurchasingUnitAllowedForContext(PDO $pdo, string $value, string $context): bool
{
    $unit = supplierPurchasingUnitRecord($pdo, $value);
    if (!$unit) return false;
    $group = normalizedSupplierPurchasingUnit((string)($unit['measurement_group'] ?? ''));
    if ($context === 'purchase') {
        return in_array(normalizedSupplierPurchasingUnit((string)$unit['unit_name']), ['box', 'carton'], true);
    }
    return $context === 'inventory' ? $group === 'count' : in_array($group,['count','packaging'],true);
}

function validateSupplierPurchasingUnit(PDO $pdo, string $value, string $label, ?string $savedValue = null, string $context = ''): void
{
    $clean = trim($value);
    $saved = trim((string) ($savedValue ?? ''));
    if ($clean === '' || preg_match('/^\d+(?:\.\d+)?$/', $clean)) {
        throw new InvalidArgumentException("Please select a valid {$label}.");
    }
    if ($context !== '' ? supplierPurchasingUnitAllowedForContext($pdo, $clean, $context) : supplierPurchasingUnitIsConfigured($pdo, $clean)) return;
    if ($context === 'purchase') throw new InvalidArgumentException('Purchase Unit must be Box or Carton.');
    if ($saved !== '' && normalizedSupplierPurchasingUnit($clean) === normalizedSupplierPurchasingUnit($saved)) return;
    throw new InvalidArgumentException("{$label} must be selected from the available unit list.");
}

function validateSupplierPurchasingHierarchyUnits(PDO $pdo, array $submitted, array $saved = []): void
{
    $purchase = trim((string) ($submitted['purchase_unit'] ?? ''));
    $inner = trim((string) ($submitted['inner_unit'] ?? ''));
    $inventory = trim((string) ($submitted['inventory_unit'] ?? ''));
    $sameDirectUnit = $inner === '' && normalizedSupplierPurchasingUnit($purchase) === normalizedSupplierPurchasingUnit($inventory);
    validateSupplierPurchasingUnit($pdo, $purchase, 'Purchase Unit', $saved['purchase_unit'] ?? null, $sameDirectUnit ? 'inventory' : 'purchase');
    validateSupplierPurchasingUnit($pdo, $inventory, 'Inventory/Base Unit', $saved['inventory_unit'] ?? null, 'inventory');
    if ($inner !== '') validateSupplierPurchasingUnit($pdo, $inner, 'Inner Unit', $saved['inner_unit'] ?? null, 'inner');

    $units = array_values(array_filter([$purchase, $inner, $inventory], static fn($value) => $value !== ''));
    $normalized = array_map('normalizedSupplierPurchasingUnit', $units);
    if (count(array_unique($normalized)) === count($normalized)) return;
    $contains = (int) ($submitted['purchase_unit_contains'] ?? $submitted['units_per_purchase_unit'] ?? 0);
    if ($inner === '' && $contains === 1 && normalizedSupplierPurchasingUnit($purchase) === normalizedSupplierPurchasingUnit($inventory)) return;
    $unchanged = normalizedSupplierPurchasingUnit($purchase) === normalizedSupplierPurchasingUnit((string) ($saved['purchase_unit'] ?? ''))
        && normalizedSupplierPurchasingUnit($inner) === normalizedSupplierPurchasingUnit((string) ($saved['inner_unit'] ?? ''))
        && normalizedSupplierPurchasingUnit($inventory) === normalizedSupplierPurchasingUnit((string) ($saved['inventory_unit'] ?? ''));
    if (!$unchanged) throw new InvalidArgumentException('Purchase, Inner, and Inventory/Base Units must be different.');
}
?>
