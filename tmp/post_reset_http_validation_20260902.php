<?php
declare(strict_types=1);

require_once __DIR__ . '/../pharma-api/config/db_connection.php';

function check(bool $condition, string $message): void
{
    if (!$condition) {
        throw new RuntimeException($message);
    }
}

function apiGet(string $path, string $sessionId, string $tabToken): array
{
    $curl = curl_init('http://127.0.0.1/PharmacySystem_for_DocR/pharma-api/v1/' . $path);
    curl_setopt_array($curl, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_COOKIE => 'PHPSESSID=' . $sessionId,
        CURLOPT_HTTPHEADER => ['Accept: application/json', 'X-Tab-Token: ' . $tabToken],
        CURLOPT_TIMEOUT => 20,
    ]);
    $body = curl_exec($curl);
    $status = (int) curl_getinfo($curl, CURLINFO_RESPONSE_CODE);
    $error = curl_error($curl);
    curl_close($curl);
    check($body !== false, "HTTP transport failed for {$path}: {$error}");
    $json = json_decode((string) $body, true);
    check(is_array($json), "Non-JSON response from {$path}: {$body}");
    check($status === 200, "HTTP {$status} from {$path}: {$body}");
    check(($json['status'] ?? '') === 'success', "API error from {$path}: {$body}");
    return $json;
}

$user = $pdo->query("SELECT user_id, username, full_name, role, status FROM users WHERE role='admin' AND status='Active' LIMIT 1")->fetch(PDO::FETCH_ASSOC);
check((bool) $user, 'No active admin account is available for API validation.');

if (session_status() === PHP_SESSION_ACTIVE) {
    session_write_close();
}
$sessionId = 'codexreset' . bin2hex(random_bytes(10));
$tabToken = bin2hex(random_bytes(32));
$authSessionId = newUuid($pdo);
session_id($sessionId);
session_start();
$_SESSION = [
    'user_id' => $user['user_id'],
    'username' => $user['username'],
    'full_name' => $user['full_name'],
    'role' => $user['role'],
    'roles' => [$user['role']],
    'role_identifiers' => ['ro-admin'],
    'user_status' => $user['status'],
    'auth_session_id' => $authSessionId,
    'tab_token_hash' => hash('sha256', $tabToken),
];
session_write_close();

$pdo->prepare(
    "INSERT INTO auth_sessions
     (auth_session_id, php_session_id, user_id, session_token_hash, expires_at, ip_address, user_agent)
     VALUES (:id, :php, :user, :token, DATE_ADD(NOW(), INTERVAL 10 MINUTE), '127.0.0.1', 'Codex post-reset HTTP validation')"
)->execute([
    ':id' => $authSessionId,
    ':php' => $sessionId,
    ':user' => $user['user_id'],
    ':token' => hash('sha256', $tabToken),
]);

try {
    $results = [];
    $products = apiGet('products/get_products.php', $sessionId, $tabToken);
    check(count($products['data'] ?? []) === 0, 'Products API is not empty.');
    $results['products'] = 0;

    $requests = apiGet('purchase_requests/get_purchase_requests.php', $sessionId, $tabToken);
    check(count($requests['data']['requests'] ?? []) === 0, 'Purchase Requests API is not empty.');
    $results['purchase_requests'] = 0;

    $orders = apiGet('purchase_orders/get_purchase_orders.php', $sessionId, $tabToken);
    check(count($orders['purchase_orders'] ?? []) === 0, 'Purchase Orders API is not empty.');
    check(array_sum($orders['status_counts'] ?? []) === 0, 'Purchase Order status counts are not zero.');
    $results['purchase_orders'] = 0;
    $results['purchase_order_status_counts'] = $orders['status_counts'] ?? [];

    $receiving = apiGet('purchase_orders/get_receiving_history.php', $sessionId, $tabToken);
    check(count($receiving['history'] ?? []) === 0, 'Receiving history API is not empty.');
    $results['receiving_history'] = 0;

    $returns = apiGet('purchase_orders/get_return_damage_orders.php', $sessionId, $tabToken);
    check(count($returns['returns'] ?? []) === 0, 'Return/damage API is not empty.');
    $results['return_damage'] = 0;

    foreach ([
        'inventory/get_inventory.php' => 'storage_inventory',
        'inventory/get_transfer_history.php' => 'transfer_history',
        'inventory/get_shelf_inventory.php' => 'shelf_inventory',
    ] as $path => $label) {
        $response = apiGet($path, $sessionId, $tabToken);
        check(count($response['data'] ?? []) === 0, "{$label} API is not empty.");
        $results[$label] = 0;
    }

    $sales = apiGet('sales/get_sales_history.php', $sessionId, $tabToken);
    $saleOrders = $sales['data']['orders'] ?? [];
    check(count($saleOrders) > 0, 'Historical Sales API returned no orders.');
    $results['sales_history_orders'] = count($saleOrders);

    $historicalOrderId = (int) $pdo->query(
        "SELECT o.order_id
         FROM sales_orders o
         INNER JOIN sales_order_items i ON i.order_id=o.order_id
         ORDER BY (o.status='completed') DESC, o.order_id
         LIMIT 1"
    )->fetchColumn();
    check($historicalOrderId > 0, 'No historical sale is available for receipt validation.');
    $receipt = apiGet('cashier/get_cashier_order.php?order_id=' . $historicalOrderId, $sessionId, $tabToken);
    $detail = $receipt['data'] ?? [];
    $items = $detail['items'] ?? [];
    check(count($items) > 0, 'Historical cashier order has no product lines.');
    foreach (['order_no', 'created_at', 'subtotal', 'total_amount'] as $field) {
        check(array_key_exists($field, $detail), "Historical cashier order is missing {$field}.");
    }
    foreach (['product_name', 'quantity', 'unit_price', 'line_total'] as $field) {
        check(array_key_exists($field, $items[0]), "Historical receipt line is missing {$field}.");
    }
    $results['historical_receipt_order_id'] = $historicalOrderId;
    $results['historical_receipt_items'] = count($items);

    $dashboard = apiGet('dashboard/get_dashboard_summary.php?preset=this_week', $sessionId, $tabToken);
    foreach (['pending_po', 'expiring_soon', 'low_stock', 'out_of_stock'] as $field) {
        check((int) ($dashboard[$field] ?? -1) === 0, "Dashboard {$field} is not zero.");
    }
    check(abs((float) ($dashboard['inventory_value'] ?? -1)) < 0.00001, 'Dashboard inventory value is not zero.');
    $results['dashboard'] = [
        'pending_po' => (int) $dashboard['pending_po'],
        'expiring_soon' => (int) $dashboard['expiring_soon'],
        'low_stock' => (int) $dashboard['low_stock'],
        'out_of_stock' => (int) $dashboard['out_of_stock'],
        'inventory_value' => (float) $dashboard['inventory_value'],
        'historical_sales_summary_preserved' => $dashboard['summary'] ?? [],
    ];

    echo json_encode(['status' => 'passed', 'results' => $results], JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES) . PHP_EOL;
} finally {
    $pdo->prepare('DELETE FROM auth_sessions WHERE auth_session_id=:id')->execute([':id' => $authSessionId]);
}
