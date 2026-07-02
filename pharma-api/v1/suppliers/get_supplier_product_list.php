<?php
require_once '../../config/db_connection.php';
require_once '../../config/require_auth.php';
require_once '../products/product_category_schema.php';

try {

    $statement = $pdo->query(
        "SELECT
            sp.supplier_product_id,
            sp.supplier_id,
            sp.supplier_cost_price,
            sp.purchase_unit,
            COALESCE(sp.units_per_purchase_unit, 1) AS units_per_purchase_unit,
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
            msd.material,
            msd.sterile_status,
            COALESCE(md.package_type, gd.package_type, msd.package_type) AS package_type,
            COALESCE(md.package_type, gd.package_type, msd.package_type) AS packaging,
            COALESCE(gd.variant, msd.variant) AS variant_flavor,
            COALESCE(md.strength_value, md.strength) AS strength_value,
            md.strength_unit AS strength_unit,
            md.strength,
            md.net_content_value,
            md.net_content_unit,
            md.net_content_value AS volume_value,
            md.net_content_unit AS volume_unit,
            COALESCE(gd.size, msd.size) AS size_value,
            COALESCE(gd.size, msd.size) AS display_size,
            gd.net_weight AS weight_volume_value,
            gd.net_weight AS net_weight,
            gd.unit AS weight_volume_unit,
            gd.unit AS unit,
            CASE
                WHEN LOWER(COALESCE(md.dosage_form, '')) IN ('tablet', 'capsule', 'caplet') THEN 'pcs'
                ELSE COALESCE(md.dosage_form, '')
            END AS product_unit,
            CASE
                WHEN LOWER(COALESCE(md.dosage_form, '')) IN ('tablet', 'capsule', 'caplet') THEN 'pcs'
                ELSE COALESCE(md.dosage_form, '')
            END AS measurement_unit_name,
            COALESCE(gd.pack_content, msd.pack_content) AS pack_content,
            COALESCE(gd.pack_content, msd.pack_content) AS pack_content_unit,
            p.price,
            p.barcode,
            NULL AS sku,
            0 AS stock,
            COALESCE(md.strength_value, md.strength) AS strength_size_value,
            COALESCE(NULLIF(CONCAT_WS(' ', md.strength_value, md.strength_unit), ''), md.strength) AS strength_size_display
         FROM supplier_products sp
         INNER JOIN suppliers s ON sp.supplier_id = s.supplier_id
         INNER JOIN product p ON sp.product_id = p.product_id
         LEFT JOIN product_categories pc ON p.category_id = pc.category_id
         LEFT JOIN product_types pt ON p.type_id = pt.type_id
         LEFT JOIN medicine_details md ON p.product_id = md.product_id
         LEFT JOIN grocery_details gd ON p.product_id = gd.product_id
         LEFT JOIN medical_supply_details msd ON p.product_id = msd.product_id
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
