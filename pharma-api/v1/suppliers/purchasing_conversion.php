<?php

function ensureSupplierPurchasingConversionSchema(PDO $pdo): void
{
    $columns = [
        'purchase_unit_contains' => 'INT NULL AFTER purchase_unit',
        'inner_unit' => 'VARCHAR(50) NULL AFTER purchase_unit_contains',
        'units_per_inner_unit' => 'INT NULL AFTER inner_unit',
        'supplier_cost_input' => 'DECIMAL(10,2) NULL AFTER supplier_cost_price',
        'supplier_cost_basis' => "VARCHAR(20) NOT NULL DEFAULT 'inventory' AFTER supplier_cost_input",
    ];
    foreach ($columns as $name => $definition) {
        $check = $pdo->prepare("SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'supplier_products' AND column_name = :column_name");
        $check->execute([':column_name' => $name]);
        if (!(int) $check->fetchColumn()) $pdo->exec("ALTER TABLE supplier_products ADD COLUMN {$name} {$definition}");
    }
    $precision = $pdo->query("SELECT numeric_scale FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'supplier_products' AND column_name = 'supplier_cost_price'")->fetchColumn();
    if ($precision !== false && (int) $precision < 4) $pdo->exec('ALTER TABLE supplier_products MODIFY supplier_cost_price DECIMAL(12,4) NULL');
    $pdo->exec(
        "CREATE TABLE IF NOT EXISTS supplier_product_unit_conversions (
            conversion_id CHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
            supplier_product_id CHAR(36) NOT NULL,
            unit_name VARCHAR(50) NOT NULL,
            base_quantity INT NOT NULL,
            level_order INT NOT NULL DEFAULT 0,
            is_transfer_unit TINYINT(1) NOT NULL DEFAULT 1,
            is_selling_unit TINYINT(1) NOT NULL DEFAULT 0,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            UNIQUE KEY uq_supplier_product_unit (supplier_product_id,unit_name),
            KEY idx_supplier_product_unit_factor (supplier_product_id,base_quantity),
            CONSTRAINT fk_supplier_product_unit_supplier_product FOREIGN KEY (supplier_product_id) REFERENCES supplier_products(supplier_product_id) ON DELETE CASCADE,
            CONSTRAINT chk_supplier_product_unit_base CHECK (base_quantity>0)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4"
    );
}

function productInventoryUnitForSupplier(PDO $pdo, string $productId): array
{
    $stmt = $pdo->prepare(
        "SELECT pmu.measurement_unit_id,pmu.unit_name,COALESCE(NULLIF(pmu.unit_symbol,''),pmu.unit_name) unit_symbol
         FROM product p INNER JOIN product_measurement_units pmu ON pmu.measurement_unit_id=p.inventory_unit_id
         WHERE p.product_id=:product_id AND pmu.measurement_group='Count' AND pmu.is_active=1 LIMIT 1"
    );
    $stmt->execute([':product_id'=>$productId]);
    $unit = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$unit) throw new InvalidArgumentException('Set the Product Master Selling / Inventory Unit before configuring supplier purchasing.');
    return $unit;
}

