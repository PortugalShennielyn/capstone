<?php
declare(strict_types=1);

require_once __DIR__ . '/../pharma-api/config/db_connection.php';

function cashierWorkflowAssert(bool $condition, string $message): void
{
    if (!$condition) throw new RuntimeException($message);
}

function cashierWorkflowRequest(string $path, array $session, ?array $payload = null): array
{
    $curl = curl_init('http://127.0.0.1/PharmacySystem_for_DocR/pharma-api/v1/' . ltrim($path, '/'));
    $options = [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_COOKIE => 'PHPSESSID=' . $session['php_session_id'],
        CURLOPT_HTTPHEADER => ['Accept: application/json', 'Content-Type: application/json', 'X-Tab-Token: ' . $session['tab_token']],
        CURLOPT_TIMEOUT => 30,
    ];
    if ($payload !== null) {
        $options[CURLOPT_POST] = true;
        $options[CURLOPT_POSTFIELDS] = json_encode($payload, JSON_UNESCAPED_SLASHES);
    }
    curl_setopt_array($curl, $options);
    $body = curl_exec($curl);
    $status = (int) curl_getinfo($curl, CURLINFO_RESPONSE_CODE);
    $error = curl_error($curl);
    curl_close($curl);
    cashierWorkflowAssert($body !== false, 'HTTP failure: ' . $error);
    return ['status' => $status, 'body' => json_decode((string) $body, true) ?: ['raw' => (string) $body]];
}

function cashierWorkflowSession(PDO $pdo, array $user, string $label): array
{
    if (session_status() === PHP_SESSION_ACTIVE) session_write_close();
    $phpSessionId = 'codexcashier' . $label . bin2hex(random_bytes(7));
    $tabToken = bin2hex(random_bytes(32));
    $authSessionId = newUuid($pdo);
    session_id($phpSessionId);
    session_start();
    $_SESSION = [
        'user_id' => $user['user_id'], 'username' => $user['username'], 'full_name' => $user['full_name'],
        'role' => $user['role'], 'roles' => [$user['role']], 'role_identifiers' => ['ro-' . $user['role']],
        'user_status' => $user['status'], 'auth_session_id' => $authSessionId,
        'tab_token_hash' => hash('sha256', $tabToken),
    ];
    session_write_close();
    $pdo->prepare(
        "INSERT INTO auth_sessions
         (auth_session_id,php_session_id,user_id,session_token_hash,expires_at,ip_address,user_agent)
         VALUES (:id,:php,:user,:token,DATE_ADD(NOW(),INTERVAL 20 MINUTE),'127.0.0.1',:agent)"
    )->execute([
        ':id' => $authSessionId, ':php' => $phpSessionId, ':user' => $user['user_id'],
        ':token' => hash('sha256', $tabToken), ':agent' => 'Codex cashier workflow ' . $label,
    ]);
    return ['auth_session_id' => $authSessionId, 'php_session_id' => $phpSessionId, 'tab_token' => $tabToken];
}

function cashierWorkflowCompleteConcurrently(int $orderId, float $amount, array $session): array
{
    $handles = [];
    $multi = curl_multi_init();
    $payload = json_encode([
        'order_id' => $orderId, 'amount_paid' => $amount,
        'cashier_discount_type' => 'none', 'cashier_discount_amount' => 0,
    ], JSON_UNESCAPED_SLASHES);
    for ($index = 0; $index < 2; $index++) {
        $curl = curl_init('http://127.0.0.1/PharmacySystem_for_DocR/pharma-api/v1/cashier/complete_payment.php');
        curl_setopt_array($curl, [
            CURLOPT_RETURNTRANSFER => true, CURLOPT_POST => true, CURLOPT_POSTFIELDS => $payload,
            CURLOPT_COOKIE => 'PHPSESSID=' . $session['php_session_id'],
            CURLOPT_HTTPHEADER => ['Accept: application/json', 'Content-Type: application/json', 'X-Tab-Token: ' . $session['tab_token']],
            CURLOPT_TIMEOUT => 30,
        ]);
        curl_multi_add_handle($multi, $curl);
        $handles[] = $curl;
    }
    do {
        $status = curl_multi_exec($multi, $running);
        if ($running) curl_multi_select($multi, 1.0);
    } while ($running && $status === CURLM_OK);
    $responses = [];
    foreach ($handles as $curl) {
        $responses[] = [
            'status' => (int) curl_getinfo($curl, CURLINFO_RESPONSE_CODE),
            'body' => json_decode((string) curl_multi_getcontent($curl), true) ?: [],
        ];
        curl_multi_remove_handle($multi, $curl);
        curl_close($curl);
    }
    curl_multi_close($multi);
    return $responses;
}

