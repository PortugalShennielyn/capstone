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

    $status = trim((string) ($_GET['status'] ?? ''));
    $scope = trim((string) ($_GET['scope'] ?? 'active'));
    $whereClause = '';
    $params = [];

    if ($status !== '') {
        if (!in_array($status, purchaseOrderStatuses(), true)) {
            throw new InvalidArgumentException('Invalid purchase order status filter.');
        }

        $whereClause = 'WHERE po.status = :status';
        $params[':status'] = $status;
    } elseif ($scope === 'complete') {
        $whereClause = "WHERE po.status IN ('Delivered', 'Delivered with Return/Damage')";
    } elseif ($scope === 'all') {
        $whereClause = '';
    } else {
        $whereClause = "WHERE po.status IN ('Pending', 'Approved by the owner', 'In transit', 'Arrived')";
    }

    $statement = $pdo->prepare(
        "SELECT
            po.po_id,
            po.po_number,
            po.created_at AS order_date,
            po.payment_terms,
            po.payment_status,
            po.final_payment AS stored_final_payment,
            po.expected_delivery_date,
            po.status,
            receiving.received_date,
            receiving.receiving_remarks,
            s.supplier_name
         FROM purchase_orders po
         INNER JOIN suppliers s ON s.supplier_id = po.supplier_id
         LEFT JOIN (
            SELECT
                po_id,
                MAX(received_date) AS received_date,
                SUBSTRING_INDEX(GROUP_CONCAT(NULLIF(remarks, '') ORDER BY received_date DESC SEPARATOR ' | '), ' | ', 1) AS receiving_remarks
            FROM purchase_order_receiving
            GROUP BY po_id
         ) receiving ON receiving.po_id = po.po_id
         {$whereClause}
         ORDER BY po.created_at DESC, po.po_id DESC"
    );
    $statement->execute($params);
    $orders = $statement->fetchAll(PDO::FETCH_ASSOC);

    if (count($orders) > 0) {
        $poIds = array_map(static fn($order) => cleanId($order['po_id']), $orders);
        $placeholders = implode(',', array_fill(0, count($poIds), '?'));
        $itemsStatement = $pdo->prepare(
            "SELECT
                poi.po_id,
                poi.po_item_id,
                poi.product_id,
                poi.variation_id,
                poi.quantity,
                COALESCE(NULLIF(poi.product_name_snapshot, ''), p.product_name) AS product_name,
                COALESCE(NULLIF(poi.brand_name_snapshot, ''), p.brand_name) AS brand_name,
                COALESCE(NULLIF(poi.category_name_snapshot, ''), pc.category_name) AS category_name,
                COALESCE(NULLIF(poi.type_name_snapshot, ''), pt.type_name) AS type_name,
                COALESCE(NULLIF(poi.generic_name_snapshot, ''), p.generic_name) AS generic_name,
                COALESCE(NULLIF(poi.strength_snapshot, ''), NULLIF(CONCAT_WS(' ', pv.strength_value, pv.strength_unit), ''), 'N/A') AS strength,
                pv.strength_value,
                pv.strength_unit,
                pv.volume_value,
                pv.volume_unit,
                COALESCE(NULLIF(poi.variant_flavor_snapshot, ''), pv.variant_name, 'N/A') AS variant_flavor,
                COALESCE(NULLIF(poi.size_value_snapshot, ''), pv.size_value, 'N/A') AS size_value,
                pv.weight_value AS weight_volume_value,
                pv.weight_unit AS weight_volume_unit,
                COALESCE(NULLIF(poi.unit_snapshot, ''), pv.unit, pmu.unit_name, 'N/A') AS unit,
                COALESCE(NULLIF(poi.packaging_snapshot, ''), pv.packaging, 'N/A') AS packaging,
                COALESCE(poi.unit_price_snapshot, pv.price, p.price) AS price,
                COALESCE(SUM(pori.received_quantity), 0) AS received_quantity,
                COALESCE(SUM(pori.damaged_quantity), 0) AS damaged_quantity,
                COALESCE(returns.return_quantity, 0) AS returned_quantity
             FROM purchase_order_items poi
             INNER JOIN product p ON p.product_id = poi.product_id
             LEFT JOIN product_variations pv ON pv.variation_id = poi.variation_id
             LEFT JOIN product_categories pc ON pc.category_id = p.category_id
             LEFT JOIN product_types pt ON pt.type_id = p.type_id
             LEFT JOIN product_measurement_units pmu ON p.measurement_unit_id = pmu." . getMeasurementUnitIdColumn($pdo) . "
             LEFT JOIN purchase_order_receiving_items pori ON pori.po_item_id = poi.po_item_id
             LEFT JOIN (
                SELECT po_item_id, SUM(return_quantity) AS return_quantity
                FROM purchase_order_returns
                GROUP BY po_item_id
             ) returns ON returns.po_item_id = poi.po_item_id
             WHERE poi.po_id IN ({$placeholders})
             GROUP BY poi.po_id, poi.po_item_id, poi.product_id, poi.quantity, poi.product_name_snapshot, poi.brand_name_snapshot, poi.category_name_snapshot, poi.type_name_snapshot, poi.generic_name_snapshot, poi.variant_flavor_snapshot, poi.strength_snapshot, poi.size_value_snapshot, poi.unit_snapshot, poi.packaging_snapshot, poi.unit_price_snapshot, p.product_name, p.brand_name, pc.category_name, pt.type_name, p.generic_name, pv.strength_value, pv.strength_unit, pv.volume_value, pv.volume_unit, pv.variant_name, pv.size_value, pv.weight_value, pv.weight_unit, pv.unit, pv.packaging, pmu.unit_name, p.price, returns.return_quantity
             ORDER BY poi.po_id, poi.po_item_id"
        );
        $itemsStatement->execute($poIds);

        $itemsByPo = [];
        foreach ($itemsStatement->fetchAll(PDO::FETCH_ASSOC) as $item) {
            $quantity = (int) $item['quantity'];
            $price = (float) $item['price'];
            $returnedQuantity = (int) $item['returned_quantity'];
            $item['line_total'] = $quantity * $price;
            $item['returned_amount'] = $returnedQuantity * $price;
            $itemsByPo[cleanId($item['po_id'])][] = $item;
        }

        foreach ($orders as &$order) {
            $orderItems = $itemsByPo[cleanId($order['po_id'])] ?? [];
            $totalAmount = 0;
            $returnedAmount = 0;
            $totalQuantity = 0;

            foreach ($orderItems as $item) {
                $totalAmount += (float) $item['line_total'];
                $returnedAmount += (float) $item['returned_amount'];
                $totalQuantity += (int) $item['quantity'];
            }

            $order['items'] = $orderItems;
            $order['total_quantity'] = $totalQuantity;
            $order['total_amount'] = $totalAmount;
            $order['returned_amount'] = $returnedAmount;
            $storedFinalPayment = (float) ($order['stored_final_payment'] ?? 0);
            $order['final_payment'] = $storedFinalPayment > 0 ? $storedFinalPayment : max(0, $totalAmount - $returnedAmount);
            $order['payment_state'] = $order['payment_status'] ?: ($returnedAmount > 0 ? 'Adjusted' : 'Unpaid');
            $order['item_names'] = array_map(static fn($item) => $item['product_name'], $orderItems);
            $order['brand_names'] = array_map(static fn($item) => $item['brand_name'], $orderItems);
            $order['quantities'] = array_map(static fn($item) => (int) $item['quantity'], $orderItems);
        }
        unset($order);
    }

    $counts = array_fill_keys(purchaseOrderStatuses(), 0);
    $countStatement = $pdo->query('SELECT status, COUNT(*) AS total FROM purchase_orders GROUP BY status');
    foreach ($countStatement->fetchAll(PDO::FETCH_ASSOC) as $row) {
        if (array_key_exists($row['status'], $counts)) {
            $counts[$row['status']] = (int) $row['total'];
        }
    }
    $returnDamageStatement = $pdo->query('SELECT COUNT(DISTINCT po_id) FROM purchase_order_returns');
    $returnDamageCount = max(
        (int) ($counts['Delivered with Return/Damage'] ?? 0),
        (int) $returnDamageStatement->fetchColumn()
    );
    $counts['Return/Damage'] = $returnDamageCount;
    $counts['Delivered'] = (int) ($counts['Delivered'] ?? 0) + (int) ($counts['Delivered with Return/Damage'] ?? 0);

    echo json_encode([
        'status' => 'success',
        'purchase_orders' => $orders,
        'status_counts' => $counts
    ]);
} catch (InvalidArgumentException $e) {
    http_response_code(400);
    echo json_encode(['status' => 'error', 'message' => $e->getMessage()]);
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode(['status' => 'error', 'message' => 'Unable to load purchase orders.']);
}
?>