function syncSupplierProductUnitConversions(PDO $pdo, string $supplierProductId, array $setup): void
{
    // Schema preparation can execute DDL, which implicitly commits an active
    // MySQL transaction. Transactional callers must prepare the schema before
    // beginTransaction() so product and supplier-unit changes stay atomic.
    if (!$pdo->inTransaction()) {
        ensureSupplierPurchasingConversionSchema($pdo);
    }
    $conversion = supplierPurchasingConversion($setup);
    $existingStatement = $pdo->prepare(
        'SELECT conversion_id,unit_name
         FROM supplier_product_unit_conversions
         WHERE supplier_product_id=:id
         FOR UPDATE'
    );
    $existingStatement->execute([':id'=>$supplierProductId]);
    $existingByUnit = [];
    foreach ($existingStatement->fetchAll(PDO::FETCH_ASSOC) as $existing) {
        $existingByUnit[mb_strtolower(trim((string)$existing['unit_name']))] = $existing;
    }
    $update = $pdo->prepare(
        'UPDATE supplier_product_unit_conversions
         SET unit_name=:unit_name,base_quantity=:base_quantity,level_order=:level_order,
             is_transfer_unit=1,is_selling_unit=:is_selling_unit
         WHERE conversion_id=:conversion_id'
    );
    $insert = $pdo->prepare(
        'INSERT INTO supplier_product_unit_conversions
            (conversion_id,supplier_product_id,unit_name,base_quantity,level_order,is_transfer_unit,is_selling_unit)
         VALUES (UUID(),:supplier_product_id,:unit_name,:base_quantity,:level_order,1,:is_selling_unit)'
    );
    foreach ($conversion['absolute_levels'] as $level) {
        $unitKey = mb_strtolower(trim((string)$level['unit']));
        $parameters = [
            ':supplier_product_id'=>$supplierProductId,
            ':unit_name'=>$level['unit'],
            ':base_quantity'=>$level['base_quantity'],
            ':level_order'=>$level['level_order'],
            ':is_selling_unit'=>$level['base_quantity'] === 1 ? 1 : 0,
        ];
        if (isset($existingByUnit[$unitKey])) {
            unset($parameters[':supplier_product_id']);
            $parameters[':conversion_id'] = $existingByUnit[$unitKey]['conversion_id'];
            $update->execute($parameters);
            unset($existingByUnit[$unitKey]);
        } else {
            $insert->execute($parameters);
        }
    }
    if ($existingByUnit) {
        $obsoleteIds = array_column($existingByUnit, 'conversion_id');
        $placeholders = implode(',', array_fill(0, count($obsoleteIds), '?'));
        try {
            $pdo->prepare("DELETE FROM supplier_product_unit_conversions WHERE conversion_id IN ({$placeholders})")->execute($obsoleteIds);
        } catch (PDOException $error) {
            if ((string)$error->getCode() === '23000') {
                throw new InvalidArgumentException('This supplier packaging hierarchy is used by historical receiving or damage records and cannot be replaced.');
            }
            throw $error;
        }
    }
}

function positivePurchasingFactor($value, string $label): int
{
    if (!is_numeric($value) || !is_finite((float)$value) || (float)$value > 2147483647 || (int) $value < 1 || (float) $value !== (float) (int) $value) {
        throw new InvalidArgumentException("{$label} must be a positive whole number.");
    }
    return (int) $value;
}

function purchasingQuantityUnitLabel(string $unit, int $quantity): string
{
    $unit = trim($unit);
    if ($quantity === 1 || $unit === '' || preg_match('/s$/i', $unit)) return $unit;
    if (preg_match('/(?:s|x|z|ch|sh)$/i', $unit)) return $unit . 'es';
    return $unit . 's';
}

