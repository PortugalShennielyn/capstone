<?php
require_once '../../config/db_connection.php';
require_once '../../config/require_auth.php';
require_once 'product_customization_schema.php';

try {
    ensureProductCustomizationSchema($pdo);
    $typeId = cleanId($_GET['type_id'] ?? null);
    $groups = $pdo->query("SELECT DISTINCT measurement_group FROM product_measurement_units WHERE measurement_group <> 'Packaging' AND is_active = 1 ORDER BY measurement_group")->fetchAll(PDO::FETCH_COLUMN);
    $units = $pdo->query("SELECT measurement_unit_id, unit_name, COALESCE(NULLIF(unit_symbol, ''), unit_name) AS unit_symbol, measurement_group, is_active, is_system FROM product_measurement_units WHERE measurement_group <> 'Packaging' AND is_active = 1 ORDER BY measurement_group, unit_name")->fetchAll();
    $packageTypes = $pdo->query("SELECT lookup_label FROM lookup_values WHERE lookup_type = 'product_package_type' AND is_active = 1 ORDER BY sort_order, lookup_label")->fetchAll(PDO::FETCH_COLUMN);
    echo json_encode([
        'status' => 'success',
        'specifications' => $typeId === '' ? [] : getTypeSpecificationConfiguration($pdo, $typeId),
        'all_specifications' => $typeId === '' ? [] : getAllSpecificationDefinitionsForType($pdo, $typeId),
        'units' => $units,
        'measurement_groups' => $groups,
        'package_types' => $packageTypes
    ]);
} catch (Throwable $error) {
    http_response_code(500);
    echo json_encode(['status' => 'error', 'message' => 'Unable to load product configuration.', 'error' => $error->getMessage()]);
}
?>
