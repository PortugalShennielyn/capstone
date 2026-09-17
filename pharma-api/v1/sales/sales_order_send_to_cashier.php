<?php
require_once '../../config/db_connection.php';
require_once '../../config/require_auth.php';
require_once 'sales_pos_helpers.php';

try {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        http_response_code(405);
        echo json_encode(['status' => 'error', 'message' => 'POST is required.']);
        exit();
    }

    ensureActivityLogSchema($pdo);
    ensureSalesOrderCashSchema($pdo);

    $payload = salesReadJsonBody();
    $orderId = (int) ($payload['order_id'] ?? 0);
    $items = salesNormalizeCartItems($payload['items'] ?? []);

    if ($orderId <= 0 && !$items) {
        http_response_code(400);
        echo json_encode(['status' => 'error', 'message' => 'Save or add cart items before sending to cashier.']);
        exit();
    }

    $pdo->beginTransaction();

    if ($orderId <= 0) {
        $products = salesLoadProductsByIds($pdo, array_column($items, 'product_id'));
        [$stockOk, $stockMessage] = salesValidateCartStock($items, $products);
        if (!$stockOk) {
            http_response_code(409);
            echo json_encode(['status' => 'error', 'message' => $stockMessage]);
            $pdo->rollBack();
            exit();
        }

        $customerName = trim((string) ($payload['customer_name'] ?? ''));
        $insert = $pdo->prepare(
            "INSERT INTO sales_orders
                (order_no, customer_name, sales_clerk_id, status, subtotal, discount, vat, total_amount)
             VALUES
                (:order_no, :customer_name, :sales_clerk_id, 'draft', 0, 0, 0, 0)"
        );
        $insert->execute([
            ':order_no' => salesGenerateOrderNo($pdo),
            ':customer_name' => $customerName !== '' ? $customerName : null,
            ':sales_clerk_id' => salesCurrentUserId(),
        ]);
        $orderId = (int) $pdo->lastInsertId();
        $subtotal = salesWriteOrderItems($pdo, $orderId, $items, $products);
        $totals = salesOrderTotalsFromPayload($payload, $subtotal);
        $cashTotals = salesCashTotalsFromPayload($payload, $totals['total_amount']);
        $update = $pdo->prepare(
            'UPDATE sales_orders
             SET subtotal = :subtotal,
                 discount = :discount,
                 vat = :vat,
                 total_amount = :total_amount,
                 cash_received = :cash_received,
                 change_amount = :change_amount
             WHERE order_id = :order_id'
        );
        $update->execute([
            ':subtotal' => $totals['subtotal'],
            ':discount' => $totals['discount'],
            ':vat' => $totals['vat'],
            ':total_amount' => $totals['total_amount'],
            ':cash_received' => $cashTotals['cash_received'],
            ':change_amount' => $cashTotals['change_amount'],
            ':order_id' => $orderId,
        ]);
    }

    $orderStmt = $pdo->prepare(
        "SELECT order_id, status
         FROM sales_orders
         WHERE order_id = :order_id
         LIMIT 1
         FOR UPDATE"
    );
    $orderStmt->execute([':order_id' => $orderId]);
    $order = $orderStmt->fetch(PDO::FETCH_ASSOC);
    if (!$order) {
        throw new RuntimeException('Order was not found.');
    }
    if (!in_array($order['status'], ['draft', 'waiting_cashier'], true)) {
        throw new RuntimeException('Only draft orders can be sent to cashier.');
    }

    if ($items && $order['status'] === 'draft') {
        $payloadProducts = salesLoadProductsByIds($pdo, array_column($items, 'product_id'));
        [$payloadStockOk, $payloadStockMessage] = salesValidateCartStock($items, $payloadProducts);
        if (!$payloadStockOk) {
            http_response_code(409);
            echo json_encode(['status' => 'error', 'message' => $payloadStockMessage]);
            $pdo->rollBack();
            exit();
        }

        $subtotal = salesWriteOrderItems($pdo, $orderId, $items, $payloadProducts);
        $totals = salesOrderTotalsFromPayload($payload, $subtotal);
        $cashTotals = salesCashTotalsFromPayload($payload, $totals['total_amount']);
        $customerName = trim((string) ($payload['customer_name'] ?? ''));
        $draftUpdate = $pdo->prepare(
            "UPDATE sales_orders
             SET customer_name = :customer_name,
                 subtotal = :subtotal,
                 discount = :discount,
                 vat = :vat,
                 total_amount = :total_amount,
                 cash_received = :cash_received,
                 change_amount = :change_amount
             WHERE order_id = :order_id"
        );
        $draftUpdate->execute([
            ':customer_name' => $customerName !== '' ? $customerName : null,
            ':subtotal' => $totals['subtotal'],
            ':discount' => $totals['discount'],
            ':vat' => $totals['vat'],
            ':total_amount' => $totals['total_amount'],
            ':cash_received' => $cashTotals['cash_received'],
            ':change_amount' => $cashTotals['change_amount'],
            ':order_id' => $orderId,
        ]);
    }

    $itemStmt = $pdo->prepare(
        'SELECT product_id, quantity
         FROM sales_order_items
         WHERE order_id = :order_id'
    );
    $itemStmt->execute([':order_id' => $orderId]);
    $storedOrderItems = $itemStmt->fetchAll(PDO::FETCH_ASSOC);
    $orderItems = [];
    foreach ($storedOrderItems as $storedItem) {
        $productId = trim((string) ($storedItem['product_id'] ?? ''));
        if ($productId === '') continue;
        if (!isset($orderItems[$productId])) $orderItems[$productId] = ['product_id'=>$productId,'base_quantity'=>0];
        $orderItems[$productId]['base_quantity'] += max(0,(int)($storedItem['quantity'] ?? 0));
    }
    $orderItems = array_values($orderItems);
    if (!$orderItems) {
        throw new RuntimeException('Order has no items.');
    }

    $products = salesLoadProductsByIds($pdo, array_column($orderItems, 'product_id'));
    $stockOk = true;
    $stockMessage = '';
    foreach ($orderItems as $orderItem) {
        $product = $products[$orderItem['product_id']] ?? null;
        if (!$product || (int)$orderItem['base_quantity'] > (int)$product['available_stock']) {
            $stockOk = false;
            $stockMessage = 'Insufficient shelf stock for ' . ($product['product_name'] ?? 'an order item') . '.';
            break;
        }
    }
    if (!$stockOk) {
        http_response_code(409);
        echo json_encode(['status' => 'error', 'message' => $stockMessage]);
        $pdo->rollBack();
        exit();
    }

    if ($order['status'] === 'draft') {
        $update = $pdo->prepare(
            "UPDATE sales_orders
             SET status = 'waiting_cashier',
                 sent_to_cashier_at = NOW()
             WHERE order_id = :order_id"
        );
        $update->execute([':order_id' => $orderId]);
    }

    $queue = $pdo->prepare(
        "INSERT INTO cashier_queue (order_id, queue_status, queued_at)
         VALUES (:order_id, 'waiting', NOW())
         ON DUPLICATE KEY UPDATE queue_status = 'waiting', queued_at = VALUES(queued_at)"
    );
    $queue->execute([':order_id' => $orderId]);

    salesRecordStatusChange($pdo, $orderId, $order['status'], 'waiting_cashier', salesCurrentUserId(), 'Order sent to cashier queue.');

    $pdo->commit();

    $detailStmt = $pdo->prepare(
        "SELECT
            o.order_id,
            o.order_no,
            COALESCE(NULLIF(o.customer_name, ''), 'Walk-in Customer') AS customer_name,
            COALESCE(NULLIF(sc.full_name, ''), sc.username, :sales_clerk_name) AS sales_clerk_name,
            o.subtotal,
            o.discount,
            o.vat,
            o.total_amount,
            o.cash_received,
            o.change_amount,
            o.status,
            COALESCE(o.sent_to_cashier_at, NOW()) AS sent_at
         FROM sales_orders o
         LEFT JOIN users sc ON sc.user_id = o.sales_clerk_id
         WHERE o.order_id = :order_id
         LIMIT 1"
    );
    $detailStmt->execute([
        ':order_id' => $orderId,
        ':sales_clerk_name' => salesCurrentUserName(),
    ]);
    $detail = $detailStmt->fetch(PDO::FETCH_ASSOC) ?: [];

    $summaryItemsStmt = $pdo->prepare(
        "SELECT product_name, brand_name, specification, quantity, unit_price, line_total
         FROM sales_order_items
         WHERE order_id = :order_id
         ORDER BY order_item_id ASC"
    );
    $summaryItemsStmt->execute([':order_id' => $orderId]);
    $summaryItems = array_map(static function (array $item): array {
        return [
            'product_name' => $item['product_name'],
            'brand_name' => $item['brand_name'],
            'specification' => $item['specification'],
            'quantity' => (int) $item['quantity'],
            'unit_price' => round((float) $item['unit_price'], 2),
            'line_total' => round((float) $item['line_total'], 2),
        ];
    }, $summaryItemsStmt->fetchAll(PDO::FETCH_ASSOC));

    echo json_encode([
        'status' => 'success',
        'data' => [
            'order_id' => $orderId,
            'order_no' => $detail['order_no'] ?? '',
            'customer_name' => $detail['customer_name'] ?? 'Walk-in Customer',
            'sales_clerk_name' => $detail['sales_clerk_name'] ?? salesCurrentUserName(),
            'status_code' => $detail['status'] ?? 'waiting_cashier',
            'status' => salesStatusLabel((string) ($detail['status'] ?? 'waiting_cashier')),
            'sent_at' => $detail['sent_at'] ?? date('Y-m-d H:i:s'),
            'items' => $summaryItems,
            'total_items' => count($summaryItems),
            'total_quantity' => array_sum(array_map(static fn($item) => (int) $item['quantity'], $summaryItems)),
            'subtotal' => round((float) ($detail['subtotal'] ?? 0), 2),
            'discount' => round((float) ($detail['discount'] ?? 0), 2),
            'vat' => round((float) ($detail['vat'] ?? 0), 2),
            'total_amount' => round((float) ($detail['total_amount'] ?? 0), 2),
            'cash_received' => round((float) ($detail['cash_received'] ?? 0), 2),
            'change_amount' => round((float) ($detail['change_amount'] ?? 0), 2),
            'message' => 'Order sent to cashier.',
        ],
    ]);
} catch (Throwable $e) {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }

    http_response_code(500);
    echo json_encode([
        'status' => 'error',
        'message' => $e->getMessage() ?: 'Unable to send order to cashier.',
    ]);
}

?>
