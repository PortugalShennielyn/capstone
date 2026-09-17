<?php

declare(strict_types=1);

require_once __DIR__ . '/../pharma-api/config/db_connection.php';
require_once __DIR__ . '/../pharma-api/v1/purchase_requests/automatic_purchase_order_helpers.php';

function automaticPoAssert(bool $condition, string $message): void
{
    if (!$condition) throw new RuntimeException($message);
}

ensurePurchaseRequestSchema($pdo);
ensurePurchaseOrderSchema($pdo);

$rows = $pdo->query(
    "SELECT sp.supplier_product_id, sp.supplier_id, sp.product_id,
            sp.supplier_cost_price, sp.purchase_unit, sp.units_per_purchase_unit
     FROM supplier_products sp
     INNER JOIN suppliers s ON s.supplier_id = sp.supplier_id AND s.archived_at IS NULL
     INNER JOIN product p ON p.product_id = sp.product_id AND p.status = 'Active'
     WHERE sp.supplier_cost_price > 0
       AND NULLIF(TRIM(sp.purchase_unit), '') IS NOT NULL
       AND sp.units_per_purchase_unit > 0
     ORDER BY sp.supplier_id, sp.product_id"
)->fetchAll(PDO::FETCH_ASSOC);

$selected = [];
$suppliers = [];
$products = [];
foreach ($rows as $row) {
    if (isset($products[$row['product_id']])) continue;
    if ($selected && isset($suppliers[$row['supplier_id']])) continue;
    $selected[] = $row;
    $suppliers[$row['supplier_id']] = true;
    $products[$row['product_id']] = true;
    if (count($selected) === 2) break;
}
automaticPoAssert(count($selected) === 2, 'Two valid supplier-product fixtures from different suppliers are required.');

$requestedBy = $pdo->query(
    "SELECT user_id FROM users
     WHERE role IN ('manager','admin','super_admin') AND status = 'Active'
     LIMIT 1"
)->fetchColumn();
automaticPoAssert(is_string($requestedBy) && $requestedBy !== '', 'An active Manager/Admin fixture is required.');