$cashierJs = (string) file_get_contents(__DIR__ . '/../pharma-frontend/js/modules/cashier_pos.js');
$navbarJs = (string) file_get_contents(__DIR__ . '/../pharma-frontend/js/navbar.js');
cashierWorkflowAssert(substr_count($cashierJs, 'id="cashAmountInput"') === 1, 'Cashier POS must render exactly one authoritative Cash Received input.');
cashierWorkflowAssert(strpos($cashierJs, 'class="payment-hero"') < strpos($cashierJs, 'class="items-wrap"'), 'The payment summary must render before the order items.');
cashierWorkflowAssert(str_contains($cashierJs, 'paymentDrafts: new Map()') && str_contains($cashierJs, "event.key !== 'Enter'"), 'Cash preservation or Enter-to-submit handling is missing.');
cashierWorkflowAssert(str_contains($cashierJs, 'submittingOrderIds.has(normalizedOrderId)'), 'Frontend double-submission protection is missing.');
cashierWorkflowAssert(str_contains($navbarJs, '.cashier-topbar') && str_contains($navbarJs, '.shift-topbar') && str_contains($navbarJs, '.title-wrap'), 'The shared topbar does not cover all cashier and sales headers.');
foreach (['cashier_pos.html', 'cashier_transaction_history.html', 'cashier_shift_summary.html', 'sales_history.html'] as $page) {
    $html = (string) file_get_contents(__DIR__ . '/../pharma-frontend/' . $page);
    cashierWorkflowAssert(str_contains($html, 'id="navbar-container"') && str_contains($html, 'navbar.js?v=84'), "{$page} is not using the current shared sidebar implementation.");
}

$salesClerk = $pdo->query("SELECT user_id,username,full_name,role,status FROM users WHERE role='salesclerk' AND status='Active' LIMIT 1")->fetch(PDO::FETCH_ASSOC);
$cashier = $pdo->query("SELECT user_id,username,full_name,role,status FROM users WHERE role='cashier' AND status='Active' LIMIT 1")->fetch(PDO::FETCH_ASSOC);
cashierWorkflowAssert((bool) $salesClerk && (bool) $cashier, 'Active Sales Clerk and Cashier fixtures are required.');

$product = $pdo->query(
    "SELECT p.product_id,p.price,COALESCE(NULLIF(d.unit_name,''),'') AS unit_name,SUM(s.quantity_remaining) AS shelf_quantity
     FROM product p
     INNER JOIN product_selling_stock s ON s.product_id=p.product_id
     LEFT JOIN product_selling_options d ON d.product_id=p.product_id AND d.is_default=1 AND d.is_active=1
     WHERE p.status='Active' AND ABS(COALESCE(d.selling_price,p.price)-5.00)<0.005
     GROUP BY p.product_id,p.price,d.unit_name
     HAVING shelf_quantity>=6
     ORDER BY CASE WHEN p.product_name='Disposable Face Mask 50 pcs Box' THEN 0 ELSE 1 END
     LIMIT 1"
)->fetch(PDO::FETCH_ASSOC);
cashierWorkflowAssert((bool) $product, 'An active existing product priced at PHP 5.00 with at least six shelf units is required.');

$stockStatement = $pdo->prepare('SELECT selling_stock_id,quantity_remaining FROM product_selling_stock WHERE product_id=:product_id ORDER BY selling_stock_id');
$stockStatement->execute([':product_id' => $product['product_id']]);
$stockBefore = $stockStatement->fetchAll(PDO::FETCH_KEY_PAIR);
$stockTotalBefore = array_sum(array_map('intval', $stockBefore));
$today = (string) $pdo->query('SELECT DATE(NOW())')->fetchColumn();
$clerkSession = cashierWorkflowSession($pdo, $salesClerk, 'clerk');
$cashierSession = cashierWorkflowSession($pdo, $cashier, 'cashier');
$orderIds = [];

