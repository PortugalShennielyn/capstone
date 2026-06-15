<?php
require_once '../../config/db_connection.php';
require_once '../products/product_category_schema.php';

try {
    ensureProductCategorySchema($pdo);

    $statement = $pdo->query(
        "SELECT
            sp.supplier_product_id,
            sp.supplier_id,
            s.supplier_name,
            p.product_id,
            pv.variation_id,
            p.brand_name,
            p.product_name,
            p.category_id,
            p.type_id,
            pc.category_name,
            pt.type_name,
            p.generic_name,
            pv.variant_name AS variant_flavor,
            pv.strength_value,
            pv.strength_unit,
            pv.volume_value,
            pv.volume_unit,
            pv.size_value,
            pv.size_value AS display_size,
            pv.weight_value AS weight_volume_value,
            pv.weight_unit AS weight_volume_unit,
            pv.unit AS product_unit,
            pv.unit AS measurement_unit_name,
            pv.packaging,
            pv.pack_content_qty,
            pv.pack_content_unit,
            pv.price,
            pv.barcode,
            pv.sku,
            pv.stock,
            CONCAT_WS(' ', pv.strength_value, pv.strength_unit) AS strength_size_value,
            CONCAT_WS(' ', pv.strength_value, pv.strength_unit) AS strength_size_display,
            p.image_url
         FROM supplier_products sp
         INNER JOIN suppliers s ON sp.supplier_id = s.supplier_id
         INNER JOIN product p ON sp.product_id = p.product_id
         INNER JOIN product_variations pv ON pv.product_id = p.product_id
         LEFT JOIN product_categories pc ON p.category_id = pc.category_id
         LEFT JOIN product_types pt ON p.type_id = pt.type_id
         ORDER BY s.supplier_name ASC, p.product_name ASC, pv.is_default DESC, pv.variation_id ASC"
    );

    echo json_encode([
        'status' => 'success',
        'products' => $statement->fetchAll(PDO::FETCH_ASSOC)
    ]);
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode([
        'status' => 'error',
        'message' => 'Unable to load supplier product list.',
        'error' => $e->getMessage()
    ]);
}

?>
