<?php
function sellingUnitAvailability(int $shelfBaseQuantity, int $baseQuantity): int
{
    if ($baseQuantity < 1) throw new InvalidArgumentException('Selling unit conversion must be positive.');
    return intdiv(max(0, $shelfBaseQuantity), $baseQuantity);
}

function sellingUnitBaseQuantity(int $selectedQuantity, int $baseQuantity): int
{
    if ($selectedQuantity < 1 || $baseQuantity < 1 || $selectedQuantity > intdiv(PHP_INT_MAX, $baseQuantity)) {
        throw new InvalidArgumentException('Selling quantity and conversion must be positive whole numbers within range.');
    }
    return $selectedQuantity * $baseQuantity;
}

function productSellingBaseUnit(PDO $pdo, string $productId): array
{
    $statement = $pdo->prepare(
        "SELECT p.product_id, p.price,
                pmu.measurement_unit_id,
                pmu.unit_name,
                COALESCE(NULLIF(pmu.unit_symbol, ''), pmu.unit_name) AS unit_symbol
         FROM product p
         INNER JOIN product_measurement_units pmu
             ON pmu.measurement_unit_id = p.inventory_unit_id
         WHERE p.product_id = :product_id
         LIMIT 1"
    );
    $statement->execute([':product_id' => $productId]);
    $row = $statement->fetch(PDO::FETCH_ASSOC);
    if (!$row) {
        throw new InvalidArgumentException('Product Base Unit is not configured.');
    }
    return $row;
}

function productShelfBaseQuantity(PDO $pdo, string $productId, bool $usableOnly = false): int
{
    $expiryFilter = $usableOnly ? ' AND (expiration_date IS NULL OR expiration_date >= CURDATE())' : '';
    $statement = $pdo->prepare(
        "SELECT COALESCE(SUM(quantity_remaining), 0)
         FROM product_selling_stock
         WHERE product_id = :product_id
           AND quantity_remaining > 0{$expiryFilter}"
    );
    $statement->execute([':product_id' => $productId]);
    return (int) $statement->fetchColumn();
}

function productSellingOptionBarcodeColumn(PDO $pdo): ?string
{
    static $column = false;
    if ($column !== false) return $column;
    $statement = $pdo->query(
        "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE()
           AND TABLE_NAME = 'product_selling_options'
           AND COLUMN_NAME IN ('barcode', 'unit_barcode')
         ORDER BY FIELD(COLUMN_NAME, 'barcode', 'unit_barcode') LIMIT 1"
    );
    $column = $statement->fetchColumn() ?: null;
    return $column;
}

function productSellingOptions(PDO $pdo, string $productId, bool $posOnly = false): array
{
    $where = $posOnly ? ' AND pso.is_active = 1 AND pso.pos_enabled = 1' : '';
    $barcodeColumn = productSellingOptionBarcodeColumn($pdo);
    $barcodeSelect = $barcodeColumn ? ", pso.`{$barcodeColumn}` AS unit_barcode" : ", '' AS unit_barcode";
    $statement = $pdo->prepare(
        "SELECT pso.selling_option_id, pso.product_id,
                pso.unit_name AS unit, pso.base_quantity,
                pso.selling_price, pso.pos_enabled,
                pso.is_active, pso.is_default{$barcodeSelect}
         FROM product_selling_options pso
         WHERE pso.product_id = :product_id{$where}
         ORDER BY pso.is_default DESC, pso.is_active DESC,
                  pso.base_quantity ASC, pso.unit_name ASC"
    );
    $statement->execute([':product_id' => $productId]);
    $shelfQuantity = productShelfBaseQuantity($pdo, $productId, true);
    return array_map(static function (array $row) use ($shelfQuantity): array {
        $baseQuantity = max(1, (int) $row['base_quantity']);
        return [
            'selling_option_id' => (string) $row['selling_option_id'],
            'product_id' => (string) $row['product_id'],
            'unit' => (string) $row['unit'],
            'base_quantity' => $baseQuantity,
            'selling_price' => round((float) $row['selling_price'], 2),
            'barcode' => trim((string) ($row['unit_barcode'] ?? '')),
            'pos_enabled' => (int) $row['pos_enabled'],
            'is_active' => (int) $row['is_active'],
            'is_default' => (int) $row['is_default'],
            'available_quantity' => sellingUnitAvailability($shelfQuantity, $baseQuantity),
        ];
    }, $statement->fetchAll(PDO::FETCH_ASSOC));
}

