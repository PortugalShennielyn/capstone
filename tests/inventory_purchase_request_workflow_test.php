<?php

declare(strict_types=1);

require_once __DIR__ . '/../pharma-api/config/db_connection.php';
require_once __DIR__ . '/../pharma-api/config/id_helpers.php';
require_once __DIR__ . '/../pharma-api/v1/inventory/inventory_stock_summary.php';
require_once __DIR__ . '/../pharma-api/v1/purchase_requests/purchase_request_helpers.php';

function inventoryPrAssert(bool $condition, string $message): void
{
    if (!$condition) throw new RuntimeException($message);
}

$stockSql = inventoryStockSummarySql();
$beforePrCount = (int) $pdo->query('SELECT COUNT(*) FROM purchase_requests')->fetchColumn();
$beforePrItemCount = (int) $pdo->query('SELECT COUNT(*) FROM purchase_request_items')->fetchColumn();
$typeId = (string) $pdo->query('SELECT type_id FROM product_types ORDER BY type_id LIMIT 1')->fetchColumn();
$managerId = (string) $pdo->query("SELECT user_id FROM users WHERE role = 'manager' AND status = 'Active' ORDER BY user_id LIMIT 1")->fetchColumn();
$inventoryUnitId = (string) $pdo->query("SELECT measurement_unit_id FROM product_measurement_units WHERE measurement_group='Count' AND LOWER(unit_name)='each' LIMIT 1")->fetchColumn();
inventoryPrAssert($typeId !== '' && $managerId !== '' && $inventoryUnitId !== '', 'The workflow fixture requires an active Manager, product type, and Each unit.');

$cases = [
    'A' => ['storage' => 0, 'shelf' => 0, 'on_hand' => 0, 'status' => 'Out of Stock', 'selectable' => true],
    'B' => ['storage' => 20, 'shelf' => 0, 'on_hand' => 20, 'status' => 'Low Stock', 'selectable' => true],
    'C' => ['storage' => 0, 'shelf' => 30, 'on_hand' => 30, 'status' => 'Low Stock', 'selectable' => true],
    'D' => ['storage' => 20, 'shelf' => 10, 'on_hand' => 30, 'status' => 'Low Stock', 'selectable' => true],
    'E' => ['storage' => 31, 'shelf' => 0, 'on_hand' => 31, 'status' => 'In Stock', 'selectable' => false],
    'F' => ['storage' => 100, 'shelf' => 0, 'on_hand' => 100, 'status' => 'In Stock', 'selectable' => false],
];

