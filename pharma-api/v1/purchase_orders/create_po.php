<?php
require_once '../../config/db_connection.php';
$allowedRoles = ['manager', 'ro-manager'];
require_once '../../config/require_auth.php';
require_once 'purchase_order_helpers.php';
require_once '../purchase_requests/purchase_request_helpers.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['status' => 'error', 'message' => 'Only POST requests are allowed.']);
    exit();
}

http_response_code(403);
echo json_encode([
    'status' => 'error',
    'message' => 'Manual purchase-order creation is disabled. Manager/Admin generates purchase orders from Supervisor-approved purchase requests.'
]);
exit();
