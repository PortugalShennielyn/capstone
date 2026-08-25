<?php

declare(strict_types=1);

function singleApprovalAssert(bool $condition, string $message): void
{
    if (!$condition) throw new RuntimeException($message);
}

$root = dirname(__DIR__);
$supervisorHtml = (string) file_get_contents($root . '/pharma-frontend/supervisor_approval.html');
$supervisorJs = (string) file_get_contents($root . '/pharma-frontend/js/modules/supervisor_approval.js');
$managerHtml = (string) file_get_contents($root . '/pharma-frontend/purchase_requests.html');
$managerJs = (string) file_get_contents($root . '/pharma-frontend/js/modules/purchase_requests.js');
$decisionPhp = (string) file_get_contents($root . '/pharma-api/v1/purchase_requests/decide_purchase_request.php');
$generationPhp = (string) file_get_contents($root . '/pharma-api/v1/purchase_requests/generate_purchase_orders.php');
$generationHelper = (string) file_get_contents($root . '/pharma-api/v1/purchase_requests/automatic_purchase_order_helpers.php');
$requestListPhp = (string) file_get_contents($root . '/pharma-api/v1/purchase_requests/get_purchase_requests.php');

singleApprovalAssert(str_contains($supervisorHtml, 'Supervisor PR Approval'), 'Supervisor role label is missing.');
singleApprovalAssert(!str_contains($supervisorHtml, 'Continue to Purchasing Setup'), 'Supervisor still has the Purchasing Setup transition.');
singleApprovalAssert(!str_contains($supervisorHtml, 'Manage Supplier Pricing'), 'Supervisor still has supplier pricing controls.');
singleApprovalAssert(!str_contains($supervisorHtml, 'data-step-panel="2"') && !str_contains($supervisorHtml, 'data-step-panel="3"'), 'Supervisor still has commercial workflow panels.');
singleApprovalAssert(str_contains($supervisorJs, '>Reject<') && str_contains($supervisorJs, 'Approve Quantities & PR'), 'Supervisor PR decision controls are incomplete.');
singleApprovalAssert(!str_contains($supervisorJs, 'data-modal-decision="revision"') && !str_contains($supervisorJs, 'data-quick-decision="revision"'), 'New Supervisor reviews still expose Request Revision.');
singleApprovalAssert(str_contains($supervisorHtml, 'id="quantityApprovalRows"') && str_contains($supervisorJs, 'approved_quantities'), 'Supervisor approved-quantity review is missing.');
singleApprovalAssert(!str_contains($supervisorJs, 'supplier_product_id') && !str_contains($supervisorJs, 'supplier_payment_terms'), 'Supervisor JavaScript still submits commercial PO data.');

singleApprovalAssert(!str_contains($decisionPhp, 'generatePurchaseOrdersForApprovedRequest'), 'Supervisor decision endpoint still generates purchase orders.');
singleApprovalAssert(!str_contains($decisionPhp, 'INSERT INTO purchase_orders'), 'Supervisor decision endpoint inserts purchase orders.');
singleApprovalAssert(str_contains($decisionPhp, "'purchase_orders' => []"), 'Supervisor approval response does not explicitly return zero POs.');

