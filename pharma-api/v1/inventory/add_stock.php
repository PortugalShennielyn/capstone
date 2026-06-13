<?php
require_once '../../config/db_connection.php';
require_once '../products/product_category_schema.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode([
        'status' => 'error',
        'message' => 'Only POST requests are allowed.'
    ]);
    exit();
}

$payload = json_decode(file_get_contents('php://input'), true);

if (!is_array($payload)) {
    http_response_code(400);
    echo json_encode([
        'status' => 'error',
        'message' => 'Invalid JSON payload.'
    ]);
    exit();
}

try {
    ensureProductCategorySchema($pdo);

    $productId = isset($payload['product_id']) ? (int) $payload['product_id'] : 0;
    $variationId = isset($payload['variation_id']) ? (int) $payload['variation_id'] : 0;
    $batchNumber = isset($payload['batch_number']) ? trim((string) $payload['batch_number']) : '';
    $quantityStocked = isset($payload['quantity_stocked']) ? (int) $payload['quantity_stocked'] : 0;
    $expirationDate = isset($payload['expiration_date']) ? trim((string) $payload['expiration_date']) : '';

    if ($productId > 0 && $variationId <= 0) {
        $defaultVariation = $pdo->prepare(
            'SELECT variation_id FROM product_variations WHERE product_id = :product_id ORDER BY variation_id ASC LIMIT 1'
        );
        $defaultVariation->execute([':product_id' => $productId]);
        $variationId = (int) $defaultVariation->fetchColumn();
    }

    if ($productId <= 0 || $variationId <= 0 || $batchNumber === '' || $quantityStocked <= 0 || $expirationDate === '') {
        http_response_code(400);
        echo json_encode([
            'status' => 'error',
            'message' => 'Product variation, batch number, quantity, and expiration date are required.'
        ]);
        exit();
    }

    $variationCheck = $pdo->prepare('SELECT COUNT(*) FROM product_variations WHERE variation_id = :variation_id AND product_id = :product_id');
    $variationCheck->execute([':variation_id' => $variationId, ':product_id' => $productId]);
    if ((int) $variationCheck->fetchColumn() !== 1) {
        throw new InvalidArgumentException('The selected variation does not belong to this product.');
    }

    $statement = $pdo->prepare(
        "INSERT INTO product_selling_stock
            (product_id, variation_id, batch_number, quantity_stocked, quantity_remaining, expiration_date)
         VALUES
            (:product_id, :variation_id, :batch_number, :quantity_stocked, :quantity_remaining, :expiration_date)"
    );

    $statement->execute([
        ':product_id' => $productId,
        ':variation_id' => $variationId,
        ':batch_number' => $batchNumber,
        ':quantity_stocked' => $quantityStocked,
        ':quantity_remaining' => $quantityStocked,
        ':expiration_date' => $expirationDate
    ]);

    http_response_code(201);
    echo json_encode([
        'status' => 'success',
        'message' => 'Stock successfully added to Products selling stock.',
        'inventory_id' => (int) $pdo->lastInsertId()
    ]);
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode([
        'status' => 'error',
        'message' => 'Unable to add stock. Please try again later.',
        'error' => $e->getMessage()
    ]);
}
?>
