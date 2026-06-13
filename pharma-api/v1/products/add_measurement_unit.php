<?php
require_once '../../config/db_connection.php';
require_once 'product_category_schema.php';

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
    ensureProductCategorySchema($pdo);

    $unitName = requiredProductField($payload, 'unit_name');
    $unitIdColumn = getMeasurementUnitIdColumn($pdo);

    $statement = $pdo->prepare(
        "INSERT INTO product_measurement_units (unit_name)
         VALUES (:unit_name)
         ON DUPLICATE KEY UPDATE {$unitIdColumn} = LAST_INSERT_ID({$unitIdColumn}), unit_name = VALUES(unit_name)"
    );
    $statement->execute([':unit_name' => $unitName]);

    echo json_encode([
        'status' => 'success',
        'message' => 'Measurement unit saved successfully.',
        'unit' => [
            'measurement_unit_id' => (int) $pdo->lastInsertId(),
            'unit_name' => $unitName
        ]
    ]);
} catch (InvalidArgumentException $e) {
    http_response_code(400);
    echo json_encode(['status' => 'error', 'message' => $e->getMessage()]);
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode(['status' => 'error', 'message' => 'Unable to save measurement unit.']);
}
?>
