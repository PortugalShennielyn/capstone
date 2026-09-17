<?php
declare(strict_types=1);

require_once __DIR__ . '/../pharma-api/config/db_connection.php';
require_once __DIR__ . '/../pharma-api/v1/purchase_orders/purchase_order_receiving_helpers.php';

function receivingAssert(bool $condition, string $message): void
{
    if (!$condition) throw new RuntimeException($message);
}

function receivingPost(string $path, array $payload, string $sessionId, string $tabToken): array
{
    $curl = curl_init('http://127.0.0.1/PharmacySystem_for_DocR/pharma-api/v1/' . $path);
    curl_setopt_array($curl, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_POST => true,
        CURLOPT_POSTFIELDS => json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
        CURLOPT_COOKIE => 'PHPSESSID=' . $sessionId,
        CURLOPT_HTTPHEADER => ['Content-Type: application/json', 'X-Tab-Token: ' . $tabToken],
        CURLOPT_TIMEOUT => 20,
    ]);
    $body = curl_exec($curl);
    $status = (int) curl_getinfo($curl, CURLINFO_RESPONSE_CODE);
    $error = curl_error($curl);
    curl_close($curl);
    receivingAssert($body !== false, 'HTTP request failed: ' . $error);
    return ['status' => $status, 'body' => json_decode((string) $body, true) ?: []];
}

function receivingGet(string $path, string $sessionId, string $tabToken): array
{
    $curl = curl_init('http://127.0.0.1/PharmacySystem_for_DocR/pharma-api/v1/' . $path);
    curl_setopt_array($curl, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_COOKIE => 'PHPSESSID=' . $sessionId,
        CURLOPT_HTTPHEADER => ['X-Tab-Token: ' . $tabToken],
        CURLOPT_TIMEOUT => 20,
    ]);
    $body = curl_exec($curl);
    $status = (int) curl_getinfo($curl, CURLINFO_RESPONSE_CODE);
    $error = curl_error($curl);
    curl_close($curl);
    receivingAssert($body !== false, 'HTTP request failed: ' . $error);
    return ['status' => $status, 'body' => json_decode((string) $body, true) ?: []];
}

$poId = newUuid($pdo);
$poItemId = newUuid($pdo);
$authSessionId = newUuid($pdo);
$phpSessionId = 'codexreceive' . bin2hex(random_bytes(8));
$tabToken = bin2hex(random_bytes(32));
$productId = '';
$originalProductPricing = null;