function productSellableUnitCandidates(PDO $pdo, string $productId): array
{
    $base = productSellingBaseUnit($pdo, $productId);
    $baseName = (string) ($base['unit_symbol'] ?: $base['unit_name']);
    $candidates = [['unit' => $baseName, 'base_quantity' => 1]];
    $statement = $pdo->prepare(
        "SELECT pc.category_name, pt.type_name,
                COALESCE(NULLIF(TRIM(specs.dosage_form), ''), NULLIF(TRIM(md.dosage_form), '')) AS dosage_form,
                COALESCE(NULLIF(TRIM(specs.package_type), ''),
                         CASE pc.category_name
                             WHEN 'Medicine' THEN NULLIF(TRIM(md.package_type), '')
                             WHEN 'Grocery' THEN NULLIF(TRIM(gd.package_type), '')
                             WHEN 'Medical Supplies' THEN NULLIF(TRIM(msd.package_type), '')
                         END) AS package_type,
                specs.pack_count,
                specs.pack_unit_group,
                COALESCE(NULLIF(TRIM(specs.pack_text), ''),
                         CASE pc.category_name
                             WHEN 'Grocery' THEN NULLIF(TRIM(gd.pack_content), '')
                             WHEN 'Medical Supplies' THEN NULLIF(TRIM(msd.pack_content), '')
                         END) AS pack_text
         FROM product p
         LEFT JOIN product_categories pc ON pc.category_id = p.category_id
         LEFT JOIN product_types pt ON pt.type_id = p.type_id
         LEFT JOIN medicine_details md ON md.product_id = p.product_id
         LEFT JOIN grocery_details gd ON gd.product_id = p.product_id
         LEFT JOIN medical_supply_details msd ON msd.product_id = p.product_id
         LEFT JOIN (
             SELECT psv.product_id,
                    MAX(CASE WHEN LOWER(TRIM(ps.specification_name)) IN ('package type', 'package / container', 'package/container')
                             THEN psv.value_text END) AS package_type,
                    MAX(CASE WHEN LOWER(TRIM(ps.specification_name)) = 'pack content'
                             THEN psv.value_number END) AS pack_count,
                    MAX(CASE WHEN LOWER(TRIM(ps.specification_name)) = 'pack content'
                             THEN pmu.measurement_group END) AS pack_unit_group,
                    MAX(CASE WHEN LOWER(TRIM(ps.specification_name)) IN ('dosage form', 'form')
                             THEN psv.value_text END) AS dosage_form,
                    MAX(CASE WHEN LOWER(TRIM(ps.specification_name)) = 'pack content'
                             THEN psv.value_text END) AS pack_text
             FROM product_specification_values psv
             INNER JOIN product_specifications ps ON ps.specification_id = psv.specification_id
             LEFT JOIN product_measurement_units pmu ON pmu.measurement_unit_id = psv.measurement_unit_id
             WHERE psv.product_id = :spec_product_id
             GROUP BY psv.product_id
         ) specs ON specs.product_id = p.product_id
         WHERE p.product_id = :product_id LIMIT 1"
    );
    $statement->execute([':spec_product_id' => $productId, ':product_id' => $productId]);
    $details = $statement->fetch(PDO::FETCH_ASSOC) ?: [];
    $package = trim((string) ($details['package_type'] ?? ''));
    $unitKey = static function (string $unit): string {
        $key = mb_strtolower(rtrim(trim($unit), '.'));
        if (in_array($key, ['pc', 'pcs', 'pieces', 'each'], true)) return 'piece';
        if ($key === 'boxes') return 'box';
        if (in_array($key, ['tablets', 'capsules', 'bottles', 'packs', 'packets'], true)) return rtrim($key, 's');
        return $key;
    };
    $normalizedBase = $unitKey($baseName);
    $normalizedPackage = $unitKey($package);
    $count = $details['pack_count'] ?? null;
    $countUnitValid = in_array((string) ($details['pack_unit_group'] ?? ''), ['', 'Count', 'Packaging'], true);
    if (!$countUnitValid) $count = null;
    if ($countUnitValid && (!is_numeric($count) || (float) $count <= 1)
        && preg_match('/^\s*(\d+)(?:\s+([\p{L}. -]+))?\s*$/u', (string) ($details['pack_text'] ?? ''), $matches)) {
        $suffix = $unitKey($matches[2] ?? '');
        if ($suffix === '' || $suffix === $normalizedBase || $suffix === $normalizedPackage) $count = $matches[1];
    }
    if ($package !== '' && $normalizedPackage !== $normalizedBase && is_numeric($count)
        && (float) $count === (float) (int) $count && (int) $count > 1) {
        $candidates[] = ['unit' => $package, 'base_quantity' => (int) $count];
    }
    // Keep an explicitly configured larger unit when its conversion is already
    // stored here, even if older Product Master data has no pack content.
    $stored = $pdo->prepare('SELECT unit_name, base_quantity FROM product_selling_options WHERE product_id=:product_id ORDER BY base_quantity, unit_name');
    $stored->execute([':product_id' => $productId]);
    $category = mb_strtolower(trim((string) ($details['category_name'] ?? '')));
    $form = mb_strtolower(trim((string) (($details['dosage_form'] ?? '') ?: ($details['type_name'] ?? ''))));
    foreach ($stored->fetchAll(PDO::FETCH_ASSOC) as $option) {
        $name = trim((string) $option['unit_name']);
        $key = $unitKey($name);
        $quantity = (int) $option['base_quantity'];
        if ($name === '' || $quantity <= 1 || $key === $normalizedBase) continue;
        if ($category !== 'medicine' && in_array($key, ['tablet', 'capsule', 'blister pack', 'strip'], true)) continue;
        if ($category === 'medicine') {
            if (str_contains($form, 'tablet') && $key === 'capsule') continue;
            if (str_contains($form, 'capsule') && $key === 'tablet') continue;
            if (preg_match('/syrup|suspension|solution|liquid/', $form)
                && in_array($key, ['tablet', 'capsule', 'blister pack', 'strip'], true)) continue;
        }
        if (array_filter($candidates, static fn(array $candidate): bool => $unitKey($candidate['unit']) === $key)) continue;
        $candidates[] = ['unit' => $name, 'base_quantity' => $quantity];
    }
    return $candidates;
}

