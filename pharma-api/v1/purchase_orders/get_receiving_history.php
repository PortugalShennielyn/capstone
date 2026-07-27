<?php
$allowedRoles = ['super_admin', 'admin', 'manager', 'Admin', 'ro-super-admin', 'ro-admin', 'ro-manager'];
require_once '../../config/db_connection.php';
require_once '../../config/require_auth.php';
require_once __DIR__ . '/purchase_order_receiving_helpers.php';

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    http_response_code(405);
    echo json_encode(['status' => 'error', 'message' => 'Only GET requests are allowed.']);
    exit();
}

try {
    if (!purchaseOrderPaymentTableExists($pdo)) throw new RuntimeException('Purchase order payment storage is not installed.');
    $statement = $pdo->query(
        'SELECT por.po_id
         FROM purchase_order_receiving por
         WHERE EXISTS (SELECT 1 FROM purchase_order_receiving_items pori WHERE pori.receiving_id = por.receiving_id)
         ORDER BY por.received_date DESC, por.receiving_id DESC'
    );
    $history = [];
    foreach ($statement->fetchAll(PDO::FETCH_COLUMN) as $poId) {
        $details = buildPurchaseOrderReceivingDetails($pdo, cleanId($poId));
        if (!$details) continue;
        $history[] = [
            'po_id' => $details['po_id'], 'grn_number' => $details['grn_number'], 'po_number' => $details['po_number'],
            'supplier_name' => $details['supplier_name'], 'arrival_date' => $details['expected_delivery_date'],
            'received_date' => $details['received_date'], 'products' => $details['products'],
            'ordered_units' => $details['totals']['ordered_units'],
            'accepted_units' => $details['totals']['accepted_units'], 'affected_units' => $details['totals']['affected_units'],
            'inventory_added' => $details['totals']['inventory_added'], 'receiving_result' => $details['receiving_result'],
            'payment_status' => $details['payment']['payment_status'], 'remaining_balance' => $details['payment']['remaining_balance'],
            'received_by' => $details['received_by'], 'po_status' => $details['status']
        ];
    }
    echo json_encode(['status' => 'success', 'history' => $history], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
} catch (Throwable $error) {
    http_response_code(500);
    echo json_encode(['status' => 'error', 'message' => 'Unable to load inspection history.', 'error' => $error->getMessage()]);
}
