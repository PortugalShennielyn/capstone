<?php

declare(strict_types=1);

require_once __DIR__ . '/../pharma-api/config/db_connection.php';
require_once __DIR__ . '/../pharma-api/v1/purchase_requests/automatic_purchase_order_helpers.php';
require_once __DIR__ . '/../pharma-api/v1/purchase_orders/purchase_order_helpers.php';

function emptyGuardAssert(bool $condition, string $message): void
{
    if (!$condition) throw new RuntimeException($message);
}

function emptyGuardExpectInvalidArgument(callable $action, string $expectedMessage): void
{
    try {
        $action();
    } catch (InvalidArgumentException $error) {
        emptyGuardAssert($error->getMessage() === $expectedMessage, 'Unexpected validation message: ' . $error->getMessage());
        return;
    }
    throw new RuntimeException('Expected validation failure: ' . $expectedMessage);
}

ensurePurchaseRequestSchema($pdo);
ensurePurchaseOrderSchema($pdo);

$userId = (string) $pdo->query("SELECT user_id FROM users WHERE status='Active' LIMIT 1")->fetchColumn();
$supplierId = (string) $pdo->query('SELECT supplier_id FROM suppliers ORDER BY supplier_id LIMIT 1')->fetchColumn();
$categoryId = (string) $pdo->query('SELECT category_id FROM product_categories LIMIT 1')->fetchColumn();
$typeId = (string) $pdo->query('SELECT type_id FROM product_types LIMIT 1')->fetchColumn();
$unitId = (string) $pdo->query("SELECT measurement_unit_id FROM product_measurement_units WHERE unit_name = 'pcs' LIMIT 1")->fetchColumn();
emptyGuardAssert($userId !== '' && $supplierId !== '' && $categoryId !== '' && $typeId !== '' && $unitId !== '', 'User, supplier, category, type, and unit fixtures are required for this test.');

