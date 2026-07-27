<?php
require_once '../../config/db_connection.php';
require_once '../../config/require_auth.php';
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

    $supplierProductId = cleanId($payload['supplier_product_id'] ?? null);
    $supplierId = cleanId($payload['supplier_id'] ?? null);
    $productId = cleanId($payload['product_id'] ?? null);

    if ($supplierProductId !== '') {
        $linkStatement = $pdo->prepare(
            'SELECT supplier_id, product_id
             FROM supplier_products
             WHERE supplier_product_id = :supplier_product_id
             LIMIT 1'
        );
        $linkStatement->execute([':supplier_product_id' => $supplierProductId]);
        $link = $linkStatement->fetch();
        if (!$link) {
            http_response_code(404);
            echo json_encode(['status' => 'error', 'message' => 'Supplier product link was not found.']);
            exit();
        }
        $supplierId = cleanId($link['supplier_id'] ?? null);
        $productId = cleanId($link['product_id'] ?? null);
    }

    if ($supplierId !== '' && $productId !== '') {
        $activeOrderStatement = $pdo->prepare(
            "SELECT COUNT(*)
             FROM purchase_order_items poi
             INNER JOIN purchase_orders po ON po.po_id = poi.po_id
             WHERE po.supplier_id = :supplier_id
               AND poi.product_id = :product_id
               AND LOWER(TRIM(po.status)) NOT IN (
                   'cancelled',
                   'canceled',
                   'rejected',
                   'delivered',
                   'delivered with return/damage',
                   'completed'
               )"
        );
        $activeOrderStatement->execute([
            ':supplier_id' => $supplierId,
            ':product_id' => $productId
        ]);
        if ((int) $activeOrderStatement->fetchColumn() > 0) {
            http_response_code(409);
            echo json_encode([
                'status' => 'error',
                'message' => 'This assignment is used by an active purchase order and cannot be removed yet.'
            ]);
            exit();
        }
    }

    if ($supplierProductId !== '') {
        $statement = $pdo->prepare('DELETE FROM supplier_products WHERE supplier_product_id = :supplier_product_id');
        $statement->execute([':supplier_product_id' => $supplierProductId]);
    } elseif ($supplierId !== '' && $productId !== '') {
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
