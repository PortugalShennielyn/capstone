<?php
require_once '../../config/db_connection.php';
require_once '../../config/require_auth.php';
require_once 'purchase_order_helpers.php';
require_once '../products/product_category_schema.php';

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    http_response_code(405);
    echo json_encode(['status' => 'error', 'message' => 'Only GET requests are allowed.']);
    exit();
}

$returnId = cleanId($_GET['return_id'] ?? null);
if ($returnId === '') {
    http_response_code(400);
    echo json_encode(['status' => 'error', 'message' => 'Return/Damage id is required.']);
    exit();
}

try {
    ensurePurchaseOrderSchema($pdo);
    ensureProductCategorySchema($pdo);

    $statement = $pdo->prepare(
        "SELECT
            por.return_id,
            por.created_at AS return_date,
            por.return_quantity,
            por.damage_reason,
            por.remarks,
            por.return_status,
            po.po_id,
            po.po_number,
            po.created_at AS order_date,
            po.payment_terms,
            po.expected_delivery_date,
            po.status AS purchase_order_status,
            s.supplier_name,
            COALESCE(NULLIF(poi.product_name_snapshot, ''), p.product_name) AS product_name,
            COALESCE(NULLIF(poi.brand_name_snapshot, ''), p.brand_name) AS brand_name,
            COALESCE(NULLIF(poi.category_name_snapshot, ''), pc.category_name) AS category_name,
            COALESCE(NULLIF(poi.type_name_snapshot, ''), pt.type_name) AS type_name,
            COALESCE(NULLIF(poi.generic_name_snapshot, ''), md.generic_name) AS generic_name,
            COALESCE(NULLIF(poi.strength_snapshot, ''), NULLIF(CONCAT_WS(' ', md.strength_value, md.strength_unit), ''), md.strength, 'N/A') AS strength,
            COALESCE(md.strength_value, md.strength) AS strength_value,
            md.strength_unit AS strength_unit,
            md.net_content_value,
            md.net_content_unit,
            md.net_content_value AS volume_value,
            md.net_content_unit AS volume_unit,
            COALESCE(NULLIF(poi.variant_flavor_snapshot, ''), gd.variant, 'N/A') AS variant_flavor,
            COALESCE(NULLIF(poi.size_value_snapshot, ''), gd.size, 'N/A') AS size_value,
            gd.net_weight AS weight_volume_value,
            gd.unit AS weight_volume_unit,
            COALESCE(NULLIF(poi.unit_snapshot, ''), md.package_type, gd.package_type, 'N/A') AS unit,
            COALESCE(NULLIF(poi.packaging_snapshot, ''), md.package_type, gd.package_type, 'N/A') AS packaging,
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
         LEFT JOIN medicine_details md ON md.product_id = p.product_id
         LEFT JOIN grocery_details gd ON gd.product_id = p.product_id
         LEFT JOIN purchase_order_receiving_items pori ON pori.po_item_id = poi.po_item_id
         WHERE por.return_id = :return_id
         GROUP BY
            por.return_id,
            por.created_at,
            por.return_quantity,
            por.damage_reason,
            por.remarks,
            por.return_status,
            po.po_id,
            po.po_number,
            po.created_at,
            po.payment_terms,
            po.expected_delivery_date,
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
            p.product_name,
            p.brand_name,
            pc.category_name,
            pt.type_name,
            md.generic_name,
            md.strength,
            md.strength_value,
            md.strength_unit,
            md.net_content_value,
            md.net_content_unit,
            md.dosage_form,
            md.package_type,
            gd.variant,
            gd.size,
            gd.net_weight,
            gd.unit,
            gd.package_type,
            poi.quantity
         LIMIT 1"
    );
    $statement->execute([':return_id' => $returnId]);
    $record = $statement->fetch(PDO::FETCH_ASSOC);

    if (!$record) {
        http_response_code(404);
        echo json_encode(['status' => 'error', 'message' => 'Return/Damage record not found.']);
        exit();
    }

    echo json_encode(['status' => 'success', 'return_damage' => $record]);
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode(['status' => 'error', 'message' => 'Unable to load return/damage details.']);
}
?>