function supplierPurchasingConversion(array $setup): array
{
    $purchaseUnit = trim((string) ($setup['purchase_unit'] ?? '')) ?: 'Unit';
    $inventoryUnit = trim((string) ($setup['inventory_unit'] ?? '')) ?: 'unit';
    $submittedLevels = isset($setup['hierarchy_levels']) && is_array($setup['hierarchy_levels'])
        ? array_values($setup['hierarchy_levels'])
        : [];
    if ($submittedLevels) {
        if (strcasecmp($purchaseUnit, $inventoryUnit) === 0) {
            $only = count($submittedLevels) === 1 ? $submittedLevels[0] : null;
            if (!is_array($only) || strcasecmp(trim((string)($only['unit'] ?? '')), $inventoryUnit) !== 0
                || positivePurchasingFactor($only['quantity'] ?? null, 'Packaging quantity') !== 1) {
                throw new InvalidArgumentException('When Purchase Unit equals Product Base Unit, the conversion must be exactly 1 to 1 with no packaging levels.');
            }
            return [
                'purchase_unit'=>$purchaseUnit,'contains'=>1,'inner_unit'=>null,'units_per_inner_unit'=>null,
                'inventory_unit'=>$inventoryUnit,'base_qty_per_purchase_unit'=>1,
                'hierarchy_levels'=>[['unit'=>$inventoryUnit,'quantity'=>1]],
                'absolute_levels'=>[['unit'=>$inventoryUnit,'base_quantity'=>1,'level_order'=>0]],
                'summary'=>"1 {$purchaseUnit} = 1 {$inventoryUnit}",
            ];
        }
        $levels = [];
        $seen = [mb_strtolower($purchaseUnit) => true];
        $running = 1;
        $summaryParts = ["1 {$purchaseUnit}"];
        foreach ($submittedLevels as $index => $level) {
            if (!is_array($level)) throw new InvalidArgumentException('Invalid supplier packaging level.');
            $unit = trim((string) ($level['unit'] ?? ''));
            $quantity = positivePurchasingFactor($level['quantity'] ?? null, 'Packaging quantity');
            if ($unit === '') throw new InvalidArgumentException('Every supplier packaging level requires a unit.');
            $key = mb_strtolower($unit);
            if (isset($seen[$key])) throw new InvalidArgumentException('Supplier packaging units must be unique at every level.');
            $seen[$key] = true;
            if ($running > intdiv(2147483647, $quantity)) throw new InvalidArgumentException('Converted packaging quantity exceeds the supported inventory limit.');
            $running *= $quantity;
            $levels[] = ['unit'=>$unit,'quantity'=>$quantity];
            $summaryParts[] = number_format($running) . ' ' . purchasingQuantityUnitLabel($unit, $running);
        }
        $last = $levels[count($levels)-1]['unit'] ?? '';
        if (strcasecmp($last, $inventoryUnit) !== 0) throw new InvalidArgumentException("Incomplete unit conversion. Configure how {$last} converts to {$inventoryUnit} before receiving or transferring stock.");
        $absolute = [];
        $factor = 1;
        for ($index = count($levels)-1; $index >= 0; $index--) {
            $absolute[] = ['unit'=>$levels[$index]['unit'],'base_quantity'=>$factor,'level_order'=>count($levels)-1-$index];
            $factor *= $levels[$index]['quantity'];
        }
        if (strcasecmp($purchaseUnit, $inventoryUnit) !== 0) {
            $absolute[] = ['unit'=>$purchaseUnit,'base_quantity'=>$running,'level_order'=>count($levels)];
        }
        $firstChild = $levels[0] ?? ['unit'=>$inventoryUnit,'quantity'=>$running];
        return [
            'purchase_unit'=>$purchaseUnit,
            'contains'=>$firstChild['quantity'],
            'inner_unit'=>count($levels) > 1 ? $firstChild['unit'] : null,
            'units_per_inner_unit'=>count($levels) > 1 ? intdiv($running, $firstChild['quantity']) : null,
            'inventory_unit'=>$inventoryUnit,
            'base_qty_per_purchase_unit'=>$running,
            'hierarchy_levels'=>$levels,
            'absolute_levels'=>$absolute,
            'summary'=>implode(' = ', $summaryParts),
        ];
    }
    $innerUnit = trim((string) ($setup['inner_unit'] ?? ''));
    $storedTotal = max(1, (int) ($setup['units_per_purchase_unit'] ?? 1));
    $hasExplicitFirstLevel = isset($setup['purchase_unit_contains']) && (int) $setup['purchase_unit_contains'] > 0;
    $contains = $hasExplicitFirstLevel ? max(1, (int) $setup['purchase_unit_contains']) : $storedTotal;
    $perInner = $innerUnit !== '' ? max(1, (int) ($setup['units_per_inner_unit'] ?? 1)) : 1;
    $total = $hasExplicitFirstLevel ? $contains * $perInner : $storedTotal;

    $levels = $innerUnit !== ''
        ? [['unit'=>$innerUnit,'quantity'=>$contains],['unit'=>$inventoryUnit,'quantity'=>$perInner]]
        : [['unit'=>$inventoryUnit,'quantity'=>$total]];
    $absolute = [['unit'=>$inventoryUnit,'base_quantity'=>1,'level_order'=>0]];
    if ($innerUnit !== '' && strcasecmp($innerUnit, $inventoryUnit) !== 0) $absolute[] = ['unit'=>$innerUnit,'base_quantity'=>$perInner,'level_order'=>1];
    if (strcasecmp($purchaseUnit, $inventoryUnit) !== 0 && strcasecmp($purchaseUnit, $innerUnit) !== 0) $absolute[] = ['unit'=>$purchaseUnit,'base_quantity'=>$total,'level_order'=>count($absolute)];
    return [
        'purchase_unit' => $purchaseUnit,
        'contains' => $contains,
        'inner_unit' => $innerUnit !== '' ? $innerUnit : null,
        'units_per_inner_unit' => $innerUnit !== '' ? $perInner : null,
        'inventory_unit' => $inventoryUnit,
        'base_qty_per_purchase_unit' => $total,
        'hierarchy_levels' => $levels,
        'absolute_levels' => $absolute,
        'summary' => $innerUnit !== ''
            ? "1 {$purchaseUnit} = {$contains} " . purchasingQuantityUnitLabel($innerUnit, $contains) . " = {$total} " . purchasingQuantityUnitLabel($inventoryUnit, $total)
            : "1 {$purchaseUnit} = {$total} " . purchasingQuantityUnitLabel($inventoryUnit, $total),
    ];
}