$pdo->beginTransaction();
try {
    $insertProduct = $pdo->prepare(
        "INSERT INTO product (product_id, barcode, brand_name, product_name, price, type_id, inventory_unit_id, status)
         VALUES (:product_id, :barcode, 'Workflow Test', :product_name, 1, :type_id, :inventory_unit_id, 'Active')"
    );
    $insertBatch = $pdo->prepare(
        "INSERT INTO inventory_batches
            (batch_id, product_id, received_qty, storage_qty, shelf_qty, batch_status)
         VALUES (:batch_id, :product_id, :received_qty, :storage_qty, :shelf_qty, 'active')"
    );
    $insertShelf = $pdo->prepare(
        "INSERT INTO product_selling_stock
            (selling_stock_id, product_id, source_batch_id, batch_number, quantity_stocked, quantity_remaining)
         VALUES (:selling_stock_id, :product_id, :batch_id, :batch_number, :quantity_stocked, :quantity_remaining)"
    );

    foreach ($cases as $label => &$case) {
        $productId = newUuid($pdo);
        $batchId = newUuid($pdo);
        $case['product_id'] = $productId;
        $insertProduct->execute([
            ':product_id' => $productId,
            ':barcode' => 'inventory-pr-' . strtolower($label) . '-' . $productId,
            ':product_name' => "Inventory PR Case {$label}",
            ':type_id' => $typeId,
            ':inventory_unit_id' => $inventoryUnitId,
        ]);
        $insertBatch->execute([
            ':batch_id' => $batchId,
            ':product_id' => $productId,
            ':received_qty' => $case['storage'] + $case['shelf'],
            ':storage_qty' => $case['storage'],
            ':shelf_qty' => $case['shelf'],
        ]);
        if ($case['shelf'] > 0) {
            $insertShelf->execute([
                ':selling_stock_id' => newUuid($pdo),
                ':product_id' => $productId,
                ':batch_id' => $batchId,
                ':batch_number' => "WORKFLOW-{$label}",
                ':quantity_stocked' => $case['shelf'],
                ':quantity_remaining' => $case['shelf'],
            ]);
        }
    }
    unset($case);

    $caseIds = array_column($cases, 'product_id');
    $placeholders = implode(',', array_fill(0, count($caseIds), '?'));
    $stockStatement = $pdo->prepare("SELECT * FROM ({$stockSql}) stock WHERE product_id IN ({$placeholders})");
    $stockStatement->execute($caseIds);
    $stockByProduct = [];
    foreach ($stockStatement->fetchAll(PDO::FETCH_ASSOC) as $row) $stockByProduct[$row['product_id']] = $row;

    $lowCount = 0;
    $outCount = 0;
    foreach ($cases as $label => $case) {
        $stock = $stockByProduct[$case['product_id']] ?? null;
        inventoryPrAssert($stock !== null, "Case {$label} was not tracked by Inventory.");
        inventoryPrAssert((int) $stock['storage_quantity'] === $case['storage'], "Case {$label} storage is incorrect.");
        inventoryPrAssert((int) $stock['shelf_quantity'] === $case['shelf'], "Case {$label} shelf is incorrect.");
        inventoryPrAssert((int) $stock['total_quantity'] === $case['on_hand'], "Case {$label} On Hand is incorrect.");
        inventoryPrAssert($stock['stock_status'] === $case['status'], "Case {$label} stock status is incorrect.");
        $selectable = in_array($stock['stock_status'], ['Low Stock', 'Out of Stock'], true);
        inventoryPrAssert($selectable === $case['selectable'], "Case {$label} PR eligibility is incorrect.");
        $lowCount += $stock['stock_status'] === 'Low Stock' ? 1 : 0;
        $outCount += $stock['stock_status'] === 'Out of Stock' ? 1 : 0;
    }
    inventoryPrAssert($lowCount === 3, 'Low Stock summary must count three products, not their 80 total units.');
    inventoryPrAssert($outCount === 1, 'Out of Stock summary must count one product.');

    $prId = newUuid($pdo);
    $prNumber = 'PR-WORKFLOW-' . strtoupper(bin2hex(random_bytes(3)));
    $pdo->prepare(
        "INSERT INTO purchase_requests (pr_id, pr_number, requested_by, request_date, status)
         VALUES (:pr_id, :pr_number, :requested_by, CURDATE(), 'Draft')"
    )->execute([':pr_id' => $prId, ':pr_number' => $prNumber, ':requested_by' => $managerId]);
    $prItemId = newUuid($pdo);
    $pdo->prepare(
        "INSERT INTO purchase_request_items
            (pr_item_id, pr_id, product_id, stock_qty_at_request, requested_qty, unit_label_at_request)
         VALUES (:item_id, :pr_id, :product_id, 0, 24, 'pcs')"
    )->execute([':item_id' => $prItemId, ':pr_id' => $prId, ':product_id' => $cases['A']['product_id']]);

    $draftConflict = activePurchaseRequestConflict($pdo, $cases['A']['product_id']);
    inventoryPrAssert(($draftConflict['pr_number'] ?? '') === $prNumber, 'Draft PR duplicate detection failed.');
    $duplicateBlocked = false;
    try {
        assertNoActivePurchaseRequestConflict($pdo, $cases['A']['product_id'], 'Inventory PR Case A');
    } catch (InvalidArgumentException $error) {
        $duplicateBlocked = str_contains($error->getMessage(), '24 units requested') && str_contains($error->getMessage(), $prNumber);
    }
    inventoryPrAssert($duplicateBlocked, 'The active replenishment warning is missing its quantity or PR number.');

    $pdo->prepare("UPDATE purchase_requests SET status = 'Pending Supervisor Approval' WHERE pr_id = :pr_id")
        ->execute([':pr_id' => $prId]);
    inventoryPrAssert(activePurchaseRequestConflict($pdo, $cases['A']['product_id']) !== null, 'Submitted PR duplicate detection failed.');

    $rejectedRetryId = newUuid($pdo);
    $rejectedRetryNumber = 'PR-WORKFLOW-REJECTED-' . strtoupper(bin2hex(random_bytes(3)));
    $pdo->prepare(
        "INSERT INTO purchase_requests (pr_id, pr_number, requested_by, request_date, status, created_at)
         VALUES (:pr_id, :pr_number, :requested_by, CURDATE(), 'Rejected', DATE_ADD(NOW(), INTERVAL 1 SECOND))"
    )->execute([':pr_id' => $rejectedRetryId, ':pr_number' => $rejectedRetryNumber, ':requested_by' => $managerId]);
    $pdo->prepare(
        "INSERT INTO purchase_request_items
            (pr_item_id, pr_id, product_id, stock_qty_at_request, requested_qty, unit_label_at_request)
         VALUES (:item_id, :pr_id, :product_id, 0, 24, 'pcs')"
    )->execute([':item_id' => newUuid($pdo), ':pr_id' => $rejectedRetryId, ':product_id' => $cases['A']['product_id']]);
    inventoryPrAssert(activePurchaseRequestConflict($pdo, $cases['A']['product_id']) === null, 'A newer rejected PR must clear older pending PR conflicts.');
    $pdo->prepare('DELETE FROM purchase_request_items WHERE pr_id = :pr_id')->execute([':pr_id' => $rejectedRetryId]);
    $pdo->prepare('DELETE FROM purchase_requests WHERE pr_id = :pr_id')->execute([':pr_id' => $rejectedRetryId]);

    $supplierIds = $pdo->query('SELECT supplier_id FROM suppliers WHERE archived_at IS NULL ORDER BY supplier_id LIMIT 2')->fetchAll(PDO::FETCH_COLUMN);
    inventoryPrAssert(count($supplierIds) === 2, 'The multi-PO fixture requires two active suppliers.');
    $pdo->prepare("UPDATE purchase_requests SET status = 'Approved' WHERE pr_id = :pr_id")->execute([':pr_id' => $prId]);
    $insertPo = $pdo->prepare("INSERT INTO purchase_orders (po_id, pr_id, po_number, supplier_id, status) VALUES (:po_id, :pr_id, :po_number, :supplier_id, 'Pending')");
    $insertPoItem = $pdo->prepare('INSERT INTO purchase_order_items (po_item_id, po_id, pr_item_id, product_id, quantity, inventory_qty_ordered) VALUES (:po_item_id, :po_id, :pr_item_id, :product_id, :quantity, :inventory_qty_ordered)');
    foreach ([10, 14] as $index => $quantity) {
        $poId = newUuid($pdo);
        $insertPo->execute([':po_id' => $poId, ':pr_id' => $prId, ':po_number' => $prNumber . '-PO-' . ($index + 1), ':supplier_id' => $supplierIds[$index]]);
        $insertPoItem->execute([
            ':po_item_id' => newUuid($pdo), ':po_id' => $poId, ':pr_item_id' => $prItemId,
            ':product_id' => $cases['A']['product_id'], ':quantity' => $quantity, ':inventory_qty_ordered' => $quantity,
        ]);
    }
    $orderedItems = purchaseRequestItems($pdo, $prId);
    inventoryPrAssert((float) $orderedItems[0]['ordered_qty'] === 24.0, 'Two PO lines were not aggregated against the PR item.');
    inventoryPrAssert((float) $orderedItems[0]['remaining_qty'] === 0.0, 'The PR item remaining quantity is incorrect after two POs.');
    inventoryPrAssert(count(purchaseRequestPurchaseOrders($pdo, $prId)) === 2, 'One PR must retain both PO references.');
    inventoryPrAssert(activePurchaseRequestConflict($pdo, $cases['A']['product_id']) === null, 'A fully ordered PR item must not block a future replenishment request.');

    $pdo->prepare("UPDATE purchase_requests SET status = 'Rejected' WHERE pr_id = :pr_id")
        ->execute([':pr_id' => $prId]);
    inventoryPrAssert(activePurchaseRequestConflict($pdo, $cases['A']['product_id']) === null, 'Rejected PRs must not block replenishment.');
} finally {
    $pdo->rollBack();
}

