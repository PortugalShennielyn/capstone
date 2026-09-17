<?php
require_once '../../config/db_connection.php';
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
            COALESCE(NULLIF(sc.full_name, ''), sc.username, 'Unassigned') AS sales_clerk_name,
            COALESCE(NULLIF(ca.full_name, ''), ca.username, '') AS cashier_name,
            o.total_amount,
            o.status,
            o.created_at,
            o.sent_to_cashier_at
         FROM sales_orders o
         LEFT JOIN users sc ON sc.user_id = o.sales_clerk_id
         LEFT JOIN users ca ON ca.user_id = o.assigned_cashier_id
         WHERE o.order_id = :order_id
         LIMIT 1"
    );
    $stmt->execute([':order_id' => $orderId]);
    $order = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$order) {
        http_response_code(404);
        echo json_encode(['status' => 'error', 'message' => 'Order not found.']);
        exit();
    }

    $itemsStmt = $pdo->prepare(
        "SELECT
            brand_name,
            product_name,
            specification,
            quantity,
            unit_price,
            line_total
         FROM sales_order_items
         WHERE order_id = :order_id
         ORDER BY order_item_id ASC"
    );
    $itemsStmt->execute([':order_id' => $orderId]);
    $items = array_map(static function (array $item): array {
        return [
            'brand_name' => salesDisplayValue($item['brand_name'], '-'),
            'product_name' => salesDisplayValue($item['product_name'], '-'),
            'variant_description' => salesDisplayValue($item['specification'], '-'),
            'quantity' => (int) ($item['quantity'] ?? 0),
            'price' => salesMoneyValue($item['unit_price'] ?? 0),
            'subtotal' => salesMoneyValue($item['line_total'] ?? 0),
        ];
    }, $itemsStmt->fetchAll(PDO::FETCH_ASSOC));

    echo json_encode([
        'status' => 'success',
        'data' => [
            'order_id' => (string) $order['order_id'],
            'order_no' => salesDisplayValue($order['order_no'], (string) $order['order_id']),
            'customer_name' => salesDisplayValue($order['customer_name'], 'Walk-in Customer'),
            'sales_clerk_name' => salesDisplayValue($order['sales_clerk_name'], 'Unassigned'),
            'cashier_name' => salesDisplayValue($order['cashier_name']),
            'total_items' => array_sum(array_map(static fn($item) => (int) $item['quantity'], $items)),
            'total_amount' => salesMoneyValue($order['total_amount'] ?? 0),
            'status' => salesStatusLabel((string) ($order['status'] ?? 'waiting_cashier')),
            'status_code' => (string) ($order['status'] ?? ''),
            'created_at' => $order['created_at'],
            'sent_to_cashier_at' => $order['sent_to_cashier_at'],
            'notes' => '',
            'items' => $items,
        ],
    ]);
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode([
        'status' => 'error',
        'message' => 'Unable to load sales clerk order details.',
        'error' => $e->getMessage(),
    ]);
}

?>
