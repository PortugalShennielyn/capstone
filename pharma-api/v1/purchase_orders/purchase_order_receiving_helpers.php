<?php

require_once __DIR__ . '/purchase_order_helpers.php';
require_once __DIR__ . '/purchase_order_payment_helpers.php';

function parseReceivingRemarks(?string $storedRemarks): array
{
    $stored = (string) $storedRemarks;
    $prefix = "[RECEIVING_META_V1]\n";
    if (!str_starts_with($stored, $prefix)) return ['metadata' => [], 'remarks' => trim($stored)];
    $remaining = substr($stored, strlen($prefix));
    [$json, $remarks] = array_pad(explode("\n", $remaining, 2), 2, '');
    $metadata = json_decode($json, true);
    return ['metadata' => is_array($metadata) ? $metadata : [], 'remarks' => trim($remarks)];
}

function receivingResultLabel(array $items, string $poStatus): string
{
    $resolutions = array_column($items, 'resolution');
    if (in_array('return_for_replacement', $resolutions, true)) return 'Received with Replacement Pending';
    if (in_array('return_for_credit', $resolutions, true)) return 'Received with Credit Pending';
    if (in_array('reject_without_replacement', $resolutions, true)) return 'Received with Return';
    if (array_intersect(['keep_damaged', 'keep_with_discount'], $resolutions)) return 'Received with Damage Kept';
    return $poStatus === 'Delivered' ? 'Received in Full' : 'Received with Return';
}

function receivingGrnNumber(string $poNumber, string $receivedDate): string
{
    $date = date('Ymd', strtotime($receivedDate ?: 'now'));
    $suffix = substr(preg_replace('/[^A-Za-z0-9]+/', '', $poNumber) ?: '0001', -4);
    return 'GRN-' . $date . '-' . str_pad($suffix, 4, '0', STR_PAD_LEFT);
}

