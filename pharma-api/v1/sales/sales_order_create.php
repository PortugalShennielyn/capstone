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
    $items = salesNormalizeCartItems($payload['items'] ?? []);
    if (!$items) {
        http_response_code(400);
        echo json_encode(['status' => 'error', 'message' => 'Add at least one product to the cart.']);
        exit();
    }

    $products = salesLoadProductsByIds($pdo, array_column($items, 'product_id'));
    [$stockOk, $stockMessage] = salesValidateCartStock($items, $products);
    if (!$stockOk) {
        http_response_code(409);
        echo json_encode(['status' => 'error', 'message' => $stockMessage]);
        exit();
    }

    $customerName = trim((string) ($payload['customer_name'] ?? ''));
    $orderId = (int) ($payload['order_id'] ?? 0);
    $userId = salesCurrentUserId();

    $pdo->beginTransaction();

    if ($orderId > 0) {
        $stmt = $pdo->prepare(
            "SELECT order_id, status
             FROM sales_orders
             WHERE order_id = :order_id
             LIMIT 1
             FOR UPDATE"
        );
        $stmt->execute([':order_id' => $orderId]);
        $existing = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$existing) {
            throw new RuntimeException('Draft order was not found.');
        }
        if ($existing['status'] !== 'draft') {
            throw new RuntimeException('Only draft orders can be updated.');
        }

        $subtotal = salesWriteOrderItems($pdo, $orderId, $items, $products);
        $totals = salesOrderTotalsFromPayload($payload, $subtotal);
        $cashTotals = salesCashTotalsFromPayload($payload, $totals['total_amount']);
        $update = $pdo->prepare(
            "UPDATE sales_orders
             SET customer_name = :customer_name,
                 subtotal = :subtotal,
                 discount = :discount,
                 vat = :vat,
                 total_amount = :total_amount,
                 cash_received = :cash_received,
                 change_amount = :change_amount,
                 status = 'draft'
             WHERE order_id = :order_id"
        );
        $update->execute([
            ':customer_name' => $customerName !== '' ? $customerName : null,
            ':subtotal' => $totals['subtotal'],
            ':discount' => $totals['discount'],
            ':vat' => $totals['vat'],
            ':total_amount' => $totals['total_amount'],
            ':cash_received' => $cashTotals['cash_received'],
            ':change_amount' => $cashTotals['change_amount'],
            ':order_id' => $orderId,
        ]);
    } else {
        $orderNo = salesGenerateOrderNo($pdo);
        $insert = $pdo->prepare(
            "INSERT INTO sales_orders
                (order_no, customer_name, sales_clerk_id, status, total_amount)
             VALUES
                (:order_no, :customer_name, :sales_clerk_id, 'draft', 0)"
        );
        $insert->execute([
            ':order_no' => $orderNo,
            ':customer_name' => $customerName !== '' ? $customerName : null,
            ':sales_clerk_id' => $userId,
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

        salesRecordStatusChange($pdo, $orderId, null, 'draft', $userId, 'Draft saved by sales clerk.');
    }

    $pdo->commit();

    echo json_encode([
        'status' => 'success',
        'data' => [
            'order_id' => $orderId,
            'message' => 'Draft saved.',
        ],
    ]);
} catch (Throwable $e) {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }

    http_response_code(500);
    echo json_encode([
        'status' => 'error',
        'message' => $e->getMessage() ?: 'Unable to save draft order.',
    ]);
}

?>
