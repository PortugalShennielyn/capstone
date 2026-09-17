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
    if (array_intersect(['replacement', 'return_for_replacement'], $resolutions)) return 'Received with Replacement Pending';
    if (array_intersect(['supplier_credit', 'next_po_credit'], $resolutions)) return 'Received with Supplier Claim';
    return $poStatus === 'Delivered' ? 'Received in Full' : 'Received with Return/Damage';
}

function receivingGrnNumber(string $poNumber, string $receivedDate): string
{
    $date = date('Ymd', strtotime($receivedDate ?: 'now'));
    $suffix = substr(preg_replace('/[^A-Za-z0-9]+/', '', $poNumber) ?: '0001', -4);
    return 'GRN-' . $date . '-' . str_pad($suffix, 4, '0', STR_PAD_LEFT);
}

function buildPurchaseOrderReceivingDetails(PDO $pdo, string $poId, string $receivingId = ''): ?array
{
    $receivingFilter = $receivingId !== '' ? ' AND por.receiving_id = :receiving_id' : '';
    $headerStatement = $pdo->prepare(
        "SELECT po.po_id, po.po_number, po.status, po.payment_status, po.payment_terms,
                po.total_amount, po.final_payment, po.created_at AS order_date, po.expected_delivery_date,
                s.supplier_id, s.supplier_name, por.receiving_id, por.claim_id, por.received_date, por.inspection_status, por.inspected_by,
                por.delivered_by_name, por.delivery_receipt_no, por.remarks AS stored_receiving_remarks,
                COALESCE(NULLIF(inspector.full_name, ''), inspector.username, '') AS inspected_by_name,
                receiver.user_id AS received_by_id,
                COALESCE(NULLIF(receiver.full_name, ''), receiver.username, 'System') AS received_by
         FROM purchase_orders po
         INNER JOIN suppliers s ON s.supplier_id = po.supplier_id
         INNER JOIN purchase_order_receiving por ON por.po_id = po.po_id AND por.receiving_type = 'Original'
         LEFT JOIN users inspector ON inspector.user_id = por.inspected_by
         LEFT JOIN activity_logs receipt_log ON receipt_log.activity_id = (
             SELECT al.activity_id FROM activity_logs al
             WHERE al.reference_id = po.po_id AND al.module = 'Purchase Order'
             ORDER BY al.created_at DESC, al.activity_id DESC LIMIT 1
         )
         LEFT JOIN users receiver ON receiver.user_id = receipt_log.user_id
         WHERE po.po_id = :po_id{$receivingFilter}
           AND EXISTS (SELECT 1 FROM purchase_order_receiving_items x WHERE x.receiving_id = por.receiving_id)
         ORDER BY por.received_date DESC, por.receiving_id DESC
         LIMIT 1"
    );
    $headerParameters = [':po_id' => $poId];
    if ($receivingId !== '') $headerParameters[':receiving_id'] = $receivingId;
    $headerStatement->execute($headerParameters);
    $header = $headerStatement->fetch(PDO::FETCH_ASSOC);
    if (!$header) return null;

    $remarks = parseReceivingRemarks($header['stored_receiving_remarks'] ?? '');
    $itemStatement = $pdo->prepare(
        "SELECT poi.po_item_id, poi.product_id, pori.receiving_item_id,
                COALESCE(NULLIF(poi.inventory_qty_ordered, 0), poi.quantity) AS ordered_quantity,
                COALESCE(pori.received_quantity, 0) AS delivered_quantity,
                COALESCE(pori.accepted_quantity, 0) AS accepted_quantity,
                COALESCE((SELECT raw_ri.missing_quantity
                          FROM purchase_order_receiving_items raw_ri
                          WHERE raw_ri.receiving_item_id = pori.receiving_item_id
                          LIMIT 1), 0) AS recorded_missing_quantity,
                COALESCE(NULLIF(poi.purchase_unit_snapshot, ''), 'Package') AS purchase_unit,
                COALESCE(poi.units_per_purchase_unit_snapshot, 1) AS units_per_purchase_unit,
                COALESCE(pori.damaged_quantity, 0) AS damaged_quantity,
                COALESCE(pori.action_quantity, 0) AS action_quantity,
                COALESCE(piii.unit_cost / NULLIF(poi.units_per_purchase_unit_snapshot, 0), poi.unit_price_snapshot, 0) AS unit_price,
                CASE
                    WHEN LOWER(COALESCE(pc.category_name, '')) = 'medicine'
                        THEN COALESCE(NULLIF(poi.generic_name_snapshot, ''), md.generic_name, p.product_name)
                    ELSE COALESCE(NULLIF(poi.product_name_snapshot, ''), p.product_name)
                END AS product_name,
                COALESCE(NULLIF(poi.brand_name_snapshot, ''), p.brand_name) AS brand_name,
                COALESCE(NULLIF(poi.generic_name_snapshot, ''), md.generic_name, '') AS generic_name,
                pc.category_name,
                COALESCE(NULLIF(poi.generic_name_snapshot, ''), md.generic_name, gd.variant, '') AS generic_or_variant,
                COALESCE(NULLIF(poi.strength_snapshot, ''), NULLIF(md.strength, ''), NULLIF(CONCAT_WS(' ', md.strength_value, md.strength_unit), ''), '') AS strength,
                COALESCE(NULLIF(poi.size_value_snapshot, ''), gd.size, '') AS size_value,
                COALESCE(NULLIF(poi.unit_snapshot, ''), md.dosage_form, gd.unit, 'pcs') AS unit,
                COALESCE(NULLIF(poi.packaging_snapshot, ''), md.package_type, gd.package_type, '') AS packaging
         FROM purchase_order_items poi
         LEFT JOIN product p ON p.product_id = poi.product_id
         LEFT JOIN product_categories pc ON pc.category_id = p.category_id
         LEFT JOIN purchase_order_receiving_item_summary pori ON pori.po_item_id = poi.po_item_id AND pori.receiving_id = :receiving_id
         LEFT JOIN purchase_order_invoice_items piii ON piii.po_item_id = poi.po_item_id
         LEFT JOIN medicine_details md ON md.product_id = poi.product_id
         LEFT JOIN grocery_details gd ON gd.product_id = poi.product_id
         WHERE poi.po_id = :po_id
         ORDER BY poi.po_item_id"
    );
    $itemStatement->execute([':receiving_id' => $header['receiving_id'], ':po_id' => $poId]);
    $items = $itemStatement->fetchAll(PDO::FETCH_ASSOC);

    $productIds = array_values(array_unique(array_filter(array_map(
        static fn(array $item): string => cleanId($item['product_id'] ?? null),
        $items
    ))));
    $specificationsByProduct = [];
    if ($productIds) {
        $placeholders = implode(',', array_fill(0, count($productIds), '?'));
        $specificationStatement = $pdo->prepare(
            "SELECT psv.product_id, psv.value_text, psv.value_number,
                    COALESCE(NULLIF(pmu.unit_symbol, ''), pmu.unit_name, '') AS unit_symbol
             FROM product_specification_values psv
             INNER JOIN product p ON p.product_id = psv.product_id
             INNER JOIN product_specifications ps ON ps.specification_id = psv.specification_id
             LEFT JOIN product_type_specifications pts
                    ON pts.type_id = p.type_id AND pts.specification_id = psv.specification_id
             LEFT JOIN product_measurement_units pmu
                    ON pmu.measurement_unit_id = psv.measurement_unit_id
             WHERE psv.product_id IN ({$placeholders})
             ORDER BY psv.product_id, COALESCE(pts.sort_order, 2147483647), ps.specification_name"
        );
        $specificationStatement->execute($productIds);
        foreach ($specificationStatement->fetchAll(PDO::FETCH_ASSOC) as $specification) {
            $value = trim((string) ($specification['value_text'] ?? ''));
            if ($value === '' && $specification['value_number'] !== null && $specification['value_number'] !== '') {
                $number = rtrim(rtrim((string) $specification['value_number'], '0'), '.');
                $value = trim(($number === '' ? '0' : $number) . ' ' . (string) ($specification['unit_symbol'] ?? ''));
            }
            if ($value !== '') $specificationsByProduct[cleanId($specification['product_id'])][] = $value;
        }
    }
    foreach ($items as &$item) {
        $item['specification'] = implode(' • ', array_values(array_unique($specificationsByProduct[cleanId($item['product_id'])] ?? [])));
    }
    unset($item);

    $returnStatement = $pdo->prepare(
        'SELECT claim_projection.*,
                (SELECT cr.credit_id FROM supplier_credits cr WHERE cr.claim_id = claim_projection.claim_id LIMIT 1) AS credit_id,
                (SELECT cr.credit_amount FROM supplier_credits cr WHERE cr.claim_id = claim_projection.claim_id LIMIT 1) AS credit_amount,
                (SELECT cr.credit_status FROM supplier_credits cr WHERE cr.claim_id = claim_projection.claim_id LIMIT 1) AS credit_status,
                (SELECT COALESCE(SUM(app.amount_applied), 0)
                 FROM supplier_credit_applications app
                 INNER JOIN supplier_credits cr ON cr.credit_id = app.credit_id
                 WHERE cr.claim_id = claim_projection.claim_id) AS credit_applied_amount
         FROM supplier_claim_legacy_projection claim_projection
         WHERE claim_projection.po_id = :po_id
           AND (
               EXISTS (
                   SELECT 1
                   FROM supplier_claim_damage_lines scoped_dl
                   INNER JOIN purchase_order_receiving_items scoped_ri
                           ON scoped_ri.receiving_item_id = scoped_dl.receiving_item_id
                   WHERE scoped_dl.claim_id = claim_projection.claim_id
                     AND scoped_ri.receiving_id = :claim_receiving_id
               )
               OR claim_projection.claim_id = :receiving_claim_id
               OR (SELECT COUNT(*)
                        FROM purchase_order_receiving single_por
                        WHERE single_por.po_id = :single_po_id
                          AND single_por.receiving_type = \'Original\'
                          AND EXISTS (SELECT 1 FROM purchase_order_receiving_items single_ri WHERE single_ri.receiving_id = single_por.receiving_id)) = 1
           )
         ORDER BY claim_projection.created_at, claim_projection.return_id'
    );
    $returnStatement->execute([
        ':po_id' => $poId,
        ':claim_receiving_id' => $header['receiving_id'],
        ':receiving_claim_id' => $header['claim_id'] ?? '',
        ':single_po_id' => $poId,
    ]);
    $returnsByItem = [];
    foreach ($returnStatement->fetchAll(PDO::FETCH_ASSOC) as $return) {
        $decorated = decoratePurchaseOrderReturnRecord($return);
        if (($decorated['resolution'] ?? '') === 'replacement_damage_event') continue;
        $returnsByItem[cleanId($return['po_item_id'])][] = $decorated;
    }

    $damageLineStatement = $pdo->prepare(
        'SELECT sc.po_item_id, dl.receiving_item_id, dl.sequence_no, dl.sequence_no AS package_sequence,
                dl.affected_quantity, dl.affected_unit_conversion_id,
                affected_c.unit_name AS affected_unit_name, affected_c.base_quantity AS affected_unit_base_quantity,
                dl.damaged_quantity, dl.damaged_unit_conversion_id,
                damaged_c.unit_name AS damaged_unit_name, damaged_c.base_quantity AS damaged_unit_base_quantity,
                dl.inventory_batch_id, pi.batch_number AS batch_identifier
         FROM supplier_claim_damage_lines dl
         INNER JOIN supplier_claims sc ON sc.claim_id = dl.claim_id
         INNER JOIN supplier_product_unit_conversions affected_c ON affected_c.conversion_id = dl.affected_unit_conversion_id
         INNER JOIN supplier_product_unit_conversions damaged_c ON damaged_c.conversion_id = dl.damaged_unit_conversion_id
         LEFT JOIN inventory_batches ib ON ib.batch_id = dl.inventory_batch_id
         LEFT JOIN product_inventory pi ON pi.inventory_id = ib.legacy_inventory_id
         WHERE sc.po_item_id IN (SELECT po_item_id FROM purchase_order_items WHERE po_id = :po_id)
            AND (dl.receiving_item_id IN (
                SELECT pri.receiving_item_id
                FROM purchase_order_receiving_items pri
                WHERE pri.receiving_id = :damage_receiving_id
            ) OR (dl.receiving_item_id IS NULL AND (
                SELECT COUNT(*)
                FROM purchase_order_receiving pr
                WHERE pr.po_id = :damage_po_id AND pr.receiving_type = \'Original\'
                  AND EXISTS (SELECT 1 FROM purchase_order_receiving_items pri2 WHERE pri2.receiving_id = pr.receiving_id)
            ) = 1))
          ORDER BY sc.po_item_id, dl.sequence_no'
    );
    $damageLineStatement->execute([
        ':po_id' => $poId,
        ':damage_receiving_id' => $header['receiving_id'],
        ':damage_po_id' => $poId,
    ]);
    $damageLinesByItem = [];
    foreach ($damageLineStatement->fetchAll(PDO::FETCH_ASSOC) as $damageLine) {
        foreach (['sequence_no', 'package_sequence', 'affected_quantity', 'affected_unit_base_quantity', 'damaged_quantity', 'damaged_unit_base_quantity'] as $field) $damageLine[$field] = (int) $damageLine[$field];
        $damageLine['affected_base_quantity'] = $damageLine['affected_quantity'] * $damageLine['affected_unit_base_quantity'];
        $damageLine['damaged_base_quantity'] = $damageLine['damaged_quantity'] * $damageLine['damaged_unit_base_quantity'];
        $damageLinesByItem[cleanId($damageLine['po_item_id'])][] = $damageLine;
    }

    $conversionStatement = $pdo->prepare(
        'SELECT poi.po_item_id, c.conversion_id, c.unit_name, c.base_quantity, c.level_order
         FROM purchase_order_items poi
         INNER JOIN purchase_orders po ON po.po_id = poi.po_id
         INNER JOIN supplier_products sp ON sp.product_id = poi.product_id AND sp.supplier_id = po.supplier_id
         INNER JOIN supplier_product_unit_conversions c ON c.supplier_product_id = sp.supplier_product_id
         WHERE poi.po_id = :po_id
         ORDER BY poi.po_item_id, c.level_order, c.base_quantity'
    );
    $conversionStatement->execute([':po_id' => $poId]);
    $conversionsByItem = [];
    foreach ($conversionStatement->fetchAll(PDO::FETCH_ASSOC) as $conversion) {
        $conversion['base_quantity'] = (int) $conversion['base_quantity'];
        $conversion['level_order'] = (int) $conversion['level_order'];
        $conversionsByItem[cleanId($conversion['po_item_id'])][] = $conversion;
    }

    $batchStatement = $pdo->prepare(
        "SELECT ib.batch_id, ib.legacy_inventory_id, ib.po_item_id, COALESCE(NULLIF(pi.batch_number, ''), ib.batch_id) AS batch_identifier,
                ib.received_qty AS batch_quantity, ib.storage_qty + ib.shelf_qty AS inventory_quantity,
                ib.damaged_qty, ib.returned_qty, ib.expiry_date, ib.received_date
         FROM inventory_batches ib
         LEFT JOIN product_inventory pi ON pi.inventory_id = ib.legacy_inventory_id
         WHERE ib.po_item_id IN (SELECT po_item_id FROM purchase_order_items WHERE po_id = :po_id)
           AND pi.receiving_id = :receiving_id
           AND ib.created_at <= DATE_ADD(:received_date, INTERVAL 10 MINUTE)
         ORDER BY ib.received_date, ib.created_at, ib.batch_id"
    );
    $batchStatement->execute([':po_id' => $poId, ':receiving_id' => $header['receiving_id'], ':received_date' => $header['received_date']]);
    $batchesByItem = [];
    foreach ($batchStatement->fetchAll(PDO::FETCH_ASSOC) as $batch) {
        foreach (['batch_quantity', 'inventory_quantity', 'damaged_qty', 'returned_qty'] as $field) $batch[$field] = (int) $batch[$field];
        $batchesByItem[cleanId($batch['po_item_id'])][] = $batch;
    }

    $totals = ['ordered_units' => 0, 'delivered_units' => 0, 'accepted_units' => 0, 'affected_units' => 0, 'inventory_added' => 0, 'accepted_goods_value' => 0, 'returned_unavailable_value' => 0, 'returned_rejected_value' => 0, 'supplier_credit' => 0, 'supplier_discount' => 0, 'future_supplier_credit' => 0];
    foreach ($items as &$item) {
        $itemId = cleanId($item['po_item_id']);
        $return = $returnsByItem[$itemId][0] ?? [];
        $resolution = (string) ($return['resolution'] ?? 'none');
        $disposition = (string) ($return['disposition'] ?? '');
        $ordered = (int) $item['ordered_quantity'];
        $delivered = (int) $item['delivered_quantity'];
        $damaged = (int) $item['damaged_quantity'];
        $action = (int) $item['action_quantity'];
        $missing = (int) ($return['missing_quantity'] ?? $item['recorded_missing_quantity'] ?? max(0, $ordered - $delivered));
        $returned = $disposition === 'Return to Supplier' ? $action : 0;
        $disposed = $disposition === 'Dispose' ? $action : 0;
        $quarantined = $disposition === 'Hold/Quarantine' ? $action : 0;
        $accepted = (int) $item['accepted_quantity'];
        $batches = $batchesByItem[$itemId] ?? [];
        $inventoryAdded = array_sum(array_column($batches, 'batch_quantity'));
        if ($inventoryAdded === 0 && $accepted > 0) $inventoryAdded = $accepted;
        $affected = max($damaged, $action) + $missing;
        $unitPrice = (float) $item['unit_price'];
        $credit = 0;
        $returnedRejectedValue = ($returned + $disposed) * $unitPrice;
        $item['ordered_quantity'] = $ordered;
        $item['delivered_quantity'] = $delivered;
        $item['delivered_purchase_quantity'] = intdiv($delivered, max(1, (int) $item['units_per_purchase_unit']));
        $item['accepted_quantity'] = $accepted;
        $item['damaged_quantity'] = $damaged;
        $item['damage_breakdown'] = $damageLinesByItem[$itemId] ?? [];
        $item['package_conversions'] = $conversionsByItem[$itemId] ?? [];
        $item['claim_id'] = $return['return_id'] ?? null;
        $item['action_quantity'] = $action;
        $item['damaged_selected_quantity'] = (int) ($return['damaged_selected_quantity'] ?? 0);
        $item['damaged_unit_conversion_id'] = $return['damaged_unit_conversion_id'] ?? null;
        $item['damaged_unit_name'] = $return['damaged_unit_name'] ?? null;
        $item['action_selected_quantity'] = (int) ($return['action_quantity'] ?? 0);
        $item['action_unit_conversion_id'] = $return['action_unit_conversion_id'] ?? null;
        $item['action_unit_name'] = $return['action_unit_name'] ?? null;
        $item['returned_quantity'] = $returned;
        $item['quarantined_quantity'] = $quarantined;
        $item['disposed_quantity'] = $disposed;
        $item['missing_quantity'] = $missing;
        $item['replacement_pending_quantity'] = (int) ($return['replacement_outstanding_qty'] ?? 0);
        $item['replacement_received_quantity'] = (int) ($return['replacement_received_qty'] ?? 0);
        $item['replacement_expected_quantity'] = (int) ($return['replacement_expected_qty'] ?? 0);
        $item['issue_type'] = (string) ($return['damage_reason'] ?? '');
        $item['affected_goods_action'] = $disposition;
        $item['resolution'] = $resolution;
        $item['return_status'] = (string) ($return['return_status'] ?? '');
        $item['claim_resolved_at'] = $return['resolved_at'] ?? null;
        $item['credit_id'] = $return['credit_id'] ?? null;
        $item['credit_amount'] = round((float) ($return['credit_amount'] ?? 0), 2);
        $item['credit_status'] = (string) ($return['credit_status'] ?? '');
        $item['credit_applied_amount'] = round((float) ($return['credit_applied_amount'] ?? 0), 2);
        $item['item_remarks'] = (string) ($return['remarks'] ?? '');
        $confirmedAdjustment = (float) ($return['supplier_adjustment'] ?? 0);
        $item['supplier_adjustment'] = $confirmedAdjustment;
        $item['supplier_discount'] = $resolution === 'supplier_credit' ? $confirmedAdjustment : 0.0;
        $item['future_supplier_credit'] = $resolution === 'next_po_credit' ? $confirmedAdjustment : 0.0;
        $item['inventory_added'] = $inventoryAdded;
        $item['batches'] = $batches;
        $item['unit_price'] = $unitPrice;
        $totals['ordered_units'] += $ordered;
        $totals['delivered_units'] += $delivered;
        $totals['accepted_units'] += $accepted;
        $totals['affected_units'] += $affected;
        $totals['inventory_added'] += $inventoryAdded;
        $totals['accepted_goods_value'] += $accepted * $unitPrice;
        $totals['returned_unavailable_value'] += max(0, $ordered - $accepted) * $unitPrice;
        $totals['returned_rejected_value'] += $returnedRejectedValue;
        $totals['supplier_credit'] += $credit;
        $totals['supplier_discount'] += (float) $item['supplier_discount'];
        $totals['future_supplier_credit'] += (float) $item['future_supplier_credit'];
    }
    unset($item);
    $totals['supplier_discount'] = max($totals['supplier_discount'], (float) ($remarks['metadata']['supplier_discount'] ?? 0));
    foreach (['accepted_goods_value', 'returned_unavailable_value', 'returned_rejected_value', 'supplier_credit', 'supplier_discount', 'future_supplier_credit'] as $field) $totals[$field] = round((float) $totals[$field], 2);
    $effectivePayable = purchaseOrderEffectivePayable($pdo, $poId, (float) $header['final_payment']);
    $payment = purchaseOrderPaymentSummary($pdo, $poId, $effectivePayable);
    $payment['payments'] = purchaseOrderPaymentHistory($pdo, $poId);
    $header['total_amount'] = $effectivePayable > 0 ? $effectivePayable : ($header['total_amount'] === null ? null : round((float) $header['total_amount'], 2));
    $header['final_payment'] = $effectivePayable;
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

function buildLegacyPurchaseOrderPaymentDetails(PDO $pdo, string $poId): ?array
{
    $statement = $pdo->prepare(
        "SELECT po.po_id, po.po_number, po.status, po.payment_status, po.payment_terms,
                po.total_amount, po.final_payment, po.created_at AS order_date,
                po.expected_delivery_date, s.supplier_id, s.supplier_name
         FROM purchase_orders po
         INNER JOIN suppliers s ON s.supplier_id = po.supplier_id
         WHERE po.po_id = :po_id AND po.status = 'Delivered'
         LIMIT 1"
    );
    $statement->execute([':po_id' => $poId]);
    $header = $statement->fetch(PDO::FETCH_ASSOC);
    if (!$header) return null;

    $effectivePayable = purchaseOrderEffectivePayable($pdo, $poId, (float) ($header['final_payment'] ?? 0));
    $payment = purchaseOrderPaymentSummary($pdo, $poId, $effectivePayable);
    $payment['payments'] = purchaseOrderPaymentHistory($pdo, $poId);

    $header['total_amount'] = $header['total_amount'] === null
        ? ($effectivePayable > 0 ? $effectivePayable : null)
        : round((float) $header['total_amount'], 2);
    $header['final_payment'] = $effectivePayable;
    $header['items'] = [];
    $header['totals'] = [
        'ordered_units' => null,
        'delivered_units' => null,
        'accepted_units' => null,
        'affected_units' => null,
        'inventory_added' => null,
        'accepted_goods_value' => null,
        'supplier_credit' => (float) ($payment['supplier_credit_applied'] ?? 0),
        'supplier_discount' => 0.0,
    ];
    $header['payment'] = $payment;
    $header['legacy_receiving_unavailable'] = true;
    $header['receiving_record_available'] = false;
    $header['receiving_message'] = 'Receiving record unavailable for this legacy purchase order.';
    return $header;
}
