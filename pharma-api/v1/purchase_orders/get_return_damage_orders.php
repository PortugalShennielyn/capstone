<?php
require_once '../../config/db_connection.php';
require_once 'purchase_order_helpers.php';
require_once '../products/product_category_schema.php';

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    http_response_code(405);
    echo json_encode(['status' => 'error', 'message' => 'Only GET requests are allowed.']);
    exit();
}

try {
    ensurePurchaseOrderSchema($pdo);
    ensureProductCategorySchema($pdo);
    $unitIdColumn = getMeasurementUnitIdColumn($pdo);

    $statement = $pdo->query(
        "SELECT
            por.return_id,
            por.created_at AS return_date,
            por.return_quantity,
            por.damage_reason,
            por.remarks,
            por.return_status,
            po.po_id,
            po.po_number,
            po.status AS purchase_order_status,
            s.supplier_name,
            COALESCE(NULLIF(poi.product_name_snapshot, ''), p.product_name) AS product_name,
            COALESCE(NULLIF(poi.brand_name_snapshot, ''), p.brand_name) AS brand_name,
            COALESCE(NULLIF(poi.category_name_snapshot, ''), pc.category_name) AS category_name,
            COALESCE(NULLIF(poi.type_name_snapshot, ''), pt.type_name) AS type_name,
            COALESCE(NULLIF(poi.generic_name_snapshot, ''), p.generic_name) AS generic_name,
            COALESCE(NULLIF(poi.strength_snapshot, ''), NULLIF(CONCAT_WS(' ', p.strength_value, p.strength_unit), ''), p.strength_size_value, p.strength_size, 'N/A') AS strength,
            p.strength_value,
            p.strength_unit,
            p.volume_value,
            p.volume_unit,
            COALESCE(NULLIF(poi.variant_flavor_snapshot, ''), p.variant_flavor, p.goods_type, 'N/A') AS variant_flavor,
            COALESCE(NULLIF(poi.size_value_snapshot, ''), p.display_size, p.size_value, p.size_weight, 'N/A') AS size_value,
            p.weight_volume_value,
            p.weight_volume_unit,
            COALESCE(NULLIF(poi.unit_snapshot, ''), p.product_unit, pmu.unit_name, p.unit, 'N/A') AS unit,
            COALESCE(NULLIF(poi.packaging_snapshot, ''), p.packaging, p.unit, 'N/A') AS packaging,
            poi.quantity AS ordered_quantity,
            CASE
                WHEN COALESCE(SUM(pori.received_quantity), 0) >= poi.quantity THEN
                    GREATEST(poi.quantity - COALESCE(SUM(pori.damaged_quantity), 0), 0)
                ELSE
                    COALESCE(SUM(pori.received_quantity), 0)
            END AS received_quantity,
            COALESCE(SUM(pori.damaged_quantity), 0) AS damaged_quantity
         FROM purchase_order_returns por
         INNER JOIN purchase_orders po ON po.po_id = por.po_id
         INNER JOIN purchase_order_items poi ON poi.po_item_id = por.po_item_id
         INNER JOIN product p ON p.product_id = poi.product_id
         INNER JOIN suppliers s ON s.supplier_id = po.supplier_id
         LEFT JOIN product_categories pc ON pc.category_id = p.category_id
         LEFT JOIN product_types pt ON pt.type_id = p.type_id
         LEFT JOIN product_measurement_units pmu ON p.measurement_unit_id = pmu.{$unitIdColumn}
         LEFT JOIN purchase_order_receiving_items pori ON pori.po_item_id = poi.po_item_id
         GROUP BY
            por.return_id,
            por.created_at,
            por.return_quantity,
            por.damage_reason,
            por.remarks,
            por.return_status,
            po.po_id,
            po.po_number,
            po.status,
            s.supplier_name,
            poi.product_name_snapshot,
            poi.brand_name_snapshot,
            poi.category_name_snapshot,
            poi.type_name_snapshot,
            poi.generic_name_snapshot,
            poi.variant_flavor_snapshot,
            poi.strength_snapshot,
            poi.size_value_snapshot,
            poi.unit_snapshot,
            poi.packaging_snapshot,
            p.strength_value,
            p.strength_unit,
            p.volume_value,
            p.volume_unit,
            p.display_size,
            p.weight_volume_value,
            p.weight_volume_unit,
            p.product_unit,
            p.product_name,
            p.brand_name,
            pc.category_name,
            pt.type_name,
            p.generic_name,
            p.strength_size_value,
            p.strength_size,
            p.variant_flavor,
            p.goods_type,
            p.size_value,
            p.size_weight,
            pmu.unit_name,
            p.packaging,
            p.unit,
            poi.quantity
         ORDER BY por.created_at DESC, por.return_id DESC"
    );
    $returns = $statement->fetchAll(PDO::FETCH_ASSOC);

    $summary = [
        'Total Return/Damage' => count($returns),
        'Expired' => 0,
        'Broken package' => 0,
        'Wrong item delivered' => 0,
        'Incorrect quantity' => 0,
        'Damaged during delivery' => 0,
        'Other' => 0
    ];

    foreach ($returns as $row) {
        if (array_key_exists($row['damage_reason'], $summary)) {
            $summary[$row['damage_reason']]++;
        }
    }

    echo json_encode([
        'status' => 'success',
        'returns' => $returns,
        'summary' => $summary
    ]);
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode(['status' => 'error', 'message' => 'Unable to load return/damage records.']);
}
?>
