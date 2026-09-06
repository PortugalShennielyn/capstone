<?php
require_once '../../config/db_connection.php';
$allowedRoles = ['supervisor', 'manager', 'super_admin', 'admin', 'ro-supervisor', 'ro-manager', 'ro-super-admin', 'ro-admin'];
require_once '../../config/require_auth.php';
require_once 'purchase_request_helpers.php';
require_once 'automatic_purchase_order_helpers.php';
require_once '../inventory/inventory_stock_summary.php';
require_once '../settings/settings_helpers.php';

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    sendPurchaseRequestJson(false, 'Only GET requests are allowed.', null, 405);
}

try {
    ensurePurchaseRequestSchema($pdo);
    $systemSettings = fetchSystemSettings($pdo);
    $status = trim((string) ($_GET['status'] ?? ''));
    $prId = trim((string) ($_GET['pr_id'] ?? ''));
    $conditions = [];
    $params = [];
    if ($status !== '') {
        $conditions[] = 'pr.status = :status';
        $params[':status'] = $status;
    }
    if ($prId !== '') {
        $conditions[] = 'pr.pr_id = :pr_id';
        $params[':pr_id'] = $prId;
    }
    $where = $conditions ? 'WHERE ' . implode(' AND ', $conditions) : '';
    $stmt = $pdo->prepare(
        "SELECT pr.*, u.full_name AS requested_by_name, su.full_name AS supervisor_name,
                COUNT(pri.pr_item_id) AS item_count,
                COALESCE(SUM(pri.requested_qty), 0) AS total_requested_qty,
                COALESCE(po_counts.po_generated_count, 0) AS po_generated_count
         FROM purchase_requests pr
         INNER JOIN users u ON u.user_id = pr.requested_by
         LEFT JOIN users su ON su.user_id = pr.supervisor_user_id
         LEFT JOIN purchase_request_items pri ON pri.pr_id = pr.pr_id
         LEFT JOIN (
             SELECT pr_id, COUNT(po_id) AS po_generated_count
             FROM purchase_orders
             WHERE pr_id IS NOT NULL
             GROUP BY pr_id
         ) po_counts ON po_counts.pr_id = pr.pr_id
         {$where}
         GROUP BY pr.pr_id
         ORDER BY pr.created_at DESC"
    );
    $stmt->execute($params);
    $requests = $stmt->fetchAll(PDO::FETCH_ASSOC);
    $itemsByRequest = [];
    foreach (purchaseRequestItemsForRequests($pdo, array_column($requests, 'pr_id')) as $item) {
        $itemsByRequest[$item['pr_id']][] = $item;
    }
    $allProductIds = [];
    foreach ($requests as &$request) {
        $request['items'] = $itemsByRequest[$request['pr_id']] ?? [];
        $allProductIds = array_merge($allProductIds, array_column($request['items'], 'product_id'));
    }
    unset($request);
    $purchaseOrdersByRequest = purchaseRequestPurchaseOrdersForRequests($pdo, array_column($requests, 'pr_id'));
    $productDetails = purchaseRequestProductDetails($pdo, $allProductIds);
    $canManagePurchasing = currentSessionHasRbacRole('manager') || currentSessionHasRbacRole('admin') || currentSessionHasRbacRole('super_admin')
        || currentSessionHasRbacRole('ro_manager') || currentSessionHasRbacRole('ro_admin') || currentSessionHasRbacRole('ro_super_admin');
    $supplierOptions = $canManagePurchasing ? purchaseRequestSupplierOptions($pdo, $allProductIds) : [];
    $inventoryContext = [];
    $receivedHistory = [];
    {
        $stockSql = inventoryStockSummarySql();
        $contextRows = $pdo->query(
            "SELECT stock.product_id,stock.shelf_quantity,stock.storage_quantity,stock.total_quantity,stock.stock_status
             FROM ({$stockSql}) stock"
        )->fetchAll(PDO::FETCH_ASSOC);
        $recentSalesByProduct = [];
        try {
            $recentSalesRows = $pdo->query(
                "SELECT i.product_id, SUM(i.quantity) AS quantity_sold
                 FROM sales_orders o
                 INNER JOIN sales_order_items i ON i.order_id = o.order_id
                 WHERE o.status = 'completed'
                   AND o.completed_at >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
                 GROUP BY i.product_id"
            )->fetchAll(PDO::FETCH_ASSOC);
            foreach ($recentSalesRows as $recentSalesRow) {
                $recentSalesByProduct[(string) $recentSalesRow['product_id']] = (int) $recentSalesRow['quantity_sold'];
            }
        } catch (PDOException $e) {
            // Recent-sales velocity is supplementary context. Keep procurement
            // available while an optional sales table is being repaired/migrated.
            error_log('[PURCHASE REQUESTS] Recent sales context unavailable: ' . $e->getMessage());
        }
        foreach ($contextRows as $row) {
            $productId = (string) $row['product_id'];
            $inventoryContext[(string) $row['product_id']] = [
                'shelf_stock'=>(int)$row['shelf_quantity'],
                'storage_stock'=>(int)$row['storage_quantity'],
                'on_hand'=>(int)$row['total_quantity'],
                'stock_condition'=>(string)$row['stock_status'],
                'sold_last_30_days'=>$recentSalesByProduct[$productId] ?? 0,
            ];
        }
        foreach ($pdo->query('SELECT DISTINCT product_id FROM inventory_batches WHERE received_qty > 0')->fetchAll(PDO::FETCH_COLUMN) as $receivedProductId) {
            $receivedHistory[(string) $receivedProductId] = true;
        }
    }
    foreach ($requests as &$request) {
        foreach ($request['items'] as &$item) {
            $productId = (string) $item['product_id'];
            $context = $inventoryContext[$productId] ?? [
                'shelf_stock'=>0,'storage_stock'=>0,'on_hand'=>0,
                'stock_condition'=>isset($receivedHistory[$productId]) ? 'Out of Stock' : 'New Product',
                'sold_last_30_days'=>0
            ];
            $item = array_merge($item, $productDetails[$productId] ?? [], $context);
            if ($request['status'] === 'Approved' && $canManagePurchasing) {
                $item['supplier_options'] = $supplierOptions[$productId] ?? [];
            }
        }
        unset($item);
        $riskConditions = array_values(array_unique(array_filter(array_column($request['items'], 'stock_condition'))));
        $request['stock_risk'] = count($riskConditions) > 1 ? 'Mixed' : ($riskConditions[0] ?? 'Normal');
        $request['po_generated_count'] = (int) ($request['po_generated_count'] ?? 0);
        $request['purchase_orders'] = $purchaseOrdersByRequest[(string) $request['pr_id']] ?? [];
        $request['total_ordered_qty'] = array_sum(array_map(static fn(array $item): float => (float) $item['ordered_qty'], $request['items']));
        $request['total_remaining_qty'] = array_sum(array_map(static fn(array $item): float => (float) $item['remaining_qty'], $request['items']));
        $request['workflow_status'] = $request['status'];
        if ($request['status'] === 'Approved' && (float) $request['total_ordered_qty'] > 0) {
            $request['workflow_status'] = (float) $request['total_remaining_qty'] > 0 ? 'Partially Ordered' : 'Ordered';
        }
    }
    unset($request);

    sendPurchaseRequestJson(true, 'Purchase requests loaded.', [
        'requests' => $requests,
        'procurementDocumentSettings' => [
            'prPreparedName' => $systemSettings['prPreparedName'] ?? '',
            'prPreparedRole' => $systemSettings['prPreparedRole'] ?? 'Manager',
            'prReviewedName' => $systemSettings['prReviewedName'] ?? '',
            'prReviewedRole' => $systemSettings['prReviewedRole'] ?? 'Supervisor',
        ],
    ]);
} catch (Throwable $e) {
    error_log('[PURCHASE REQUESTS] Unable to load requests: ' . $e->getMessage());
    sendPurchaseRequestJson(false, 'Unable to load purchase requests.', null, 500);
}
?>
