<?php
require_once '../../config/db_connection.php';
require_once '../products/product_category_schema.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['status' => 'error', 'message' => 'Only POST requests are allowed.']);
    exit();
}

$payload = json_decode(file_get_contents('php://input'), true);
$supplierId = cleanId($payload['supplier_id'] ?? null);
$productId = cleanId($payload['product_id'] ?? null);

if ($supplierId === '' || $productId === '') {
    http_response_code(400);
    echo json_encode(['status' => 'error', 'message' => 'A valid supplier and product are required.']);
    exit();
}

try {
    ensureProductCategorySchema($pdo);

    $supplierCheck = $pdo->prepare('SELECT COUNT(*) FROM suppliers WHERE supplier_id = :supplier_id');
    $supplierCheck->execute([':supplier_id' => $supplierId]);

    $productCheck = $pdo->prepare('SELECT COUNT(*) FROM product WHERE product_id = :product_id');
    $productCheck->execute([':product_id' => $productId]);

    if ((int) $supplierCheck->fetchColumn() === 0 || (int) $productCheck->fetchColumn() === 0) {
        http_response_code(404);
        echo json_encode(['status' => 'error', 'message' => 'Supplier or product was not found.']);
        exit();
    }

    $statement = $pdo->prepare(
        'INSERT IGNORE INTO supplier_products (supplier_id, product_id)
         VALUES (:supplier_id, :product_id)'
    );
    $statement->execute([
        ':supplier_id' => $supplierId,
        ':product_id' => $productId
    ]);

    echo json_encode([
        'status' => 'success',
        'message' => 'Product assigned to supplier successfully.'
    ]);
} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode(['status' => 'error', 'message' => 'Unable to assign product to supplier.']);
}
?>