function productDefaultSellingOption(PDO $pdo, string $productId): ?array
{
    $options = productSellingOptions($pdo, $productId, true);
    foreach ($options as $option) {
        if ((int) $option['is_default'] === 1) return $option;
    }
    return $options[0] ?? null;
}

function ensureProductDefaultSellingOption(PDO $pdo, string $productId): void
{
    $existing = $pdo->prepare('SELECT 1 FROM product_selling_options WHERE product_id=:product_id LIMIT 1');
    $existing->execute([':product_id'=>$productId]);
    if ($existing->fetchColumn()) return;
    $base = productSellingBaseUnit($pdo, $productId);
    $statement = $pdo->prepare(
        'INSERT INTO product_selling_options
         (selling_option_id,product_id,unit_name,base_quantity,selling_price,pos_enabled,is_active,is_default)
         VALUES (UUID(),:product_id,:unit_name,1,:selling_price,0,1,0)'
    );
    $statement->execute([
        ':product_id'=>$productId,
        ':unit_name'=>$base['unit_symbol'] ?: $base['unit_name'],
        ':selling_price'=>(float)$base['price'],
    ]);
}

function syncProductDefaultSellingPrice(PDO $pdo, string $productId, float $price): void
{
    // Product Master price remains a legacy base-unit fallback. Shelf Selling
    // Prices owns configured retail prices, including the default option.
    ensureProductDefaultSellingOption($pdo, $productId);
}
