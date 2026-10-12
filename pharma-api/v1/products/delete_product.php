<?php
require_once '../../config/db_connection.php';
require_once '../../config/require_auth.php';
require_once '../activity_log_helpers.php';
require_once '../../config/audit_log.php';
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

    ensureActivityLogSchema($pdo);
    ensureAuditLogSchema($pdo);
    $pdo->beginTransaction();
    $detailsStmt = $pdo->prepare(
        'SELECT p.product_id, p.product_name, p.brand_name, p.barcode, p.price, p.status,
                pc.category_name,
                COALESCE((SELECT SUM(storage_qty) FROM inventory_batches WHERE product_id=p.product_id),0) AS storage_stock,
                COALESCE((SELECT SUM(quantity_remaining) FROM product_selling_stock WHERE product_id=p.product_id),0) AS shelf_stock,
                (SELECT MIN(expiry_date) FROM inventory_batches WHERE product_id=p.product_id AND expiry_date IS NOT NULL) AS expiry_date
         FROM product p LEFT JOIN product_categories pc ON pc.category_id=p.category_id
         WHERE p.product_id=:product_id FOR UPDATE'
    );
    $detailsStmt->execute([':product_id' => $productId]);
    $deletedProduct = $detailsStmt->fetch(PDO::FETCH_ASSOC);
    if (!$deletedProduct) throw new RuntimeException('Product not found.');

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

    $name = trim((string) ($deletedProduct['product_name'] ?? '')) ?: trim((string) ($deletedProduct['brand_name'] ?? 'product'));
    $description = "Product deleted: {$name}.";
    recordInventoryAudit($pdo, 'PRODUCT_DELETED', $description, $productId, [
        'product_id' => $productId, 'product_name' => $name,
        'category' => $deletedProduct['category_name'] ?? null,
        'brand_name' => $deletedProduct['brand_name'] ?? null,
        'barcode' => $deletedProduct['barcode'] ?? null,
        'price' => $deletedProduct['price'] ?? null,
        'status' => $deletedProduct['status'] ?? null,
        'storage_stock' => (int) ($deletedProduct['storage_stock'] ?? 0),
        'shelf_stock' => (int) ($deletedProduct['shelf_stock'] ?? 0),
        'expiry_date' => $deletedProduct['expiry_date'] ?? null,
    ]);
    recordActivityLog($pdo, 'Products', 'Deleted', $description, $productId, null, null, false);
    $pdo->commit();

    echo json_encode([
        'status' => 'success',
        'message' => 'Product deleted successfully.'
    ]);
} catch (Throwable $e) {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }
    recordInventoryAuditFailure($pdo, 'PRODUCT_DELETE_FAILED', 'Product deletion failed before commit.', isset($productId) ? (string) $productId : null);

    http_response_code(500);
    echo json_encode(['status' => 'error', 'message' => 'Unable to delete product.']);
}
?>
