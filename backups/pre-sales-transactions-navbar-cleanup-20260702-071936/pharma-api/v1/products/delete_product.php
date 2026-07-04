<?php
require_once '../../config/db_connection.php';
require_once '../../config/require_auth.php';
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

    $productId = cleanId($payload['product_id'] ?? null);

    if ($productId === '') {
        http_response_code(400);
        echo json_encode(['status' => 'error', 'message' => 'A valid product is required.']);
        exit();
    }

    $existsStatement = $pdo->prepare('SELECT COUNT(*) FROM product WHERE product_id = :product_id');
    $existsStatement->execute([':product_id' => $productId]);
    if ((int) $existsStatement->fetchColumn() === 0) {
        echo json_encode([
            'status' => 'already_deleted',
            'message' => 'Product already removed.'
        ]);
        exit();
    }

    $pdo->beginTransaction();

    $supplierProducts = $pdo->prepare('DELETE FROM supplier_products WHERE product_id = :product_id');
    $supplierProducts->execute([':product_id' => $productId]);

    $sellingStock = $pdo->prepare('DELETE FROM product_selling_stock WHERE product_id = :product_id');
    $sellingStock->execute([':product_id' => $productId]);

    $batches = $pdo->prepare('DELETE FROM inventory_batches WHERE product_id = :product_id');
    $batches->execute([':product_id' => $productId]);

    $inventory = $pdo->prepare('DELETE FROM product_inventory WHERE product_id = :product_id');
    $inventory->execute([':product_id' => $productId]);

    $product = $pdo->prepare('DELETE FROM product WHERE product_id = :product_id');
    $product->execute([':product_id' => $productId]);

    if ($product->rowCount() === 0) {
        $pdo->commit();
        echo json_encode([
            'status' => 'already_deleted',
            'message' => 'Product already removed.'
        ]);
        exit();
    }

    $pdo->commit();

    echo json_encode([
        'status' => 'success',
        'message' => 'Product deleted successfully.'
    ]);
} catch (Throwable $e) {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }

    http_response_code(500);
    echo json_encode(['status' => 'error', 'message' => 'Unable to delete product.']);
}
?>
