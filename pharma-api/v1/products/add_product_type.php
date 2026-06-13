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

    $categoryId = isset($payload['category_id']) ? (int) $payload['category_id'] : 0;
    $typeName = requiredProductField($payload, 'type_name');

    if ($categoryId <= 0) {
        throw new InvalidArgumentException('A valid category is required.');
    }

    $categoryCheck = $pdo->prepare('SELECT category_id FROM product_categories WHERE category_id = :category_id LIMIT 1');
    $categoryCheck->execute([':category_id' => $categoryId]);
    if ((int) $categoryCheck->fetchColumn() <= 0) {
        throw new InvalidArgumentException('A valid category is required.');
    }

    $statement = $pdo->prepare(
        'INSERT INTO product_types (category_id, type_name)
         VALUES (:category_id, :type_name)
         ON DUPLICATE KEY UPDATE category_id = VALUES(category_id), type_id = LAST_INSERT_ID(type_id)'
    );
    $statement->execute([
        ':category_id' => $categoryId,
        ':type_name' => $typeName
    ]);

    echo json_encode([
        'status' => 'success',
        'message' => 'Product type saved successfully.',
        'type' => [
            'type_id' => (int) $pdo->lastInsertId(),
            'category_id' => $categoryId,
            'type_name' => $typeName
        ]
    ]);
} catch (InvalidArgumentException $e) {
    http_response_code(400);
    echo json_encode(['status' => 'error', 'message' => $e->getMessage()]);
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode(['status' => 'error', 'message' => 'Unable to save product type.']);
}
?>
