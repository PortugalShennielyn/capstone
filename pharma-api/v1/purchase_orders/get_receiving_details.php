<?php
$allowedRoles = ['super_admin', 'admin', 'manager', 'Admin', 'ro-super-admin', 'ro-admin', 'ro-manager'];
require_once '../../config/db_connection.php';
require_once '../../config/require_auth.php';
require_once __DIR__ . '/purchase_order_receiving_helpers.php';
require_once __DIR__ . '/../settings/settings_helpers.php';
require_once __DIR__ . '/purchase_order_receiving_revision_helpers.php';

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    http_response_code(405);
    echo json_encode(['status' => 'error', 'message' => 'Only GET requests are allowed.']);
    exit();
}
$poId = cleanId($_GET['po_id'] ?? null);
if ($poId === '') {
    http_response_code(400);
    echo json_encode(['status' => 'error', 'message' => 'Purchase order id is required.']);
    exit();
}
try {
    ensurePurchaseOrderReceivingRevisionSchema($pdo);
    $details = buildPurchaseOrderReceivingDetails($pdo, $poId);
    if (!$details) {
        http_response_code(404);
        echo json_encode(['status' => 'error', 'message' => 'Completed receiving record not found.']);
        exit();
    }
    $settings = fetchSystemSettings($pdo);
    $details['pharmacy'] = [
        'name' => $settings['name'] ?? 'Dr. R Pharmacy',
        'address' => $settings['address'] ?? '',
        'contact_number' => $settings['contactNumber'] ?? ''
    ];
    $details['grn_settings'] = [
        'received_by_name' => $settings['grnReceivedByName'] ?? '',
        'approved_by_name' => $settings['grnApprovedByName'] ?? '',
    ];
    $details['latest_revision'] = latestPurchaseOrderReceivingRevision($pdo, cleanId($details['receiving_id']));
    echo json_encode(['status' => 'success', 'receiving' => $details], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
} catch (Throwable $error) {
    http_response_code(500);
    echo json_encode(['status' => 'error', 'message' => 'Unable to load receiving details.', 'error' => $error->getMessage()]);
}
