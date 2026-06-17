<?php
require_once '../../config/db_connection.php';
require_once 'supplier_schema.php';

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

$supplierId = cleanId($payload['supplier_id'] ?? null);
$supplierName = trim((string) ($payload['supplier_name'] ?? ''));
$supplierPhone = trim((string) ($payload['phone'] ?? ''));
$supplierEmail = trim((string) ($payload['email'] ?? ''));
$supplierAddress = trim((string) ($payload['address'] ?? ''));

if ($supplierId === '' || $supplierName === '') {
    http_response_code(400);
    echo json_encode(['status' => 'error', 'message' => 'Supplier ID and name are required.']);
    exit();
}

if ($supplierEmail !== '' && !filter_var($supplierEmail, FILTER_VALIDATE_EMAIL)) {
    http_response_code(400);
    echo json_encode(['status' => 'error', 'message' => 'Enter a valid supplier email address.']);
    exit();
}

try {
    ensureSupplierArchiveColumn($pdo);

    $statement = $pdo->prepare(
        'UPDATE suppliers
         SET supplier_name = :supplier_name,
             phone = :phone,
             email = :email,
             address = :address
         WHERE supplier_id = :supplier_id
           AND archived_at IS NULL'
    );
    $statement->execute([
        ':supplier_id' => $supplierId,
        ':supplier_name' => $supplierName,
        ':phone' => $supplierPhone,
        ':email' => $supplierEmail,
        ':address' => $supplierAddress
    ]);

    echo json_encode([
        'status' => 'success',
        'message' => 'Supplier updated successfully.'
    ]);
} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode(['status' => 'error', 'message' => 'Unable to update supplier.']);
}
?>
