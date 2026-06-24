<?php
require_once '../../config/db_connection.php';
require_once '../products/product_category_schema.php';

try {

    $statement = $pdo->query(
        "SELECT
            sp.supplier_product_id,
            sp.supplier_id,
            sp.supplier_cost_price,
            sp.purchase_unit,
            sp.units_per_purchase_unit,
            s.supplier_name,
            p.product_id,
            p.brand_name,
            p.product_name,
            p.category_id,
            p.type_id,
            pc.category_name,
            pt.type_name,
            md.generic_name,
            md.dosage_form,
            COALESCE(md.package_type, gd.package_type) AS package_type,
            gd.variant AS variant_flavor,
            md.strength AS strength_value,
            '' AS strength_unit,
            gd.size AS size_value,
            gd.size AS display_size,
            gd.net_weight AS weight_volume_value,
            '' AS weight_volume_unit,
            '' AS product_unit,
            '' AS measurement_unit_name,
            gd.pack_content,
            gd.pack_content AS pack_content_unit,
            p.price,
            p.barcode,
            NULL AS sku,
            0 AS stock,
            md.strength AS strength_size_value,
            md.strength AS strength_size_display
         FROM supplier_products sp
         INNER JOIN suppliers s ON sp.supplier_id = s.supplier_id
         INNER JOIN product p ON sp.product_id = p.product_id
         LEFT JOIN product_categories pc ON p.category_id = pc.category_id
         LEFT JOIN product_types pt ON p.type_id = pt.type_id
         LEFT JOIN medicine_details md ON p.product_id = md.product_id
         LEFT JOIN grocery_details gd ON p.product_id = gd.product_id
         ORDER BY s.supplier_name ASC, p.product_name ASC, sp.supplier_product_id ASC"
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
