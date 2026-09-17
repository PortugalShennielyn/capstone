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

    $categoryCheck = $pdo->prepare('SELECT category_id, category_name FROM product_categories WHERE category_id = :category_id LIMIT 1');
    $categoryCheck->execute([':category_id' => $categoryId]);
    $category = $categoryCheck->fetch(PDO::FETCH_ASSOC);
    if (!$category) {
        throw new InvalidArgumentException('A valid category is required.');
    }
    $isMedicine = strcasecmp(trim((string) $category['category_name']), 'Medicine') === 0;
    $specificationPattern = trim((string) ($payload['specification_pattern'] ?? ''));
    if ($isMedicine && $typeId === '') {
        medicineDosageFormSpecificationPattern($specificationPattern);
    }

    $matchingType = findProductTypeByNormalizedName($pdo, $categoryId, $typeName, $typeId);
    if ($matchingType) {
        throw new InvalidArgumentException($isMedicine
            ? 'A Dosage Form with this name already exists.'
            : 'A Product Type with this name already exists in the selected Category.');
    }

    $pdo->beginTransaction();
    if ($typeId !== '') {
        $statement = $pdo->prepare('UPDATE product_types SET type_name = :type_name, is_active = 1 WHERE type_id = :type_id AND category_id = :category_id');
        $statement->execute([':type_id' => $typeId, ':category_id' => $categoryId, ':type_name' => $typeName]);
        $exists = $pdo->prepare('SELECT type_id FROM product_types WHERE type_id = :type_id AND category_id = :category_id');
        $exists->execute([':type_id' => $typeId, ':category_id' => $categoryId]);
        if (!$exists->fetchColumn()) {
            throw new InvalidArgumentException('Product Type not found under the selected Category.');
        }
    } else {
        $typeId = newUuid($pdo);
        $statement = $pdo->prepare('INSERT INTO product_types (type_id, category_id, type_name) VALUES (:type_id, :category_id, :type_name)');
        $statement->execute([':type_id' => $typeId, ':category_id' => $categoryId, ':type_name' => $typeName]);
    }
    if ($isMedicine && $specificationPattern !== '') {
        assignMedicineDosageFormPattern($pdo, $typeId, $specificationPattern);
    } else {
        assignSuggestedProductTypeTemplate($pdo, $typeId);
    }
    $pdo->commit();

    echo json_encode([
        'status' => 'success',
        'message' => $isMedicine ? 'Dosage Form saved successfully.' : 'Product Type saved successfully.',
        'type' => [
            'type_id' => $typeId,
            'category_id' => $categoryId,
            'type_name' => $typeName,
            'specification_pattern' => $isMedicine ? $specificationPattern : null,
        ]
    ]);
} catch (InvalidArgumentException $e) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    http_response_code(400);
    echo json_encode(['status' => 'error', 'message' => $e->getMessage()]);
} catch (Throwable $e) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    http_response_code(500);
    echo json_encode(['status' => 'error', 'message' => 'Unable to save product type.']);
}
?>
