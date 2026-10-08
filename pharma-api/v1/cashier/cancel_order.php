<?php
require_once '../../config/db_connection.php';
$allowedRoles = ['super_admin', 'admin', 'Cashier', 'cashier', 'ro-super-admin', 'ro-admin', 'ro-cashier'];
require_once '../../config/require_auth.php';
require_once 'cashier_helpers.php';

try {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        http_response_code(405);
        echo json_encode(['status' => 'error', 'message' => 'POST is required.']);
        exit();
    }
    ensureActivityLogSchema($pdo);
    $payload = salesReadJsonBody();
    $orderId = (int) ($payload['order_id'] ?? 0);
    $reason = trim((string) ($payload['reason'] ?? ''));
    if ($orderId <= 0 || $reason === '' || mb_strlen($reason) > 255) {
        throw new InvalidArgumentException('Select an order and enter a cancellation reason of 255 characters or fewer.');
    }

    $cashierId = cashierCurrentUserId();
    $pdo->beginTransaction();
    $stmt = $pdo->prepare('SELECT status, assigned_cashier_id FROM sales_orders WHERE order_id = :order_id LIMIT 1 FOR UPDATE');
    $stmt->execute([':order_id' => $orderId]);
    $order = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$order) throw new RuntimeException('Order not found.');
    $oldStatus = (string) $order['status'];
    if (!in_array($oldStatus, ['accepted_by_cashier', 'processing_payment', 'processing'], true)) {
        throw new RuntimeException('Only unpaid processing orders can be cancelled.');
    }
    if (!cashierIsAdminSession() && (string) $order['assigned_cashier_id'] !== $cashierId) {
        throw new RuntimeException('Only the assigned cashier can cancel this order.');
    }
    $paid = $pdo->prepare("SELECT 1 FROM sales_payments WHERE order_id = :order_id AND payment_status = 'paid' LIMIT 1");
    $paid->execute([':order_id' => $orderId]);
    if ($paid->fetchColumn()) throw new RuntimeException('This order has already been paid.');

    $update = $pdo->prepare("UPDATE sales_orders SET status = 'cancelled', cancellation_reason = :reason, cancelled_by = :cashier_id, cancelled_at = NOW() WHERE order_id = :order_id");
    $update->execute([':reason' => $reason, ':cashier_id' => $cashierId, ':order_id' => $orderId]);
    $queue = $pdo->prepare("UPDATE cashier_queue SET queue_status = 'cancelled' WHERE order_id = :order_id");
    $queue->execute([':order_id' => $orderId]);
    salesRecordStatusChange($pdo, $orderId, $oldStatus, 'cancelled', $cashierId, $reason);
    $pdo->commit();
    echo json_encode(['status' => 'success', 'message' => 'Order cancelled.', 'data' => ['order_id' => $orderId]]);
} catch (Throwable $e) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    http_response_code($e instanceof InvalidArgumentException || $e instanceof RuntimeException ? 400 : 500);
    echo json_encode(['status' => 'error', 'message' => $e->getMessage() ?: 'Unable to cancel order.']);
}