singleApprovalAssert(str_contains($managerHtml, 'id="generatePoModal"'), 'Manager PO generation modal is missing.');
singleApprovalAssert(str_contains($managerJs, 'Generate PO'), 'Approved PR Generate PO action is missing.');
singleApprovalAssert(str_contains($managerJs, 'View Related POs'), 'Related PO replacement action is missing.');
singleApprovalAssert(str_contains($managerJs, 'Excess:'), 'Packaging excess quantity is not shown.');
singleApprovalAssert(!str_contains($managerJs, 'data-manager-order-qty') && !str_contains($managerJs, 'order_qty:'), 'Manager can still edit or submit a PO quantity.');
singleApprovalAssert(str_contains($managerJs, 'Approved Requirement') && str_contains($managerJs, 'PO Qty'), 'PO preview does not distinguish approved requirement and derived PO quantity.');
singleApprovalAssert(str_contains($managerJs, 'Generate ${count} Purchase Order'), 'Dynamic PO generation label is missing.');
singleApprovalAssert(str_contains($managerJs, 'generate_purchase_orders.php'), 'Manager UI does not use the generation endpoint.');
singleApprovalAssert(!str_contains($managerJs, 'data-manager-payment') && !str_contains($managerJs, 'supplier_payment_terms'), 'Manager PO Preview still exposes or submits payment-mode selection.');
singleApprovalAssert(!str_contains($managerJs, 'GCash') && !str_contains($managerJs, 'select a payment mode'), 'Manager PO Preview still contains legacy payment modes or validation.');
singleApprovalAssert(!str_contains($managerJs, 'Cash payment'), 'Manager PO Preview still renders the automatic Cash payment label.');
singleApprovalAssert(str_contains($managerJs, 'Product / Description') && str_contains($managerJs, 'Contents / Packaging'), 'Manager PO Preview does not show the quantity and packaging layout.');
singleApprovalAssert(!str_contains($managerJs, 'Estimated Total') && !str_contains($managerJs, 'Supplier Cost') && !str_contains($managerJs, 'Line Total') && !str_contains($managerJs, 'Supplier Total'), 'Manager PO generation still renders monetary values.');
singleApprovalAssert(str_contains($managerJs, 'supplier_address') && str_contains($managerJs, 'supplier_phone') && str_contains($managerJs, 'supplier_email'), 'Manager PO Preview does not render supplier contact fields.');

singleApprovalAssert(str_contains($generationPhp, 'requireActivePurchaseRequestManager'), 'Generation endpoint lacks Manager/Admin authorization.');
singleApprovalAssert(str_contains($generationPhp, "status'] ?? '') !== 'Approved'"), 'Generation endpoint does not enforce Approved PR status.');
singleApprovalAssert(str_contains($generationPhp, 'purchaseRequestById($pdo, $prId, true)'), 'Generation endpoint does not lock the PR.');
singleApprovalAssert(str_contains($generationPhp, 'purchaseRequestPurchaseOrders($pdo, $prId)'), 'Generation endpoint does not prevent duplicate related POs.');
singleApprovalAssert(str_contains($generationPhp, '$pdo->beginTransaction()') && str_contains($generationPhp, '$pdo->rollBack()'), 'Generation endpoint is not transactional.');
singleApprovalAssert(str_contains($generationHelper, "\$groups[\$supplierId]['items'][]"), 'PO items are not grouped by supplier.');
singleApprovalAssert(str_contains($generationHelper, "'Draft', 'Approved'"), 'Generated POs must begin as approved, unpriced Drafts for the Manager to place with the supplier.');
singleApprovalAssert(str_contains($generationHelper, "':unit_cost' => null, ':line_total' => null") && str_contains($generationHelper, "'total_amount' => null"), 'Generated POs do not keep all monetary fields unset.');
singleApprovalAssert(str_contains($generationHelper, "\$paymentTerms = 'Cash';"), 'Generated supplier POs do not enforce Cash in the API helper.');
singleApprovalAssert(str_contains($generationHelper, "\$requestItem['approved_qty']") && !str_contains($generationHelper, "\$assignment['order_qty']"), 'The API does not derive PO quantity exclusively from approved quantity.');
singleApprovalAssert(str_contains($generationHelper, 'product_specification_values') && str_contains($generationHelper, 'WHERE psv.product_id IN'), 'Product Master specifications are not loaded in one batch.');
singleApprovalAssert(str_contains($generationHelper, 's.address AS supplier_address') && str_contains($generationHelper, 's.phone AS supplier_phone') && str_contains($generationHelper, 's.email AS supplier_email'), 'The batched supplier lookup omits supplier contact fields.');
singleApprovalAssert(!str_contains($generationPhp, 'supplier_payment_terms'), 'Generation endpoint still accepts client-controlled payment terms.');
singleApprovalAssert(!preg_match('/inventory_batches\s*\(|UPDATE\s+(?:product_inventory|selling_stocks)/i', $generationHelper), 'PO generation mutates inventory.');
singleApprovalAssert(str_contains($requestListPhp, "\$request['status'] === 'Approved'"), 'Supplier options are not restricted to approved PRs.');
singleApprovalAssert(str_contains($requestListPhp, "currentSessionHasRbacRole('manager')"), 'Supplier options are not restricted to Manager/Admin.');

echo "Single-approval PR-to-PO workflow structure tests passed.\n";
