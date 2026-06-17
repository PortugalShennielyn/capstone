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
    $unitIdColumn = getMeasurementUnitIdColumn($pdo);

    $statement = $pdo->prepare(
        "SELECT
            inv.product_id,
            inv.variation_id,
            p.product_name,
            p.brand_name,
            pc.category_name,
            pt.type_name,
            p.generic_name,
            COALESCE(NULLIF(CONCAT_WS(' ', pv.strength_value, pv.strength_unit), ''), 'N/A') AS strength,
            pv.strength_value,
            pv.strength_unit,
            pv.volume_value,
            pv.volume_unit,
            COALESCE(pv.variant_name, 'N/A') AS variant_flavor,
            COALESCE(pv.unit, pmu.unit_name, 'N/A') AS unit,
            COALESCE(pv.size_value, 'N/A') AS size,
            pv.weight_value AS weight_volume_value,
            pv.weight_unit AS weight_volume_unit,
            COALESCE(pv.packaging, 'N/A') AS packaging,
            COALESCE(inv.total_inventory_quantity, 0) AS total_inventory_quantity,
            COALESCE(inv.available_quantity, 0) AS available_quantity,
            COALESCE(sell.selling_quantity, 0) AS selling_quantity,
            COALESCE(ret.damaged_returned_quantity, 0) AS damaged_returned_quantity,
            inv.last_stock_in_date,
            inv.expiry_date
         FROM (
            SELECT
                product_id,
                variation_id,
                SUM(quantity_stocked) AS total_inventory_quantity,
                SUM(quantity_remaining) AS available_quantity,
                MAX(created_at) AS last_stock_in_date,
                MIN(CASE WHEN quantity_remaining > 0 THEN expiration_date ELSE NULL END) AS expiry_date
            FROM product_inventory
            GROUP BY product_id, variation_id
         ) inv
         INNER JOIN product p ON p.product_id = inv.product_id
         LEFT JOIN product_variations pv ON pv.variation_id = inv.variation_id
         LEFT JOIN product_categories pc ON pc.category_id = p.category_id
         LEFT JOIN product_types pt ON pt.type_id = p.type_id
         LEFT JOIN product_measurement_units pmu ON pmu.{$unitIdColumn} = p.measurement_unit_id
         LEFT JOIN (
            SELECT product_id, variation_id, SUM(quantity_remaining) AS selling_quantity
            FROM product_selling_stock
            GROUP BY product_id, variation_id
         ) sell ON sell.product_id = p.product_id AND COALESCE(sell.variation_id, 0) = COALESCE(inv.variation_id, 0)
         LEFT JOIN (
            SELECT poi.product_id, SUM(por.return_quantity) AS damaged_returned_quantity
            FROM purchase_order_returns por
            INNER JOIN purchase_order_items poi ON poi.po_item_id = por.po_item_id
            GROUP BY poi.product_id
         ) ret ON ret.product_id = p.product_id
         WHERE COALESCE(inv.total_inventory_quantity, 0) > 0
            OR COALESCE(inv.available_quantity, 0) > 0
            OR COALESCE(sell.selling_quantity, 0) > 0
            OR COALESCE(ret.damaged_returned_quantity, 0) > 0
         ORDER BY p.product_name ASC, p.brand_name ASC"
    );

    $statement->execute();

    echo json_encode([
        'status' => 'success',
        'data' => $statement->fetchAll(PDO::FETCH_ASSOC)
    ]);
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode([
        'status' => 'error',
        'message' => 'Unable to load inventory.',
        'error' => $e->getMessage()
    ]);
}
?>
