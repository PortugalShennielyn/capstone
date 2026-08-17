<?php
require_once __DIR__ . '/../suppliers/purchasing_conversion.php';

function inventoryTransferUnits(PDO $pdo, string $productId): array
{
    $units = supplierProductConfiguredUnits($pdo, $productId);
    if ($units) return $units;

    $fallback = $pdo->prepare(
        "SELECT COALESCE(NULLIF(TRIM(inventory_unit), ''), 'PCS') AS unit
         FROM supplier_products WHERE product_id = :product_id ORDER BY created_at DESC LIMIT 1"
    );
    $fallback->execute([':product_id' => $productId]);
    return [['unit' => trim((string) ($fallback->fetchColumn() ?: 'PCS')), 'base_quantity' => 1]];
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
