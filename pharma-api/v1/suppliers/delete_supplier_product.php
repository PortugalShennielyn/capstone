<?php
require_once '../../config/db_connection.php';
require_once '../products/product_category_schema.php';

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

    $supplierProductId = isset($payload['supplier_product_id']) ? (int) $payload['supplier_product_id'] : 0;
    $supplierId = isset($payload['supplier_id']) ? (int) $payload['supplier_id'] : 0;
    $productId = isset($payload['product_id']) ? (int) $payload['product_id'] : 0;

    if ($supplierProductId > 0) {
        $statement = $pdo->prepare('DELETE FROM supplier_products WHERE supplier_product_id = :supplier_product_id');
        $statement->execute([':supplier_product_id' => $supplierProductId]);
    } elseif ($supplierId > 0 && $productId > 0) {
        $statement = $pdo->prepare(
            'DELETE FROM supplier_products
             WHERE supplier_id = :supplier_id
               AND product_id = :product_id'
        );
        $statement->execute([
            ':supplier_id' => $supplierId,
            ':product_id' => $productId
        ]);
    } else {
        throw new InvalidArgumentException('A valid supplier product link is required.');
    }

    if ($statement->rowCount() === 0) {
        http_response_code(404);
        echo json_encode(['status' => 'error', 'message' => 'Supplier product link was not found.']);
        exit();
    }

    echo json_encode([
        'status' => 'success',
        'message' => 'Product removed from supplier successfully.'
    ]);
} catch (InvalidArgumentException $e) {
    http_response_code(400);
    echo json_encode(['status' => 'error', 'message' => $e->getMessage()]);
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode(['status' => 'error', 'message' => 'Unable to remove product from supplier.']);
}
?>