$pdo->beginTransaction();
try {
    $pendingPrId = (string) $pdo->query('SELECT UUID()')->fetchColumn();
    $approvedPrId = (string) $pdo->query('SELECT UUID()')->fetchColumn();
    $emptyPoId = (string) $pdo->query('SELECT UUID()')->fetchColumn();
    $normalProductId = (string) $pdo->query('SELECT UUID()')->fetchColumn();
    $normalSupplierProductId = (string) $pdo->query('SELECT UUID()')->fetchColumn();
    $normalPrId = (string) $pdo->query('SELECT UUID()')->fetchColumn();
    $normalPrItemId = (string) $pdo->query('SELECT UUID()')->fetchColumn();

    $insertPr = $pdo->prepare(
        "INSERT INTO purchase_requests (pr_id,pr_number,requested_by,request_date,status)
         VALUES (:pr_id,:pr_number,:requested_by,CURDATE(),:status)"
    );
    $insertPr->execute([
        ':pr_id' => $pendingPrId,
        ':pr_number' => 'PR-EMPTY-GUARD-' . strtoupper(bin2hex(random_bytes(3))),
        ':requested_by' => $userId,
        ':status' => 'Pending Supervisor Approval',
    ]);
    $insertPr->execute([
        ':pr_id' => $approvedPrId,
        ':pr_number' => 'PR-EMPTY-GEN-' . strtoupper(bin2hex(random_bytes(3))),
        ':requested_by' => $userId,
        ':status' => 'Approved',
    ]);

    emptyGuardExpectInvalidArgument(
        static fn() => assertPurchaseRequestHasValidItems($pdo, $pendingPrId, 'Cannot approve an empty Purchase Request.'),
        'Cannot approve an empty Purchase Request.'
    );

    $approvedRequest = purchaseRequestById($pdo, $approvedPrId, true);
    emptyGuardExpectInvalidArgument(
        static fn() => generatePurchaseOrdersForApprovedRequest($pdo, $approvedRequest, [], []),
        'Cannot generate Purchase Order because this Purchase Request has no products.'
    );
    $countPo = $pdo->prepare('SELECT COUNT(*) FROM purchase_orders WHERE pr_id = :pr_id');
    $countPo->execute([':pr_id' => $approvedPrId]);
    emptyGuardAssert((int) $countPo->fetchColumn() === 0, 'Empty PR generation must not insert any purchase orders.');

    $pdo->prepare(
        "INSERT INTO purchase_orders (po_id,pr_id,supplier_id,po_number,expected_delivery_date,status,total_amount)
         VALUES (:po_id,:pr_id,:supplier_id,:po_number,CURDATE(),'Pending',100.00)"
    )->execute([
        ':po_id' => $emptyPoId,
        ':pr_id' => $approvedPrId,
        ':supplier_id' => $supplierId,
        ':po_number' => 'PO-EMPTY-GUARD-' . strtoupper(bin2hex(random_bytes(3))),
    ]);

    emptyGuardExpectInvalidArgument(
        static fn() => assertPurchaseOrderHasProducts($pdo, $emptyPoId),
        'Invalid Purchase Order: no products.'
    );
    emptyGuardExpectInvalidArgument(
        static fn() => updatePurchaseOrderStatus($pdo, $emptyPoId, 'Arrived', 'Pending'),
        'Invalid Purchase Order: no products.'
    );

    $pdo->prepare(
        "INSERT INTO product (product_id,barcode,brand_name,product_name,price,category_id,type_id,inventory_unit_id,status)
         VALUES (:product_id,:barcode,'Guard Brand','Guard Product',100,:category_id,:type_id,:unit_id,'Active')"
    )->execute([
        ':product_id' => $normalProductId,
        ':barcode' => 'GUARD-' . strtoupper(bin2hex(random_bytes(4))),
        ':category_id' => $categoryId,
        ':type_id' => $typeId,
        ':unit_id' => $unitId,
    ]);
    $pdo->prepare(
        "INSERT INTO supplier_products
            (supplier_product_id,supplier_id,product_id,supplier_cost_price,supplier_cost_input,supplier_cost_basis,purchase_unit,inventory_unit,units_per_purchase_unit)
         VALUES (:supplier_product_id,:supplier_id,:product_id,25,25,'inventory','pcs','pcs',1)"
    )->execute([
        ':supplier_product_id' => $normalSupplierProductId,
        ':supplier_id' => $supplierId,
        ':product_id' => $normalProductId,
    ]);
    $insertPr->execute([
        ':pr_id' => $normalPrId,
        ':pr_number' => 'PR-NORMAL-GUARD-' . strtoupper(bin2hex(random_bytes(3))),
        ':requested_by' => $userId,
        ':status' => 'Approved',
    ]);
    $pdo->prepare(
        "INSERT INTO purchase_request_items (pr_item_id,pr_id,product_id,requested_qty,approved_qty,unit_label_at_request,stock_qty_at_request)
         VALUES (:pr_item_id,:pr_id,:product_id,5,5,'pcs',0)"
    )->execute([':pr_item_id' => $normalPrItemId, ':pr_id' => $normalPrId, ':product_id' => $normalProductId]);

    $normalRequest = purchaseRequestById($pdo, $normalPrId, true);
    $generated = generatePurchaseOrdersForApprovedRequest(
        $pdo,
        $normalRequest,
        [['pr_item_id' => $normalPrItemId, 'supplier_product_id' => $normalSupplierProductId, 'order_qty' => 999]],
        [$supplierId => date('Y-m-d', strtotime('+3 days'))]
    );
    emptyGuardAssert(count($generated) === 1, 'A valid one-item PR must generate one purchase order.');
    $generatedPoId = $generated[0]['po_id'] ?? '';
    $generatedItemCount = $pdo->prepare('SELECT COUNT(*) FROM purchase_order_items WHERE po_id = :po_id AND quantity > 0');
    $generatedItemCount->execute([':po_id' => $generatedPoId]);
    emptyGuardAssert((int) $generatedItemCount->fetchColumn() === 1, 'Generated purchase orders must contain a positive item line.');
    $duplicate = generatePurchaseOrdersForApprovedRequest(
        $pdo,
        $normalRequest,
        [['pr_item_id' => $normalPrItemId, 'supplier_product_id' => $normalSupplierProductId]],
        [$supplierId => date('Y-m-d', strtotime('+3 days'))]
    );
    emptyGuardAssert(count($duplicate) === 1 && ($duplicate[0]['po_id'] ?? '') === $generatedPoId, 'Duplicate generation must return the existing PO instead of inserting another.');

    emptyGuardAssert($pdo->inTransaction(), 'Empty guard checks must keep the test transaction open.');
    echo "Empty PR/PO guard tests passed: approval block, generation block, normal generation, duplicate idempotency, and PO transition block.\n";
} finally {
    if ($pdo->inTransaction()) $pdo->rollBack();
}
