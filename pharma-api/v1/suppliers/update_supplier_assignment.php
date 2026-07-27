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
$supplierProductId = cleanId($payload['supplier_product_id'] ?? null);
$supplierCost = $payload['supplier_cost_price'] ?? null;
$purchaseUnit = trim((string) ($payload['purchase_unit'] ?? ''));
$units = $payload['units_per_purchase_unit'] ?? null;

if ($supplierProductId === '' || !is_numeric($supplierCost) || (float) $supplierCost < 0 || $purchaseUnit === '' || !is_numeric($units) || (int) $units < 1) {
    http_response_code(422);
    echo json_encode(['status' => 'error', 'message' => 'Valid supplier cost, purchase unit, and units per purchase unit are required.']);
    exit();
}

try {
    $statement = $pdo->prepare(
        'UPDATE supplier_products
         SET supplier_cost_price = :supplier_cost_price,
             purchase_unit = :purchase_unit,
             units_per_purchase_unit = :units_per_purchase_unit
         WHERE supplier_product_id = :supplier_product_id'
    );
    $statement->execute([
        ':supplier_cost_price' => (float) $supplierCost,
        ':purchase_unit' => $purchaseUnit,
        ':units_per_purchase_unit' => (int) $units,
        ':supplier_product_id' => $supplierProductId
    ]);
    if ($statement->rowCount() === 0) {
        $check = $pdo->prepare('SELECT COUNT(*) FROM supplier_products WHERE supplier_product_id = :supplier_product_id');
        $check->execute([':supplier_product_id' => $supplierProductId]);
        if (!(int) $check->fetchColumn()) {
            http_response_code(404);
            echo json_encode(['status' => 'error', 'message' => 'Supplier product assignment was not found.']);
            exit();
        }
    }
    echo json_encode(['status' => 'success', 'message' => 'Supplier purchasing setup updated successfully.']);
} catch (Throwable $error) {
    http_response_code(500);
    echo json_encode(['status' => 'error', 'message' => 'Unable to update supplier purchasing setup.']);
}

