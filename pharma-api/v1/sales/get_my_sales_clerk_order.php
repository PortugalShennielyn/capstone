<?php
require_once '../../config/db_connection.php';

$allowedRoles = ['salesclerk', 'Sales Clerk', 'ro-sales-clerk', 'ro_sales_clerk', 'admin', 'Admin', 'ro-admin'];
require_once '../../config/require_auth.php';
require_once 'sales_helpers.php';
require_once 'sales_pos_helpers.php';

try {
    $orderId = (int) ($_GET['order_id'] ?? 0);
    if ($orderId <= 0) {
        http_response_code(400);
        echo json_encode(['status' => 'error', 'message' => 'Missing order_id.']);
        exit();
    }

    $stmt = $pdo->prepare(
        "SELECT
            o.order_id,
            o.order_no,
            COALESCE(NULLIF(o.customer_name, ''), 'Walk-in Customer') AS customer_name,
            COALESCE(NULLIF(sc.full_name, ''), sc.username, 'Sales Clerk') AS sales_clerk_name,
            COALESCE(NULLIF(ca.full_name, ''), ca.username, '') AS cashier_name,
            o.subtotal,
            o.discount,
            o.vat,
            o.total_amount,
            o.status,
            o.created_at,
            o.updated_at,
            o.sent_to_cashier_at,
            o.cashier_accepted_at,
            o.completed_at,
            o.cancelled_at
         FROM sales_orders o
         LEFT JOIN users sc ON sc.user_id = o.sales_clerk_id
         LEFT JOIN users ca ON ca.user_id = o.assigned_cashier_id
         WHERE o.order_id = :order_id
           AND o.sales_clerk_id = :sales_clerk_id
         LIMIT 1"
    );
    $stmt->execute([
        ':order_id' => $orderId,
        ':sales_clerk_id' => salesCurrentUserId(),
    ]);
    $order = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$order) {
        http_response_code(404);
        echo json_encode(['status' => 'error', 'message' => 'Order not found.']);
        exit();
    }

    $itemsStmt = $pdo->prepare(
        "SELECT
            i.brand_name,
            i.product_name,
            i.specification,
            i.quantity,
            i.unit_price,
            i.line_total,
            md.generic_name,
            classification_values.medicine_classification,
            classification_values.medicine_classification_badge,
            COALESCE(NULLIF(md.strength, ''), TRIM(CONCAT(COALESCE(md.strength_value, ''), CASE WHEN md.strength_unit IS NULL OR md.strength_unit = '' THEN '' ELSE CONCAT(' ', md.strength_unit) END))) AS medicine_strength,
            md.dosage_form
         FROM sales_order_items i
         LEFT JOIN medicine_details md ON md.product_id = i.product_id
         LEFT JOIN (
            SELECT psv.product_id,
                   psv.value_text AS medicine_classification,
                   CASE WHEN LOWER(TRIM(psv.value_text)) = 'prescription (rx)' THEN 'Rx' ELSE NULL END AS medicine_classification_badge
            FROM product_specification_values psv
            INNER JOIN product_specifications ps ON ps.specification_id = psv.specification_id
            WHERE LOWER(TRIM(ps.specification_name)) = 'medicine classification'
         ) classification_values ON classification_values.product_id = i.product_id
         WHERE i.order_id = :order_id
         ORDER BY i.order_item_id ASC"
    );
    $itemsStmt->execute([':order_id' => $orderId]);
    $items = array_map(static function (array $item): array {
        return [
            'brand_name' => salesDisplayValue($item['brand_name'], '-'),
            'product_name' => salesDisplayValue($item['product_name'], '-'),
            'specification' => salesDisplayValue($item['specification'], '-'),
            'generic_name' => salesDisplayValue($item['generic_name']),
            'medicine_classification' => salesDisplayValue($item['medicine_classification']),
            'medicine_classification_badge' => salesDisplayValue($item['medicine_classification_badge']),
            'strength' => salesDisplayValue($item['medicine_strength']),
            'dosage_form' => salesDisplayValue($item['dosage_form']),
            'quantity' => (int) ($item['quantity'] ?? 0),
            'unit_price' => salesMoneyValue($item['unit_price'] ?? 0),
            'line_total' => salesMoneyValue($item['line_total'] ?? 0),
        ];
    }, $itemsStmt->fetchAll(PDO::FETCH_ASSOC));

    $historyStmt = $pdo->prepare(
        "SELECT
            h.old_status,
            h.new_status,
            h.remarks,
            h.changed_at,
            COALESCE(NULLIF(u.full_name, ''), u.username, '') AS changed_by_name
         FROM sales_order_status_history h
         LEFT JOIN users u ON u.user_id = h.changed_by
         WHERE h.order_id = :order_id
         ORDER BY h.changed_at ASC, h.history_id ASC"
    );
    $historyStmt->execute([':order_id' => $orderId]);
    $history = array_map(static function (array $row): array {
        return [
            'old_status' => $row['old_status'],
            'new_status' => (string) $row['new_status'],
            'label' => salesClerkStatusLabel((string) $row['new_status']),
            'remarks' => salesDisplayValue($row['remarks']),
            'changed_by_name' => salesDisplayValue($row['changed_by_name']),
            'changed_at' => $row['changed_at'],
        ];
    }, $historyStmt->fetchAll(PDO::FETCH_ASSOC));

    $receiptStmt = $pdo->prepare(
        "SELECT receipt_no, payment_method, printed_at, created_at
         FROM sales_receipts
         WHERE order_id = :order_id
         LIMIT 1"
    );
    $receiptStmt->execute([':order_id' => $orderId]);
    $receipt = $receiptStmt->fetch(PDO::FETCH_ASSOC) ?: null;

    echo json_encode([
        'status' => 'success',
        'data' => [
            'order_id' => (string) $order['order_id'],
            'order_no' => salesDisplayValue($order['order_no'], (string) $order['order_id']),
            'customer_name' => salesDisplayValue($order['customer_name'], 'Walk-in Customer'),
            'sales_clerk_name' => salesDisplayValue($order['sales_clerk_name'], 'Sales Clerk'),
            'cashier_name' => salesDisplayValue($order['cashier_name']),
            'subtotal' => salesMoneyValue($order['subtotal'] ?? 0),
            'discount' => salesMoneyValue($order['discount'] ?? 0),
            'vat' => salesMoneyValue($order['vat'] ?? 0),
            'total_amount' => salesMoneyValue($order['total_amount'] ?? 0),
            'total_items' => count($items),
            'total_quantity' => array_sum(array_map(static fn($item) => (int) $item['quantity'], $items)),
            'status_code' => salesClerkStatusGroup((string) ($order['status'] ?? '')),
            'raw_status_code' => (string) ($order['status'] ?? ''),
            'status' => salesClerkStatusLabel((string) ($order['status'] ?? '')),
            'created_at' => $order['created_at'],
            'updated_at' => $order['updated_at'],
            'sent_to_cashier_at' => $order['sent_to_cashier_at'],
            'cashier_accepted_at' => $order['cashier_accepted_at'],
            'completed_at' => $order['completed_at'],
            'cancelled_at' => $order['cancelled_at'],
            'items' => $items,
            'history' => $history,
            'receipt' => $receipt,
        ],
    ]);
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode([
        'status' => 'error',
        'message' => 'Unable to load your order details.',
        'error' => $e->getMessage(),
    ]);
}

?>
