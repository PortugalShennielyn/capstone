<?php
require_once __DIR__ . '/../suppliers/purchasing_conversion.php';

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

function productSellingOptions(PDO $pdo, string $productId, bool $posOnly = false): array
{
    $where = $posOnly ? ' AND pso.is_active = 1 AND pso.pos_enabled = 1' : '';
    $statement = $pdo->prepare(
        "SELECT pso.selling_option_id, pso.product_id,
                pso.unit_name AS unit, pso.base_quantity,
                pso.selling_price, pso.pos_enabled,
                pso.is_active, pso.is_default
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
            'pos_enabled' => (int) $row['pos_enabled'],
            'is_active' => (int) $row['is_active'],
            'is_default' => (int) $row['is_default'],
            'available_quantity' => intdiv(max(0, $shelfQuantity), $baseQuantity),
        ];
    }, $statement->fetchAll(PDO::FETCH_ASSOC));
}

function productSellableUnitCandidates(PDO $pdo, string $productId): array
{
    $base = productSellingBaseUnit($pdo, $productId);
    $candidates = [];
    $configuredUnits = supplierProductConfiguredUnits($pdo, $productId);
    $largestFactor = 0;
    foreach ($configuredUnits as $unit) $largestFactor = max($largestFactor, (int) ($unit['base_quantity'] ?? 1));
    foreach ($configuredUnits as $unit) {
        $name = trim((string) ($unit['unit'] ?? ''));
        $factor = max(1, (int) ($unit['base_quantity'] ?? 1));
        if ($name === '') continue;
        $candidates[mb_strtolower($name)] = ['unit' => $name, 'base_quantity' => $factor];
    }
    $baseName = (string) ($base['unit_symbol'] ?: $base['unit_name']);
    $candidates[mb_strtolower($baseName)] = ['unit' => $baseName, 'base_quantity' => 1];
    uasort($candidates, static fn(array $left, array $right): int =>
        $right['base_quantity'] <=> $left['base_quantity'] ?: strcasecmp($left['unit'], $right['unit'])
    );
    return array_values($candidates);
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
         VALUES (UUID(),:product_id,:unit_name,1,:selling_price,1,1,1)'
    );
    $statement->execute([
        ':product_id'=>$productId,
        ':unit_name'=>$base['unit_symbol'] ?: $base['unit_name'],
        ':selling_price'=>(float)$base['price'],
    ]);
}

function syncProductDefaultSellingPrice(PDO $pdo, string $productId, float $price): void
{
    ensureProductDefaultSellingOption($pdo, $productId);
    $statement = $pdo->prepare(
        'UPDATE product_selling_options SET selling_price=:selling_price
         WHERE product_id=:product_id AND is_default=1 AND is_active=1'
    );
    $statement->execute([':selling_price'=>round($price,2),':product_id'=>$productId]);
}
