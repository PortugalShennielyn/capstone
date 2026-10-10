<?php

declare(strict_types=1);

require_once __DIR__ . '/../pharma-api/config/db_connection.php';
require_once __DIR__ . '/../pharma-api/v1/purchase_requests/purchase_request_helpers.php';
require_once __DIR__ . '/../pharma-api/v1/purchase_orders/purchase_order_invoice_helpers.php';

function relatedPoAssert(bool $condition, string $message): void
{
    if (!$condition) throw new RuntimeException($message);
}

$indexCheck = $pdo->query(
    "SELECT COUNT(*) FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='purchase_orders'
       AND INDEX_NAME='idx_purchase_orders_pr' AND COLUMN_NAME='pr_id'"
);
relatedPoAssert((int) $indexCheck->fetchColumn() === 1, 'The existing purchase_orders.pr_id index is unavailable.');

$foreignKeyCheck = $pdo->query(
    "SELECT COUNT(*) FROM information_schema.KEY_COLUMN_USAGE
     WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='purchase_orders'
       AND COLUMN_NAME='pr_id' AND REFERENCED_TABLE_NAME='purchase_requests'
       AND REFERENCED_COLUMN_NAME='pr_id'"
);
relatedPoAssert((int) $foreignKeyCheck->fetchColumn() === 1, 'The existing PR-to-PO foreign key is unavailable.');

$userId = (string) $pdo->query("SELECT user_id FROM users WHERE status='Active' LIMIT 1")->fetchColumn();
$supplierId = (string) $pdo->query('SELECT supplier_id FROM suppliers ORDER BY supplier_id LIMIT 1')->fetchColumn();
$productId = (string) $pdo->query("SELECT product_id FROM product WHERE status='Active' LIMIT 1")->fetchColumn();
relatedPoAssert($userId !== '' && $supplierId !== '' && $productId !== '', 'An active user, supplier, and product are required for this test.');

ensurePurchaseOrderInvoiceSchema($pdo);

$pdo->beginTransaction();
try {
    $prId = (string) $pdo->query('SELECT UUID()')->fetchColumn();
    $prItemId = (string) $pdo->query('SELECT UUID()')->fetchColumn();
    $prNumber = 'PR-RELATED-PO-' . strtoupper(bin2hex(random_bytes(4)));
    $pdo->prepare(
        "INSERT INTO purchase_requests (pr_id,pr_number,requested_by,request_date,status)
         VALUES (:pr_id,:pr_number,:requested_by,CURDATE(),'Approved')"
    )->execute([':pr_id'=>$prId, ':pr_number'=>$prNumber, ':requested_by'=>$userId]);
    $pdo->prepare(
        "INSERT INTO purchase_request_items (pr_item_id,pr_id,product_id,requested_qty,approved_qty,unit_label_at_request,stock_qty_at_request)
         VALUES (:pr_item_id,:pr_id,:product_id,1,1,'pcs',0)"
    )->execute([':pr_item_id'=>$prItemId, ':pr_id'=>$prId, ':product_id'=>$productId]);

    $zero = purchaseRequestRelatedPurchaseOrders($pdo, $prId);
    relatedPoAssert($zero !== null && $zero['pr_number'] === $prNumber && count($zero['purchase_orders']) === 0, 'Zero related POs did not return a clean empty result.');

    $insertPo = $pdo->prepare(
        "INSERT INTO purchase_orders
            (po_id,pr_id,supplier_id,po_number,expected_delivery_date,status,total_amount)
         VALUES (:po_id,:pr_id,:supplier_id,:po_number,CURDATE(),'Pending',100.00)"
    );
    foreach ([1, 2] as $sequence) {
        $poId = (string) $pdo->query('SELECT UUID()')->fetchColumn();
        $insertPo->execute([
            ':po_id'=>$poId,
            ':pr_id'=>$prId,
            ':supplier_id'=>$supplierId,
            ':po_number'=>'PO-RELATED-' . $sequence . '-' . strtoupper(bin2hex(random_bytes(4))),
        ]);
        if ($sequence === 1) {
            $emptyResult = purchaseRequestRelatedPurchaseOrders($pdo, $prId);
            relatedPoAssert(count($emptyResult['purchase_orders']) === 0, 'Empty linked POs must not be listed as related purchase orders.');
        }
        $pdo->prepare(
            "INSERT INTO purchase_order_items (po_id,pr_item_id,product_id,quantity,purchase_qty,inventory_qty_ordered,unit_snapshot,purchase_unit_snapshot,units_per_purchase_unit_snapshot)
             VALUES (:po_id,:pr_item_id,:product_id,1,1,1,'pcs','pcs',1)"
        )->execute([':po_id'=>$poId, ':pr_item_id'=>$prItemId, ':product_id'=>$productId]);
        $result = purchaseRequestRelatedPurchaseOrders($pdo, $prId);
        relatedPoAssert(count($result['purchase_orders']) === $sequence, "Expected {$sequence} related purchase order(s).");
        relatedPoAssert((int) $result['purchase_orders'][$sequence - 1]['product_count'] > 0, 'Related purchase orders must include at least one product.');
        relatedPoAssert($pdo->inTransaction(), 'The related PO helper must not commit the surrounding transaction.');
    }

    $frontend = (string) file_get_contents(__DIR__ . '/../pharma-frontend/js/modules/purchase_requests.js');
    relatedPoAssert(str_contains($frontend, "showRelatedPurchaseOrders(request.pr_id)"), 'The Related PO action is not wired to its dedicated function.');
    relatedPoAssert(!str_contains($frontend, "if (control.dataset.prAction === 'related-pos') showDetails(request)"), 'The Related PO action still opens PR details.');
    relatedPoAssert(str_contains($frontend, 'get_related_purchase_orders.php?pr_id='), 'The Related PO modal does not request by PR id.');

    echo "Related Purchase Orders tests passed: existing FK/index, empty linked PO exclusion, real PO listing, transaction rollback, and dedicated UI action.\n";
} finally {
    if ($pdo->inTransaction()) $pdo->rollBack();
}
