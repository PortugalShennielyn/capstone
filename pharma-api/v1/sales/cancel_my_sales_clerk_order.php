<?php
require_once '../../config/db_connection.php';

$allowedRoles = ['salesclerk', 'Sales Clerk', 'ro-sales-clerk', 'ro_sales_clerk', 'admin', 'Admin', 'ro-admin'];
require_once '../../config/require_auth.php';
require_once 'sales_pos_helpers.php';

try {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        http_response_code(405);
        echo json_encode(['status' => 'error', 'message' => 'POST is required.']);
        exit();
    }

    ensureActivityLogSchema($pdo);

    $payload = salesReadJsonBody();
    $orderId = (int) ($payload['order_id'] ?? 0);
    if ($orderId <= 0) {
        http_response_code(400);
        echo json_encode(['status' => 'error', 'message' => 'Missing order_id.']);
        exit();
    }

    $pdo->beginTransaction();

    $stmt = $pdo->prepare(
        "SELECT order_id, status
         FROM sales_orders
         WHERE order_id = :order_id
           AND sales_clerk_id = :sales_clerk_id
         LIMIT 1
         FOR UPDATE"
    );
    $stmt->execute([
        ':order_id' => $orderId,
        ':sales_clerk_id' => salesCurrentUserId(),
    ]);
    $order = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$order) {
        throw new RuntimeException('Order not found.');
    }
    if (!in_array($order['status'], ['draft', 'waiting_cashier'], true)) {
        throw new RuntimeException('Only draft or waiting-for-cashier orders can be cancelled.');
    }

    $update = $pdo->prepare(
        "UPDATE sales_orders
         SET status = 'cancelled',
             cancellation_reason = :reason,
             cancelled_by = :cancelled_by,
             cancelled_at = NOW()
         WHERE order_id = :order_id"
    );
    $update->execute([
        ':reason' => trim((string) ($payload['reason'] ?? 'Cancelled by sales clerk.')),
        ':cancelled_by' => salesCurrentUserId(),
        ':order_id' => $orderId,
    ]);

    $queue = $pdo->prepare(
        "UPDATE cashier_queue
         SET queue_status = 'cancelled'
         WHERE order_id = :order_id"
    );
    $queue->execute([':order_id' => $orderId]);

    salesRecordStatusChange($pdo, $orderId, (string) $order['status'], 'cancelled', salesCurrentUserId(), 'Order cancelled by sales clerk.');

    $pdo->commit();

    echo json_encode([
        'status' => 'success',
        'data' => [
            'order_id' => $orderId,
            'message' => 'Order cancelled.',
        ],
    ]);
} catch (Throwable $e) {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }

    http_response_code(500);
    echo json_encode([
        'status' => 'error',
        'message' => $e->getMessage() ?: 'Unable to cancel order.',
    ]);
}

?>
