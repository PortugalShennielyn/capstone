<?php
require_once '../../config/db_connection.php';
require_once 'supplier_schema.php';

try {
    ensureSupplierArchiveColumn($pdo);

    $statement = $pdo->prepare(
        'SELECT supplier_id, supplier_name, phone, email, address
         FROM suppliers
         WHERE archived_at IS NULL
         ORDER BY supplier_name ASC'
    );
    $statement->execute();

    echo json_encode([
        'status' => 'success',
        'suppliers' => $statement->fetchAll()
    ]);
} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode([
        'status' => 'error',
        'message' => 'Unable to load suppliers.'
    ]);
}
?>
