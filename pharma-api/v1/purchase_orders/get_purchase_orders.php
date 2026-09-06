<?php
require_once '../../config/db_connection.php';
require_once '../../config/require_auth.php';
require_once 'purchase_order_helpers.php';
require_once 'purchase_order_payment_helpers.php';
require_once 'purchase_order_invoice_helpers.php';
require_once '../products/product_category_schema.php';
require_once '../purchase_requests/purchase_request_helpers.php';

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    http_response_code(405);
    echo json_encode(['status' => 'error', 'message' => 'Only GET requests are allowed.']);
    exit();
}

try {
    ensurePurchaseRequestSchema($pdo);
    ensurePurchaseOrderSchema($pdo);
    ensurePurchaseOrderInvoiceSchema($pdo);
    $status = trim((string) ($_GET['status'] ?? ''));
    $paymentStatusFilter = trim((string) ($_GET['payment_status'] ?? ''));
    $scope = trim((string) ($_GET['scope'] ?? 'active'));
    $whereClause = '';
    $params = [];

    if ($paymentStatusFilter !== '' && !in_array($paymentStatusFilter, ['Paid', 'Partially Paid', 'Unpaid'], true)) {
        throw new InvalidArgumentException('Invalid payment status filter.');
    }

    if ($status !== '') {
        if (!in_array($status, purchaseOrderStatuses(), true)) {
            throw new InvalidArgumentException('Invalid purchase order status filter.');
        }

        $whereClause = 'WHERE po.status = :status';
        $params[':status'] = $status;
    } elseif ($scope === 'complete') {
        $whereClause = "WHERE po.status = 'Delivered'";
    } elseif ($scope === 'all') {
        $whereClause = '';
    } else {
        $whereClause = "WHERE po.status IN ('Draft', 'Pending', 'Arrived', 'Delivered') AND po.approval_status <> 'Rejected'";
    }

    $statement = $pdo->prepare(
        "SELECT
            po.po_id,
            po.pr_id,
            po.po_number,
            pr.pr_number,
            po.created_at AS order_date,
            po.payment_terms,
            po.payment_status,
            po.approval_status,
            po.total_amount AS legacy_total_amount,
            poi.supplier_invoice_total AS invoice_total,
            po.final_payment AS stored_final_payment,
            COALESCE(payments.total_paid, 0) AS stored_total_paid,
            COALESCE(credits.total_credit, 0) AS supplier_credit_applied,
            po.expected_delivery_date,
            po.status,
            CASE WHEN poi.invoice_id IS NULL THEN 0 ELSE 1 END AS invoice_recorded,
            COALESCE(claims.open_claim_count, 0) AS open_claim_count,
            CASE
                WHEN COALESCE(claims.open_replacement_count, 0) > 0 THEN 'Replacement Pending'
                WHEN COALESCE(claims.open_credit_count, 0) > 0 THEN 'Supplier Credit Pending'
                WHEN COALESCE(claims.open_claim_count, 0) > 0 THEN 'Claim Pending'
                ELSE NULL
            END AS open_claim_badge,
            receiving.received_date,
            receiving.receiving_remarks,
            receiving.inspection_status,
            COALESCE(receiving.receiving_record_available, 0) AS receiving_record_available,
            audit.action AS approval_action,
            audit.reason AS approval_reason,
            audit.created_at AS approval_reason_at,
            audit.user_name AS approval_reason_by,
            s.supplier_name
         FROM purchase_orders po
         INNER JOIN suppliers s ON s.supplier_id = po.supplier_id
         LEFT JOIN purchase_order_invoices poi ON poi.po_id = po.po_id
         LEFT JOIN purchase_requests pr ON pr.pr_id = po.pr_id
         LEFT JOIN (
            SELECT po_id, SUM(amount) AS total_paid
            FROM purchase_order_payments
            GROUP BY po_id
         ) payments ON payments.po_id = po.po_id
         LEFT JOIN (
            SELECT po_id, SUM(amount_applied) AS total_credit
            FROM supplier_credit_applications
            GROUP BY po_id
         ) credits ON credits.po_id = po.po_id
         LEFT JOIN (
            SELECT
                poi.po_id,
                COUNT(*) AS open_claim_count,
                SUM(CASE WHEN sc.resolution_type = 'Replacement' OR sc.claim_status IN ('Awaiting Replacement', 'Partially Replaced', 'Replacement Partially Received') THEN 1 ELSE 0 END) AS open_replacement_count,
                SUM(CASE WHEN sc.resolution_type IN ('Current PO Credit', 'Next PO Credit', 'Supplier Credit') OR sc.claim_status = 'Awaiting Supplier Credit' THEN 1 ELSE 0 END) AS open_credit_count
            FROM supplier_claims sc
            INNER JOIN purchase_order_items poi ON poi.po_item_id = sc.po_item_id
            WHERE sc.resolved_at IS NULL
              AND sc.claim_status NOT IN ('Resolved', 'Resolved / Credit Issued', 'Replacement Received / Resolved')
            GROUP BY poi.po_id
         ) claims ON claims.po_id = po.po_id
         LEFT JOIN (
            SELECT
                po_id,
                MAX(received_date) AS received_date,
                MAX(inspection_status) AS inspection_status,
                MAX(EXISTS(
                    SELECT 1
                    FROM purchase_order_receiving_items pri
                    WHERE pri.receiving_id = purchase_order_receiving.receiving_id
                )) AS receiving_record_available,
                SUBSTRING_INDEX(GROUP_CONCAT(NULLIF(remarks, '') ORDER BY received_date DESC SEPARATOR ' | '), ' | ', 1) AS receiving_remarks
            FROM purchase_order_receiving
            WHERE receiving_type = 'Original'
            GROUP BY po_id
         ) receiving ON receiving.po_id = po.po_id
         LEFT JOIN (
            SELECT a.po_id, a.action, a.reason, a.created_at, a.user_name
            FROM purchase_order_approval_audit a
            INNER JOIN (
                SELECT po_id, MAX(created_at) AS latest_created_at
                FROM purchase_order_approval_audit
                WHERE action IN ('reject', 'cancel', 'request_revision', 'revoke_approval', 'resubmit_revision')
                GROUP BY po_id
            ) latest ON latest.po_id = a.po_id AND latest.latest_created_at = a.created_at
            WHERE a.action IN ('reject', 'cancel', 'request_revision', 'revoke_approval', 'resubmit_revision')
         ) audit ON audit.po_id = po.po_id
         {$whereClause}
         ORDER BY po.created_at DESC, po.po_id DESC"
    );
    $statement->execute($params);
    $orders = $statement->fetchAll(PDO::FETCH_ASSOC);

    if (count($orders) > 0) {
        $poIds = array_map(static fn($order) => cleanId($order['po_id']), $orders);
        $placeholders = implode(',', array_fill(0, count($poIds), '?'));
        $itemsStatement = $pdo->prepare(
            "SELECT
                poi.po_id,
                poi.po_item_id,
                poi.product_id,
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
                CASE
                    WHEN NULLIF(poi.unit_snapshot, '') IS NOT NULL AND UPPER(TRIM(poi.unit_snapshot)) NOT LIKE 'N/A%' THEN poi.unit_snapshot
                    WHEN LOWER(COALESCE(md.dosage_form, '')) IN ('tablet', 'capsule', 'caplet') THEN 'pcs'
                    ELSE COALESCE(md.dosage_form, '')
                END AS unit,
                COALESCE(NULLIF(poi.packaging_snapshot, ''), md.package_type, gd.package_type, '') AS packaging,
                COALESCE(piii.unit_cost / NULLIF(poi.units_per_purchase_unit_snapshot, 0), poi.unit_price_snapshot) AS price,
                p.price AS selling_price,
                COALESCE(SUM(pori.received_quantity), 0) AS received_quantity,
                COALESCE(SUM(pori.damaged_quantity), 0) AS damaged_quantity,
                COALESCE(returns.returned_quantity, 0) AS returned_quantity,
                COALESCE(returns.replacement_pending_quantity, 0) AS replacement_pending_quantity,
                COALESCE(batches.inventory_added, 0) AS inventory_added
             FROM purchase_order_items poi
             LEFT JOIN product p ON p.product_id = poi.product_id
             LEFT JOIN product_categories pc ON pc.category_id = p.category_id
             LEFT JOIN product_types pt ON pt.type_id = p.type_id
             LEFT JOIN medicine_details md ON md.product_id = p.product_id
             LEFT JOIN grocery_details gd ON gd.product_id = p.product_id
             LEFT JOIN purchase_order_receiving_item_summary pori ON pori.po_item_id = poi.po_item_id
             LEFT JOIN purchase_order_invoice_items piii ON piii.po_item_id = poi.po_item_id
             LEFT JOIN (
                 SELECT po_item_id,
                        SUM(CASE WHEN disposition = 'Return to Supplier' THEN return_quantity ELSE 0 END) AS returned_quantity,
                        SUM(CASE WHEN resolution_type = 'Replacement' THEN GREATEST(replacement_expected_qty - replacement_received_qty, 0) ELSE 0 END) AS replacement_pending_quantity
                 FROM supplier_claim_legacy_projection
                 GROUP BY po_item_id
              ) returns ON returns.po_item_id = poi.po_item_id
              LEFT JOIN (
                 SELECT po_item_id, SUM(received_qty) AS inventory_added
                 FROM inventory_batches
                 GROUP BY po_item_id
              ) batches ON batches.po_item_id = poi.po_item_id
             WHERE poi.po_id IN ({$placeholders})
              GROUP BY poi.po_id, poi.po_item_id, poi.product_id, poi.quantity, poi.purchase_qty, poi.purchase_unit_snapshot, poi.units_per_purchase_unit_snapshot, poi.inventory_qty_ordered, poi.line_total, piii.unit_cost, poi.product_name_snapshot, poi.brand_name_snapshot, poi.category_name_snapshot, poi.type_name_snapshot, poi.generic_name_snapshot, poi.variant_flavor_snapshot, poi.strength_snapshot, poi.size_value_snapshot, poi.unit_snapshot, poi.packaging_snapshot, poi.unit_price_snapshot, p.product_name, p.brand_name, pc.category_name, pt.type_name, md.generic_name, md.strength, md.strength_value, md.strength_unit, md.net_content_value, md.net_content_unit, md.dosage_form, md.package_type, gd.variant, gd.size, gd.net_weight, gd.unit, gd.package_type, p.price, returns.returned_quantity, returns.replacement_pending_quantity, batches.inventory_added
             ORDER BY poi.po_id, poi.po_item_id"
        );
        $itemsStatement->execute($poIds);

        $itemsByPo = [];
        foreach ($itemsStatement->fetchAll(PDO::FETCH_ASSOC) as $item) {
            $quantity = (int) ($item['inventory_qty_ordered'] ?: $item['quantity']);
            $price = $item['price'] === null ? 0.0 : (float) $item['price'];
            $returnedQuantity = (int) $item['returned_quantity'];
            $item['line_total'] = $item['stored_line_total'] === null ? null : round((float) $item['stored_line_total'], 2);
            $item['cost_basis'] = 'base_unit';
            $baseUnitCost = $price;
            $item['returned_amount'] = round($returnedQuantity * $baseUnitCost, 2);
            $itemsByPo[cleanId($item['po_id'])][] = $item;
        }

        foreach ($orders as &$order) {
            $orderItems = $itemsByPo[cleanId($order['po_id'])] ?? [];
            $returnedAmount = 0;
            $totalQuantity = 0;

            foreach ($orderItems as $item) {
                $returnedAmount += (float) $item['returned_amount'];
                $totalQuantity += (int) ($item['inventory_qty_ordered'] ?: $item['quantity']);
            }

            $order['items'] = $orderItems;
            $replacementPendingQuantity = array_sum(array_map(static fn(array $item): int => (int) ($item['replacement_pending_quantity'] ?? 0), $orderItems));
            if ($replacementPendingQuantity > 0) $order['open_claim_badge'] = 'Replacement Pending - ' . $replacementPendingQuantity . ' pcs';
            $order['total_quantity'] = $totalQuantity;
            $invoiceTotal = $order['invoice_total'] === null ? null : round((float) $order['invoice_total'], 2);
            $legacyTotal = $order['legacy_total_amount'] === null ? null : round((float) $order['legacy_total_amount'], 2);
            $order['invoice_total'] = $invoiceTotal;
            $order['total_amount'] = $invoiceTotal ?? $legacyTotal;
            $order['total_source'] = $invoiceTotal !== null ? 'supplier_invoice' : ($legacyTotal !== null ? 'legacy_po' : null);
            $order['total_confirmed'] = $invoiceTotal !== null || $legacyTotal !== null;
            $order['returned_amount'] = $returnedAmount;
            $storedFinalPayment = round((float) ($order['stored_final_payment'] ?? 0), 2);
            $order['final_payment'] = $invoiceTotal ?? ($storedFinalPayment > 0 ? $storedFinalPayment : $legacyTotal);
            $payable = (float) ($order['final_payment'] ?? 0);
            $adjustedPayable = round(max(0, $payable - (float) ($order['supplier_credit_applied'] ?? 0)), 2);
            $totalPaid = round((float) ($order['stored_total_paid'] ?? 0), 2);
            $computedPaymentStatus = $invoiceTotal !== null && $payable > 0
                ? purchaseOrderPaymentStatus($adjustedPayable, $totalPaid)
                : 'Awaiting Invoice';
            $normalizedPaymentState = strtolower(str_replace(' ', '_', $computedPaymentStatus));
            $paymentSummary = [
                'total_paid' => $totalPaid,
                'remaining_balance' => round(max(0, $adjustedPayable - $totalPaid), 2),
                'payment_status' => $computedPaymentStatus
            ];
            $order['total_paid'] = $paymentSummary['total_paid'];
            $order['remaining_balance'] = $paymentSummary['remaining_balance'];
            $order['payment_status'] = $paymentSummary['payment_status'];
            $order['payment_state'] = $normalizedPaymentState;
            $order['receiving_record_available'] = (bool) ($order['receiving_record_available'] ?? false);
            $order['invoice_recorded'] = (bool)($order['invoice_recorded'] ?? false);
            $order['payment_available'] = in_array(($order['status'] ?? ''), ['Pending','Arrived','Delivered'], true) && $order['invoice_recorded'] && $payable > 0;
            $order['payment_timing'] = ($order['status'] ?? '') === 'Pending' && $totalPaid > 0 ? 'Prepaid' : 'Standard';
            $order['item_names'] = array_map(static fn($item) => $item['product_name'], $orderItems);
            $order['brand_names'] = array_map(static fn($item) => $item['brand_name'], $orderItems);
            $order['quantities'] = array_map(static fn($item) => (int) ($item['purchase_qty'] ?: 1), $orderItems);
            $order['inspection_in_progress'] = ($order['inspection_status'] ?? '') === 'In Progress';
            if ($order['inspection_in_progress']) {
                $order['received_date'] = null;
                $order['receiving_remarks'] = '';
            }
        }
        unset($order);
    }

    if ($paymentStatusFilter !== '') {
        $orders = array_values(array_filter($orders, static function (array $order) use ($paymentStatusFilter): bool {
            $wantedState = strtolower(str_replace(' ', '_', $paymentStatusFilter));
            return ($order['payment_state'] ?? 'awaiting_invoice') === $wantedState;
        }));
    }

    $counts = array_fill_keys(purchaseOrderStatuses(), 0);
    $countStatement = $pdo->query('SELECT status, COUNT(*) AS total FROM purchase_orders GROUP BY status');
    foreach ($countStatement->fetchAll(PDO::FETCH_ASSOC) as $row) {
        if (array_key_exists($row['status'], $counts)) {
            $counts[$row['status']] = (int) $row['total'];
        }
    }
    $approvalCounts = array_fill_keys(approvalStatuses(), 0);
    $approvalCountStatement = $pdo->query('SELECT approval_status, COUNT(*) AS total FROM purchase_orders GROUP BY approval_status');
    foreach ($approvalCountStatement->fetchAll(PDO::FETCH_ASSOC) as $row) {
        if (array_key_exists($row['approval_status'], $approvalCounts)) {
            $approvalCounts[$row['approval_status']] = (int) $row['total'];
        }
    }
    $openClaimsCount = (int) $pdo->query(
        "SELECT COUNT(*)
         FROM supplier_claims
         WHERE resolved_at IS NULL
           AND claim_status NOT IN ('Resolved', 'Replacement Received / Resolved')"
    )->fetchColumn();

    echo json_encode([
        'status' => 'success',
        'purchase_orders' => $orders,
        'status_counts' => $counts,
        'open_claims_count' => $openClaimsCount,
        'approval_counts' => $approvalCounts
    ]);
} catch (InvalidArgumentException $e) {
    http_response_code(400);
    echo json_encode(['status' => 'error', 'message' => $e->getMessage()]);
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode(['status' => 'error', 'message' => 'Unable to load purchase orders.']);
}
?>
