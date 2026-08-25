<?php
$allowedRoles = ['super_admin','admin','manager','Admin','ro-super-admin','ro-admin','ro-manager'];
require_once '../../config/db_connection.php';
require_once '../../config/require_auth.php';
require_once 'purchase_order_helpers.php';
require_once 'purchase_order_invoice_helpers.php';
if ($_SERVER['REQUEST_METHOD'] !== 'GET') { http_response_code(405); echo json_encode(['status'=>'error','message'=>'Only GET requests are allowed.']); exit; }
$poId = cleanId($_GET['po_id'] ?? null);
if ($poId === '') { http_response_code(400); echo json_encode(['status'=>'error','message'=>'Purchase order is required.']); exit; }
echo json_encode(['status'=>'success','invoice'=>purchaseOrderInvoice($pdo,$poId)], JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES);
?>
