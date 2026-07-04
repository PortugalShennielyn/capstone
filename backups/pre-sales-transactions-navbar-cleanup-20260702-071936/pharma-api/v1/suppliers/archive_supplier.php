<?php
require_once '../../config/db_connection.php';
require_once '../../config/require_auth.php';
require_once 'supplier_schema.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['status' => 'error', 'message' => 'Only POST requests are allowed.']);
    exit();
}

$payload = json_decode(file_get_contents('php://input'), true);
$supplierId = cleanId($payload['supplier_id'] ?? null);

if ($supplierId === '') {
    http_response_code(400);
    echo json_encode(['status' => 'error', 'message' => 'A valid supplier is required.']);
    exit();
}

try {
    ensureSupplierArchiveColumn($pdo);

    $statement = $pdo->prepare(
        'UPDATE suppliers
         SET archived_at = CURRENT_TIMESTAMP
         WHERE supplier_id = :supplier_id
           AND archived_at IS NULL'
    );
    $statement->execute([':supplier_id' => $supplierId]);

    echo json_encode([
        'status' => 'success',
        'message' => 'Supplier archived successfully.'
    ]);
} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode(['status' => 'error', 'message' => 'Unable to archive supplier.']);
}
?>
