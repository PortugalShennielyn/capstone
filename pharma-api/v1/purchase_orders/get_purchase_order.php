<?php
require_once '../../config/db_connection.php';
require_once 'purchase_order_helpers.php';
require_once '../products/product_category_schema.php';

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    http_response_code(405);
    echo json_encode(['status' => 'error', 'message' => 'Only GET requests are allowed.']);
    exit();
}

$poId = isset($_GET['po_id']) ? (int) $_GET['po_id'] : 0;

if ($poId <= 0) {
    http_response_code(400);
    echo json_encode(['status' => 'error', 'message' => 'Purchase order id is required.']);
    exit();
}

try {
    ensurePurchaseOrderSchema($pdo);
    ensureProductCategorySchema($pdo);
    $unitIdColumn = getMeasurementUnitIdColumn($pdo);

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
            poi.variation_id,
            poi.quantity,
            COALESCE(NULLIF(poi.product_name_snapshot, ''), p.product_name) AS product_name,
            COALESCE(NULLIF(poi.brand_name_snapshot, ''), p.brand_name) AS brand_name,
            COALESCE(NULLIF(poi.category_name_snapshot, ''), pc.category_name) AS category_name,
            COALESCE(NULLIF(poi.type_name_snapshot, ''), pt.type_name) AS type_name,
            COALESCE(NULLIF(poi.generic_name_snapshot, ''), p.generic_name) AS generic_name,
            COALESCE(NULLIF(poi.strength_snapshot, ''), NULLIF(CONCAT_WS(' ', pv.strength_value, pv.strength_unit), ''), NULLIF(CONCAT_WS(' ', p.strength_value, p.strength_unit), ''), p.strength_size_value, p.strength_size, 'N/A') AS strength,
            p.strength_value,
            p.strength_unit,
            p.volume_value,
            p.volume_unit,
            COALESCE(NULLIF(poi.variant_flavor_snapshot, ''), pv.variant_name, p.variant_flavor, p.goods_type, 'N/A') AS variant_flavor,
            COALESCE(NULLIF(poi.size_value_snapshot, ''), pv.size_value, p.display_size, p.size_value, p.size_weight, 'N/A') AS size_value,
            p.weight_volume_value,
            p.weight_volume_unit,
            COALESCE(NULLIF(poi.packaging_snapshot, ''), pv.packaging, p.packaging, p.unit, 'N/A') AS packaging,
            COALESCE(NULLIF(poi.unit_snapshot, ''), pv.unit, p.product_unit, pmu.unit_name, p.unit, '') AS unit,
            COALESCE(poi.unit_price_snapshot, pv.price, p.price) AS price,
            COALESCE(SUM(pori.received_quantity), 0) AS received_quantity,
            COALESCE(SUM(pori.damaged_quantity), 0) AS damaged_quantity,
            COALESCE(returns.return_quantity, 0) AS returned_quantity,
            COALESCE(returns.return_reasons, '') AS return_reasons,
            COALESCE(returns.return_remarks, '') AS return_remarks
         FROM purchase_order_items poi
         INNER JOIN product p ON p.product_id = poi.product_id
         LEFT JOIN product_variations pv ON pv.variation_id = poi.variation_id
         LEFT JOIN product_categories pc ON pc.category_id = p.category_id
         LEFT JOIN product_types pt ON pt.type_id = p.type_id
         LEFT JOIN product_measurement_units pmu ON p.measurement_unit_id = pmu.{$unitIdColumn}
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
         GROUP BY poi.po_item_id, poi.product_id, poi.quantity, poi.product_name_snapshot, poi.brand_name_snapshot, poi.category_name_snapshot, poi.type_name_snapshot, poi.generic_name_snapshot, poi.variant_flavor_snapshot, poi.strength_snapshot, poi.size_value_snapshot, poi.unit_snapshot, poi.packaging_snapshot, poi.unit_price_snapshot, p.product_name, p.brand_name, pc.category_name, pt.type_name, p.generic_name, p.strength_value, p.strength_unit, p.volume_value, p.volume_unit, p.strength_size_value, p.strength_size, p.variant_flavor, p.goods_type, p.display_size, p.size_value, p.size_weight, p.weight_volume_value, p.weight_volume_unit, p.packaging, p.product_unit, p.unit, pmu.unit_name, p.price, returns.return_quantity, returns.return_reasons, returns.return_remarks
         ORDER BY poi.po_item_id"
    );
    $itemsStatement->execute([':po_id' => $poId]);

    $items = $itemsStatement->fetchAll(PDO::FETCH_ASSOC);
    $totalAmount = 0;
    $returnedAmount = 0;

    foreach ($items as &$item) {
        $quantity = (int) $item['quantity'];
        $price = (float) $item['price'];
        $returnedQuantity = (int) $item['returned_quantity'];
        $item['line_total'] = $quantity * $price;
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