function supplierProductPurchasingHierarchy(PDO $pdo, string $supplierProductId): array
{
    return supplierProductPurchasingHierarchies($pdo, [$supplierProductId])[$supplierProductId] ?? [];
}

function supplierProductPurchasingHierarchies(PDO $pdo, array $supplierProductIds): array
{
    $ids = array_values(array_unique(array_filter(array_map('cleanId', $supplierProductIds))));
    if (!$ids) return [];
    $placeholders = implode(',', array_fill(0, count($ids), '?'));
    $statement = $pdo->prepare(
        "SELECT supplier_product_id,unit_name,base_quantity,level_order
         FROM supplier_product_unit_conversions
         WHERE supplier_product_id IN ({$placeholders})
         ORDER BY supplier_product_id,base_quantity DESC,level_order DESC"
    );
    $statement->execute($ids);
    $rowsBySupplierProduct = [];
    foreach ($statement->fetchAll(PDO::FETCH_ASSOC) as $row) {
        $rowsBySupplierProduct[(string)$row['supplier_product_id']][] = $row;
    }
    $result = [];
    foreach ($rowsBySupplierProduct as $supplierProductId => $rows) {
        if (count($rows) < 2) continue;
        $levels = [];
        $valid = true;
        for ($index = 0; $index < count($rows)-1; $index++) {
            $parent = max(1,(int)$rows[$index]['base_quantity']);
            $child = max(1,(int)$rows[$index+1]['base_quantity']);
            if ($parent % $child !== 0) { $valid = false; break; }
            $levels[] = ['unit'=>(string)$rows[$index+1]['unit_name'],'quantity'=>intdiv($parent,$child)];
        }
        if ($valid) {
            $result[$supplierProductId] = [
                'purchase_unit' => (string)$rows[0]['unit_name'],
                'base_unit_name' => (string)$rows[array_key_last($rows)]['unit_name'],
                'units_per_purchase_unit' => max(1, (int)$rows[0]['base_quantity']),
                'hierarchy_levels' => $levels,
            ];
        }
    }
    return $result;
}

function supplierPurchasingCost(array $setup, ?array $conversion = null): array
{
    $conversion ??= supplierPurchasingConversion($setup);
    $basis = strtolower(trim((string) ($setup['supplier_cost_basis'] ?? 'inventory')));
    if (!in_array($basis, ['purchase', 'inner', 'inventory'], true)) $basis = 'inventory';
    if ($basis === 'inner' && empty($conversion['inner_unit'])) $basis = 'inventory';
    $input = isset($setup['supplier_cost_input']) && $setup['supplier_cost_input'] !== null
        ? (float) $setup['supplier_cost_input']
        : (float) ($setup['supplier_cost_price'] ?? 0);
    $baseCost = match ($basis) {
        'purchase' => $input / $conversion['base_qty_per_purchase_unit'],
        'inner' => $input / max(1, (int) $conversion['units_per_inner_unit']),
        default => $input,
    };
    return [
        'supplier_cost_input' => round($input, 2),
        'supplier_cost_basis' => $basis,
        'supplier_cost_per_inventory_unit' => round($baseCost, 4),
        'estimated_purchase_unit_cost' => round($baseCost * $conversion['base_qty_per_purchase_unit'], 2),
    ];
}

