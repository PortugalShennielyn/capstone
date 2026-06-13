<?php
require_once '../../config/db_connection.php';

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

$supplierName = trim((string) ($payload['supplier_name'] ?? ''));
$supplierPhone = trim((string) ($payload['phone'] ?? ''));
$supplierEmail = trim((string) ($payload['email'] ?? ''));
$supplierAddress = trim((string) ($payload['address'] ?? ''));

if ($supplierName === '') {
    http_response_code(400);
    echo json_encode(['status' => 'error', 'message' => 'Supplier name is required.']);
    exit();
}

if ($supplierEmail !== '' && !filter_var($supplierEmail, FILTER_VALIDATE_EMAIL)) {
    http_response_code(400);
    echo json_encode(['status' => 'error', 'message' => 'Enter a valid supplier email address.']);
    exit();
}

try {
    $statement = $pdo->prepare(
        'INSERT INTO suppliers (supplier_name, phone, email, address)
         VALUES (:supplier_name, :phone, :email, :address)'
    );
    $statement->execute([
        ':supplier_name' => $supplierName,
        ':phone' => $supplierPhone,
        ':email' => $supplierEmail,
        ':address' => $supplierAddress
    ]);

    http_response_code(201);
    echo json_encode([
        'status' => 'success',
        'message' => 'Supplier created successfully.',
        'supplier_id' => (int) $pdo->lastInsertId()
    ]);
} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode(['status' => 'error', 'message' => 'Unable to add supplier.']);
}
?>
