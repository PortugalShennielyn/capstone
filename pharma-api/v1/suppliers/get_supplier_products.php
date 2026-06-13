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
    $unitIdColumn = getMeasurementUnitIdColumn($pdo);

    $statement = $pdo->prepare(
        "SELECT
            p.product_id,
            pv.variation_id,
            p.product_name,
            p.brand_name,
            COALESCE(pv.unit, p.product_unit, pmu.unit_name, p.unit, '') AS unit,
            COALESCE(pv.price, p.price) AS price,
            pv.barcode AS variation_barcode,
            p.category_id,
            p.type_id,
            p.measurement_unit_id,
            pc.category_name,
            pt.type_name,
            pmu.unit_name AS measurement_unit_name,
            COALESCE(pv.unit, p.product_unit, pmu.unit_name, p.unit, 'N/A') AS product_unit,
            p.generic_name,
            COALESCE(pv.strength_value, p.strength_value, p.strength_size_value, p.strength_size) AS strength_size_value,
            COALESCE(pv.strength_value, p.strength_value) AS strength_value,
            COALESCE(pv.strength_unit, p.strength_unit) AS strength_unit,
            COALESCE(pv.volume_value, p.volume_value) AS volume_value,
            COALESCE(pv.volume_unit, p.volume_unit) AS volume_unit,
            COALESCE(pv.variant_name, p.variant_flavor, p.goods_type) AS variant_flavor,
            COALESCE(pv.size_value, p.display_size, p.size_value, p.size_weight) AS size_value,
            COALESCE(pv.size_value, p.display_size) AS display_size,
            COALESCE(pv.weight_value, p.weight_volume_value) AS weight_volume_value,
            COALESCE(pv.weight_unit, p.weight_volume_unit) AS weight_volume_unit,
            COALESCE(pv.packaging, p.packaging, p.unit) AS packaging,
            CASE
                WHEN COALESCE(pv.strength_value, p.strength_value, p.strength_size_value, p.strength_size) = 'N/A' THEN 'N/A'
                WHEN COALESCE(pv.strength_unit, p.strength_unit) IS NULL OR COALESCE(pv.strength_unit, p.strength_unit) = '' THEN COALESCE(pv.strength_value, p.strength_value, p.strength_size_value, p.strength_size, 'N/A')
                ELSE CONCAT(COALESCE(pv.strength_value, p.strength_value, p.strength_size_value, p.strength_size), ' ', COALESCE(pv.strength_unit, p.strength_unit))
            END AS strength_size_display
         FROM supplier_products sp
         INNER JOIN product p ON sp.product_id = p.product_id
         INNER JOIN product_variations pv ON pv.product_id = p.product_id
         LEFT JOIN product_categories pc ON p.category_id = pc.category_id
         LEFT JOIN product_types pt ON p.type_id = pt.type_id
         LEFT JOIN product_measurement_units pmu ON p.measurement_unit_id = pmu.{$unitIdColumn}
         WHERE sp.supplier_id = :supplier_id
         ORDER BY p.product_name ASC, pv.variation_id ASC"
    );
    $statement->execute([':supplier_id' => $supplierId]);

    echo json_encode([
        'status' => 'success',
        'products' => $statement->fetchAll(PDO::FETCH_ASSOC)
    ]);
} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode(['status' => 'error', 'message' => 'Unable to load supplier products.']);
}
?>
