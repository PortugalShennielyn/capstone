<?php
require_once '../../config/db_connection.php';
require_once '../../config/require_auth.php';
require_once '../activity_log_helpers.php';
require_once 'product_status_schema.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['status' => 'error', 'message' => 'Only POST requests are allowed.']);
    exit();
}

$payload = json_decode(file_get_contents('php://input'), true);
$productId = cleanId($payload['product_id'] ?? null);
if ($productId === '') {
    http_response_code(400);
    echo json_encode(['status' => 'error', 'message' => 'A valid product is required.']);
    exit();
}

try {
    ensureProductStatusColumn($pdo);
    $status = normalizeProductStatus($payload['status'] ?? 'Active');
    $statement = $pdo->prepare('UPDATE product SET status = :status WHERE product_id = :product_id');
    $statement->execute([':status' => $status, ':product_id' => $productId]);
    if ($statement->rowCount() === 0) {
        $exists = $pdo->prepare('SELECT 1 FROM product WHERE product_id = :product_id');
        $exists->execute([':product_id' => $productId]);
        if (!$exists->fetchColumn()) {
            throw new InvalidArgumentException('Product not found.');
        }
    }
    recordActivityLog($pdo, 'Products', $status === 'Active' ? 'Activated' : 'Deactivated', "Product status changed to {$status}.", $productId);
    $message = $status === 'Active'
        ? 'Product reactivated. Existing inventory and history were retained.'
        : 'Product deactivated. Existing inventory and history were retained.';
    echo json_encode(['status' => 'success', 'product_status' => $status, 'message' => $message]);
} catch (InvalidArgumentException $e) {
    http_response_code(404);
    echo json_encode(['status' => 'error', 'message' => $e->getMessage()]);
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode(['status' => 'error', 'message' => 'Unable to change product status.']);
}
?>
