<?php

require_once __DIR__ . '/purchase_order_invoice_helpers.php';

function purchaseOrderPaymentTableExists(PDO $pdo): bool
{
    $statement = $pdo->query("SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'purchase_order_payments'");
    return (int) $statement->fetchColumn() === 1;
}

function purchaseOrderPaymentStatus(float $adjustedPayable, float $totalPaid): string
{
    if ($adjustedPayable <= 0) return 'Paid';
    if ($totalPaid <= 0) return 'Unpaid';
    if ($adjustedPayable > 0 && $totalPaid >= $adjustedPayable) return 'Paid';
    return 'Partially Paid';
}

function purchaseOrderNormalizedPaymentState(?float $adjustedPayable, float $totalPaid): string
{
    if ($adjustedPayable === null || $adjustedPayable <= 0) return 'awaiting_invoice';
    return round($totalPaid, 2) + 0.005 >= round($adjustedPayable, 2) ? 'paid' : 'unpaid';
}

function purchaseOrderEffectivePayable(PDO $pdo, string $poId, ?float $storedPayable = null): float
{
    $statement = $pdo->prepare(
        'SELECT COALESCE(poi.supplier_invoice_total, NULLIF(po.final_payment, 0), po.total_amount, 0)
         FROM purchase_orders po
         LEFT JOIN purchase_order_invoices poi ON poi.po_id = po.po_id
         WHERE po.po_id = :po_id
         LIMIT 1'
    );
    $statement->execute([':po_id' => $poId]);
    return round(max(0, (float) $statement->fetchColumn()), 2);
}

function purchaseOrderPaymentSummary(PDO $pdo, string $poId, ?float $adjustedPayable = null): array
{
    if ($adjustedPayable === null) {
        $payableStatement = $pdo->prepare('SELECT final_payment FROM purchase_orders WHERE po_id = :po_id LIMIT 1');
        $payableStatement->execute([':po_id' => $poId]);
        $adjustedPayable = (float) ($payableStatement->fetchColumn() ?: 0);
    }
    $adjustedPayable = purchaseOrderEffectivePayable($pdo, $poId, $adjustedPayable);
    $discountStatement = $pdo->prepare("SELECT COALESCE(SUM(app.amount_applied),0) FROM supplier_credit_applications app INNER JOIN supplier_credits cr ON cr.credit_id=app.credit_id INNER JOIN supplier_claims sc ON sc.claim_id=cr.claim_id INNER JOIN purchase_order_items source_item ON source_item.po_item_id=sc.po_item_id WHERE app.po_id=:po_id AND source_item.po_id=:source_po_id AND sc.resolution_type IN ('Current PO Credit','Supplier Credit')");
    $discountStatement->execute([':po_id' => $poId, ':source_po_id' => $poId]);
    $currentDiscount = round((float) $discountStatement->fetchColumn(), 2);
    $futureCreditStatement = $pdo->prepare('SELECT COALESCE(SUM(app.amount_applied),0) FROM supplier_credit_applications app INNER JOIN supplier_credits cr ON cr.credit_id=app.credit_id INNER JOIN supplier_claims sc ON sc.claim_id=cr.claim_id INNER JOIN purchase_order_items source_item ON source_item.po_item_id=sc.po_item_id WHERE app.po_id=:po_id AND source_item.po_id<>:source_po_id');
    $futureCreditStatement->execute([':po_id' => $poId, ':source_po_id' => $poId]);
    $futureCreditApplied = round((float) $futureCreditStatement->fetchColumn(), 2);
    $creditApplied = round($currentDiscount + $futureCreditApplied, 2);
    $adjustedPayable = max(0, (float) $adjustedPayable - $creditApplied);
    $paidStatement = $pdo->prepare('SELECT COALESCE(SUM(amount), 0) FROM purchase_order_payments WHERE po_id = :po_id');
    $paidStatement->execute([':po_id' => $poId]);
    $totalPaid = round((float) $paidStatement->fetchColumn(), 2);
    $adjustedPayable = round(max(0, (float) $adjustedPayable), 2);
    return [
        'adjusted_payable' => $adjustedPayable,
        'supplier_credit_applied' => $creditApplied,
        'current_po_discount' => $currentDiscount,
        'future_supplier_credit_applied' => $futureCreditApplied,
        'total_paid' => $totalPaid,
        'remaining_balance' => round(max(0, $adjustedPayable - $totalPaid), 2),
        'payment_status' => purchaseOrderPaymentStatus($adjustedPayable, $totalPaid)
    ];
}