try {
    $fixture = $pdo->query(
        "SELECT po.supplier_id, poi.product_id, poi.quantity, poi.purchase_qty,
                poi.purchase_unit_snapshot, poi.units_per_purchase_unit_snapshot,
                poi.inventory_qty_ordered, poi.product_name_snapshot, poi.brand_name_snapshot,
                poi.category_name_snapshot, poi.type_name_snapshot, poi.generic_name_snapshot,
                poi.variant_flavor_snapshot, poi.strength_snapshot, poi.size_value_snapshot,
                poi.unit_snapshot, poi.packaging_snapshot, poi.unit_price_snapshot, poi.line_total,
                c.conversion_id, c.unit_name AS base_unit_name,
                box_c.conversion_id AS purchase_conversion_id,
                action_c.conversion_id AS action_conversion_id, action_c.unit_name AS action_unit_name,
                action_c.base_quantity AS action_base_quantity,
                p.price AS selling_price, p.pricing_method, p.custom_markup_percentage
         FROM purchase_orders po
         INNER JOIN purchase_order_items poi ON poi.po_id = po.po_id
         INNER JOIN product p ON p.product_id = poi.product_id
         INNER JOIN supplier_products sp ON sp.supplier_id = po.supplier_id AND sp.product_id = poi.product_id
         INNER JOIN supplier_product_unit_conversions c ON c.supplier_product_id = sp.supplier_product_id AND c.base_quantity = 1
         INNER JOIN supplier_product_unit_conversions box_c ON box_c.supplier_product_id = sp.supplier_product_id
            AND box_c.base_quantity = poi.units_per_purchase_unit_snapshot
         INNER JOIN supplier_product_unit_conversions action_c ON action_c.supplier_product_id = sp.supplier_product_id
            AND action_c.base_quantity > 1 AND action_c.base_quantity < poi.units_per_purchase_unit_snapshot
         WHERE poi.units_per_purchase_unit_snapshot > 1
         ORDER BY po.created_at DESC
         LIMIT 1"
    )->fetch(PDO::FETCH_ASSOC);
    receivingAssert((bool) $fixture, 'A purchase-order item with base and intermediate package conversions is required.');
    $productId = cleanId($fixture['product_id']);
    $originalProductPricing = [
        'price' => $fixture['selling_price'],
        'pricing_method' => $fixture['pricing_method'],
        'custom_markup_percentage' => $fixture['custom_markup_percentage'],
    ];
    $pdo->prepare("UPDATE product SET pricing_method='manual' WHERE product_id=:product_id")->execute([':product_id' => $productId]);

    $user = $pdo->query("SELECT user_id,username,full_name,role,status FROM users WHERE role='admin' AND status='Active' LIMIT 1")->fetch(PDO::FETCH_ASSOC);
    receivingAssert((bool) $user, 'An active admin fixture is required.');

    $pdo->prepare(
        "INSERT INTO purchase_orders
            (po_id, po_number, supplier_id, payment_terms, expected_delivery_date, final_payment, status, approval_status, payment_status, total_amount)
         VALUES
            (:po_id, :po_number, :supplier_id, 'Cash', CURRENT_DATE, :final_payment, 'Arrived', 'Approved', 'Unpaid', :total_amount)"
    )->execute([
        ':po_id' => $poId,
        ':po_number' => 'TEST-RECEIVE-' . substr(str_replace('-', '', $poId), 0, 12),
        ':supplier_id' => $fixture['supplier_id'],
        ':final_payment' => 5 * (int) $fixture['units_per_purchase_unit_snapshot'] * (float) $fixture['unit_price_snapshot'],
        ':total_amount' => 5 * (int) $fixture['units_per_purchase_unit_snapshot'] * (float) $fixture['unit_price_snapshot'],
    ]);

    $pdo->prepare(
        "INSERT INTO purchase_order_items
            (po_item_id, po_id, product_id, quantity, purchase_qty, purchase_unit_snapshot,
             units_per_purchase_unit_snapshot, inventory_qty_ordered, product_name_snapshot,
             brand_name_snapshot, category_name_snapshot, type_name_snapshot, generic_name_snapshot,
             variant_flavor_snapshot, strength_snapshot, size_value_snapshot, unit_snapshot,
             packaging_snapshot, unit_price_snapshot, line_total)
         VALUES
            (:po_item_id, :po_id, :product_id, :quantity, :purchase_qty, :purchase_unit,
             :units_per_purchase_unit, :inventory_qty_ordered, :product_name, :brand_name,
             :category_name, :type_name, :generic_name, :variant_flavor, :strength,
             :size_value, :unit_name, :packaging, :unit_price, :line_total)"
    )->execute([
        ':po_item_id' => $poItemId, ':po_id' => $poId, ':product_id' => $fixture['product_id'],
        ':quantity' => 5 * (int) $fixture['units_per_purchase_unit_snapshot'], ':purchase_qty' => 5,
        ':purchase_unit' => $fixture['purchase_unit_snapshot'], ':units_per_purchase_unit' => $fixture['units_per_purchase_unit_snapshot'],
        ':inventory_qty_ordered' => 5 * (int) $fixture['units_per_purchase_unit_snapshot'], ':product_name' => $fixture['product_name_snapshot'],
        ':brand_name' => $fixture['brand_name_snapshot'], ':category_name' => $fixture['category_name_snapshot'],
        ':type_name' => $fixture['type_name_snapshot'], ':generic_name' => $fixture['generic_name_snapshot'],
        ':variant_flavor' => $fixture['variant_flavor_snapshot'], ':strength' => $fixture['strength_snapshot'],
        ':size_value' => $fixture['size_value_snapshot'], ':unit_name' => $fixture['unit_snapshot'],
        ':packaging' => $fixture['packaging_snapshot'], ':unit_price' => $fixture['unit_price_snapshot'],
        ':line_total' => 5 * (int) $fixture['units_per_purchase_unit_snapshot'] * (float) $fixture['unit_price_snapshot'],
    ]);

    if (session_status() === PHP_SESSION_ACTIVE) session_write_close();
    session_id($phpSessionId);
    session_start();
    $_SESSION = [
        'user_id' => $user['user_id'], 'username' => $user['username'], 'full_name' => $user['full_name'],
        'role' => $user['role'], 'roles' => [$user['role']], 'role_identifiers' => ['ro-admin'],
        'user_status' => $user['status'], 'auth_session_id' => $authSessionId,
        'tab_token_hash' => hash('sha256', $tabToken),
    ];
    session_write_close();
    $pdo->prepare(
        "INSERT INTO auth_sessions
            (auth_session_id,php_session_id,user_id,session_token_hash,expires_at,ip_address,user_agent)
         VALUES (:id,:php,:user,:token,DATE_ADD(NOW(),INTERVAL 10 MINUTE),'127.0.0.1','Codex receiving test')"
    )->execute([':id' => $authSessionId, ':php' => $phpSessionId, ':user' => $user['user_id'], ':token' => hash('sha256', $tabToken)]);

    $receivedPurchaseQuantity = 5;
    $receivedInventoryQuantity = 5 * (int) $fixture['units_per_purchase_unit_snapshot'];
    $damagedQuantity = 3;
    $actionQuantity = $damagedQuantity;
    $actionBaseQuantity = 1;
    $removedBaseQuantity = $damagedQuantity;
    $acceptedInventoryQuantity = $receivedInventoryQuantity - $removedBaseQuantity;
    $item = [
        'po_item_id' => $poItemId,
        'delivered_purchase_quantity' => $receivedPurchaseQuantity,
        'delivered_quantity' => $receivedInventoryQuantity,
        'received_quantity' => $receivedInventoryQuantity,
        'has_issue' => true,
        'affected_quantity' => $actionQuantity,
        'unit_conversion_id' => $fixture['action_conversion_id'],
        'damaged_quantity' => $damagedQuantity,
        'damaged_unit_conversion_id' => $fixture['conversion_id'],
        'damage_lines' => [
            ['package_sequence' => 3, 'damaged_quantity' => 1, 'damaged_unit_conversion_id' => $fixture['conversion_id'], 'batch_index' => 0],
            ['package_sequence' => 5, 'damaged_quantity' => 2, 'damaged_unit_conversion_id' => $fixture['conversion_id'], 'batch_index' => 0],
        ],
        'action_quantity' => $actionQuantity,
        'action_unit_conversion_id' => $fixture['conversion_id'],
        'returned_quantity' => $removedBaseQuantity,
        'disposed_quantity' => 0,
        'disposition' => 'return_to_supplier',
        'issue_type' => 'Broken Package',
        'resolution' => 'replacement',
        'batches' => [[
            'batch_identifier' => 'TEST-ACCEPTED-BATCH',
            'quantity' => $acceptedInventoryQuantity,
            'expiry_date' => '2030-12-31',
            'no_expiry' => false,
        ]],
        'remarks' => '',
        'inspection_complete' => true,
        'accepted_quantity' => $acceptedInventoryQuantity,
        'missing_quantity' => 0,
    ];

    $draft = receivingPost('purchase_orders/receive_purchase_order.php', [
        'po_id' => $poId, 'mode' => 'draft', 'delivered_by_name' => 'Test Driver', 'delivery_receipt_no' => 'DR-TEST-001', 'remarks' => 'Draft receiving test', 'items' => [$item],
    ], $phpSessionId, $tabToken);
    receivingAssert($draft['status'] === 200 && ($draft['body']['success'] ?? false), 'Save Draft failed: ' . json_encode($draft));
    receivingAssert((int) $pdo->query("SELECT COUNT(*) FROM purchase_order_receiving WHERE po_id='{$poId}'")->fetchColumn() === 1, 'Draft receiving header was not saved.');
    receivingAssert((int) $pdo->query("SELECT COUNT(*) FROM purchase_order_receiving_items WHERE receiving_id=(SELECT receiving_id FROM purchase_order_receiving WHERE po_id='{$poId}')")->fetchColumn() === 0, 'Draft posted receiving items.');
    receivingAssert((int) $pdo->query("SELECT COUNT(*) FROM supplier_claims WHERE po_item_id='{$poItemId}'")->fetchColumn() === 0, 'Draft finalized a supplier claim.');

    $impossibleDamageItem = $item;
    $impossibleDamageItem['damage_lines'] = [[
        'package_sequence' => 3,
        'damaged_quantity' => (int) $fixture['units_per_purchase_unit_snapshot'] + 1,
        'damaged_unit_conversion_id' => $fixture['conversion_id'],
    ]];
    $impossibleDamage = receivingPost('purchase_orders/receive_purchase_order.php', [
        'po_id' => $poId, 'delivered_by_name' => 'Test Driver', 'delivery_receipt_no' => 'DR-TEST-001', 'remarks' => '', 'items' => [$impossibleDamageItem],
    ], $phpSessionId, $tabToken);
    receivingAssert($impossibleDamage['status'] === 400 && str_contains((string) ($impossibleDamage['body']['message'] ?? ''), 'Damaged contents cannot exceed'), 'Per-package damage above the configured conversion was not blocked.');
    receivingAssert((int) $pdo->query("SELECT COUNT(*) FROM supplier_claims WHERE po_item_id='{$poItemId}'")->fetchColumn() === 0, 'Impossible damage created a supplier claim.');

    $duplicatePackageItem = $item;
    $duplicatePackageItem['damage_lines'][1]['package_sequence'] = 3;
    $duplicatePackage = receivingPost('purchase_orders/receive_purchase_order.php', [
        'po_id' => $poId, 'delivered_by_name' => 'Test Driver', 'delivery_receipt_no' => 'DR-TEST-001', 'remarks' => '', 'items' => [$duplicatePackageItem],
    ], $phpSessionId, $tabToken);
    receivingAssert($duplicatePackage['status'] === 400 && str_contains((string) ($duplicatePackage['body']['message'] ?? ''), 'same physical package'), 'A duplicate physical package sequence was not blocked.');

    $invalidOtherItem = $item;
    $invalidOtherItem['issue_type'] = 'Other';
    $invalidOtherItem['issue_detail'] = '';
    $invalidOther = receivingPost('purchase_orders/receive_purchase_order.php', [
        'po_id' => $poId, 'delivered_by_name' => 'Test Driver', 'delivery_receipt_no' => 'DR-TEST-001', 'remarks' => '', 'items' => [$invalidOtherItem],
    ], $phpSessionId, $tabToken);
    receivingAssert($invalidOther['status'] === 400 && !($invalidOther['body']['success'] ?? true), 'Other issue was accepted without a required description.');
    receivingAssert((int) $pdo->query("SELECT COUNT(*) FROM supplier_claims WHERE po_item_id='{$poItemId}'")->fetchColumn() === 0, 'Invalid Other issue created a supplier claim.');

    $confirm = receivingPost('purchase_orders/receive_purchase_order.php', [
        'po_id' => $poId, 'delivered_by_name' => 'Test Driver', 'delivery_receipt_no' => 'DR-TEST-001', 'remarks' => 'Confirmed receiving test', 'items' => [$item],
    ], $phpSessionId, $tabToken);
    receivingAssert($confirm['status'] === 200 && ($confirm['body']['success'] ?? false), 'Confirm Receiving failed: ' . json_encode($confirm));
receivingAssert((string) $pdo->query("SELECT status FROM purchase_orders WHERE po_id='{$poId}'")->fetchColumn() === 'Delivered', 'Completed issue receiving did not keep the PO in the Delivered lifecycle state.');
    receivingAssert((int) $pdo->query("SELECT COUNT(*) FROM purchase_order_receiving_items WHERE po_item_id='{$poItemId}' AND received_quantity={$receivedInventoryQuantity}")->fetchColumn() === 1, 'Received quantity was not preserved.');
    receivingAssert((int) $pdo->query("SELECT COALESCE(SUM(storage_qty),0) FROM inventory_batches WHERE po_item_id='{$poItemId}'")->fetchColumn() === $acceptedInventoryQuantity, 'Only accepted stock was posted to inventory.');
    receivingAssert((int) $pdo->query("SELECT COALESCE(SUM(damaged_qty+returned_qty),0) FROM inventory_batches WHERE po_item_id='{$poItemId}'")->fetchColumn() === 0, 'Affected or missing stock leaked into accepted inventory batches.');
    receivingAssert((int) $pdo->query("SELECT COUNT(*) FROM supplier_claims WHERE po_item_id='{$poItemId}' AND damaged_quantity={$damagedQuantity} AND damaged_unit_conversion_id='{$fixture['conversion_id']}' AND action_quantity={$actionQuantity} AND action_unit_conversion_id='{$fixture['conversion_id']}' AND affected_quantity={$actionQuantity} AND unit_conversion_id='{$fixture['conversion_id']}' AND resolution_type='Replacement' AND claim_status='Awaiting Replacement'")->fetchColumn() === 1, 'The claim did not preserve the damaged base quantity.');
    $poListing = receivingGet('purchase_orders/get_purchase_orders.php?scope=all', $phpSessionId, $tabToken);
    receivingAssert($poListing['status'] === 200 && ($poListing['body']['status'] ?? '') === 'success', 'PO listing failed after issue receiving.');
    $listedOrder = array_values(array_filter($poListing['body']['purchase_orders'] ?? [], static fn(array $row): bool => ($row['po_id'] ?? '') === $poId))[0] ?? null;
    receivingAssert(is_array($listedOrder) && ($listedOrder['status'] ?? '') === 'Delivered', 'PO listing mixed the supplier claim into the PO lifecycle status.');
    receivingAssert(($listedOrder['open_claim_badge'] ?? '') === 'Replacement Pending - ' . $removedBaseQuantity . ' pcs', 'PO listing did not expose the replacement-pending quantity as a secondary badge: ' . json_encode($listedOrder['open_claim_badge'] ?? null));
    receivingAssert((int) ($listedOrder['open_claim_count'] ?? 0) === 1, 'PO listing did not aggregate its open supplier claim.');
    receivingAssert((int) $pdo->query("SELECT COUNT(*) FROM supplier_claim_damage_lines dl INNER JOIN supplier_claims sc ON sc.claim_id=dl.claim_id WHERE sc.po_item_id='{$poItemId}'")->fetchColumn() === 2, 'The affected-goods breakdown was not normalized into two physical-package rows.');
    receivingAssert((int) $pdo->query("SELECT COUNT(*) FROM supplier_claim_damage_lines dl INNER JOIN supplier_claims sc ON sc.claim_id=dl.claim_id WHERE sc.po_item_id='{$poItemId}' AND dl.sequence_no IN (3,5)")->fetchColumn() === 2, 'The exact physical package sequences were not preserved.');
    receivingAssert((int) $pdo->query("SELECT COUNT(*) FROM supplier_claim_damage_lines dl INNER JOIN supplier_claims sc ON sc.claim_id=dl.claim_id WHERE sc.po_item_id='{$poItemId}' AND dl.receiving_item_id IS NOT NULL AND dl.inventory_batch_id IS NOT NULL")->fetchColumn() === 2, 'Affected goods rows were not linked to the receiving item and existing batch.');
    receivingAssert((int) $pdo->query("SELECT COALESCE(SUM(dl.damaged_quantity*c.base_quantity),0) FROM supplier_claim_damage_lines dl INNER JOIN supplier_claims sc ON sc.claim_id=dl.claim_id INNER JOIN supplier_product_unit_conversions c ON c.conversion_id=dl.damaged_unit_conversion_id WHERE sc.po_item_id='{$poItemId}'")->fetchColumn() === $damagedQuantity, 'The normalized damage lines did not preserve three physically damaged pieces.');
    $receivingDetails = buildPurchaseOrderReceivingDetails($pdo, $poId);
    receivingAssert(($receivingDetails['delivered_by_name'] ?? '') === 'Test Driver' && ($receivingDetails['delivery_receipt_no'] ?? '') === 'DR-TEST-001', 'Receiving history did not preserve delivery information.');
    $specificationStatement = $pdo->prepare(
        "SELECT psv.value_text, psv.value_number, COALESCE(NULLIF(pmu.unit_symbol, ''), pmu.unit_name, '') AS unit_symbol
         FROM product_specification_values psv
         INNER JOIN product p ON p.product_id=psv.product_id
         INNER JOIN product_specifications ps ON ps.specification_id=psv.specification_id
         LEFT JOIN product_type_specifications pts ON pts.type_id=p.type_id AND pts.specification_id=psv.specification_id
         LEFT JOIN product_measurement_units pmu ON pmu.measurement_unit_id=psv.measurement_unit_id
         WHERE psv.product_id=:product_id
         ORDER BY COALESCE(pts.sort_order,2147483647),ps.specification_name"
    );
    $specificationStatement->execute([':product_id' => $productId]);
    $expectedSpecification = [];
    foreach ($specificationStatement->fetchAll(PDO::FETCH_ASSOC) as $specification) {
        $value = trim((string) ($specification['value_text'] ?? ''));
        if ($value === '' && $specification['value_number'] !== null && $specification['value_number'] !== '') {
            $number = rtrim(rtrim((string) $specification['value_number'], '0'), '.');
            $value = trim(($number === '' ? '0' : $number) . ' ' . (string) ($specification['unit_symbol'] ?? ''));
        }
        if ($value !== '') $expectedSpecification[] = $value;
    }
    if ($expectedSpecification) receivingAssert(($receivingDetails['items'][0]['specification'] ?? '') === implode(' • ', array_values(array_unique($expectedSpecification))), 'Receiving documents did not reuse the normalized Product Master specification.');
    receivingAssert((int) ($receivingDetails['items'][0]['damaged_quantity'] ?? -1) === $damagedQuantity, 'Receiving history did not preserve physical damage.');
    receivingAssert((int) ($receivingDetails['items'][0]['returned_quantity'] ?? -1) === $removedBaseQuantity, 'Receiving history did not preserve returned action quantity.');
    receivingAssert((int) ($receivingDetails['items'][0]['accepted_quantity'] ?? -1) === $acceptedInventoryQuantity, 'Receiving history did not calculate accepted inventory from Action Qty.');
    receivingAssert((int) $pdo->query("SELECT COUNT(*) FROM supplier_credits sc INNER JOIN supplier_claims c ON c.claim_id=sc.claim_id WHERE c.po_item_id='{$poItemId}'")->fetchColumn() === 0, 'A peso credit was created before supplier confirmation.');

    $duplicate = receivingPost('purchase_orders/receive_purchase_order.php', [
        'po_id' => $poId, 'delivered_by_name' => 'Test Driver', 'delivery_receipt_no' => 'DR-TEST-001', 'remarks' => 'Duplicate receiving test', 'items' => [$item],
    ], $phpSessionId, $tabToken);
    receivingAssert($duplicate['status'] === 400, 'A duplicate confirmation was not rejected.');
    receivingAssert((int) $pdo->query("SELECT COUNT(*) FROM supplier_claims WHERE po_item_id='{$poItemId}'")->fetchColumn() === 1, 'Duplicate confirmation created another claim.');
    receivingAssert((int) $pdo->query("SELECT COALESCE(SUM(storage_qty),0) FROM inventory_batches WHERE po_item_id='{$poItemId}'")->fetchColumn() === $acceptedInventoryQuantity, 'Duplicate confirmation added inventory twice.');

    $receivingId = (string) $pdo->query("SELECT receiving_id FROM purchase_order_receiving WHERE po_id='{$poId}' LIMIT 1")->fetchColumn();
    $batchId = (string) $pdo->query("SELECT batch_id FROM inventory_batches WHERE po_item_id='{$poItemId}' ORDER BY created_at LIMIT 1")->fetchColumn();
    $correctedActionQuantity = 1;
    $correctedAcceptedQuantity = $receivedInventoryQuantity - ($correctedActionQuantity * $actionBaseQuantity);
    $editItem = [
        'po_item_id' => $poItemId,
        'received_quantity' => $receivedInventoryQuantity,
        'damaged_quantity' => $correctedActionQuantity,
        'damaged_unit_conversion_id' => $fixture['conversion_id'],
        'action_quantity' => $correctedActionQuantity,
        'action_unit_conversion_id' => $fixture['conversion_id'],
        'issue_type' => 'Broken Package',
        'disposition' => 'return_to_supplier',
        'resolution' => 'replacement',
        'remarks' => 'Corrected after supplier recount.',
        'damage_lines' => [$item['damage_lines'][0]],
        'batches' => [[
            'batch_id' => $batchId,
            'quantity' => $correctedAcceptedQuantity,
            'expiry_date' => '2030-12-31',
        ]],
    ];
    $edit = receivingPost('purchase_orders/update_receiving_grn.php', [
        'receiving_id' => $receivingId,
        'edit_reason' => 'Supplier recount confirmed one affected pack.',
        'receiving_remarks' => 'Confirmed receiving test (corrected)',
        'items' => [$editItem],
    ], $phpSessionId, $tabToken);
    receivingAssert($edit['status'] === 200 && ($edit['body']['success'] ?? false), 'GRN correction failed: ' . json_encode($edit));
    receivingAssert((int) $pdo->query("SELECT COALESCE(SUM(storage_qty),0) FROM inventory_batches WHERE po_item_id='{$poItemId}'")->fetchColumn() === $correctedAcceptedQuantity, 'GRN correction did not add only the accepted-stock delta.');
    receivingAssert((int) $pdo->query("SELECT COUNT(*) FROM supplier_claims WHERE po_item_id='{$poItemId}'")->fetchColumn() === 1, 'GRN correction duplicated the supplier claim.');
    receivingAssert((int) $pdo->query("SELECT COUNT(*) FROM purchase_order_receiving_revisions WHERE receiving_id='{$receivingId}'")->fetchColumn() === 1, 'GRN correction did not create a revision audit row.');
    $editedDetails = buildPurchaseOrderReceivingDetails($pdo, $poId);
    receivingAssert((int) ($editedDetails['items'][0]['accepted_quantity'] ?? -1) === $correctedAcceptedQuantity, 'Corrected receiving details did not refresh the accepted quantity.');

    $editItem['action_quantity'] = $actionQuantity;
    $editItem['damaged_quantity'] = $damagedQuantity;
    $editItem['damage_lines'] = $item['damage_lines'];
    $editItem['remarks'] = '';
    $editItem['batches'][0]['quantity'] = $acceptedInventoryQuantity;
    $restore = receivingPost('purchase_orders/update_receiving_grn.php', [
        'receiving_id' => $receivingId,
        'edit_reason' => 'Restore original verified supplier count.',
        'receiving_remarks' => 'Confirmed receiving test',
        'items' => [$editItem],
    ], $phpSessionId, $tabToken);
    receivingAssert($restore['status'] === 200 && ($restore['body']['success'] ?? false), 'GRN restoration failed: ' . json_encode($restore));
    receivingAssert((int) $pdo->query("SELECT COALESCE(SUM(storage_qty),0) FROM inventory_batches WHERE po_item_id='{$poItemId}'")->fetchColumn() === $acceptedInventoryQuantity, 'GRN restoration did not subtract only the inventory delta.');
    receivingAssert((int) $pdo->query("SELECT quantity_stocked FROM product_inventory WHERE receiving_id='{$receivingId}' LIMIT 1")->fetchColumn() === $acceptedInventoryQuantity, 'Legacy inventory totals drifted after reversible GRN corrections.');
    receivingAssert((int) $pdo->query("SELECT COUNT(*) FROM purchase_order_receiving_revisions WHERE receiving_id='{$receivingId}'")->fetchColumn() === 2, 'Both GRN edits were not retained in revision history.');
    $revisionDetails = receivingGet('purchase_orders/get_receiving_details.php?po_id=' . rawurlencode($poId), $phpSessionId, $tabToken);
    receivingAssert($revisionDetails['status'] === 200 && ($revisionDetails['body']['status'] ?? '') === 'success', 'Receiving details API failed after GRN correction: ' . json_encode($revisionDetails));
    receivingAssert(($revisionDetails['body']['receiving']['latest_revision']['edit_reason'] ?? '') === 'Restore original verified supplier count.', 'Receiving details API did not expose the persisted latest revision metadata.');

    $claimId = (string) $pdo->query("SELECT claim_id FROM supplier_claims WHERE po_item_id='{$poItemId}' AND resolution_type='Replacement' LIMIT 1")->fetchColumn();
    $stockBeforeReplacement = (int) $pdo->query("SELECT COALESCE(SUM(storage_qty+shelf_qty),0) FROM inventory_batches WHERE po_item_id='{$poItemId}'")->fetchColumn();
    $partialReplacementQuantity = $removedBaseQuantity - 1;
    $replacementRequestKey = 'replacement-test-' . str_replace('-', '', newUuid($pdo));
    $replacementPayload = [
        'return_id' => $claimId,
        'receiving_request_key' => $replacementRequestKey,
        'delivered_quantity' => $partialReplacementQuantity,
        'damaged_quantity' => 0,
        'batches' => [[
            'batch_identifier' => 'TEST-REPLACEMENT-BATCH',
            'quantity' => $partialReplacementQuantity,
            'expiry_date' => '2031-12-31',
            'no_expiry' => false,
        ]],
        'remarks' => 'Verified replacement test',
    ];
    $replacement = receivingPost('purchase_orders/record_replacement_arrival.php', $replacementPayload, $phpSessionId, $tabToken);
    receivingAssert($replacement['status'] === 200 && ($replacement['body']['success'] ?? false), 'Replacement arrival failed: ' . json_encode($replacement));
    receivingAssert((int) $pdo->query("SELECT COALESCE(SUM(storage_qty+shelf_qty),0) FROM inventory_batches WHERE po_item_id='{$poItemId}'")->fetchColumn() === $stockBeforeReplacement + $partialReplacementQuantity, 'Partial replacement arrival did not add only the accepted replacement quantity.');
    receivingAssert((int) $pdo->query("SELECT COUNT(*) FROM purchase_order_receiving WHERE po_id='{$poId}' AND receiving_type='Replacement' AND parent_receiving_id='{$receivingId}' AND claim_id='{$claimId}'")->fetchColumn() === 1, 'Replacement did not create a separate receiving event linked to the original and the claim.');
    receivingAssert((int) $pdo->query("SELECT COUNT(*) FROM purchase_order_receiving_items replacement_item INNER JOIN purchase_order_receiving_items original_item ON original_item.receiving_item_id=replacement_item.parent_receiving_item_id WHERE replacement_item.receiving_id='{$replacement['body']['receiving_id']}' AND original_item.receiving_id='{$receivingId}' AND replacement_item.po_item_id='{$poItemId}'")->fetchColumn() === 1, 'Replacement receiving item was not directly linked to the original receiving item.');
    receivingAssert((int) $pdo->query("SELECT COUNT(*) FROM inventory_receiving_transactions WHERE claim_id='{$claimId}' AND transaction_type='Replacement Receiving'")->fetchColumn() === 1, 'Replacement inventory movement was not recorded in the audit table.');
    receivingAssert((int) $pdo->query("SELECT received_quantity FROM purchase_order_receiving_items WHERE receiving_id='{$receivingId}' AND po_item_id='{$poItemId}'")->fetchColumn() === $receivedInventoryQuantity, 'Replacement receiving rewrote the original receiving item.');
    receivingAssert((string) $pdo->query("SELECT claim_status FROM supplier_claims WHERE claim_id='{$claimId}'")->fetchColumn() === 'Partially Replaced', 'Partial replacement prematurely resolved the claim.');
    $partialListing = receivingGet('purchase_orders/get_purchase_orders.php?scope=all', $phpSessionId, $tabToken);
    $partialOrder = array_values(array_filter($partialListing['body']['purchase_orders'] ?? [], static fn(array $row): bool => ($row['po_id'] ?? '') === $poId))[0] ?? null;
    receivingAssert(is_array($partialOrder) && ($partialOrder['open_claim_badge'] ?? '') === 'Replacement Pending - 1 pcs', 'Partial replacement did not retain the one-piece pending badge.');
    $duplicateReplacement = receivingPost('purchase_orders/record_replacement_arrival.php', $replacementPayload, $phpSessionId, $tabToken);
    receivingAssert($duplicateReplacement['status'] === 409, 'Duplicate replacement request key was not rejected idempotently.');
    receivingAssert((int) $pdo->query("SELECT COALESCE(SUM(storage_qty+shelf_qty),0) FROM inventory_batches WHERE po_item_id='{$poItemId}'")->fetchColumn() === $stockBeforeReplacement + $partialReplacementQuantity, 'Duplicate replacement request posted inventory twice.');
    $differentBatchCount = (int) $pdo->query("SELECT COUNT(*) FROM inventory_batches WHERE po_item_id='{$poItemId}'")->fetchColumn();
    $finalReplacement = receivingPost('purchase_orders/record_replacement_arrival.php', [
        'return_id' => $claimId,
        'receiving_request_key' => 'replacement-final-' . str_replace('-', '', newUuid($pdo)),
        'delivered_quantity' => 1,
        'damaged_quantity' => 0,
        'batches' => [['batch_identifier' => 'TEST-REPLACEMENT-BATCH', 'quantity' => 1, 'expiry_date' => '2031-12-31', 'no_expiry' => false]],
        'remarks' => 'Completed partial replacement test',
    ], $phpSessionId, $tabToken);
    receivingAssert($finalReplacement['status'] === 200 && ($finalReplacement['body']['success'] ?? false), 'Final partial replacement failed: ' . json_encode($finalReplacement));
    receivingAssert((int) $pdo->query("SELECT COUNT(*) FROM inventory_batches WHERE po_item_id='{$poItemId}'")->fetchColumn() === $differentBatchCount, 'A repeated replacement lot/expiry created a duplicate batch.');
    receivingAssert((int) $pdo->query("SELECT COALESCE(SUM(storage_qty+shelf_qty),0) FROM inventory_batches WHERE po_item_id='{$poItemId}'")->fetchColumn() === $stockBeforeReplacement + $removedBaseQuantity, 'Cumulative accepted replacements did not restore the expected stock total.');
    receivingAssert((int) $pdo->query("SELECT COUNT(*) FROM purchase_order_receiving WHERE po_id='{$poId}' AND receiving_type='Replacement' AND parent_receiving_id='{$receivingId}' AND claim_id='{$claimId}'")->fetchColumn() === 2, 'Each partial replacement did not retain its own receiving event.');
    receivingAssert((int) $pdo->query("SELECT COUNT(*) FROM inventory_receiving_transactions WHERE claim_id='{$claimId}' AND transaction_type='Replacement Receiving'")->fetchColumn() === 2, 'Each partial replacement did not retain its own inventory audit event.');
    receivingAssert((string) $pdo->query("SELECT claim_status FROM supplier_claims WHERE claim_id='{$claimId}'")->fetchColumn() === 'Resolved', 'Fully received replacement did not resolve the existing claim.');
    receivingAssert((string) $pdo->query("SELECT status FROM purchase_orders WHERE po_id='{$poId}'")->fetchColumn() === 'Delivered', 'Replacement arrival changed the PO lifecycle status.');
    receivingAssert((int) $pdo->query("SELECT COUNT(*) FROM purchase_order_payments WHERE po_id='{$poId}'")->fetchColumn() === 0, 'Replacement receiving created an unauthorized second payment.');

    $sameBatchClaimId = newUuid($pdo);
    $sameBatchConversionId = supplierClaimDefaultConversion($pdo, $poItemId);
    $sameBatchMetadata = ['version' => 1, 'resolution' => 'return_for_replacement', 'delivered_quantity' => 0, 'damaged_quantity' => 1, 'missing_quantity' => 0, 'supplier_adjustment' => 0, 'replacement_expected_qty' => 1, 'replacement_received_qty' => 0, 'parent_return_id' => null];
    $pdo->prepare("INSERT INTO supplier_claims (claim_id,po_item_id,affected_quantity,unit_conversion_id,damage_reason,disposition,resolution_type,claim_status,reported_by,remarks) VALUES (:id,:po_item_id,1,:conversion_id,'Same batch regression','Return to Supplier','Replacement','Awaiting Replacement',:reported_by,:remarks)")->execute([':id' => $sameBatchClaimId, ':po_item_id' => $poItemId, ':conversion_id' => $sameBatchConversionId, ':reported_by' => $user['user_id'], ':remarks' => buildPurchaseOrderReturnRemarks($sameBatchMetadata, 'Same-batch replacement test')]);
    $batchCountBeforeMerge = (int) $pdo->query("SELECT COUNT(*) FROM inventory_batches WHERE po_item_id='{$poItemId}'")->fetchColumn();
    $sameBatchStorageBefore = (int) $pdo->query("SELECT storage_qty FROM inventory_batches ib INNER JOIN product_inventory pi ON pi.inventory_id=ib.legacy_inventory_id WHERE ib.po_item_id='{$poItemId}' AND pi.batch_number='TEST-ACCEPTED-BATCH' AND ib.expiry_date='2030-12-31'")->fetchColumn();
    $sameBatchReplacement = receivingPost('purchase_orders/record_replacement_arrival.php', [
        'return_id' => $sameBatchClaimId,
        'receiving_request_key' => 'replacement-same-batch-' . str_replace('-', '', newUuid($pdo)),
        'delivered_quantity' => 1,
        'damaged_quantity' => 0,
        'batches' => [['batch_identifier' => 'TEST-ACCEPTED-BATCH', 'quantity' => 1, 'expiry_date' => '2030-12-31', 'no_expiry' => false]],
        'remarks' => 'Same-batch replacement regression',
    ], $phpSessionId, $tabToken);
    receivingAssert($sameBatchReplacement['status'] === 200 && ($sameBatchReplacement['body']['success'] ?? false), 'Same-batch replacement failed: ' . json_encode($sameBatchReplacement));
    receivingAssert((int) $pdo->query("SELECT COUNT(*) FROM inventory_batches WHERE po_item_id='{$poItemId}'")->fetchColumn() === $batchCountBeforeMerge, 'Same product, supplier, batch identifier, and expiry created a duplicate inventory batch.');
    receivingAssert((int) $pdo->query("SELECT storage_qty FROM inventory_batches ib INNER JOIN product_inventory pi ON pi.inventory_id=ib.legacy_inventory_id WHERE ib.po_item_id='{$poItemId}' AND pi.batch_number='TEST-ACCEPTED-BATCH' AND ib.expiry_date='2030-12-31'")->fetchColumn() === $sameBatchStorageBefore + 1, 'Same-batch replacement did not increment the existing stock record.');
    $resolvedListing = receivingGet('purchase_orders/get_purchase_orders.php?scope=all', $phpSessionId, $tabToken);
    $resolvedOrder = array_values(array_filter($resolvedListing['body']['purchase_orders'] ?? [], static fn(array $row): bool => ($row['po_id'] ?? '') === $poId))[0] ?? null;
    receivingAssert(is_array($resolvedOrder) && empty($resolvedOrder['open_claim_badge']) && (int) ($resolvedOrder['open_claim_count'] ?? 0) === 0, 'Resolved replacement claim still appears as pending on the PO row.');

    echo "inspect deliveries three-step test passed\n";
} finally {
    $receivingId = (string) ($pdo->query("SELECT receiving_id FROM purchase_order_receiving WHERE po_id='{$poId}' LIMIT 1")->fetchColumn() ?: '');
    $inventoryIds = $pdo->query("SELECT legacy_inventory_id FROM inventory_batches WHERE po_item_id='{$poItemId}' AND legacy_inventory_id IS NOT NULL")->fetchAll(PDO::FETCH_COLUMN);
    $pdo->prepare('DELETE FROM supplier_credit_applications WHERE credit_id IN (SELECT credit_id FROM supplier_credits WHERE claim_id IN (SELECT claim_id FROM supplier_claims WHERE po_item_id=:po_item_id))')->execute([':po_item_id' => $poItemId]);
    $pdo->prepare('DELETE FROM supplier_credits WHERE claim_id IN (SELECT claim_id FROM supplier_claims WHERE po_item_id=:po_item_id)')->execute([':po_item_id' => $poItemId]);
    $pdo->prepare('DELETE FROM activity_logs WHERE reference_id IN (SELECT claim_id FROM supplier_claims WHERE po_item_id=:po_item_id)')->execute([':po_item_id' => $poItemId]);
    $pdo->prepare('DELETE FROM inventory_receiving_transactions WHERE po_item_id=:po_item_id')->execute([':po_item_id' => $poItemId]);
    $pdo->prepare("DELETE FROM purchase_order_receiving WHERE po_id=:po_id AND receiving_type='Replacement'")->execute([':po_id' => $poId]);
    $pdo->prepare('DELETE FROM supplier_claims WHERE po_item_id=:po_item_id')->execute([':po_item_id' => $poItemId]);
    $pdo->prepare('DELETE FROM inventory_batches WHERE po_item_id=:po_item_id')->execute([':po_item_id' => $poItemId]);
    foreach ($inventoryIds as $inventoryId) {
        $pdo->prepare('DELETE FROM activity_logs WHERE reference_id=:reference_id')->execute([':reference_id' => $inventoryId]);
        $pdo->prepare('DELETE FROM product_inventory WHERE inventory_id=:inventory_id')->execute([':inventory_id' => $inventoryId]);
    }
    if ($receivingId !== '') {
        $pdo->prepare('DELETE FROM product_inventory WHERE receiving_id=:receiving_id')->execute([':receiving_id' => $receivingId]);
        $pdo->prepare('DELETE FROM purchase_order_receiving_items WHERE receiving_id=:receiving_id')->execute([':receiving_id' => $receivingId]);
    }
    $pdo->prepare('DELETE FROM purchase_order_receiving WHERE po_id=:po_id')->execute([':po_id' => $poId]);
    $pdo->prepare('DELETE FROM activity_logs WHERE reference_id IN (:po_id,:po_item_id)')->execute([':po_id' => $poId, ':po_item_id' => $poItemId]);
    $pdo->prepare('DELETE FROM purchase_order_items WHERE po_item_id=:po_item_id')->execute([':po_item_id' => $poItemId]);
    $pdo->prepare('DELETE FROM purchase_orders WHERE po_id=:po_id')->execute([':po_id' => $poId]);
    $pdo->prepare('DELETE FROM auth_sessions WHERE auth_session_id=:id')->execute([':id' => $authSessionId]);
    if ($productId !== '' && is_array($originalProductPricing)) {
        $pdo->prepare('UPDATE product SET price=:price,pricing_method=:pricing_method,custom_markup_percentage=:custom_markup WHERE product_id=:product_id')->execute([
            ':price' => $originalProductPricing['price'], ':pricing_method' => $originalProductPricing['pricing_method'],
            ':custom_markup' => $originalProductPricing['custom_markup_percentage'], ':product_id' => $productId,
        ]);
    }
}
