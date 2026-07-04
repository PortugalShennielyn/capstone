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
                (order_no, customer_name, sales_clerk_id, status, total_amount)
             VALUES
                (:order_no, :customer_name, :sales_clerk_id, 'draft', 0)"
        );
        $insert->execute([
            ':order_no' => salesGenerateOrderNo($pdo),
            ':customer_name' => $customerName !== '' ? $customerName : null,
            ':sales_clerk_id' => salesCurrentUserId(),
        ]);
        $orderId = (int) $pdo->lastInsertId();
        $subtotal = salesWriteOrderItems($pdo, $orderId, $items, $products);
        $total = salesOrderTotalFromPayload($payload, $subtotal);
        $update = $pdo->prepare('UPDATE sales_orders SET total_amount = :total_amount WHERE order_id = :order_id');
        $update->execute([':total_amount' => $total, ':order_id' => $orderId]);
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
        $total = salesOrderTotalFromPayload($payload, $subtotal);
        $customerName = trim((string) ($payload['customer_name'] ?? ''));
        $draftUpdate = $pdo->prepare(
            "UPDATE sales_orders
             SET customer_name = :customer_name,
                 total_amount = :total_amount
             WHERE order_id = :order_id"
        );
        $draftUpdate->execute([
            ':customer_name' => $customerName !== '' ? $customerName : null,
            ':total_amount' => $total,
            ':order_id' => $orderId,
        ]);
    }

    $itemStmt = $pdo->prepare(
        'SELECT product_id, quantity
         FROM sales_order_items
         WHERE order_id = :order_id'
    );
    $itemStmt->execute([':order_id' => $orderId]);
    $orderItems = salesNormalizeCartItems($itemStmt->fetchAll(PDO::FETCH_ASSOC));
    if (!$orderItems) {
        throw new RuntimeException('Order has no items.');
    }

    $products = salesLoadProductsByIds($pdo, array_column($orderItems, 'product_id'));
    [$stockOk, $stockMessage] = salesValidateCartStock($orderItems, $products);
    if (!$stockOk) {
        http_response_code(409);
        echo json_encode(['status' => 'error', 'message' => $stockMessage]);
        $pdo->rollBack();
        exit();
    }

    $update = $pdo->prepare(
        "UPDATE sales_orders
         SET status = 'waiting_cashier',
             sent_to_cashier_at = NOW()
         WHERE order_id = :order_id"
    );
    $update->execute([':order_id' => $orderId]);

    $queue = $pdo->prepare(
        "INSERT INTO cashier_queue (order_id, queue_status, queued_at)
         VALUES (:order_id, 'waiting', NOW())
         ON DUPLICATE KEY UPDATE queue_status = 'waiting', queued_at = VALUES(queued_at)"
    );
    $queue->execute([':order_id' => $orderId]);

    $history = $pdo->prepare(
        "INSERT INTO sales_order_status_history
            (order_id, old_status, new_status, changed_by, remarks)
         VALUES
            (:order_id, :old_status, 'waiting_cashier', :changed_by, :remarks)"
    );
    $history->execute([
        ':order_id' => $orderId,
        ':old_status' => $order['status'],
        ':changed_by' => salesCurrentUserId(),
        ':remarks' => 'Order sent to cashier queue.',
    ]);

    $pdo->commit();

    echo json_encode([
        'status' => 'success',
        'data' => [
            'order_id' => $orderId,
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