try {
    $shiftBefore = cashierWorkflowRequest("cashier/get_cashier_shift_summary.php?start_date={$today}&end_date={$today}", $cashierSession);
    cashierWorkflowAssert($shiftBefore['status'] === 200, 'Could not load the starting shift summary.');
    $initialShift = $shiftBefore['body']['data']['summary'] ?? [];

    $createOrder = static function (string $customer, float $discount = 0) use (&$orderIds, $product, $clerkSession): int {
        $response = cashierWorkflowRequest('sales/sales_order_send_to_cashier.php', $clerkSession, [
            'customer_name' => $customer,
            'items' => [['product_id' => $product['product_id'], 'quantity' => 2, 'unit' => $product['unit_name']]],
            'discount' => $discount,
        ]);
        cashierWorkflowAssert($response['status'] === 200, 'Sales Clerk could not send order: ' . json_encode($response));
        $orderId = (int) ($response['body']['data']['order_id'] ?? 0);
        cashierWorkflowAssert($orderId > 0, 'Sales Clerk response did not return an order ID.');
        $orderIds[] = $orderId;
        return $orderId;
    };

    $accept = static function (int $orderId) use ($cashierSession): void {
        $response = cashierWorkflowRequest('cashier/accept_order.php', $cashierSession, ['order_id' => $orderId]);
        cashierWorkflowAssert($response['status'] === 200, 'Cashier could not accept order: ' . json_encode($response));
    };

    $firstOrder = $createOrder('Codex Cash Test');
    $accept($firstOrder);
    $insufficient = cashierWorkflowRequest('cashier/complete_payment.php', $cashierSession, [
        'order_id' => $firstOrder, 'amount_paid' => 9.99,
        'cashier_discount_type' => 'none', 'cashier_discount_amount' => 0,
    ]);
    cashierWorkflowAssert($insufficient['status'] === 400, 'Insufficient cash must be rejected.');
    cashierWorkflowAssert((int) $pdo->query("SELECT COUNT(*) FROM sales_payments WHERE order_id={$firstOrder}")->fetchColumn() === 0, 'Insufficient cash created a payment.');

    $doubleResponses = cashierWorkflowCompleteConcurrently($firstOrder, 20.00, $cashierSession);
    $successfulDoubleRequests = count(array_filter($doubleResponses, static fn(array $response): bool => $response['status'] === 200));
    cashierWorkflowAssert($successfulDoubleRequests === 1, 'Exactly one concurrent Complete Payment request must succeed: ' . json_encode($doubleResponses));

    $secondOrder = $createOrder('Codex Exact Cash');
    $accept($secondOrder);
    $exact = cashierWorkflowRequest('cashier/complete_payment.php', $cashierSession, [
        'order_id' => $secondOrder, 'amount_paid' => 10.00,
        'cashier_discount_type' => 'none', 'cashier_discount_amount' => 0,
    ]);
    cashierWorkflowAssert($exact['status'] === 200, 'Exact-cash payment failed: ' . json_encode($exact));

    $thirdOrder = $createOrder('Codex Decimal Discount');
    $accept($thirdOrder);
    $discounted = cashierWorkflowRequest('cashier/complete_payment.php', $cashierSession, [
        'order_id' => $thirdOrder, 'amount_paid' => 9.50,
        'cashier_discount_type' => 'promo', 'cashier_discount_amount' => 0,
    ]);
    cashierWorkflowAssert($discounted['status'] === 200, 'Decimal discounted payment failed: ' . json_encode($discounted));

    $expected = [
        $firstOrder => ['total' => 10.00, 'cash' => 20.00, 'change' => 10.00, 'discount' => 0.00],
        $secondOrder => ['total' => 10.00, 'cash' => 10.00, 'change' => 0.00, 'discount' => 0.00],
        $thirdOrder => ['total' => 9.00, 'cash' => 9.50, 'change' => 0.50, 'discount' => 1.00],
    ];
    foreach ($expected as $orderId => $values) {
        $statement = $pdo->prepare(
            "SELECT o.order_no,o.status,o.sales_clerk_id,o.assigned_cashier_id,o.total_amount,o.cash_received,o.change_amount,
                    p.amount_paid,p.change_amount AS payment_change,p.cashier_discount_amount,
                    (SELECT COUNT(*) FROM sales_payments counted WHERE counted.order_id=o.order_id) payment_count,
                    (SELECT COUNT(*) FROM sales_receipts counted WHERE counted.order_id=o.order_id) receipt_count
             FROM sales_orders o INNER JOIN sales_payments p ON p.order_id=o.order_id AND p.payment_status='paid'
             WHERE o.order_id=:order_id"
        );
        $statement->execute([':order_id' => $orderId]);
        $saved = $statement->fetch(PDO::FETCH_ASSOC);
        cashierWorkflowAssert((bool) $saved && $saved['status'] === 'completed', "Order {$orderId} was not completed.");
        cashierWorkflowAssert($saved['sales_clerk_id'] === $salesClerk['user_id'] && $saved['assigned_cashier_id'] === $cashier['user_id'], 'Order staff relationships were not saved by ID.');
        cashierWorkflowAssert((int) $saved['payment_count'] === 1 && (int) $saved['receipt_count'] === 1, "Order {$orderId} did not save exactly one payment and receipt.");
        cashierWorkflowAssert(abs((float) $saved['total_amount'] - $values['total']) < 0.005, "Order {$orderId} total is incorrect.");
        cashierWorkflowAssert(abs((float) $saved['cash_received'] - $values['cash']) < 0.005, "Order {$orderId} cash received is incorrect.");
        cashierWorkflowAssert(abs((float) $saved['change_amount'] - $values['change']) < 0.005, "Order {$orderId} change is incorrect.");
        cashierWorkflowAssert(abs((float) $saved['cashier_discount_amount'] - $values['discount']) < 0.005, "Order {$orderId} discount is incorrect.");

        $history = cashierWorkflowRequest('cashier/get_cashier_report.php?type=completed&search=' . rawurlencode((string) $saved['order_no']) . '&per_page=20', $cashierSession);
        $historyRows = $history['body']['data']['rows'] ?? [];
        cashierWorkflowAssert($history['status'] === 200 && count(array_filter($historyRows, static fn(array $row): bool => (int) $row['order_id'] === $orderId)) === 1, "Order {$orderId} is missing from Cashier Transaction History.");
    }

    $completedDetail = cashierWorkflowRequest("cashier/get_cashier_order.php?order_id={$firstOrder}", $cashierSession);
    cashierWorkflowAssert($completedDetail['status'] === 200 && ($completedDetail['body']['data']['status_group'] ?? '') === 'completed', 'A completed order could not be reopened as a saved receipt.');
    $reaccept = cashierWorkflowRequest('cashier/accept_order.php', $cashierSession, ['order_id' => $firstOrder]);
    $repay = cashierWorkflowRequest('cashier/complete_payment.php', $cashierSession, ['order_id' => $firstOrder, 'amount_paid' => 20]);
    cashierWorkflowAssert($reaccept['status'] === 400 && $repay['status'] === 400, 'A completed order was accepted or paid twice.');

    $stockStatement->execute([':product_id' => $product['product_id']]);
    $stockAfter = array_sum(array_map('intval', $stockStatement->fetchAll(PDO::FETCH_KEY_PAIR)));
    cashierWorkflowAssert($stockAfter === $stockTotalBefore - 6 && $stockAfter >= 0, 'Shelf stock was not deducted exactly once per completed order.');

    $shiftAfter = cashierWorkflowRequest("cashier/get_cashier_shift_summary.php?start_date={$today}&end_date={$today}", $cashierSession);
    $finalShift = $shiftAfter['body']['data']['summary'] ?? [];
    cashierWorkflowAssert($shiftAfter['status'] === 200, 'Could not reload the shift summary.');
    cashierWorkflowAssert((int) ($finalShift['completed_transactions'] ?? 0) === (int) ($initialShift['completed_transactions'] ?? 0) + 3, 'Shift Summary did not add all three completed transactions.');
    cashierWorkflowAssert(abs((float) ($finalShift['total_completed_sales'] ?? 0) - (float) ($initialShift['total_completed_sales'] ?? 0) - 29.00) < 0.005, 'Shift Summary completed sales are incorrect.');
    cashierWorkflowAssert(abs((float) ($finalShift['cash_tendered'] ?? 0) - (float) ($initialShift['cash_tendered'] ?? 0) - 39.50) < 0.005, 'Shift Summary cash tendered is incorrect.');
    cashierWorkflowAssert(abs((float) ($finalShift['change_given'] ?? 0) - (float) ($initialShift['change_given'] ?? 0) - 10.50) < 0.005, 'Shift Summary change given is incorrect.');

    echo "cashier POS workflow HTTP test passed\n";
} finally {
    if ($orderIds) {
        $placeholders = implode(',', array_fill(0, count($orderIds), '?'));
        foreach (['sales_receipts', 'sales_payments', 'cashier_queue', 'sales_order_status_history', 'sales_order_items', 'sales_orders'] as $table) {
            $pdo->prepare("DELETE FROM {$table} WHERE order_id IN ({$placeholders})")->execute($orderIds);
        }
    }
    $restore = $pdo->prepare('UPDATE product_selling_stock SET quantity_remaining=:quantity WHERE selling_stock_id=:id');
    foreach ($stockBefore as $sellingStockId => $quantity) {
        $restore->execute([':quantity' => $quantity, ':id' => $sellingStockId]);
    }
    $pdo->prepare('DELETE FROM auth_sessions WHERE auth_session_id IN (?,?)')->execute([$clerkSession['auth_session_id'], $cashierSession['auth_session_id']]);
}
