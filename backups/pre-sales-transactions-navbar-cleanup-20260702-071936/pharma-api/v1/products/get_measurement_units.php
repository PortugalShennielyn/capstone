<?php
require_once '../../config/db_connection.php';
require_once '../../config/require_auth.php';
require_once 'product_category_schema.php';

try {
    ensureProductCategorySchema($pdo);

    echo json_encode([
        'status' => 'success',
        'units' => getProductMeasurementUnits($pdo)
    ]);
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode([
        'status' => 'error',
        'message' => 'Unable to load measurement units.'
    ]);
}

?>