$inventoryBefore = (int) $pdo->query('SELECT COUNT(*) FROM inventory_batches')->fetchColumn();
$prId = null;
$changedSupplierProducts = [];
$supplierProductByPrItem = [];
try {
    $prId = newUuid($pdo);
    $pdo->prepare(
        "INSERT INTO purchase_requests
            (pr_id, pr_number, requested_by, request_date, status, submitted_at)
         VALUES (:pr_id, :pr_number, :requested_by, CURDATE(), 'Pending Supervisor Approval', NOW())"
    )->execute([
        ':pr_id' => $prId,
        ':pr_number' => 'PR-TEST-' . strtoupper(bin2hex(random_bytes(4))),
        ':requested_by' => $requestedBy,
    ]);

    $assignments = [];
    foreach ($selected as $index => $row) {
        $prItemId = newUuid($pdo);
        $conversion = (int) $row['units_per_purchase_unit'];
        $requestedQty = $conversion + 1;
        $approvedQty = ($conversion * 3) + 1;
        $pdo->prepare(
            'INSERT INTO purchase_request_items
                (pr_item_id, pr_id, product_id, stock_qty_at_request, requested_qty, approved_qty, unit_label_at_request)
             VALUES (:pr_item_id, :pr_id, :product_id, 0, :requested_qty, :approved_qty, :unit)'
        )->execute([
            ':pr_item_id' => $prItemId, ':pr_id' => $prId, ':product_id' => $row['product_id'],
            ':requested_qty' => $requestedQty, ':approved_qty' => $approvedQty, ':unit' => 'base units',
        ]);
        $assignments[] = [
            'pr_item_id' => $prItemId,
            'supplier_product_id' => $row['supplier_product_id'],
            'order_qty' => 99,
        ];
        $supplierProductByPrItem[$prItemId] = $row['supplier_product_id'];
    }

    $request = purchaseRequestById($pdo, $prId, true);
    $supplierEtas = [];
    foreach ($selected as $row) {
        $supplierEtas[$row['supplier_id']] = date('Y-m-d', strtotime('+7 days'));
    }
    $generated = generatePurchaseOrdersForApprovedRequest($pdo, $request, $assignments, $supplierEtas);
    automaticPoAssert(count($generated) === 2, 'One PR assigned to two suppliers must generate exactly two POs.');

    $paymentTerms = $pdo->prepare('SELECT DISTINCT payment_terms FROM purchase_orders WHERE pr_id = :pr_id');
    $paymentTerms->execute([':pr_id' => $prId]);
    automaticPoAssert($paymentTerms->fetchAll(PDO::FETCH_COLUMN) === ['Cash'], 'Every generated supplier PO must automatically use Cash.');

    $stmt = $pdo->prepare(
        'SELECT po.pr_id, po.status, po.total_amount, poi.purchase_qty, poi.units_per_purchase_unit_snapshot,
                poi.inventory_qty_ordered, poi.unit_price_snapshot, poi.line_total,
                poi.pr_item_id, pri.approved_qty
         FROM purchase_orders po
         INNER JOIN purchase_order_items poi ON poi.po_id = po.po_id
         INNER JOIN purchase_request_items pri ON pri.pr_item_id = poi.pr_item_id
         WHERE po.pr_id = :pr_id
         ORDER BY poi.po_item_id'
    );
    $stmt->execute([':pr_id' => $prId]);
    $poItems = $stmt->fetchAll(PDO::FETCH_ASSOC);
    automaticPoAssert(count($poItems) === 2, 'Every PR line must be linked to one generated PO item.');
    foreach ($poItems as $item) {
        $supplierProductId = $supplierProductByPrItem[$item['pr_item_id']] ?? '';
        automaticPoAssert($supplierProductId !== '', 'The test supplier assignment was not retained in memory.');
        automaticPoAssert($item['pr_id'] === $prId, 'Generated PO must retain its originating PR reference.');
        automaticPoAssert($item['status'] === 'Draft', 'Every automatically generated PO must start as Draft.');
        automaticPoAssert($item['total_amount'] === null, 'A Draft PO must not have a confirmed total amount.');
        automaticPoAssert((int) $item['purchase_qty'] === (int) ceil((float) $item['approved_qty'] / (float) $item['units_per_purchase_unit_snapshot']), 'PO quantity must be derived from the approved requirement.');
        automaticPoAssert((int) $item['purchase_qty'] !== 99, 'A browser-supplied order quantity must be ignored.');
        automaticPoAssert((int) $item['inventory_qty_ordered'] === (int) $item['purchase_qty'] * (int) $item['units_per_purchase_unit_snapshot'], 'Expected base quantity snapshot is incorrect.');
        automaticPoAssert($item['unit_price_snapshot'] === null, 'Supplier reference cost must not become a Draft PO item cost.');
        automaticPoAssert($item['line_total'] === null, 'Draft PO line totals must remain unknown.');

        $pdo->prepare('UPDATE supplier_products SET supplier_cost_price = supplier_cost_price + 7.25 WHERE supplier_product_id = :id')
            ->execute([':id' => $supplierProductId]);
        $changedSupplierProducts[] = $supplierProductId;
        $snapshot = $pdo->prepare('SELECT unit_price_snapshot FROM purchase_order_items WHERE pr_item_id = :pr_item_id');
        $snapshot->execute([':pr_item_id' => $item['pr_item_id']]);
        automaticPoAssert($snapshot->fetchColumn() === null, 'Changing supplier reference cost must not populate a Draft PO item cost.');
    }

    automaticPoAssert((int) $pdo->query('SELECT COUNT(*) FROM inventory_batches')->fetchColumn() === $inventoryBefore, 'PO generation must not add inventory.');
    echo "Automatic PO approved-quantity, Draft lifecycle, and cost-decoupling tests passed.\n";
} finally {
    foreach (array_unique($changedSupplierProducts) as $supplierProductId) {
        $pdo->prepare('UPDATE supplier_products SET supplier_cost_price = supplier_cost_price - 7.25 WHERE supplier_product_id = :id')
            ->execute([':id' => $supplierProductId]);
    }
    if ($prId) {
        $pdo->prepare('DELETE FROM purchase_orders WHERE pr_id = :pr_id')->execute([':pr_id' => $prId]);
        $pdo->prepare('DELETE FROM purchase_requests WHERE pr_id = :pr_id')->execute([':pr_id' => $prId]);
    }
}
