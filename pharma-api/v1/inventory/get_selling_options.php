<?php
$allowedRoles = ['super_admin', 'admin', 'manager', 'supervisor', 'Admin', 'ro-super-admin', 'ro-admin', 'ro-manager', 'ro-supervisor'];
require_once '../../config/db_connection.php';
require_once '../../config/require_auth.php';
require_once '../products/product_selling_options.php';

try {
    $productId = trim((string) ($_GET['product_id'] ?? ''));
    if ($productId === '') throw new InvalidArgumentException('A product is required.');
    echo json_encode([
        'status' => 'success',
        'base_unit' => productSellingBaseUnit($pdo, $productId),
        'shelf_base_quantity' => productShelfBaseQuantity($pdo, $productId),
        'options' => productSellingOptions($pdo, $productId),
    ]);
} catch (InvalidArgumentException $error) {
    http_response_code(422);
    echo json_encode(['status' => 'error', 'message' => $error->getMessage()]);
} catch (Throwable $error) {
    http_response_code(500);
    echo json_encode(['status' => 'error', 'message' => 'Unable to load Selling Setup.']);
}

