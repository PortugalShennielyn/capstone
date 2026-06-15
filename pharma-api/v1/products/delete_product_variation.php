<?php
require_once '../../config/db_connection.php';
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
    $variationId = (int) ($payload['variation_id'] ?? 0);

    if ($variationId <= 0) {
        throw new InvalidArgumentException('A valid variation is required.');
    }

    $productStatement = $pdo->prepare('SELECT product_id FROM product_variations WHERE variation_id = :variation_id LIMIT 1');
    $productStatement->execute([':variation_id' => $variationId]);
    $productId = (int) $productStatement->fetchColumn();
    if ($productId <= 0) {
        throw new InvalidArgumentException('Variation was not found.');
    }

    $countStatement = $pdo->prepare('SELECT COUNT(*) FROM product_variations WHERE product_id = :product_id');
    $countStatement->execute([':product_id' => $productId]);
    if ((int) $countStatement->fetchColumn() <= 1) {
        throw new InvalidArgumentException('A product must keep at least one variation.');
    }

    $usageStatement = $pdo->prepare(
        'SELECT
            (SELECT COUNT(*) FROM purchase_order_items WHERE variation_id = :variation_id) +
            (SELECT COUNT(*) FROM product_inventory WHERE variation_id = :variation_id) +
            (SELECT COUNT(*) FROM product_selling_stock WHERE variation_id = :variation_id)'
    );
    $usageStatement->execute([':variation_id' => $variationId]);
    if ((int) $usageStatement->fetchColumn() > 0) {
        throw new InvalidArgumentException('Cannot delete a variation that already has purchase order or stock history.');
    }

    $statement = $pdo->prepare('DELETE FROM product_variations WHERE variation_id = :variation_id');
    $statement->execute([':variation_id' => $variationId]);

    echo json_encode(['status' => 'success', 'message' => 'Variation deleted successfully.']);
} catch (InvalidArgumentException $e) {
    http_response_code(400);
    echo json_encode(['status' => 'error', 'message' => $e->getMessage()]);
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode(['status' => 'error', 'message' => 'Unable to delete variation.']);
}
?>
