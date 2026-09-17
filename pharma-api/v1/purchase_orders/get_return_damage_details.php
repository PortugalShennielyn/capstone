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

$returnId = cleanId($_GET['return_id'] ?? null);
if ($returnId === '') {
    http_response_code(400);
    echo json_encode(['status' => 'error', 'message' => 'Return/Damage id is required.']);
    exit();
}

try {

    $statement = $pdo->prepare(
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
            COALESCE(NULLIF(poi.strength_snapshot, ''), NULLIF(md.strength, ''), NULLIF(CONCAT_WS(' ', md.strength_value, md.strength_unit), ''), 'N/A') AS strength,
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
         LEFT JOIN (SELECT claim_id, MIN(receiving_item_id) AS receiving_item_id FROM supplier_claim_damage_lines WHERE receiving_item_id IS NOT NULL GROUP BY claim_id HAVING COUNT(DISTINCT receiving_item_id)=1) claim_receiving ON claim_receiving.claim_id = por.return_id
         LEFT JOIN purchase_order_receiving_items original_item ON original_item.receiving_item_id = claim_receiving.receiving_item_id
         LEFT JOIN purchase_order_receiving original_receiving ON original_receiving.receiving_id = original_item.receiving_id
         LEFT JOIN (SELECT cr.credit_id, cr.claim_id, cr.credit_amount, cr.credit_status, COALESCE(SUM(app.amount_applied),0) AS amount_applied FROM supplier_credits cr LEFT JOIN supplier_credit_applications app ON app.credit_id=cr.credit_id GROUP BY cr.credit_id,cr.claim_id,cr.credit_amount,cr.credit_status) credit ON credit.claim_id=por.return_id
         LEFT JOIN purchase_order_receiving_item_summary pori ON pori.po_item_id = poi.po_item_id
         WHERE por.return_id = :return_id
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

    $record = decoratePurchaseOrderReturnRecord($record);
    $legacyUnconfirmedPenny = (float) ($record['credit_amount'] ?? 0) === 0.01
        && (float) ($record['supplier_adjustment'] ?? 0) === 0.01
        && (float) ($record['credit_applied'] ?? 0) === 0.0
        && ($record['credit_status'] ?? '') === 'Available'
        && ($record['return_status'] ?? '') === 'Resolved / Credit Issued';
    if ($legacyUnconfirmedPenny) {
        $record['unconfirmed_credit_placeholder'] = true;
        $record['credit_amount'] = null;
        $record['credit_remaining'] = null;
        $record['supplier_adjustment'] = 0.0;
        $record['return_status'] = 'Awaiting Supplier Credit';
    }
    $activities = [[
        'created_at' => $record['return_date'],
        'description' => 'Issue recorded during delivery inspection.'
    ]];
    if (!empty($record['inspection_date']) && (int) ($record['accepted_quantity'] ?? 0) > 0) {
        $activities[] = [
            'created_at' => $record['inspection_date'],
            'description' => (int) $record['accepted_quantity'] . ' accepted units recorded in the original receiving event.'
        ];
    }
    $replacementActivity = $pdo->prepare(
        "SELECT receiving.received_date AS created_at,
                CONCAT(item.accepted_quantity, ' replacement units accepted', IF(item.damaged_quantity > 0, CONCAT('; ', item.damaged_quantity, ' rejected'), ''), IF(receiving.delivery_receipt_no IS NOT NULL AND receiving.delivery_receipt_no <> '', CONCAT(' (DR ', receiving.delivery_receipt_no, ')'), ''), '.') AS description
         FROM purchase_order_receiving receiving
         INNER JOIN purchase_order_receiving_items item ON item.receiving_id = receiving.receiving_id
         WHERE receiving.claim_id = :claim_id AND receiving.receiving_type = 'Replacement'
         ORDER BY receiving.received_date"
    );
    $replacementActivity->execute([':claim_id' => $returnId]);
    $activities = array_merge($activities, $replacementActivity->fetchAll(PDO::FETCH_ASSOC));
    $creditActivity = $pdo->prepare(
        "SELECT app.applied_at AS created_at, CONCAT('Supplier credit of ₱', FORMAT(app.amount_applied, 2), ' applied to ', po.po_number, '.') AS description
         FROM supplier_credit_applications app
         INNER JOIN supplier_credits credit ON credit.credit_id = app.credit_id
         INNER JOIN purchase_orders po ON po.po_id = app.po_id
         WHERE credit.claim_id = :claim_id
         ORDER BY app.applied_at"
    );
    $creditActivity->execute([':claim_id' => $returnId]);
    $activities = array_merge($activities, $creditActivity->fetchAll(PDO::FETCH_ASSOC));
    usort($activities, static fn(array $a, array $b): int => strcmp((string) ($a['created_at'] ?? ''), (string) ($b['created_at'] ?? '')));
    $record['activities'] = $activities;

    echo json_encode(['status' => 'success', 'return_damage' => $record]);
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode(['status' => 'error', 'message' => 'Unable to load return/damage details.']);
}
?>
