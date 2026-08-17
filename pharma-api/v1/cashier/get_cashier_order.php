<?php
require_once '../../config/db_connection.php';
$allowedRoles = ['super_admin', 'admin', 'manager', 'Cashier', 'cashier', 'salesclerk', 'Sales Clerk', 'ro-super-admin', 'ro-admin', 'ro-manager', 'ro-cashier', 'ro-sales-clerk', 'ro_sales_clerk'];
require_once '../../config/require_auth.php';
require_once 'cashier_helpers.php';

try {
    $orderId = (int) ($_GET['order_id'] ?? 0);
    if ($orderId <= 0) {
        http_response_code(400);
        echo json_encode(['status' => 'error', 'message' => 'Missing order_id.']);
        exit();
    }

    $detail = cashierLoadOrderDetail($pdo, $orderId);
    if (!$detail) {
        http_response_code(404);
        echo json_encode(['status' => 'error', 'message' => 'Order not found.']);
        exit();
    }

    if (!cashierIsAdminSession() && $detail['status_code'] === 'completed') {
        $currentUserId = cashierCurrentUserId();
        $isAssignedCashier = (string) ($detail['assigned_cashier_id'] ?? '') === $currentUserId;
        $isOrderSalesClerk = (string) ($detail['sales_clerk_id'] ?? '') === $currentUserId;
        if (!$isAssignedCashier && !$isOrderSalesClerk) {
            http_response_code(403);
            echo json_encode(['status' => 'error', 'message' => 'This receipt is not available for your account.']);
            exit();
        }
    }

    echo json_encode(['status' => 'success', 'data' => $detail]);
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode([
        'status' => 'error',
        'message' => 'Unable to load cashier order.',
        'error' => $e->getMessage(),
    ]);
}

?>