function purchaseOrderPaymentHistory(PDO $pdo, string $poId): array
{
    $statement = $pdo->prepare(
        'SELECT pop.payment_id, pop.amount, pop.payment_method, pop.payment_date,
                pop.reference_number, pop.remarks, pop.recorded_by, pop.created_at,
                COALESCE(NULLIF(u.full_name, \'\'), u.username, \'System migration\') AS recorded_by_name
         FROM purchase_order_payments pop
         LEFT JOIN users u ON u.user_id = pop.recorded_by
         WHERE pop.po_id = :po_id
         ORDER BY pop.payment_date DESC, pop.created_at DESC, pop.payment_id DESC'
    );
    $statement->execute([':po_id' => $poId]);
    $rows = $statement->fetchAll(PDO::FETCH_ASSOC);
    foreach ($rows as &$row) {
        $row['amount'] = round((float) $row['amount'], 2);
        $isLegacyImport = ($row['payment_method'] ?? '') === 'legacy_snapshot';
        $row['display_method'] = $isLegacyImport ? 'Not recorded' : null;
        $row['display_reference'] = $isLegacyImport ? '—' : null;
        $row['display_remarks'] = $isLegacyImport
            ? 'Imported from the previous receiving record. The original payment method and reference were unavailable.'
            : null;
        $row['date_note'] = $isLegacyImport ? 'Date based on receiving record' : null;
    }
    unset($row);
    return $rows;
}

function buildPurchaseOrderPaymentDetails(PDO $pdo, string $poId): ?array
{
    $statement = $pdo->prepare(
        'SELECT po.po_id, po.po_number, po.status, po.payment_status, po.payment_terms,
                po.created_at AS order_date, po.expected_delivery_date,
                s.supplier_id, s.supplier_name,
                invoice.invoice_id, invoice.invoice_number, invoice.invoice_date,
                invoice.discount AS invoice_discount, invoice.other_charges AS invoice_other_charges,
                invoice.supplier_invoice_total AS invoice_total
         FROM purchase_orders po
         INNER JOIN suppliers s ON s.supplier_id = po.supplier_id
         LEFT JOIN purchase_order_invoices invoice ON invoice.po_id = po.po_id
         WHERE po.po_id = :po_id
         LIMIT 1'
    );
    $statement->execute([':po_id' => $poId]);
    $details = $statement->fetch(PDO::FETCH_ASSOC);
    if (!$details) return null;

    $details['invoice_recorded'] = !empty($details['invoice_id']);
    $details['total_amount'] = $details['invoice_total'] === null ? null : round((float) $details['invoice_total'], 2);
    $details['invoice_discount'] = round((float) ($details['invoice_discount'] ?? 0), 2);
    $details['invoice_other_charges'] = round((float) ($details['invoice_other_charges'] ?? 0), 2);
    $invoice = $details['invoice_recorded'] ? purchaseOrderInvoice($pdo, $poId) : null;
    $details['invoice_items'] = $invoice['items'] ?? [];
    $details['invoice_subtotal'] = round((float) ($invoice['subtotal'] ?? 0), 2);
    $effectivePayable = $details['total_amount'] ?? 0.0;
    $details['final_payment'] = $effectivePayable;
    $details['payment'] = purchaseOrderPaymentSummary($pdo, $poId, $effectivePayable);
    $details['payment']['payments'] = purchaseOrderPaymentHistory($pdo, $poId);

    $replacementStatement = $pdo->prepare(
        "SELECT COALESCE(SUM(GREATEST(sc.replacement_expected_qty - sc.replacement_received_qty, 0)), 0)
         FROM supplier_claim_legacy_projection sc
         WHERE sc.po_id = :po_id AND sc.resolution_type = 'Replacement'"
    );
    $replacementStatement->execute([':po_id' => $poId]);
    $futureCreditStatement = $pdo->prepare(
        "SELECT COALESCE(SUM(cr.credit_amount), 0)
         FROM supplier_credits cr
         INNER JOIN supplier_claims sc ON sc.claim_id = cr.claim_id
         INNER JOIN purchase_order_items poi ON poi.po_item_id = sc.po_item_id
         WHERE poi.po_id = :po_id AND sc.resolution_type = 'Next PO Credit'"
    );
    $futureCreditStatement->execute([':po_id' => $poId]);
    $details['claim_summary'] = [
        'replacement_pending_quantity' => (int) $replacementStatement->fetchColumn(),
        'future_supplier_credit' => round((float) $futureCreditStatement->fetchColumn(), 2),
    ];
    return $details;
}

function synchronizePurchaseOrderPaymentStatus(PDO $pdo, string $poId, float $adjustedPayable): array
{
    $summary = purchaseOrderPaymentSummary($pdo, $poId, $adjustedPayable);
    $statement = $pdo->prepare('UPDATE purchase_orders SET payment_status = :payment_status WHERE po_id = :po_id');
    $statement->execute([':payment_status' => $summary['payment_status'], ':po_id' => $poId]);
    return $summary;
}
