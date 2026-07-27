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
    ensureSalesOrderCashSchema($pdo);

    $payload = salesReadJsonBody();
    $orderId = (int) ($payload['order_id'] ?? 0);
    if ($orderId <= 0) {
        http_response_code(400);
        echo json_encode(['status' => 'error', 'message' => 'Missing order_id.']);
        exit();
    }

    $cashierId = cashierCurrentUserId();
    $pdo->beginTransaction();

    $stmt = $pdo->prepare(
        "SELECT order_id, status
         FROM sales_orders
         WHERE order_id = :order_id
         LIMIT 1
         FOR UPDATE"
    );
    $stmt->execute([':order_id' => $orderId]);
    $order = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$order) {
        throw new RuntimeException('Order not found.');
    }
    if ((string) $order['status'] !== 'waiting_cashier') {
        throw new RuntimeException('Only waiting cashier orders can be accepted.');
    }

    $update = $pdo->prepare(
        "UPDATE sales_orders
         SET status = 'accepted_by_cashier',
             assigned_cashier_id = :cashier_id,
             cashier_accepted_at = NOW()
         WHERE order_id = :order_id"
    );
    $update->execute([
        ':cashier_id' => $cashierId,
        ':order_id' => $orderId,
    ]);

    $queue = $pdo->prepare(
        "INSERT INTO cashier_queue (order_id, cashier_id, queue_status, queued_at, accepted_at)
         VALUES (:order_id, :cashier_id, 'accepted', NOW(), NOW())
         ON DUPLICATE KEY UPDATE cashier_id = VALUES(cashier_id), queue_status = 'accepted', accepted_at = NOW()"
    );
    $queue->execute([
        ':order_id' => $orderId,
        ':cashier_id' => $cashierId,
    ]);

    salesRecordStatusChange($pdo, $orderId, 'waiting_cashier', 'accepted_by_cashier', $cashierId, 'Order accepted by cashier.');
    $pdo->commit();

    echo json_encode([
        'status' => 'success',
        'message' => 'Order accepted.',
        'data' => cashierLoadOrderDetail($pdo, $orderId),
    ]);
} catch (Throwable $e) {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }
    http_response_code(400);
    echo json_encode([
        'status' => 'error',
        'message' => $e->getMessage(),
    ]);
}

?>
