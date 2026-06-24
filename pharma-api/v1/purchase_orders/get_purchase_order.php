<?php
require_once '../../config/db_connection.php';
require_once 'purchase_order_helpers.php';
require_once '../products/product_category_schema.php';

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    http_response_code(405);
    echo json_encode(['status' => 'error', 'message' => 'Only GET requests are allowed.']);
    exit();
}

$poId = cleanId($_GET['po_id'] ?? null);

if ($poId === '') {
    http_response_code(400);
    echo json_encode(['status' => 'error', 'message' => 'Purchase order id is required.']);
    exit();
}

try {

    $orderStatement = $pdo->prepare(
        "SELECT
            po.po_id,
            po.po_number,
            po.supplier_id,
            po.created_at AS order_date,
            po.payment_terms,
            po.payment_status,
            po.final_payment AS stored_final_payment,
            po.expected_delivery_date,
            po.status,
            s.supplier_name
         FROM purchase_orders po
         INNER JOIN suppliers s ON s.supplier_id = po.supplier_id
         WHERE po.po_id = :po_id
         LIMIT 1"
    );
    $orderStatement->execute([':po_id' => $poId]);
    $order = $orderStatement->fetch(PDO::FETCH_ASSOC);

    if (!$order) {
        http_response_code(404);
        echo json_encode(['status' => 'error', 'message' => 'Purchase order not found.']);
        exit();
    }

    $itemsStatement = $pdo->prepare(
        "SELECT
            poi.po_item_id,
            poi.product_id,
            poi.quantity,
            poi.purchase_qty,
            CASE
                WHEN LOWER(TRIM(COALESCE(poi.purchase_unit_snapshot, ''))) LIKE 'by %' THEN TRIM(SUBSTRING(TRIM(poi.purchase_unit_snapshot), 4))
                ELSE COALESCE(NULLIF(TRIM(poi.purchase_unit_snapshot), ''), 'pcs')
            END AS purchase_unit,
            COALESCE(poi.units_per_purchase_unit_snapshot, 1) AS units_per_purchase_unit,
            COALESCE(NULLIF(poi.inventory_qty_ordered, 0), poi.quantity) AS inventory_qty_ordered,
            COALESCE(NULLIF(poi.line_total, 0), COALESCE(NULLIF(poi.inventory_qty_ordered, 0), poi.quantity) * COALESCE(poi.unit_price_snapshot, p.price, 0)) AS stored_line_total,
            CASE
                WHEN NULLIF(TRIM(poi.product_name_snapshot), '') IS NULL OR UPPER(TRIM(poi.product_name_snapshot)) LIKE 'N/A%' THEN p.product_name
                ELSE poi.product_name_snapshot
            END AS product_name,
            CASE
                WHEN NULLIF(TRIM(poi.brand_name_snapshot), '') IS NULL OR UPPER(TRIM(poi.brand_name_snapshot)) LIKE 'N/A%' THEN p.brand_name
                ELSE poi.brand_name_snapshot
            END AS brand_name,
            COALESCE(NULLIF(poi.category_name_snapshot, ''), pc.category_name) AS category_name,
            COALESCE(NULLIF(poi.type_name_snapshot, ''), pt.type_name) AS type_name,
            COALESCE(NULLIF(poi.generic_name_snapshot, ''), md.generic_name) AS generic_name,
            COALESCE(NULLIF(poi.strength_snapshot, ''), md.strength, '') AS strength,
            md.strength AS strength_value,
            '' AS strength_unit,
            md.dosage_form AS dosage_form,
            md.dosage_form AS volume_value,
            '' AS volume_unit,
            COALESCE(NULLIF(poi.variant_flavor_snapshot, ''), gd.variant, '') AS variant_flavor,
            COALESCE(NULLIF(poi.size_value_snapshot, ''), gd.size, '') AS size_value,
            gd.net_weight AS weight_volume_value,
            '' AS weight_volume_unit,
            COALESCE(NULLIF(poi.packaging_snapshot, ''), md.package_type, gd.package_type, '') AS packaging,
            CASE
                WHEN NULLIF(poi.unit_snapshot, '') IS NOT NULL AND UPPER(TRIM(poi.unit_snapshot)) NOT LIKE 'N/A%' THEN poi.unit_snapshot
                WHEN LOWER(COALESCE(md.dosage_form, '')) IN ('tablet', 'capsule', 'caplet') THEN 'pcs'
                ELSE COALESCE(md.dosage_form, '')
            END AS unit,
            COALESCE(poi.unit_price_snapshot, p.price) AS price,
            COALESCE(SUM(pori.received_quantity), 0) AS received_quantity,
            COALESCE(SUM(pori.damaged_quantity), 0) AS damaged_quantity,
            COALESCE(returns.return_quantity, 0) AS returned_quantity,
            COALESCE(returns.return_reasons, '') AS return_reasons,
            COALESCE(returns.return_remarks, '') AS return_remarks
         FROM purchase_order_items poi
         INNER JOIN product p ON p.product_id = poi.product_id
         LEFT JOIN product_categories pc ON pc.category_id = p.category_id
         LEFT JOIN product_types pt ON pt.type_id = p.type_id
         LEFT JOIN medicine_details md ON md.product_id = p.product_id
         LEFT JOIN grocery_details gd ON gd.product_id = p.product_id
         LEFT JOIN purchase_order_receiving_items pori ON pori.po_item_id = poi.po_item_id
         LEFT JOIN (
            SELECT
                po_item_id,
                SUM(return_quantity) AS return_quantity,
                GROUP_CONCAT(damage_reason ORDER BY return_id SEPARATOR ', ') AS return_reasons,
                GROUP_CONCAT(NULLIF(remarks, '') ORDER BY return_id SEPARATOR '; ') AS return_remarks
            FROM purchase_order_returns
            GROUP BY po_item_id
         ) returns ON returns.po_item_id = poi.po_item_id
         WHERE poi.po_id = :po_id
         GROUP BY poi.po_item_id, poi.product_id, poi.quantity, poi.purchase_qty, poi.purchase_unit_snapshot, poi.units_per_purchase_unit_snapshot, poi.inventory_qty_ordered, poi.line_total, poi.product_name_snapshot, poi.brand_name_snapshot, poi.category_name_snapshot, poi.type_name_snapshot, poi.generic_name_snapshot, poi.variant_flavor_snapshot, poi.strength_snapshot, poi.size_value_snapshot, poi.unit_snapshot, poi.packaging_snapshot, poi.unit_price_snapshot, p.product_name, p.brand_name, pc.category_name, pt.type_name, md.generic_name, md.strength, md.dosage_form, md.package_type, gd.variant, gd.size, gd.net_weight, gd.package_type, p.price, returns.return_quantity, returns.return_reasons, returns.return_remarks
         ORDER BY poi.po_item_id"
    );
    $itemsStatement->execute([':po_id' => $poId]);

    $items = $itemsStatement->fetchAll(PDO::FETCH_ASSOC);
    $totalAmount = 0;
    $returnedAmount = 0;

    foreach ($items as &$item) {
        $quantity = (int) ($item['inventory_qty_ordered'] ?: $item['quantity']);
        $price = (float) $item['price'];
        $returnedQuantity = (int) $item['returned_quantity'];
        $item['line_total'] = (float) ($item['stored_line_total'] ?: ($quantity * $price));
        $item['returned_amount'] = $returnedQuantity * $price;
        $totalAmount += (float) $item['line_total'];
        $returnedAmount += (float) $item['returned_amount'];
    }
    unset($item);

    $order['items'] = $items;
    $order['total_amount'] = $totalAmount;
    $order['returned_amount'] = $returnedAmount;
    $storedFinalPayment = (float) ($order['stored_final_payment'] ?? 0);
    $order['final_payment'] = $storedFinalPayment > 0 ? $storedFinalPayment : max(0, $totalAmount - $returnedAmount);
    $order['payment_state'] = $order['payment_status'] ?: ($returnedAmount > 0 ? 'Adjusted' : 'Unpaid');

    echo json_encode(['status' => 'success', 'purchase_order' => $order]);
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode(['status' => 'error', 'message' => 'Unable to load purchase order details.']);
}
?>
