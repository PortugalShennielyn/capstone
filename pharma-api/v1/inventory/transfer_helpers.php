<?php
require_once __DIR__ . '/../suppliers/purchasing_conversion.php';

function inventoryTransferUnits(PDO $pdo, string $productId): array
{
    $units = supplierProductConfiguredUnits($pdo, $productId);
    if ($units) return inventoryReconcileProductPackUnit($pdo, $productId, $units);

    $fallback = $pdo->prepare(
        "SELECT COALESCE(NULLIF(TRIM(inventory_unit), ''), 'PCS') AS unit
         FROM supplier_products WHERE product_id = :product_id ORDER BY created_at DESC LIMIT 1"
    );
    $fallback->execute([':product_id' => $productId]);
    return [['unit' => trim((string) ($fallback->fetchColumn() ?: 'PCS')), 'base_quantity' => 1]];
}

function inventoryReconcileProductPackUnit(PDO $pdo, string $productId, array $units): array
{
    $stmt = $pdo->prepare(
        "SELECT
            MAX(CASE WHEN LOWER(TRIM(ps.specification_name)) IN ('package type','packaging') THEN TRIM(psv.value_text) END) AS package_type,
            MAX(CASE WHEN LOWER(TRIM(ps.specification_name)) IN ('pack content','pack contents','content per pack') THEN COALESCE(psv.value_number, CAST(NULLIF(TRIM(psv.value_text),'') AS UNSIGNED)) END) AS pack_content,
            COALESCE(NULLIF(pmu.unit_symbol,''), pmu.unit_name) AS base_unit
         FROM product p
         LEFT JOIN product_measurement_units pmu ON pmu.measurement_unit_id=p.inventory_unit_id
         LEFT JOIN product_specification_values psv ON psv.product_id=p.product_id
         LEFT JOIN product_specifications ps ON ps.specification_id=psv.specification_id
         WHERE p.product_id=:product_id
         GROUP BY p.product_id, pmu.unit_symbol, pmu.unit_name"
    );
    $stmt->execute([':product_id' => $productId]);
    $spec = $stmt->fetch(PDO::FETCH_ASSOC) ?: [];
    $packageType = strtolower(trim((string) ($spec['package_type'] ?? '')));
    $packContent = (int) ($spec['pack_content'] ?? 0);
    $baseUnit = strtolower(trim((string) ($spec['base_unit'] ?? '')));
    if ($packageType === '' || $packContent < 1 || $baseUnit === '') return $units;
    $hasBase = count(array_filter($units, static fn(array $unit): bool => (int) ($unit['base_quantity'] ?? 1) === 1 && strtolower(trim((string) ($unit['unit'] ?? ''))) === $baseUnit)) > 0;
    if (!$hasBase) return $units;
    foreach ($units as &$unit) {
        if (strtolower(trim((string) ($unit['unit'] ?? ''))) === $packageType && (int) ($unit['base_quantity'] ?? 1) !== $packContent) {
            $unit['base_quantity'] = $packContent;
        }
    }
    unset($unit);
    usort($units, static fn(array $left, array $right): int => (int) $right['base_quantity'] <=> (int) $left['base_quantity'] ?: strcasecmp((string) $left['unit'], (string) $right['unit']));
    return $units;
}

function inventoryTransferUnit(PDO $pdo, string $productId, string $requestedUnit): array
{
    foreach (inventoryTransferUnits($pdo, $productId) as $unit) {
        if (strcasecmp(trim($unit['unit']), trim($requestedUnit)) === 0) return $unit;
    }
    throw new InvalidArgumentException('The selected transfer unit is not configured for this product.');
}

function inventoryTransferBaseUnit(array $units): string
{
    foreach ($units as $unit) if ((int) $unit['base_quantity'] === 1) return (string) $unit['unit'];
    return 'base unit';
}

function inventoryQuantityBreakdown(int $quantity, array $units): string
{
    usort($units, static fn(array $a, array $b): int => $b['base_quantity'] <=> $a['base_quantity']);
    $parts = [];
    foreach ($units as $unit) {
        $factor = max(1, (int) $unit['base_quantity']);
        $count = intdiv($quantity, $factor);
        if ($count > 0) {
            $parts[] = $count . ' ' . $unit['unit'];
            $quantity %= $factor;
        }
    }
    return implode(' + ', $parts) ?: '0 ' . inventoryTransferBaseUnit($units);
}
