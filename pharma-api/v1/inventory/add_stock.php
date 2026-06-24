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

    $productId = cleanId($payload['product_id'] ?? null);
    $batchNumber = isset($payload['batch_number']) ? trim((string) $payload['batch_number']) : '';
    $quantityStocked = isset($payload['quantity_stocked']) ? (int) $payload['quantity_stocked'] : 0;
    $expirationDate = isset($payload['expiration_date']) ? trim((string) $payload['expiration_date']) : '';

    if ($productId === '' || $batchNumber === '' || $quantityStocked <= 0 || $expirationDate === '') {
        http_response_code(400);
        echo json_encode([
            'status' => 'error',
            'message' => 'Product, batch number, quantity, and expiration date are required.'
        ]);
        exit();
    }

    $statement = $pdo->prepare(
        "INSERT INTO product_selling_stock
            (selling_stock_id, product_id, batch_number, quantity_stocked, quantity_remaining, expiration_date)
         VALUES
            (:selling_stock_id, :product_id, :batch_number, :quantity_stocked, :quantity_remaining, :expiration_date)"
    );

    $sellingStockId = newUuid($pdo);
    $statement->execute([
        ':selling_stock_id' => $sellingStockId,
        ':product_id' => $productId,
        ':batch_number' => $batchNumber,
        ':quantity_stocked' => $quantityStocked,
        ':quantity_remaining' => $quantityStocked,
        ':expiration_date' => $expirationDate
    ]);

    http_response_code(201);
    echo json_encode([
        'status' => 'success',
        'message' => 'Stock successfully added to Products selling stock.',
        'inventory_id' => $sellingStockId
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
