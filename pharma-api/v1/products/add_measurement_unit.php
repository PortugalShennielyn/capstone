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
if (!is_array($payload)) {
    http_response_code(400);
    echo json_encode(['status' => 'error', 'message' => 'Invalid JSON payload.']);
    exit();
}

try {
    $measurementUnitId = cleanId($payload['measurement_unit_id'] ?? null);
    $isEditRequest = $measurementUnitId !== '';
    $unitName = requiredProductField($payload, 'unit_name');
    $unitSymbol = trim((string) ($payload['unit_symbol'] ?? '')) ?: $unitName;
    $measurementGroup = trim((string) ($payload['measurement_group'] ?? '')) ?: 'General Size';
    $unitIdColumn = getMeasurementUnitIdColumn($pdo);
    $editingUnit = null;
    if ($measurementUnitId !== '') {
        $current = $pdo->prepare(
            "SELECT {$unitIdColumn}, unit_symbol, measurement_group, is_system
             FROM product_measurement_units
             WHERE {$unitIdColumn} = :unit_id AND measurement_group <> 'Packaging' LIMIT 1"
        );
        $current->execute([':unit_id' => $measurementUnitId]);
        $editingUnit = $current->fetch(PDO::FETCH_ASSOC);
        if (!$editingUnit) throw new InvalidArgumentException('Measurement unit not found.');
        if ((int) $editingUnit['is_system'] === 1) {
            $unitSymbol = trim((string) $editingUnit['unit_symbol']) ?: $unitName;
            $measurementGroup = trim((string) $editingUnit['measurement_group']);
        }
    }
    $compoundUnitPattern = '~(?:/|\\\\|\x{2044}|\bper\b|^\s*\d+(?:\.\d+)?\s*(?:mg|g|mcg|kg|iu|%|ml|l|tablet|capsule|piece|bottle|vial|ampule|sachet|box)\s*$)~iu';
    if (preg_match($compoundUnitPattern, $unitName) || preg_match($compoundUnitPattern, $unitSymbol)) {
        throw new InvalidArgumentException('Measurement units must be atomic and reusable (for example: mg, mL, tablet, or bottle). Enter concentration values in the Medicine Strength fields.');
    }
    $groups = $pdo->query("SELECT DISTINCT measurement_group FROM product_measurement_units WHERE measurement_group <> 'Packaging' AND is_active = 1 ORDER BY measurement_group")->fetchAll(PDO::FETCH_COLUMN);
    if (!in_array($measurementGroup, $groups, true)) throw new InvalidArgumentException('Select a valid Measurement Group.');
    $duplicate = $pdo->prepare("SELECT {$unitIdColumn}, is_active, is_system FROM product_measurement_units WHERE measurement_group = :measurement_group AND (LOWER(TRIM(unit_name)) = LOWER(TRIM(:unit_name)) OR LOWER(TRIM(COALESCE(unit_symbol, ''))) = LOWER(TRIM(:unit_symbol))) AND {$unitIdColumn} <> :unit_id LIMIT 1");
    $duplicate->execute([':measurement_group' => $measurementGroup, ':unit_name' => $unitName, ':unit_symbol' => $unitSymbol, ':unit_id' => $measurementUnitId]);
    $duplicateUnit = $duplicate->fetch(PDO::FETCH_ASSOC);
    if ($duplicateUnit && ($measurementUnitId !== '' || (int) $duplicateUnit['is_active'] === 1 || (int) $duplicateUnit['is_system'] === 1)) {
        throw new InvalidArgumentException('A unit with this name or symbol already exists in the selected Measurement Group.');
    }
    if ($duplicateUnit) $measurementUnitId = cleanId($duplicateUnit[$unitIdColumn]);
    if ($measurementUnitId !== '') {
        $statement = $pdo->prepare("UPDATE product_measurement_units SET unit_name = :unit_name, unit_symbol = :unit_symbol, measurement_group = :measurement_group, is_active = 1 WHERE {$unitIdColumn} = :unit_id AND measurement_group <> 'Packaging'");
        $statement->execute([':unit_name' => $unitName, ':unit_symbol' => $unitSymbol, ':measurement_group' => $measurementGroup, ':unit_id' => $measurementUnitId]);
    } else {
        $measurementUnitId = newUuid($pdo);
        $statement = $pdo->prepare("INSERT INTO product_measurement_units ({$unitIdColumn}, unit_name, unit_symbol, measurement_group, is_active, is_system) VALUES (:measurement_unit_id, :unit_name, :unit_symbol, :measurement_group, 1, 0)");
        $statement->execute([':measurement_unit_id' => $measurementUnitId, ':unit_name' => $unitName, ':unit_symbol' => $unitSymbol, ':measurement_group' => $measurementGroup]);
    }

    $saved = $pdo->prepare("SELECT {$unitIdColumn} AS measurement_unit_id, unit_name, COALESCE(NULLIF(unit_symbol, ''), unit_name) AS unit_symbol, measurement_group, is_active, is_system, (SELECT COUNT(DISTINCT psv.product_id) FROM product_specification_values psv WHERE psv.measurement_unit_id = product_measurement_units.{$unitIdColumn}) AS usage_count FROM product_measurement_units WHERE {$unitIdColumn} = :unit_id LIMIT 1");
    $saved->execute([':unit_id' => $measurementUnitId]);

    echo json_encode([
        'status' => 'success',
        'message' => $isEditRequest ? 'Measurement unit updated successfully.' : 'Measurement unit added successfully.',
        'unit' => $saved->fetch(PDO::FETCH_ASSOC)
    ]);
} catch (InvalidArgumentException $e) {
    http_response_code(400);
    echo json_encode(['status' => 'error', 'message' => $e->getMessage()]);
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode(['status' => 'error', 'message' => 'Unable to save measurement unit.']);
}
?>
