<?php
require_once '../../config/db_connection.php';
require_once '../products/product_category_schema.php';

$supplierId = isset($_GET['supplier_id']) ? (int) $_GET['supplier_id'] : 0;

if ($supplierId <= 0) {
    http_response_code(400);
    echo json_encode(['status' => 'error', 'message' => 'A valid supplier is required.']);
    exit();
}

try {
    ensureProductCategorySchema($pdo);

    $statement = $pdo->prepare(
        "SELECT
            p.product_id,
            pv.variation_id,
            p.product_name,
            p.brand_name,
            pv.unit,
            pv.price,
            pv.barcode AS variation_barcode,
            pv.barcode,
            pv.sku,
            pv.stock,
            p.category_id,
            p.type_id,
            pc.category_name,
            pt.type_name,
            p.generic_name,
            pv.strength_value,
            pv.strength_unit,
            pv.volume_value,
            pv.volume_unit,
            pv.variant_name AS variant_flavor,
            pv.size_value,
            pv.size_value AS display_size,
            pv.weight_value AS weight_volume_value,
            pv.weight_unit AS weight_volume_unit,
            pv.packaging,
            pv.pack_content_qty,
            pv.pack_content_unit,
            pv.unit AS product_unit,
            CONCAT_WS(' ', pv.strength_value, pv.strength_unit) AS strength_size_value,
            CONCAT_WS(' ', pv.strength_value, pv.strength_unit) AS strength_size_display
         FROM supplier_products sp
         INNER JOIN product p ON sp.product_id = p.product_id
         INNER JOIN product_variations pv ON pv.product_id = p.product_id
         LEFT JOIN product_categories pc ON p.category_id = pc.category_id
         LEFT JOIN product_types pt ON p.type_id = pt.type_id
         WHERE sp.supplier_id = :supplier_id
         ORDER BY p.product_name ASC, pv.is_default DESC, pv.variation_id ASC"
    );
    $statement->execute([':supplier_id' => $supplierId]);

    echo json_encode([
        'status' => 'success',
        'products' => $statement->fetchAll(PDO::FETCH_ASSOC)
    ]);
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode(['status' => 'error', 'message' => 'Unable to load supplier products.', 'error' => $e->getMessage()]);
}
?>
