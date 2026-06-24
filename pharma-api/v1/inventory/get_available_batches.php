<?php
require_once '../../config/db_connection.php';
require_once '../products/product_category_schema.php';

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    http_response_code(405);
    echo json_encode(['status' => 'error', 'message' => 'Only GET requests are allowed.']);
    exit();
}

try {
    ensureProductCategorySchema($pdo);

    $productId = cleanId($_GET['product_id'] ?? null);

    if ($productId === '') {
        http_response_code(400);
        echo json_encode(['status' => 'error', 'message' => 'Product is required.']);
        exit();
    }

    $statement = $pdo->prepare(
        "SELECT
            ib.batch_id,
            ib.legacy_inventory_id AS inventory_id,
            ib.product_id,
            COALESCE(po.po_number, ib.legacy_inventory_id, ib.batch_id) AS po_number,
            COALESCE(po.po_number, ib.legacy_inventory_id, ib.batch_id) AS batch_number,
            s.supplier_name,
            ib.received_date,
            ib.expiry_date,
            ib.expiry_date AS expiration_date,
            ib.storage_qty AS quantity_remaining,
            ib.storage_qty,
            ib.shelf_qty,
            ib.damaged_qty,
            ib.batch_status,
            CASE
                WHEN ib.expiry_date IS NULL THEN 'N/A'
                WHEN ib.expiry_date < CURDATE() THEN 'Expired'
                WHEN ib.expiry_date <= DATE_ADD(CURDATE(), INTERVAL 30 DAY) THEN 'Expiring Soon'
                ELSE 'Safe'
            END AS status
         FROM inventory_batches ib
         LEFT JOIN purchase_orders po ON po.po_id = ib.po_id
         LEFT JOIN suppliers s ON s.supplier_id = ib.supplier_id
         WHERE ib.product_id = :product_id
           AND storage_qty > 0
           AND batch_status IN ('active', 'expired')
         ORDER BY
            CASE WHEN expiry_date IS NULL THEN 1 ELSE 0 END ASC,
            expiry_date ASC,
            received_date ASC,
            batch_id ASC"
    );
    $statement->execute([':product_id' => $productId]);

    echo json_encode([
        'status' => 'success',
        'data' => $statement->fetchAll(PDO::FETCH_ASSOC)
    ]);
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode([
        'status' => 'error',
        'message' => 'Unable to load inventory batches.',
        'error' => $e->getMessage()
    ]);
}
?>
