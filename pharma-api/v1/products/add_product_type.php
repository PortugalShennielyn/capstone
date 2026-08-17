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
    ensureProductCustomizationSchema($pdo);

    $categoryId = cleanId($payload['category_id'] ?? null);
    $typeId = cleanId($payload['type_id'] ?? null);
    $typeName = requiredProductField($payload, 'type_name');

    if ($categoryId === '') {
        throw new InvalidArgumentException('A valid category is required.');
    }

    $categoryCheck = $pdo->prepare('SELECT category_id FROM product_categories WHERE category_id = :category_id LIMIT 1');
    $categoryCheck->execute([':category_id' => $categoryId]);
    if (cleanId($categoryCheck->fetchColumn()) === '') {
        throw new InvalidArgumentException('A valid category is required.');
    }

    $matchingType = findProductTypeByNormalizedName($pdo, $categoryId, $typeName, $typeId);
    $reused = false;
    if ($matchingType && $typeId !== '') {
        throw new InvalidArgumentException('A Product Type with this name already exists in the selected Category.');
    }
    if ($matchingType) {
        $typeId = $matchingType['type_id'];
        $typeName = $matchingType['type_name'];
        $reused = true;
    }

    if ($typeId !== '' && !$reused) {
        $statement = $pdo->prepare('UPDATE product_types SET type_name = :type_name WHERE type_id = :type_id AND category_id = :category_id');
        $statement->execute([':type_id' => $typeId, ':category_id' => $categoryId, ':type_name' => $typeName]);
        $exists = $pdo->prepare('SELECT type_id FROM product_types WHERE type_id = :type_id AND category_id = :category_id');
        $exists->execute([':type_id' => $typeId, ':category_id' => $categoryId]);
        if (!$exists->fetchColumn()) {
            throw new InvalidArgumentException('Product Type not found under the selected Category.');
        }
    } elseif (!$reused) {
        $typeId = newUuid($pdo);
        $statement = $pdo->prepare('INSERT INTO product_types (type_id, category_id, type_name) VALUES (:type_id, :category_id, :type_name)');
        $statement->execute([':type_id' => $typeId, ':category_id' => $categoryId, ':type_name' => $typeName]);
    }
    assignSuggestedProductTypeTemplate($pdo, $typeId);

    echo json_encode([
        'status' => 'success',
        'message' => $reused ? 'Existing Product Type selected.' : 'Product type saved successfully.',
        'reused_existing' => $reused,
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
