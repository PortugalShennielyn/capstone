<?php
require_once '../../config/db_connection.php';
require_once '../../config/auth_context.php';

header('Content-Type: application/json; charset=UTF-8');
header('Access-Control-Allow-Origin: ' . ($_SERVER['HTTP_ORIGIN'] ?? '*'));
header('Access-Control-Allow-Credentials: true');
header('Access-Control-Allow-Headers: Content-Type, X-Tab-Token');

requireValidSession($pdo, [
    'supervisor', 'ro-supervisor', 'ro_supervisor',
    'admin', 'super_admin', 'manager', 'ro-admin', 'ro_manager'
]);

try {
    $pendingPr = (int) $pdo->query(
        "SELECT COUNT(*) FROM purchase_requests WHERE status='Pending Supervisor Approval'"
    )->fetchColumn();

    $expiring = (int) $pdo->query(
        "SELECT COUNT(DISTINCT b.batch_id) FROM inventory_batches b
         WHERE b.batch_status='active'
           AND b.expiry_date IS NOT NULL
           AND b.expiry_date BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 30 DAY)
           AND (b.shelf_qty + b.storage_qty) > 0"
    )->fetchColumn();

    $outOfStock = (int) $pdo->query(
        "SELECT COUNT(*) FROM (
            SELECT p.product_id,
                   COALESCE(SUM(CASE WHEN b.batch_status='active'
                                     AND (b.expiry_date IS NULL OR b.expiry_date >= CURDATE())
                                THEN b.shelf_qty + b.storage_qty ELSE 0 END),0) AS on_hand
            FROM product p
            LEFT JOIN inventory_batches b ON b.product_id = p.product_id
            GROUP BY p.product_id
         ) t WHERE t.on_hand = 0"
    )->fetchColumn();

    echo json_encode([
        'success'                   => true,
        'pending_purchase_requests' => $pendingPr,
        'expiring_within_30'        => $expiring,
        'out_of_stock_products'     => $outOfStock,
    ]);
} catch (PDOException $e) {
    error_log('[SUPERVISOR_SUMMARY] ' . $e->getMessage());
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Server error.']);
}