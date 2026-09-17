<?php
require_once '../../config/db_connection.php';
require_once '../../config/require_auth.php';
require_once 'product_customization_schema.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['status' => 'error', 'success' => false, 'code' => 'METHOD_NOT_ALLOWED', 'message' => 'Only POST requests are allowed.']);
    exit();
}

$payload = json_decode(file_get_contents('php://input'), true);
$requestedIds = is_array($payload['measurement_unit_ids'] ?? null)
    ? $payload['measurement_unit_ids']
    : [$payload['measurement_unit_id'] ?? null];
$unitIds = array_values(array_unique(array_filter(array_map('cleanId', $requestedIds))));
$validUuid = static fn(string $id): bool => preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i', $id) === 1;
if (!$unitIds || count($unitIds) > 100 || count(array_filter($unitIds, $validUuid)) !== count($unitIds)) {
    http_response_code(422);
    echo json_encode(['status' => 'error', 'success' => false, 'code' => 'INVALID_MEASUREMENT_UNIT_ID', 'message' => 'A valid measurement unit ID is required.']);
    exit();
}

try {
    ensureProductCustomizationSchema($pdo);
    $idPlaceholders = implode(',', array_fill(0, count($unitIds), '?'));
    $statement = $pdo->prepare(
        "SELECT measurement_unit_id, unit_name,
                COALESCE(NULLIF(unit_symbol, ''), unit_name) AS unit_symbol,
                measurement_group, is_active, is_system
         FROM product_measurement_units
         WHERE measurement_unit_id IN ({$idPlaceholders})
           AND measurement_group <> 'Packaging'
           AND is_active = 1"
    );
    $statement->execute($unitIds);
    $units = $statement->fetchAll(PDO::FETCH_ASSOC);
    if (count($units) !== count($unitIds)) throw new DomainException('Measurement unit not found.', 1001);
    foreach ($units as $unit) {
        if ((int) $unit['is_system'] === 1) throw new DomainException('Built-in measurement unit cannot be deleted.', 1002);
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

    // Resolve every normalized ID reference dynamically so new Product,
    // Supplier, Inventory, PO, receiving, transfer, or POS tables are covered
    // without adding another hard-coded unit relationship.
    $idReferenceColumns = $pdo->query(
        "SELECT table_name, column_name
         FROM information_schema.columns
         WHERE table_schema = DATABASE()
           AND column_name IN ('measurement_unit_id', 'inventory_unit_id')
           AND table_name <> 'product_measurement_units'"
    )->fetchAll(PDO::FETCH_ASSOC);
    foreach ($idReferenceColumns as $referenceColumn) {
        $table = str_replace('`', '``', (string) $referenceColumn['table_name']);
        $column = str_replace('`', '``', (string) $referenceColumn['column_name']);
        $referenceQuery = $pdo->prepare(
            "SELECT `{$column}` AS measurement_unit_id, COUNT(*) AS reference_count
             FROM `{$table}` WHERE `{$column}` IN ({$idPlaceholders}) GROUP BY `{$column}`"
        );
        $referenceQuery->execute($unitIds);
        foreach ($referenceQuery->fetchAll(PDO::FETCH_ASSOC) as $row) {
            if (!isset($byId[$row['measurement_unit_id']])) continue;
            $byId[$row['measurement_unit_id']]['reference_count'] += (int) $row['reference_count'];
            if ($table === 'product_specification_values') {
                $byId[$row['measurement_unit_id']]['usage_count'] += (int) $row['reference_count'];
            }
        }
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
        ['purchase_order_items', 'unit_snapshot'], ['purchase_request_items', 'unit_label_at_request'],
        ['inventory_transfers', 'base_unit'], ['inventory_transfers', 'selected_unit'],
        ['product_selling_options', 'unit_name'], ['sales_order_items', 'selected_unit'],
        ['supplier_product_unit_conversions', 'unit_name'],
        ['supplier_claim_legacy_projection', 'action_unit_name'],
        ['supplier_claim_legacy_projection', 'affected_unit_name'],
        ['supplier_claim_legacy_projection', 'damaged_unit_name']
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

    $referencedUnits = array_values(array_filter($units, static fn(array $unit): bool => (int) ($unit['reference_count'] ?? 0) > 0));
    if ($referencedUnits) {
        throw new DomainException('This measurement unit cannot be deleted because it is currently being used.', 1003);
    }

    $pdo->beginTransaction();
    $archive = $pdo->prepare(
        "UPDATE product_measurement_units SET is_active = 0
         WHERE measurement_unit_id IN ({$idPlaceholders}) AND is_system = 0"
    );
    $archive->execute($unitIds);
    if ($archive->rowCount() !== count($unitIds)) {
        throw new RuntimeException('Measurement unit archive did not update every requested row.');
    }
    foreach ($units as &$unit) $unit['is_active'] = 0;
    unset($unit);
    $pdo->commit();

    $count = count($units);
    echo json_encode([
        'status' => 'success',
        'success' => true,
        'message' => $count === 1
            ? 'Measurement unit deleted successfully.'
            : "{$count} measurement units deleted successfully.",
        'unit' => $count === 1 ? $units[0] : null,
        'units' => $units,
    ]);
} catch (DomainException $error) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    http_response_code(400);
    $codes = [
        1001 => 'UNIT_NOT_FOUND',
        1002 => 'SYSTEM_UNIT',
        1003 => 'UNIT_IN_USE',
    ];
    echo json_encode([
        'status' => 'error',
        'success' => false,
        'code' => $codes[$error->getCode()] ?? 'DELETE_REJECTED',
        'message' => $error->getMessage(),
    ]);
} catch (Throwable $error) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    error_log('Measurement unit deletion failed: ' . $error->getMessage());
    http_response_code(500);
    echo json_encode(['status' => 'error', 'success' => false, 'code' => 'DELETE_FAILED', 'message' => 'Unable to delete measurement unit.']);
}
?>
