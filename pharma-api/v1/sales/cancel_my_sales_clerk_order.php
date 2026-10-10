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
    if (!in_array($order['status'], ['draft', 'waiting_cashier', 'accepted_by_cashier', 'processing_payment', 'processing'], true)) {
        throw new RuntimeException('Only unpaid waiting or processing orders can be cancelled.');
    }
    $paid = $pdo->prepare("SELECT 1 FROM sales_payments WHERE order_id = :order_id AND payment_status = 'paid' LIMIT 1");
    $paid->execute([':order_id' => $orderId]);
    if ($paid->fetchColumn()) throw new RuntimeException('This order has already been paid and cannot be cancelled.');

    $reason = trim((string) ($payload['reason'] ?? ''));
    if ($reason === '') $reason = 'Cancelled by sales clerk.';
    if (mb_strlen($reason) > 255) throw new InvalidArgumentException('Cancellation reason must be 255 characters or fewer.');

    $update = $pdo->prepare(
        "UPDATE sales_orders
         SET status = 'cancelled',
             cancellation_reason = :reason,
             cancelled_by = :cancelled_by,
             cancelled_at = NOW()
         WHERE order_id = :order_id"
    );
    $update->execute([
        ':reason' => $reason,
        ':cancelled_by' => salesCurrentUserId(),
        ':order_id' => $orderId,
    ]);

    $queue = $pdo->prepare(
        "UPDATE cashier_queue
         SET queue_status = 'cancelled'
         WHERE order_id = :order_id"
    );
    $queue->execute([':order_id' => $orderId]);

    salesRecordStatusChange($pdo, $orderId, (string) $order['status'], 'cancelled', salesCurrentUserId(), $reason);

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

    http_response_code($e instanceof InvalidArgumentException || $e instanceof RuntimeException ? 400 : 500);
    echo json_encode([
        'status' => 'error',
        'message' => $e->getMessage() ?: 'Unable to cancel order.',
    ]);
}

?>
