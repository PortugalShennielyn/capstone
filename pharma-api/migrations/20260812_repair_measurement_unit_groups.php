<?php
require_once __DIR__ . '/../config/db_connection.php';

/**
 * Repairs legacy unit rows that carried a correct physical-unit symbol under
 * the wrong measurement group. Product specification rows keep their original
 * measurement_unit_id; only central unit configuration is normalized.
 */
function normalizeCanonicalUnit(PDO $pdo, string $name, string $symbol, string $group, array $aliases): void
{
    $conditions = [];
    $params = [];
    foreach ($aliases as $index => $alias) {
        $conditions[] = "LOWER(TRIM(unit_name)) = :alias_name{$index} OR LOWER(TRIM(COALESCE(unit_symbol, ''))) = :alias_symbol{$index}";
        $params[":alias_name{$index}"] = strtolower(trim($alias));
        $params[":alias_symbol{$index}"] = strtolower(trim($alias));
    }
    $query = $pdo->prepare(
        'SELECT pmu.measurement_unit_id, pmu.unit_name, pmu.unit_symbol, pmu.measurement_group, pmu.is_system,
                (SELECT COUNT(*) FROM product_specification_values psv WHERE psv.measurement_unit_id = pmu.measurement_unit_id) AS reference_count
         FROM product_measurement_units pmu WHERE ' . implode(' OR ', $conditions) . '
         ORDER BY reference_count DESC,
                  (LOWER(TRIM(unit_name)) = :canonical_name) DESC,
                  (measurement_group = :canonical_group) DESC,
                  is_system DESC'
    );
    $params[':canonical_name'] = strtolower($name);
    $params[':canonical_group'] = $group;
    $query->execute($params);
    $candidates = $query->fetchAll(PDO::FETCH_ASSOC);
    if (!$candidates) return;

    $canonical = $candidates[0];
    $archive = $pdo->prepare(
        "UPDATE product_measurement_units
         SET measurement_group = 'Legacy Archived', is_active = 0
         WHERE measurement_unit_id = :unit_id"
    );
    foreach (array_slice($candidates, 1) as $candidate) {
        $archive->execute([':unit_id' => $candidate['measurement_unit_id']]);
    }
    $update = $pdo->prepare(
        'UPDATE product_measurement_units
         SET unit_name = :unit_name, unit_symbol = :unit_symbol,
             measurement_group = :measurement_group, is_active = 1
         WHERE measurement_unit_id = :unit_id'
    );
    $update->execute([
        ':unit_name' => $name,
        ':unit_symbol' => $symbol,
        ':measurement_group' => $group,
        ':unit_id' => $canonical['measurement_unit_id'],
    ]);
}

$pdo->beginTransaction();
try {
    normalizeCanonicalUnit($pdo, 'mL', 'mL', 'Volume', ['ml', 'mililiter', 'milliliter']);
    normalizeCanonicalUnit($pdo, 'L', 'L', 'Volume', ['l', 'liter', 'liters']);
    normalizeCanonicalUnit($pdo, 'kg', 'kg', 'Weight', ['kg']);
    $pdo->commit();
    echo "Measurement-unit groups repaired without changing product specification references.\n";
} catch (Throwable $error) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    throw $error;
}
?>