function buildPurchaseOrderReceivingDetails(PDO $pdo, string $poId): ?array
{
    $headerStatement = $pdo->prepare(
        "SELECT po.po_id, po.po_number, po.status, po.payment_status, po.payment_terms,
                po.total_amount, po.final_payment, po.created_at AS order_date, po.expected_delivery_date,
                s.supplier_id, s.supplier_name, por.receiving_id, por.received_date, por.remarks AS stored_receiving_remarks,
                receiver.user_id AS received_by_id,
                COALESCE(NULLIF(receiver.full_name, ''), receiver.username, 'System') AS received_by
         FROM purchase_orders po
         INNER JOIN suppliers s ON s.supplier_id = po.supplier_id
         INNER JOIN purchase_order_receiving por ON por.po_id = po.po_id
         LEFT JOIN activity_logs receipt_log ON receipt_log.activity_id = (
             SELECT al.activity_id FROM activity_logs al
             WHERE al.reference_id = po.po_id AND al.module = 'Purchase Order'
             ORDER BY al.created_at DESC, al.activity_id DESC LIMIT 1
         )
         LEFT JOIN users receiver ON receiver.user_id = receipt_log.user_id
         WHERE po.po_id = :po_id
           AND EXISTS (SELECT 1 FROM purchase_order_receiving_items x WHERE x.receiving_id = por.receiving_id)
         LIMIT 1"
    );
    $headerStatement->execute([':po_id' => $poId]);
    $header = $headerStatement->fetch(PDO::FETCH_ASSOC);
    if (!$header) return null;

    $remarks = parseReceivingRemarks($header['stored_receiving_remarks'] ?? '');
    $itemStatement = $pdo->prepare(
        "SELECT poi.po_item_id, poi.product_id,
                COALESCE(NULLIF(poi.inventory_qty_ordered, 0), poi.quantity) AS ordered_quantity,
                COALESCE(pori.received_quantity, 0) AS delivered_quantity,
                COALESCE(pori.damaged_quantity, 0) AS damaged_quantity,
                COALESCE(poi.unit_price_snapshot, 0) AS unit_price,
                COALESCE(NULLIF(poi.product_name_snapshot, ''), p.product_name) AS product_name,
                COALESCE(NULLIF(poi.brand_name_snapshot, ''), p.brand_name) AS brand_name,
                COALESCE(NULLIF(poi.generic_name_snapshot, ''), md.generic_name, gd.variant, '') AS generic_or_variant,
                COALESCE(NULLIF(poi.strength_snapshot, ''), NULLIF(CONCAT_WS(' ', md.strength_value, md.strength_unit), ''), md.strength, '') AS strength,
                COALESCE(NULLIF(poi.size_value_snapshot, ''), gd.size, '') AS size_value,
                COALESCE(NULLIF(poi.unit_snapshot, ''), md.dosage_form, gd.unit, 'pcs') AS unit,
                COALESCE(NULLIF(poi.packaging_snapshot, ''), md.package_type, gd.package_type, '') AS packaging
         FROM purchase_order_items poi
         INNER JOIN product p ON p.product_id = poi.product_id
         LEFT JOIN purchase_order_receiving_items pori ON pori.po_item_id = poi.po_item_id AND pori.receiving_id = :receiving_id
         LEFT JOIN medicine_details md ON md.product_id = poi.product_id
         LEFT JOIN grocery_details gd ON gd.product_id = poi.product_id
         WHERE poi.po_id = :po_id
         ORDER BY poi.po_item_id"
    );
    $itemStatement->execute([':receiving_id' => $header['receiving_id'], ':po_id' => $poId]);
    $items = $itemStatement->fetchAll(PDO::FETCH_ASSOC);

    $returnStatement = $pdo->prepare('SELECT * FROM purchase_order_returns WHERE po_id = :po_id ORDER BY created_at, return_id');
    $returnStatement->execute([':po_id' => $poId]);
    $returnsByItem = [];
    foreach ($returnStatement->fetchAll(PDO::FETCH_ASSOC) as $return) {
        $decorated = decoratePurchaseOrderReturnRecord($return);
        if (($decorated['resolution'] ?? '') === 'replacement_damage_event') continue;
        $returnsByItem[cleanId($return['po_item_id'])][] = $decorated;
    }

    $batchStatement = $pdo->prepare(
        "SELECT ib.po_item_id, COALESCE(NULLIF(pi.batch_number, ''), ib.batch_id) AS batch_identifier,
                ib.received_qty AS batch_quantity, ib.storage_qty + ib.shelf_qty AS inventory_quantity,
                ib.damaged_qty, ib.returned_qty, ib.expiry_date, ib.received_date
         FROM inventory_batches ib
         LEFT JOIN product_inventory pi ON pi.inventory_id = ib.legacy_inventory_id
         WHERE ib.po_item_id IN (SELECT po_item_id FROM purchase_order_items WHERE po_id = :po_id)
         ORDER BY ib.received_date, ib.created_at, ib.batch_id"
    );
    $batchStatement->execute([':po_id' => $poId]);
    $batchesByItem = [];
    foreach ($batchStatement->fetchAll(PDO::FETCH_ASSOC) as $batch) {
        foreach (['batch_quantity', 'inventory_quantity', 'damaged_qty', 'returned_qty'] as $field) $batch[$field] = (int) $batch[$field];
        $batchesByItem[cleanId($batch['po_item_id'])][] = $batch;
    }

    $totals = ['ordered_units' => 0, 'delivered_units' => 0, 'accepted_units' => 0, 'affected_units' => 0, 'inventory_added' => 0, 'returned_rejected_value' => 0, 'supplier_credit' => 0, 'supplier_discount' => 0];
    $calculatedOrderTotal = 0.0;
    foreach ($items as &$item) {
        $itemId = cleanId($item['po_item_id']);
        $return = $returnsByItem[$itemId][0] ?? [];
        $resolution = (string) ($return['resolution'] ?? 'none');
        $ordered = (int) $item['ordered_quantity'];
        $delivered = (int) $item['delivered_quantity'];
        $damaged = (int) $item['damaged_quantity'];
        $missing = (int) ($return['missing_quantity'] ?? max(0, $ordered - $delivered));
        $returned = in_array($resolution, ['return_for_credit', 'return_for_replacement'], true) ? $damaged : 0;
        $disposed = $resolution === 'reject_without_replacement' ? $damaged : 0;
        $accepted = max(0, $delivered - $returned - $disposed);
        $batches = $batchesByItem[$itemId] ?? [];
        $inventoryAdded = array_sum(array_column($batches, 'batch_quantity'));
        if ($inventoryAdded === 0 && $accepted > 0) $inventoryAdded = $accepted;
        $affected = $damaged + $missing;
        $unitPrice = (float) $item['unit_price'];
        $calculatedOrderTotal += $ordered * $unitPrice;
        $credit = in_array($resolution, ['return_for_credit', 'reject_without_replacement'], true) ? $affected * $unitPrice : 0;
        $returnedRejectedValue = in_array($resolution, ['return_for_credit', 'return_for_replacement', 'reject_without_replacement'], true) ? $affected * $unitPrice : 0;
        $item['ordered_quantity'] = $ordered;
        $item['delivered_quantity'] = $delivered;
        $item['accepted_quantity'] = $accepted;
        $item['damaged_quantity'] = $damaged;
        $item['returned_quantity'] = $returned;
        $item['disposed_quantity'] = $disposed;
        $item['missing_quantity'] = $missing;
        $item['replacement_pending_quantity'] = (int) ($return['replacement_outstanding_qty'] ?? 0);
        $item['issue_type'] = (string) ($return['damage_reason'] ?? '');
        $item['resolution'] = $resolution;
        $item['return_status'] = (string) ($return['return_status'] ?? '');
        $item['item_remarks'] = (string) ($return['remarks'] ?? '');
        $item['supplier_discount'] = (float) ($return['supplier_adjustment'] ?? 0);
        $item['inventory_added'] = $inventoryAdded;
        $item['batches'] = $batches;
        $item['unit_price'] = $unitPrice;
        $totals['ordered_units'] += $ordered;
        $totals['delivered_units'] += $delivered;
        $totals['accepted_units'] += $accepted;
        $totals['affected_units'] += $affected;
        $totals['inventory_added'] += $inventoryAdded;
        $totals['returned_rejected_value'] += $returnedRejectedValue;
        $totals['supplier_credit'] += $credit;
        $totals['supplier_discount'] += (float) $item['supplier_discount'];
    }
    unset($item);
    $totals['supplier_discount'] = max($totals['supplier_discount'], (float) ($remarks['metadata']['supplier_discount'] ?? 0));
    foreach (['returned_rejected_value', 'supplier_credit', 'supplier_discount'] as $field) $totals[$field] = round((float) $totals[$field], 2);
    $payment = purchaseOrderPaymentSummary($pdo, $poId, (float) $header['final_payment']);
    $payment['payments'] = purchaseOrderPaymentHistory($pdo, $poId);
    $header['total_amount'] = round($calculatedOrderTotal, 2);
    $header['final_payment'] = round((float) $header['final_payment'], 2);
    $header['receiving_remarks'] = $remarks['remarks'];
    unset($header['stored_receiving_remarks']);
    $header['grn_number'] = receivingGrnNumber((string) $header['po_number'], (string) $header['received_date']);
    $header['receiving_result'] = receivingResultLabel($items, (string) $header['status']);
    $header['products'] = count($items);
    $header['items'] = $items;
    $header['totals'] = $totals;
    $header['payment'] = $payment;
    return $header;
}