function inventoryQuantityForPurchaseQuantity($purchaseQuantity, int $baseQtyPerPurchaseUnit): int
{
    if (!is_numeric($purchaseQuantity) || (int) $purchaseQuantity < 0 || (float) $purchaseQuantity !== (float) (int) $purchaseQuantity) {
        throw new InvalidArgumentException('Purchase quantity must be a non-negative whole number.');
    }
    $quantity = (int) $purchaseQuantity;
    $conversion = positivePurchasingFactor($baseQtyPerPurchaseUnit, 'Base quantity per Purchase Unit');
    if ($quantity > intdiv(PHP_INT_MAX, $conversion)) throw new InvalidArgumentException('Converted inventory quantity is too large.');
    return $quantity * $conversion;
}

function enrichSupplierPurchasingSetup(array $row): array
{
    $conversion = supplierPurchasingConversion($row);
    $cost = supplierPurchasingCost($row, $conversion);
    return $row + $conversion + $cost;
}

function supplierProductConfiguredUnits(PDO $pdo, string $productId): array
{
    $stmt = $pdo->prepare(
        "SELECT MIN(c.unit_name) unit_name,MIN(c.base_quantity) base_quantity,MAX(c.level_order) level_order
         FROM supplier_product_unit_conversions c
         INNER JOIN supplier_products sp ON sp.supplier_product_id=c.supplier_product_id
         WHERE sp.product_id=:product_id AND c.is_transfer_unit=1
         GROUP BY LOWER(TRIM(c.unit_name))
         HAVING COUNT(DISTINCT c.base_quantity)=1
         ORDER BY c.base_quantity DESC,c.unit_name"
    );
    $stmt->execute([':product_id' => $productId]);
    $normalizedRows = $stmt->fetchAll(PDO::FETCH_ASSOC);
    if ($normalizedRows) return array_map(static fn(array $row): array => [
        'unit'=>(string)$row['unit_name'],
        'base_quantity'=>(int)$row['base_quantity'],
    ], $normalizedRows);

    $configured = [];
    $legacy = $pdo->prepare("SELECT purchase_unit,purchase_unit_contains,inner_unit,units_per_inner_unit,inventory_unit,units_per_purchase_unit FROM supplier_products WHERE product_id=:product_id ORDER BY created_at DESC,supplier_product_id DESC");
    $legacy->execute([':product_id'=>$productId]);
    foreach ($legacy->fetchAll(PDO::FETCH_ASSOC) as $row) {
        $conversion = supplierPurchasingConversion($row);
        $candidates = [
            ['unit' => $conversion['inventory_unit'], 'base_quantity' => 1, 'level_order' => 0],
        ];
        if (!empty($conversion['inner_unit'])) {
            $candidates[] = [
                'unit' => $conversion['inner_unit'],
                'base_quantity' => (int) $conversion['units_per_inner_unit'],
                'level_order' => 1,
            ];
        }
        $candidates[] = [
            'unit' => $conversion['purchase_unit'],
            'base_quantity' => (int) $conversion['base_qty_per_purchase_unit'],
            'level_order' => 2,
        ];

        foreach ($candidates as $candidate) {
            $name = trim((string) $candidate['unit']);
            if ($name === '') continue;
            $key = strtolower($name);
            $configured[$key]['names'][$name] = true;
            $configured[$key]['factors'][(int) $candidate['base_quantity']] = true;
            $configured[$key]['level_order'] = max(
                (int) ($configured[$key]['level_order'] ?? 0),
                (int) $candidate['level_order']
            );
        }
    }

    $units = [];
    foreach ($configured as $entry) {
        if (count($entry['factors']) !== 1) continue;
        $units[] = [
            'unit' => array_key_first($entry['names']),
            'base_quantity' => (int) array_key_first($entry['factors']),
            'level_order' => (int) $entry['level_order'],
        ];
    }
    usort($units, static fn (array $left, array $right): int =>
        $right['base_quantity'] <=> $left['base_quantity']
        ?: strcasecmp($left['unit'], $right['unit'])
    );
    $result = array_map(static fn (array $unit): array => [
        'unit' => $unit['unit'],
        'base_quantity' => $unit['base_quantity'],
    ], $units);
    if ($result) return $result;
    try {
        $base = productInventoryUnitForSupplier($pdo, $productId);
        return [['unit'=>$base['unit_name'],'base_quantity'=>1]];
    } catch (Throwable $error) {
        return [];
    }
}
