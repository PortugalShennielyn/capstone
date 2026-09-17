<?php
$allowedRoles = ['super_admin', 'admin', 'manager', 'Admin', 'ro-super-admin', 'ro-admin', 'ro-manager'];
require_once '../../config/db_connection.php';
require_once '../../config/require_auth.php';
require_once __DIR__ . '/purchase_order_helpers.php';
require_once __DIR__ . '/purchase_order_payment_helpers.php';

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    http_response_code(405);
    echo json_encode(['status' => 'error', 'message' => 'Only GET requests are allowed.']);
    exit();
}

try {
    $poId = cleanId($_GET['po_id'] ?? null);
    if ($poId === '') throw new InvalidArgumentException('Purchase order is required.');
    $details = buildPurchaseOrderPaymentDetails($pdo, $poId);
    if (!$details) {
        http_response_code(404);
        echo json_encode(['status' => 'error', 'message' => 'Purchase order not found.']);
        exit();
    }
    if (!in_array($details['status'], ['Pending', 'Arrived', 'Delivered'], true)) {
        http_response_code(422);
        echo json_encode(['status' => 'error', 'message' => 'Supplier payments are available only for Pending, Arrived, or Delivered purchase orders.']);
        exit();
    }
    if (!$details['invoice_recorded'] || (float) $details['total_amount'] <= 0) {
        http_response_code(422);
        echo json_encode(['status' => 'error', 'message' => 'Record Supplier Invoice first.']);
        exit();
    }
    echo json_encode(['status' => 'success', 'payment_details' => $details], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
} catch (InvalidArgumentException $error) {
    http_response_code(400);
    echo json_encode(['status' => 'error', 'message' => $error->getMessage()]);
} catch (Throwable $error) {
    http_response_code(500);
    echo json_encode(['status' => 'error', 'message' => 'Unable to load purchase order payment details.']);
}
