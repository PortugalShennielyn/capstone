<?php
require_once '../../config/db_connection.php';
require_once 'product_category_schema.php';

$categoryId = cleanId($_GET['category_id'] ?? null);

try {
    ensureProductCategorySchema($pdo);

    echo json_encode([
        'status' => 'success',
        'types' => $categoryId !== '' ? getProductTypesByCategory($pdo, $categoryId) : getAllProductTypes($pdo)
    ]);
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode([
        'status' => 'error',
        'message' => 'Unable to load product types.'
    ]);
}

?>
