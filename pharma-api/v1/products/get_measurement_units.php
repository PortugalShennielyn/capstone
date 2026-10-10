<?php
require_once '../../config/db_connection.php';
require_once '../../config/require_auth.php';
require_once 'product_customization_schema.php';

try {
    $includeInactive = !empty($_GET['include_inactive']);
    $activeClause = $includeInactive ? '' : ' AND pmu.is_active = 1';
    echo json_encode([
        'status' => 'success',
        'units' => $pdo->query("SELECT pmu.measurement_unit_id, pmu.unit_name, COALESCE(NULLIF(pmu.unit_symbol, ''), pmu.unit_name) AS unit_symbol, pmu.measurement_group, pmu.is_active, pmu.is_system, (SELECT COUNT(DISTINCT psv.product_id) FROM product_specification_values psv WHERE psv.measurement_unit_id = pmu.measurement_unit_id) AS usage_count FROM product_measurement_units pmu WHERE 1=1{$activeClause} ORDER BY pmu.measurement_group, pmu.unit_name")->fetchAll(),
        'measurement_groups' => $pdo->query("SELECT DISTINCT measurement_group FROM product_measurement_units WHERE is_active = 1 ORDER BY measurement_group")->fetchAll(PDO::FETCH_COLUMN)
    ]);
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode([
        'status' => 'error',
        'message' => 'Unable to load measurement units.'
    ]);
}

?>
