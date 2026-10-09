<?php
require_once '../../config/db_connection.php';
require_once '../../config/require_auth.php';
require_once 'purchase_order_helpers.php';
require_once 'purchase_order_payment_helpers.php';
require_once 'purchase_order_invoice_helpers.php';
require_once '../products/product_category_schema.php';
require_once '../purchase_requests/purchase_request_helpers.php';
require_once '../settings/settings_helpers.php';

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    http_response_code(405);
    echo json_encode(['status' => 'error', 'message' => 'Only GET requests are allowed.']);
    exit();
}

$poId = cleanId($_GET['po_id'] ?? null);

if ($poId === '') {
    http_response_code(400);
    echo json_encode(['status' => 'error', 'message' => 'Purchase order id is required.']);
    exit();
}

try {
    ensurePurchaseRequestSchema($pdo);
    ensurePurchaseOrderSchema($pdo);
    ensurePurchaseOrderInvoiceSchema($pdo);
    $systemSettings = fetchSystemSettings($pdo);

    $orderStatement = $pdo->prepare(
        "SELECT
            po.po_id,
            po.pr_id,
            po.po_number,
            pr.pr_number,
            po.supplier_id,
            po.created_at AS order_date,
            po.payment_terms,
            po.payment_status,
            po.approval_status,
            po.total_amount AS legacy_total_amount,
            poi.supplier_invoice_total AS invoice_total,
            po.final_payment AS stored_final_payment,
            po.expected_delivery_date,
            po.status,
            s.supplier_name,
            s.address AS supplier_address,
            s.phone AS supplier_phone,
            s.email AS supplier_email,
            audit.action AS approval_action,
            audit.reason AS approval_reason,
            audit.created_at AS approval_reason_at,
            audit.user_name AS approval_reason_by,
            por.received_date,
            por.remarks AS receiving_remarks
         FROM purchase_orders po
         INNER JOIN suppliers s ON s.supplier_id = po.supplier_id
         LEFT JOIN purchase_order_invoices poi ON poi.po_id = po.po_id
         LEFT JOIN purchase_requests pr ON pr.pr_id = po.pr_id
         LEFT JOIN (
            SELECT a.po_id, a.action, a.reason, a.created_at, a.user_name
            FROM purchase_order_approval_audit a
            INNER JOIN (
                SELECT po_id, MAX(created_at) AS latest_created_at
                FROM purchase_order_approval_audit
                WHERE action IN ('reject', 'request_revision', 'revoke_approval', 'resubmit_revision')
                GROUP BY po_id
            ) latest ON latest.po_id = a.po_id AND latest.latest_created_at = a.created_at
            WHERE a.action IN ('reject', 'request_revision', 'revoke_approval', 'resubmit_revision')
         ) audit ON audit.po_id = po.po_id
         LEFT JOIN purchase_order_receiving por ON por.po_id = po.po_id
         WHERE po.po_id = :po_id
         LIMIT 1"
    );
    $orderStatement->execute([':po_id' => $poId]);
    $order = $orderStatement->fetch(PDO::FETCH_ASSOC);

    if (!$order) {
        http_response_code(404);
        echo json_encode(['status' => 'error', 'message' => 'Purchase order not found.']);
        exit();
    }

    $order['inspection_in_progress'] = false;
    $order['inspection_draft'] = null;
    $draftPrefix = "[INSPECTION_DRAFT_V1]\n";
    $receivingRemarks = (string) ($order['receiving_remarks'] ?? '');
    if (str_starts_with($receivingRemarks, $draftPrefix)) {
        $draft = json_decode(substr($receivingRemarks, strlen($draftPrefix)), true);
        if (is_array($draft)) {
            $order['inspection_in_progress'] = true;
            $order['inspection_draft'] = $draft;
            $order['receiving_remarks'] = '';
            $order['received_date'] = null;
        }
    }
    $receivingMetaPrefix = "[RECEIVING_META_V1]\n";
    if (str_starts_with($receivingRemarks, $receivingMetaPrefix)) {
        $metaAndRemarks = substr($receivingRemarks, strlen($receivingMetaPrefix));
        [$metaJson, $plainRemarks] = array_pad(explode("\n", $metaAndRemarks, 2), 2, '');
        $receivingMeta = json_decode($metaJson, true);
        if (is_array($receivingMeta)) {
            $order['receiving_payment'] = $receivingMeta;
            $order['receiving_remarks'] = $plainRemarks;
        }
    }

    $itemsStatement = $pdo->prepare(
        "SELECT
            poi.po_item_id,
            poi.product_id,
            pri.requested_qty AS pr_requested_qty, pri.approved_qty AS pr_approved_qty,
            pri.unit_label_at_request AS pr_unit,
            p.status AS product_status,
            poi.quantity,
            poi.purchase_qty,
            CASE
                WHEN LOWER(TRIM(COALESCE(poi.purchase_unit_snapshot, ''))) LIKE 'by %' THEN TRIM(SUBSTRING(TRIM(poi.purchase_unit_snapshot), 4))
                ELSE COALESCE(NULLIF(TRIM(poi.purchase_unit_snapshot), ''), 'pcs')
            END AS purchase_unit,
            COALESCE(poi.units_per_purchase_unit_snapshot, 1) AS units_per_purchase_unit,
            COALESCE(NULLIF(poi.inventory_qty_ordered, 0), poi.quantity) AS inventory_qty_ordered,
            COALESCE(ROUND(piii.unit_cost * poi.purchase_qty, 2), poi.line_total) AS stored_line_total,
            CASE
                WHEN NULLIF(TRIM(poi.product_name_snapshot), '') IS NULL OR UPPER(TRIM(poi.product_name_snapshot)) LIKE 'N/A%' THEN p.product_name
                ELSE poi.product_name_snapshot
            END AS product_name,
            CASE
                WHEN NULLIF(TRIM(poi.brand_name_snapshot), '') IS NULL OR UPPER(TRIM(poi.brand_name_snapshot)) LIKE 'N/A%' THEN p.brand_name
                ELSE poi.brand_name_snapshot
            END AS brand_name,
            COALESCE(NULLIF(poi.category_name_snapshot, ''), pc.category_name) AS category_name,
            COALESCE(NULLIF(poi.type_name_snapshot, ''), pt.type_name) AS type_name,
            COALESCE(NULLIF(poi.generic_name_snapshot, ''), md.generic_name) AS generic_name,
            COALESCE(NULLIF(poi.strength_snapshot, ''), NULLIF(md.strength, ''), NULLIF(CONCAT_WS(' ', md.strength_value, md.strength_unit), ''), '') AS strength,
            COALESCE(md.strength_value, md.strength) AS strength_value,
            md.strength_unit AS strength_unit,
            md.dosage_form AS dosage_form,
            md.net_content_value,
            md.net_content_unit,
            md.net_content_value AS volume_value,
            md.net_content_unit AS volume_unit,
            COALESCE(NULLIF(poi.variant_flavor_snapshot, ''), gd.variant, '') AS variant_flavor,
            COALESCE(NULLIF(poi.size_value_snapshot, ''), gd.size, '') AS size_value,
            gd.net_weight AS weight_volume_value,
            gd.unit AS weight_volume_unit,
            COALESCE(NULLIF(poi.packaging_snapshot, ''), md.package_type, gd.package_type, '') AS packaging,
            CASE
                WHEN NULLIF(poi.unit_snapshot, '') IS NOT NULL AND UPPER(TRIM(poi.unit_snapshot)) NOT LIKE 'N/A%' THEN poi.unit_snapshot
                WHEN LOWER(COALESCE(md.dosage_form, '')) IN ('tablet', 'capsule', 'caplet') THEN 'pcs'
                ELSE COALESCE(md.dosage_form, '')
            END AS unit,
            COALESCE(piii.unit_cost / NULLIF(poi.units_per_purchase_unit_snapshot, 0), poi.unit_price_snapshot) AS price,
            p.price AS selling_price,
            COALESCE(SUM(pori.received_quantity), 0) AS received_quantity,
            COALESCE(SUM(pori.damaged_quantity), 0) AS damaged_quantity,
            COALESCE(returns.return_quantity, 0) AS returned_quantity,
            COALESCE(returns.supplier_credit_quantity, 0) AS supplier_credit_quantity,
            COALESCE(returns.replacement_pending_quantity, 0) AS replacement_pending_quantity,
            COALESCE(returns.return_reasons, '') AS return_reasons,
            COALESCE(returns.return_remarks, '') AS return_remarks,
            MAX(ib.expiry_date) AS received_expiry_date,
            COALESCE(inv.storage_qty, 0) AS storage_qty,
            COALESCE(inv.shelf_qty, 0) AS shelf_qty,
            COALESCE(inv.damaged_qty, 0) AS damaged_qty,
            COALESCE(inv.storage_qty, 0) + COALESCE(inv.shelf_qty, 0) + COALESCE(inv.damaged_qty, 0) AS total_qty
         FROM purchase_order_items poi
         LEFT JOIN purchase_request_items pri ON pri.pr_item_id = poi.pr_item_id
         LEFT JOIN product p ON p.product_id = poi.product_id
         LEFT JOIN product_categories pc ON pc.category_id = p.category_id
         LEFT JOIN product_types pt ON pt.type_id = p.type_id
         LEFT JOIN medicine_details md ON md.product_id = p.product_id
         LEFT JOIN grocery_details gd ON gd.product_id = p.product_id
         LEFT JOIN purchase_order_receiving_item_summary pori ON pori.po_item_id = poi.po_item_id
         LEFT JOIN purchase_order_invoice_items piii ON piii.po_item_id = poi.po_item_id
         LEFT JOIN (
            SELECT
                po_item_id,
                SUM(return_quantity) AS return_quantity,
                SUM(CASE WHEN resolution_type IN ('Current PO Credit','Next PO Credit','Supplier Credit') THEN return_quantity ELSE 0 END) AS supplier_credit_quantity,
                SUM(CASE WHEN resolution_type = 'Replacement' THEN GREATEST(replacement_expected_qty - replacement_received_qty, 0) ELSE 0 END) AS replacement_pending_quantity,
                GROUP_CONCAT(damage_reason ORDER BY return_id SEPARATOR ', ') AS return_reasons,
            GROUP_CONCAT(NULLIF(remarks, '') ORDER BY return_id SEPARATOR '; ') AS return_remarks
            FROM supplier_claim_legacy_projection
            GROUP BY po_item_id
         ) returns ON returns.po_item_id = poi.po_item_id
         LEFT JOIN inventory_batches ib ON ib.po_item_id = poi.po_item_id
         LEFT JOIN (
            SELECT
                product_id,
                SUM(storage_qty) AS storage_qty,
                SUM(shelf_qty) AS shelf_qty,
                SUM(damaged_qty) AS damaged_qty
            FROM inventory_batches
            WHERE batch_status IN ('active', 'expired', 'damaged', 'returned')
            GROUP BY product_id
         ) inv ON inv.product_id = poi.product_id
         WHERE poi.po_id = :po_id
         GROUP BY poi.po_item_id, poi.product_id, p.status, poi.quantity, poi.purchase_qty, poi.purchase_unit_snapshot, poi.units_per_purchase_unit_snapshot, poi.inventory_qty_ordered, poi.line_total, piii.unit_cost, poi.product_name_snapshot, poi.brand_name_snapshot, poi.category_name_snapshot, poi.type_name_snapshot, poi.generic_name_snapshot, poi.variant_flavor_snapshot, poi.strength_snapshot, poi.size_value_snapshot, poi.unit_snapshot, poi.packaging_snapshot, poi.unit_price_snapshot, p.product_name, p.brand_name, pc.category_name, pt.type_name, md.generic_name, md.strength, md.strength_value, md.strength_unit, md.net_content_value, md.net_content_unit, md.dosage_form, md.package_type, gd.variant, gd.size, gd.net_weight, gd.unit, gd.package_type, p.price, returns.return_quantity, returns.supplier_credit_quantity, returns.replacement_pending_quantity, returns.return_reasons, returns.return_remarks, inv.storage_qty, inv.shelf_qty, inv.damaged_qty
         ORDER BY poi.po_item_id"
    );
    $itemsStatement->execute([':po_id' => $poId]);

    $items = $itemsStatement->fetchAll(PDO::FETCH_ASSOC);

    // Purchase-order snapshots contain the legacy medicine/grocery fields,
    // while configurable product specifications are stored separately.
    // Load those saved values for the PO detail and invoice views as well.
    $productIds = array_values(array_unique(array_filter(array_column($items, 'product_id'))));
    $specificationsByProduct = [];
    if ($productIds) {
        $placeholders = implode(',', array_fill(0, count($productIds), '?'));
        $specificationStatement = $pdo->prepare(
            "SELECT psv.product_id, psv.value_text, psv.value_number,
                    COALESCE(NULLIF(pmu.unit_symbol, ''), pmu.unit_name, '') AS unit_symbol
             FROM product_specification_values psv
             INNER JOIN product_specifications ps ON ps.specification_id = psv.specification_id
             LEFT JOIN product_measurement_units pmu ON pmu.measurement_unit_id = psv.measurement_unit_id
             WHERE psv.product_id IN ({$placeholders})
             ORDER BY psv.product_id, ps.specification_name"
        );
        $specificationStatement->execute($productIds);
        foreach ($specificationStatement->fetchAll(PDO::FETCH_ASSOC) as $specification) {
            $value = trim((string) ($specification['value_text'] ?? ''));
            if ($value === '' && $specification['value_number'] !== null && $specification['value_number'] !== '') {
                $number = (string) $specification['value_number'];
                if (str_contains($number, '.')) $number = rtrim(rtrim($number, '0'), '.');
                $value = trim($number . ' ' . (string) ($specification['unit_symbol'] ?? ''));
            }
            if ($value !== '') $specificationsByProduct[cleanId($specification['product_id'])][] = $value;
        }
    }
    foreach ($items as &$item) {
        $item['specification'] = implode(' • ', array_values(array_unique(
            $specificationsByProduct[cleanId($item['product_id'])] ?? []
        )));
    }
    unset($item);

    $conversionStatement = $pdo->prepare(
        'SELECT poi.po_item_id,c.conversion_id,c.unit_name,c.base_quantity,c.level_order
         FROM purchase_order_items poi
         INNER JOIN purchase_orders po ON po.po_id=poi.po_id
         INNER JOIN supplier_products sp ON sp.product_id=poi.product_id AND sp.supplier_id=po.supplier_id
         INNER JOIN supplier_product_unit_conversions c ON c.supplier_product_id=sp.supplier_product_id
         WHERE poi.po_id=:po_id
         ORDER BY poi.po_item_id,c.level_order DESC,c.base_quantity DESC'
    );
    $conversionStatement->execute([':po_id'=>$poId]);
    $conversionsByItem=[];
    foreach($conversionStatement->fetchAll(PDO::FETCH_ASSOC) as $conversion){
        $conversion['base_quantity']=(int)$conversion['base_quantity'];
        $conversionsByItem[cleanId($conversion['po_item_id'])][]=$conversion;
    }

    $batchStatement = $pdo->prepare(
        "SELECT ib.po_item_id,
                COALESCE(pi.batch_number, ib.batch_id) AS batch_identifier,
                ib.storage_qty + ib.shelf_qty AS accepted_quantity,
                ib.expiry_date
         FROM inventory_batches ib
         LEFT JOIN product_inventory pi ON pi.inventory_id = ib.legacy_inventory_id
         WHERE ib.po_item_id IN (SELECT po_item_id FROM purchase_order_items WHERE po_id = :po_id)
           AND (ib.storage_qty > 0 OR ib.shelf_qty > 0)
         ORDER BY ib.received_date, ib.created_at, ib.batch_id"
    );
    $batchStatement->execute([':po_id' => $poId]);
    $batchesByItem = [];
    foreach ($batchStatement->fetchAll(PDO::FETCH_ASSOC) as $batch) {
        $batch['accepted_quantity'] = (int) ($batch['accepted_quantity'] ?? 0);
        $batchesByItem[cleanId($batch['po_item_id'])][] = $batch;
    }
    $returnedAmount = 0;
    $replacementPendingAmount = 0;

    foreach ($items as &$item) {
        $item['package_conversions']=$conversionsByItem[cleanId($item['po_item_id'])]??[];
        $inventoryQuantity = (int) ($item['inventory_qty_ordered'] ?: $item['quantity']);
        $price = $item['price'] === null ? 0.0 : (float) $item['price'];
        $returnedQuantity = (int) $item['supplier_credit_quantity'];
        $item['line_total'] = $item['stored_line_total'] === null ? null : round((float) $item['stored_line_total'], 2);
        $item['cost_basis'] = 'base_unit';
        $baseUnitCost = $price;
        $item['returned_amount'] = round($returnedQuantity * $baseUnitCost, 2);
        $item['supplier_credit_amount'] = $item['returned_amount'];
        $item['replacement_pending_amount'] = round((int) ($item['replacement_pending_quantity'] ?? 0) * $baseUnitCost, 2);
        $item['accepted_batches'] = $batchesByItem[cleanId($item['po_item_id'])] ?? [];
        $returnedAmount += (float) $item['returned_amount'];
        $replacementPendingAmount += (float) $item['replacement_pending_amount'];
    }
    unset($item);

    $order['items'] = $items;
    $order['print_roles'] = [
        'preparedName' => $systemSettings['poPreparedName'] ?? '',
        'preparedRole' => $systemSettings['poPreparedRole'] ?? 'Manager',
        'approvedName' => $systemSettings['poApprovedName'] ?? '',
        'approvedRole' => $systemSettings['poApprovedRole'] ?? 'Supervisor',
    ];
    $invoiceTotal = $order['invoice_total'] === null ? null : round((float) $order['invoice_total'], 2);
    $legacyTotal = $order['legacy_total_amount'] === null ? null : round((float) $order['legacy_total_amount'], 2);
    $order['invoice_total'] = $invoiceTotal;
    $order['total_amount'] = $invoiceTotal ?? $legacyTotal;
    $order['total_source'] = $invoiceTotal !== null ? 'supplier_invoice' : ($legacyTotal !== null ? 'legacy_po' : null);
    $order['total_confirmed'] = $order['total_amount'] !== null;
    $order['invoice_recorded'] = $invoiceTotal !== null;
    $order['returned_amount'] = $returnedAmount;
    $order['replacement_value_pending'] = $replacementPendingAmount;
    $storedFinalPayment = (float) ($order['stored_final_payment'] ?? 0);
    $order['final_payment'] = $invoiceTotal ?? ($storedFinalPayment > 0 ? $storedFinalPayment : $legacyTotal);
    $paymentSummary = purchaseOrderPaymentSummary($pdo, $poId, (float) ($order['final_payment'] ?? 0));
    $order['total_paid'] = $paymentSummary['total_paid'];
    $order['supplier_credit_applied'] = $paymentSummary['supplier_credit_applied'];
    $order['remaining_balance'] = $paymentSummary['remaining_balance'];
    $order['payment_status'] = $paymentSummary['payment_status'];
    $order['payment_state'] = $paymentSummary['payment_status'];
    $order['payment_available'] = in_array(($order['status'] ?? ''), ['Pending', 'Arrived', 'Delivered'], true)
        && $order['invoice_recorded']
        && (float) ($order['final_payment'] ?? 0) > 0;

    echo json_encode(['status' => 'success', 'purchase_order' => $order]);
} catch (Throwable $e) {
    error_log(sprintf(
        '[PURCHASE_ORDER_DETAILS] po_id=%s error=%s',
        $poId,
        $e->getMessage()
    ));
    http_response_code(500);
    echo json_encode(['status' => 'error', 'message' => 'Unable to load purchase order details.']);
}
?>
