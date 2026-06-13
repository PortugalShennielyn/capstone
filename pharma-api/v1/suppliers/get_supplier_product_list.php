<?php
require_once '../../config/db_connection.php';
require_once '../products/product_category_schema.php';

try {
    ensureProductCategorySchema($pdo);
    $unitIdColumn = getMeasurementUnitIdColumn($pdo);

    $statement = $pdo->query(
        "SELECT
            sp.supplier_product_id,
            sp.supplier_id,
            s.supplier_name,
            p.product_id,
            p.brand_name,
            p.product_name,
            p.category_id,
            p.type_id,
            p.measurement_unit_id,
            pc.category_name,
            pt.type_name,
            p.generic_name,
            COALESCE(p.strength_value, p.strength_size_value, p.strength_size) AS strength_size_value,
            p.strength_value,
            p.strength_unit,
            p.volume_value,
            p.volume_unit,
            COALESCE(p.variant_flavor, p.goods_type) AS variant_flavor,
            COALESCE(p.display_size, p.size_value, p.size_weight) AS size_value,
            p.display_size,
            p.weight_volume_value,
            p.weight_volume_unit,
            COALESCE(p.packaging, p.unit) AS packaging,
            pmu.unit_name AS measurement_unit_name,
            COALESCE(p.product_unit, pmu.unit_name, p.unit, 'N/A') AS product_unit,
            CASE
                WHEN COALESCE(p.strength_value, p.strength_size_value, p.strength_size) = 'N/A' THEN 'N/A'
                WHEN p.strength_unit IS NULL OR p.strength_unit = '' THEN COALESCE(p.strength_value, p.strength_size_value, p.strength_size, 'N/A')
                ELSE CONCAT(COALESCE(p.strength_value, p.strength_size_value, p.strength_size), ' ', p.strength_unit)
            END AS strength_size_display,
            p.price,
            p.image_url
         FROM supplier_products sp
         INNER JOIN suppliers s ON sp.supplier_id = s.supplier_id
         INNER JOIN product p ON sp.product_id = p.product_id
         LEFT JOIN product_categories pc ON p.category_id = pc.category_id
         LEFT JOIN product_types pt ON p.type_id = pt.type_id
         LEFT JOIN product_measurement_units pmu ON p.measurement_unit_id = pmu.{$unitIdColumn}
         ORDER BY s.supplier_name ASC, p.product_name ASC"
    );

    echo json_encode([
        'status' => 'success',
        'products' => $statement->fetchAll(PDO::FETCH_ASSOC)
    ]);
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode([
        'status' => 'error',
        'message' => 'Unable to load supplier product list.'
    ]);
}

?>
