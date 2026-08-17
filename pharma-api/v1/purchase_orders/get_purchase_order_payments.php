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
$poId = cleanId($_GET['po_id'] ?? null);
if ($poId === '') { http_response_code(400); echo json_encode(['status' => 'error', 'message' => 'Purchase order id is required.']); exit(); }
$statement = $pdo->prepare('SELECT final_payment FROM purchase_orders WHERE po_id = :po_id LIMIT 1');
$statement->execute([':po_id' => $poId]);
$payable = $statement->fetchColumn();
if ($payable === false) { http_response_code(404); echo json_encode(['status' => 'error', 'message' => 'Purchase order not found.']); exit(); }
$summary = purchaseOrderPaymentSummary($pdo, $poId, (float) $payable);
$summary['payments'] = purchaseOrderPaymentHistory($pdo, $poId);
echo json_encode(['status' => 'success', 'payment' => $summary], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);

