<?php
require_once '../../config/db_connection.php';
require_once '../../config/require_auth.php';
require_once 'product_customization_schema.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['status' => 'error', 'message' => 'Only POST requests are allowed.']);
    exit();
}

$payload = json_decode(file_get_contents('php://input'), true);
$requestedIds = is_array($payload['measurement_unit_ids'] ?? null)
    ? $payload['measurement_unit_ids']
    : [$payload['measurement_unit_id'] ?? null];
$unitIds = array_values(array_unique(array_filter(array_map('cleanId', $requestedIds))));
if (!$unitIds || count($unitIds) > 100) {
    http_response_code(422);
    echo json_encode(['status' => 'error', 'message' => 'Select between 1 and 100 valid measurement units.']);
    exit();
}

try {
    $idPlaceholders = implode(',', array_fill(0, count($unitIds), '?'));
    $statement = $pdo->prepare(
        "SELECT measurement_unit_id, unit_name,
                COALESCE(NULLIF(unit_symbol, ''), unit_name) AS unit_symbol,
                measurement_group, is_active, is_system
         FROM product_measurement_units
         WHERE measurement_unit_id IN ({$idPlaceholders}) AND measurement_group <> 'Packaging'"
    );
    $statement->execute($unitIds);
    $units = $statement->fetchAll(PDO::FETCH_ASSOC);
    if (count($units) !== count($unitIds)) throw new InvalidArgumentException('One or more measurement units were not found.');
    foreach ($units as $unit) {
        if ((int) $unit['is_system'] === 1) throw new InvalidArgumentException('System measurement units cannot be removed.');
    }

    $byId = [];
    $tokenToIds = [];
    foreach ($units as &$unit) {
        $unit['usage_count'] = 0;
        $unit['reference_count'] = 0;
        $byId[$unit['measurement_unit_id']] =& $unit;
        foreach ([$unit['unit_name'], $unit['unit_symbol']] as $label) {
            $token = strtolower(trim((string) $label));
            if ($token !== '') $tokenToIds[$token][$unit['measurement_unit_id']] = true;
        }
    }
    unset($unit);

    $direct = $pdo->prepare(
        "SELECT measurement_unit_id, COUNT(*) AS reference_count, COUNT(DISTINCT product_id) AS usage_count
         FROM product_specification_values
         WHERE measurement_unit_id IN ({$idPlaceholders}) GROUP BY measurement_unit_id"
    );
    $direct->execute($unitIds);
    foreach ($direct->fetchAll(PDO::FETCH_ASSOC) as $row) {
        if (!isset($byId[$row['measurement_unit_id']])) continue;
        $byId[$row['measurement_unit_id']]['usage_count'] = (int) $row['usage_count'];
        $byId[$row['measurement_unit_id']]['reference_count'] += (int) $row['reference_count'];
    }

    // Legacy and supplier records store unit labels rather than unit IDs. Check
    // all known unit-bearing columns in one schema lookup, then one grouped
    // query per existing column. Historical transaction snapshots are included
    // so removal never implies that their labels will be rewritten.
    $referenceColumns = [
        ['entity_dimensions', 'unit'], ['grocery_details', 'unit'],
        ['medicine_details', 'net_content_unit'], ['medicine_details', 'strength_unit'],
        ['product_variations_backup', 'unit'], ['product_variations_backup', 'size_unit'],
        ['product_variations_backup', 'strength_unit'], ['product_variations_backup', 'volume_unit'],
        ['product_variations_backup', 'weight_unit'], ['product_variations_backup', 'pack_content_unit'],
        ['supplier_products', 'purchase_unit'], ['supplier_products', 'inner_unit'],
        ['supplier_products', 'inventory_unit'], ['purchase_order_items', 'purchase_unit_snapshot'],
        ['purchase_order_items', 'unit_snapshot'], ['purchase_request_items', 'unit_label_at_request']
    ];
    $schemaRows = $pdo->query(
        "SELECT table_name, column_name FROM information_schema.columns
         WHERE table_schema = DATABASE() AND column_name LIKE '%unit%'"
    )->fetchAll(PDO::FETCH_ASSOC);
    $availableColumns = [];
    foreach ($schemaRows as $row) $availableColumns[strtolower($row['table_name'] . '.' . $row['column_name'])] = true;
    $tokens = array_keys($tokenToIds);
    if ($tokens) {
        $tokenPlaceholders = implode(',', array_fill(0, count($tokens), '?'));
        foreach ($referenceColumns as [$table, $column]) {
            if (empty($availableColumns[strtolower($table . '.' . $column)])) continue;
            $referenceQuery = $pdo->prepare(
                "SELECT LOWER(TRIM(`{$column}`)) AS unit_token, COUNT(*) AS reference_count
                 FROM `{$table}` WHERE LOWER(TRIM(`{$column}`)) IN ({$tokenPlaceholders})
                 GROUP BY LOWER(TRIM(`{$column}`))"
            );
            $referenceQuery->execute($tokens);
            foreach ($referenceQuery->fetchAll(PDO::FETCH_ASSOC) as $row) {
                foreach (array_keys($tokenToIds[$row['unit_token']] ?? []) as $id) {
                    $byId[$id]['reference_count'] += (int) $row['reference_count'];
                }
            }
        }
    }

    $pdo->beginTransaction();
    $archive = $pdo->prepare(
        "UPDATE product_measurement_units SET is_active = 0
         WHERE measurement_unit_id IN ({$idPlaceholders}) AND is_system = 0"
    );
    $archive->execute($unitIds);
    foreach ($units as &$unit) $unit['is_active'] = 0;
    unset($unit);
    $pdo->commit();

    $count = count($units);
    echo json_encode([
        'status' => 'success',
        'message' => $count === 1
            ? 'Measurement unit removed from future selections. Existing records keep their saved value.'
            : "{$count} measurement units removed from future selections. Existing records keep their saved values.",
        'unit' => $count === 1 ? $units[0] : null,
        'units' => $units,
    ]);
} catch (InvalidArgumentException $error) {
    http_response_code(400);
    echo json_encode(['status' => 'error', 'message' => $error->getMessage()]);
} catch (Throwable $error) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    http_response_code(500);
    echo json_encode(['status' => 'error', 'message' => 'Unable to remove measurement units.']);
}
?>
