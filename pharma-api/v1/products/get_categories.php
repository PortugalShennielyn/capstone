<?php
require_once '../../config/db_connection.php';
require_once 'product_category_schema.php';

try {
    echo json_encode([
        'status' => 'success',
        'categories' => getProductCategories($pdo)
    ]);
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode([
        'status' => 'error',
        'message' => 'Unable to load product categories.'
    ]);
}

?>
