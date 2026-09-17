<?php
require_once '../../config/db_connection.php';
require_once '../../config/require_auth.php';
require_once 'product_customization_schema.php';

header('Content-Type: application/json');

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
    $typeId = cleanId($payload['type_id'] ?? null);
    $categoryId = cleanId($payload['category_id'] ?? null);
    if ($typeId === '' || $categoryId === '') {
        throw new InvalidArgumentException('A valid Product Type and Category are required.');
    }

    $type = $pdo->prepare(
        'SELECT pt.type_id, pt.type_name, pc.category_name
         FROM product_types pt
         INNER JOIN product_categories pc ON pc.category_id=pt.category_id
         WHERE pt.type_id = :type_id AND pt.category_id = :category_id LIMIT 1'
    );
    $type->execute([':type_id' => $typeId, ':category_id' => $categoryId]);
    $record = $type->fetch(PDO::FETCH_ASSOC);
    if (!$record) {
        throw new InvalidArgumentException('Product Type not found under the selected Category.');
    }

    // All operational product-type usage flows through product.product_id. If a
    // product exists, its supplier, inventory, PO, receiving and sales history
    // must remain intact, so deletion is blocked rather than cascading history.
    $usage = $pdo->prepare('SELECT COUNT(*) FROM product WHERE type_id = :type_id');
    $usage->execute([':type_id' => $typeId]);
    $usageCount = (int) $usage->fetchColumn();
    if ($usageCount > 0) {
        $label = strcasecmp(trim((string) ($record['category_name'] ?? '')), 'Medicine') === 0 ? 'dosage form' : 'Product Type';
        throw new InvalidArgumentException(
            "This {$label} is currently used by {$usageCount} product SKU" . ($usageCount === 1 ? '' : 's') . ' and cannot be deleted.'
        );
    }

    $pdo->beginTransaction();
    $delete = $pdo->prepare('DELETE FROM product_types WHERE type_id = :type_id AND category_id = :category_id');
    $delete->execute([':type_id' => $typeId, ':category_id' => $categoryId]);
    if ($delete->rowCount() !== 1) {
        throw new RuntimeException('Product Type was not deleted.');
    }
    $pdo->commit();

    echo json_encode([
        'status' => 'success',
        'message' => 'Product Type deleted successfully.',
        'type_id' => $typeId,
        'type_name' => $record['type_name']
    ]);
} catch (InvalidArgumentException $error) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    http_response_code(400);
    echo json_encode(['status' => 'error', 'message' => $error->getMessage()]);
} catch (Throwable $error) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    http_response_code(500);
    echo json_encode(['status' => 'error', 'message' => 'Unable to delete Product Type.']);
}
?>
