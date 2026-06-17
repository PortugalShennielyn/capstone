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

    $categoryId = cleanId($payload['category_id'] ?? null);
    $typeName = requiredProductField($payload, 'type_name');

    if ($categoryId === '') {
        throw new InvalidArgumentException('A valid category is required.');
    }

    $categoryCheck = $pdo->prepare('SELECT category_id FROM product_categories WHERE category_id = :category_id LIMIT 1');
    $categoryCheck->execute([':category_id' => $categoryId]);
    if (cleanId($categoryCheck->fetchColumn()) === '') {
        throw new InvalidArgumentException('A valid category is required.');
    }

    $statement = $pdo->prepare(
        'INSERT INTO product_types (type_id, category_id, type_name)
         VALUES (:type_id, :category_id, :type_name)
         ON DUPLICATE KEY UPDATE category_id = VALUES(category_id), type_name = VALUES(type_name)'
    );
    $typeId = newUuid($pdo);
    $statement->execute([
        ':type_id' => $typeId,
        ':category_id' => $categoryId,
        ':type_name' => $typeName
    ]);

    $select = $pdo->prepare('SELECT type_id FROM product_types WHERE type_name = :type_name LIMIT 1');
    $select->execute([':type_name' => $typeName]);
    $typeId = cleanId($select->fetchColumn()) ?: $typeId;

    echo json_encode([
        'status' => 'success',
        'message' => 'Product type saved successfully.',
        'type' => [
            'type_id' => $typeId,
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