inventoryPrAssert((int) $pdo->query('SELECT COUNT(*) FROM purchase_requests')->fetchColumn() === $beforePrCount, 'The workflow test left a PR record behind.');
inventoryPrAssert((int) $pdo->query('SELECT COUNT(*) FROM purchase_request_items')->fetchColumn() === $beforePrItemCount, 'The workflow test left a PR item behind.');

$inventoryHtml = (string) file_get_contents(__DIR__ . '/../pharma-frontend/inventory.html');
$inventoryJs = (string) file_get_contents(__DIR__ . '/../pharma-frontend/js/modules/inventory.js');
$requestHtml = (string) file_get_contents(__DIR__ . '/../pharma-frontend/purchase_requests.html');
$requestJs = (string) file_get_contents(__DIR__ . '/../pharma-frontend/js/modules/purchase_requests.js');
inventoryPrAssert(str_contains($inventoryJs, 'id="inventoryPrSelectAll"'), 'Inventory Select All control is missing from the dynamic table header.');
inventoryPrAssert(str_contains($inventoryHtml, 'id="createInventoryPrButton"'), 'Inventory Create Purchase Request action is missing.');
inventoryPrAssert(str_contains($inventoryJs, "['low_stock', 'out_of_stock']"), 'Inventory PR controls are not restricted to low/out-of-stock modes.');
inventoryPrAssert(str_contains($inventoryJs, "product_ids: eligibleIds.join(',')"), 'Inventory does not pass all selected products to Purchase Requests.');
inventoryPrAssert(str_contains($requestHtml, 'Submit for Supervisor Approval'), 'The PR modal is missing Supervisor submission.');
inventoryPrAssert(str_contains($requestHtml, 'id="createRequestButton"'), 'The Purchase Requests page is missing the Create PR button.');
inventoryPrAssert(str_contains($requestHtml, '<th>Shelf</th><th>Storage</th><th>On Hand</th><th>Status</th><th>Requested Qty</th>'), 'The PR catalog stock context columns are missing.');
inventoryPrAssert(str_contains($requestHtml, 'id="finalizeRequestModal"'), 'The PR review/finalize step is missing.');
inventoryPrAssert(!str_contains($requestHtml, 'id="requestItems"'), 'The obsolete duplicate Requested Products table still exists.');
inventoryPrAssert(str_contains($requestHtml, 'id="previewRequestButton"'), 'The unsaved PR Print Preview action is missing.');
inventoryPrAssert(!str_contains($requestHtml, 'id="requestNotes"'), 'Notes/Reason must not appear in the Finalize PR workflow.');
inventoryPrAssert(str_contains($requestJs, 'const selectedItems = new Map()'), 'PR product selections are not stored in one persistent draft-state map.');
inventoryPrAssert(str_contains($requestJs, 'requestInFlight'), 'PR double-submit prevention is missing.');
inventoryPrAssert(str_contains($requestJs, 'primaryAccessRole(session)'), 'Create PR visibility must use the authoritative session role resolver.');
inventoryPrAssert(!str_contains($requestJs, '.filter(product => inventoryByProduct.has'), 'The PR catalog still requires an Inventory row instead of using Product Master as its base.');
inventoryPrAssert(str_contains($requestJs, "stockStatus: inventory ? inventory.stock_status : 'New Product'"), 'A Product Master item without received Inventory is not identified as a New Product.');
inventoryPrAssert(str_contains($requestJs, 'return Boolean(type)'), 'The PR catalog does not exclude healthy products.');
inventoryPrAssert(str_contains($requestJs, 'product.barcode'), 'PR catalog search does not include the internal barcode field.');

