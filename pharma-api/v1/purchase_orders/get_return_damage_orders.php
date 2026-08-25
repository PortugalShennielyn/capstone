<?php
$allowedRoles = ['super_admin', 'admin', 'manager', 'supervisor', 'Admin', 'ro-super-admin', 'ro-admin', 'ro-manager', 'ro-supervisor'];
require_once '../../config/db_connection.php';
require_once '../../config/require_auth.php';
require_once 'purchase_order_helpers.php';
require_once '../products/product_category_schema.php';

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    http_response_code(405);
    echo json_encode(['status' => 'error', 'message' => 'Only GET requests are allowed.']);
    exit();
}

try {

    $statement = $pdo->query(
        "SELECT
            por.return_id,
            por.created_at AS return_date,
            por.return_quantity,
            por.affected_quantity,
            por.affected_base_quantity,
            por.affected_unit_name,
            por.unit_conversion_id,
            por.inventory_batch_id,
            por.damage_reason,
            por.disposition,
            por.resolution_type,
            por.remarks,
            por.return_status,
            original_receiving.receiving_id,
            original_item.receiving_item_id,
            original_receiving.delivery_receipt_no,
            original_receiving.received_date AS inspection_date,
            original_item.accepted_quantity,
            credit.credit_id,
            credit.credit_amount,
            credit.credit_status,
            credit.amount_applied AS credit_applied,
            GREATEST(0, COALESCE(credit.credit_amount, 0) - COALESCE(credit.amount_applied, 0)) AS credit_remaining,
            po.po_id,
            po.po_number,
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
            COALESCE(original_item.received_quantity, SUM(pori.received_quantity), 0) AS received_quantity,
            COALESCE(original_item.damaged_quantity, SUM(pori.damaged_quantity), 0) AS damaged_quantity
         FROM supplier_claim_legacy_projection por
         INNER JOIN purchase_orders po ON po.po_id = por.po_id
         INNER JOIN purchase_order_items poi ON poi.po_item_id = por.po_item_id
         INNER JOIN product p ON p.product_id = poi.product_id
         INNER JOIN suppliers s ON s.supplier_id = po.supplier_id
         LEFT JOIN product_categories pc ON pc.category_id = p.category_id
         LEFT JOIN product_types pt ON pt.type_id = p.type_id
         LEFT JOIN medicine_details md ON md.product_id = p.product_id
         LEFT JOIN grocery_details gd ON gd.product_id = p.product_id
         LEFT JOIN (SELECT claim_id, MIN(receiving_item_id) AS receiving_item_id FROM supplier_claim_damage_lines WHERE receiving_item_id IS NOT NULL GROUP BY claim_id) claim_receiving ON claim_receiving.claim_id = por.return_id
         LEFT JOIN purchase_order_receiving_items original_item ON original_item.receiving_item_id = claim_receiving.receiving_item_id
         LEFT JOIN purchase_order_receiving original_receiving ON original_receiving.receiving_id = original_item.receiving_id
         LEFT JOIN (SELECT cr.credit_id, cr.claim_id, cr.credit_amount, cr.credit_status, COALESCE(SUM(app.amount_applied),0) AS amount_applied FROM supplier_credits cr LEFT JOIN supplier_credit_applications app ON app.credit_id=cr.credit_id GROUP BY cr.credit_id,cr.claim_id,cr.credit_amount,cr.credit_status) credit ON credit.claim_id=por.return_id
         LEFT JOIN purchase_order_receiving_item_summary pori ON pori.po_item_id = poi.po_item_id
         GROUP BY
            por.return_id,
            por.created_at,
            por.return_quantity,
            por.affected_quantity,
            por.affected_base_quantity,
            por.affected_unit_name,
            por.unit_conversion_id,
            por.inventory_batch_id,
            por.damage_reason,
            por.disposition,
            por.resolution_type,
            por.remarks,
            por.return_status,
            original_receiving.receiving_id,
            original_item.receiving_item_id,
            original_receiving.delivery_receipt_no,
            original_receiving.received_date,
            original_item.accepted_quantity,
            original_item.received_quantity,
            original_item.damaged_quantity,
            credit.credit_id,
            credit.credit_amount,
            credit.credit_status,
            credit.amount_applied,
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
         ORDER BY por.created_at DESC, por.return_id DESC"
    );
    $returns = array_map('decoratePurchaseOrderReturnRecord', $statement->fetchAll(PDO::FETCH_ASSOC));

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
