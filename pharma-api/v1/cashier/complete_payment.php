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
    ensureCashierPaymentDiscountSchema($pdo);
    ensureSalesProfitAllocationSchema($pdo);

    $payload = salesReadJsonBody();
    $orderId = (int) ($payload['order_id'] ?? 0);
    $amountPaid = cashierMoney($payload['amount_paid'] ?? $payload['cash_received'] ?? 0);
    $cashierDiscountType = strtolower(trim((string) ($payload['cashier_discount_type'] ?? 'none')));
    $cashierDiscountAmount = cashierMoney($payload['cashier_discount_amount'] ?? 0);
    $beneficiaryName = trim((string) ($payload['beneficiary_name'] ?? ''));
    $beneficiaryId = trim((string) ($payload['beneficiary_id'] ?? ''));
    if (in_array($cashierDiscountType, ['senior', 'pwd'], true) && ($beneficiaryName === '' || $beneficiaryId === '')) {
        throw new InvalidArgumentException('Enter the beneficiary name and Senior Citizen or PWD ID number.');
    }
    if (mb_strlen($beneficiaryName) > 150 || mb_strlen($beneficiaryId) > 150) throw new InvalidArgumentException('Beneficiary details must be 150 characters or fewer.');
    if ($orderId <= 0) {
        http_response_code(400);
        echo json_encode(['status' => 'error', 'message' => 'Missing order_id.']);
        exit();
    }

    $cashierId = cashierCurrentUserId();
    $pdo->beginTransaction();

    $stmt = $pdo->prepare(
        "SELECT order_id, order_no, customer_name, sales_clerk_id, assigned_cashier_id, status, subtotal, discount, total_amount, cash_received
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

    $oldStatus = (string) ($order['status'] ?? '');
    if (!in_array($oldStatus, ['accepted_by_cashier', 'processing_payment', 'processing'], true)) {
        throw new RuntimeException('Only accepted cashier orders can be completed.');
    }
    if (!cashierIsAdminSession() && (string) $order['assigned_cashier_id'] !== $cashierId) {
        throw new RuntimeException('Only the assigned cashier can complete this order.');
    }

    $eligibleStmt = $pdo->prepare(
        "SELECT COALESCE(SUM(i.line_total), 0)
         FROM sales_order_items i
         INNER JOIN product p ON p.product_id = i.product_id
         INNER JOIN product_categories pc ON pc.category_id = p.category_id
         WHERE i.order_id = :order_id AND LOWER(TRIM(pc.category_name)) = 'medicine'"
    );
    $eligibleStmt->execute([':order_id' => $orderId]);
    $eligibleGross = cashierMoney($eligibleStmt->fetchColumn());

    $totals = cashierPaymentTotals(
        cashierMoney($order['subtotal'] ?? 0),
        $cashierDiscountType,
        $cashierDiscountAmount,
        cashierMoney($order['discount'] ?? 0),
        $eligibleGross
    );
    $totalAmount = $totals['final_amount'];
    if ($amountPaid <= 0) {
        $amountPaid = cashierMoney($order['cash_received'] ?? 0);
    }
    if ($amountPaid < $totalAmount) {
        throw new RuntimeException('Cash must be equal to or greater than the total amount.');
    }

    $existsStmt = $pdo->prepare(
        "SELECT COUNT(*)
         FROM sales_payments
         WHERE order_id = :order_id
           AND payment_status = 'paid'"
    );
    $existsStmt->execute([':order_id' => $orderId]);
    if ((int) $existsStmt->fetchColumn() > 0) {
        throw new RuntimeException('This order already has a completed payment.');
    }

    cashierAssertOrderProductsActive($pdo, $orderId);

    cashierDeductShelfStock($pdo, $orderId);

    $changeAmount = cashierMoney($amountPaid - $totalAmount);
    cashierPersistCashReceived($pdo, $orderId, $amountPaid, $totalAmount);

    $payment = $pdo->prepare(
        "INSERT INTO sales_payments
            (order_id, cashier_id, payment_method, total_amount, sales_clerk_discount, cashier_discount_type, cashier_discount_amount, final_amount, vat_exempt_sales, vat_exemption_amount, beneficiary_name, beneficiary_id, amount_paid, change_amount, payment_status, paid_at)
         VALUES
            (:order_id, :cashier_id, 'cash', :total_amount, :sales_clerk_discount, :cashier_discount_type, :cashier_discount_amount, :final_amount, :vat_exempt_sales, :vat_exemption_amount, :beneficiary_name, :beneficiary_id, :amount_paid, :change_amount, 'paid', NOW())"
    );
    $payment->execute([
        ':order_id' => $orderId,
        ':cashier_id' => $cashierId,
        ':total_amount' => $totalAmount,
        ':sales_clerk_discount' => $totals['sales_clerk_discount'],
        ':cashier_discount_type' => $totals['discount_type'],
        ':cashier_discount_amount' => $totals['discount_amount'],
        ':final_amount' => $totalAmount,
        ':vat_exempt_sales' => $totals['vat_exempt_sales'],
        ':vat_exemption_amount' => $totals['vat_exemption_amount'],
        ':beneficiary_name' => in_array($cashierDiscountType, ['senior', 'pwd'], true) ? $beneficiaryName : null,
        ':beneficiary_id' => in_array($cashierDiscountType, ['senior', 'pwd'], true) ? $beneficiaryId : null,
        ':amount_paid' => $amountPaid,
        ':change_amount' => $changeAmount,
    ]);

    $receiptNo = cashierGenerateReceiptNo($pdo);
    $receipt = $pdo->prepare(
        "INSERT INTO sales_receipts
            (order_id, receipt_no, customer_name, sales_clerk_id, cashier_id, total_amount, payment_method, printed_at, created_at)
         VALUES
            (:order_id, :receipt_no, :customer_name, :sales_clerk_id, :cashier_id, :total_amount, 'cash', NOW(), NOW())"
    );
    $receipt->execute([
        ':order_id' => $orderId,
        ':receipt_no' => $receiptNo,
        ':customer_name' => cashierDisplay($order['customer_name'] ?? '', 'Walk-in Customer'),
        ':sales_clerk_id' => $order['sales_clerk_id'],
        ':cashier_id' => $cashierId,
        ':total_amount' => $totalAmount,
    ]);

    $update = $pdo->prepare(
        "UPDATE sales_orders
         SET status = 'completed',
             assigned_cashier_id = :cashier_id,
             discount = :sales_clerk_discount,
             vat = :vat,
             total_amount = :total_amount,
             completed_at = NOW()
         WHERE order_id = :order_id"
    );
    $update->execute([
        ':cashier_id' => $cashierId,
        ':sales_clerk_discount' => $totals['sales_clerk_discount'],
        ':vat' => $totals['vat'],
        ':total_amount' => $totalAmount,
        ':order_id' => $orderId,
    ]);

    $queue = $pdo->prepare(
        "UPDATE cashier_queue
         SET cashier_id = :cashier_id,
             queue_status = 'completed',
             completed_at = NOW()
         WHERE order_id = :order_id"
    );
    $queue->execute([
        ':cashier_id' => $cashierId,
        ':order_id' => $orderId,
    ]);

    salesRecordStatusChange($pdo, $orderId, $oldStatus, 'completed', $cashierId, 'Payment completed by cashier.');
    $pdo->commit();

    echo json_encode([
        'status' => 'success',
        'message' => 'Payment completed.',
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