$createRequestPhp = (string) file_get_contents(__DIR__ . '/../pharma-api/v1/purchase_requests/create_purchase_request.php');
$saveRequestPhp = (string) file_get_contents(__DIR__ . '/../pharma-api/v1/purchase_requests/save_purchase_request.php');
inventoryPrAssert(!str_contains($createRequestPhp, 'A purchase request reason is required.'), 'New PR submission still incorrectly requires a reason.');
inventoryPrAssert(!str_contains($saveRequestPhp, 'A purchase request reason is required.'), 'Draft/resubmission still incorrectly requires a reason.');
inventoryPrAssert(is_file(__DIR__ . '/../pharma-frontend/purchase_request_print.html'), 'The printable A4 PR template is missing.');
$printHtml = (string) file_get_contents(__DIR__ . '/../pharma-frontend/purchase_request_print.html');
$printJs = (string) file_get_contents(__DIR__ . '/../pharma-frontend/js/modules/purchase_request_print.js');
$documentRenderer = (string) file_get_contents(__DIR__ . '/../pharma-frontend/js/modules/pr_document_renderer.js');
inventoryPrAssert(str_contains($printJs, 'drpPrPreview:'), 'Unsaved Print Preview is not routed through the saved PR print renderer.');
inventoryPrAssert(str_contains($documentRenderer, '<th>No.</th><th>Product Description</th><th>Unit / Packing</th><th>Shelf</th><th>Storage</th><th>On Hand</th><th>Requested / Approved Qty</th>'), 'The A4 PR renderer does not use the required seven-column audit layout.');
inventoryPrAssert(!str_contains($printHtml, 'Supplier Cost') && !str_contains($printHtml, 'Mode Payment') && !str_contains($printHtml, 'PO Total'), 'PO-only fields leaked into the PR print template.');

$createPoPhp = (string) file_get_contents(__DIR__ . '/../pharma-api/v1/purchase_orders/create_po.php');
inventoryPrAssert(str_contains($createPoPhp, "':pr_item_id'"), 'PO creation does not persist PR item traceability.');
inventoryPrAssert(!str_contains($createPoPhp, 'This purchase request already has a purchase order.'), 'PO creation still enforces one PO per PR.');
inventoryPrAssert(str_contains((string) file_get_contents(__DIR__ . '/../pharma-api/v1/purchase_requests/purchase_request_helpers.php'), 'WHERE po.pr_id = :pr_id'), 'Related POs are not queried through purchase_orders.pr_id.');

echo "Inventory-to-Purchase-Request workflow tests passed.\n";
