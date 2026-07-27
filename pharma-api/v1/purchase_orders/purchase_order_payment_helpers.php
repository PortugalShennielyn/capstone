<?php

function purchaseOrderPaymentTableExists(PDO $pdo): bool
{
    $statement = $pdo->query("SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'purchase_order_payments'");
    return (int) $statement->fetchColumn() === 1;
}

function purchaseOrderPaymentStatus(float $adjustedPayable, float $totalPaid): string
{
    if ($totalPaid <= 0) return 'Unpaid';
    if ($adjustedPayable > 0 && $totalPaid >= $adjustedPayable) return 'Fully Paid';
    return 'Partially Paid';
}

function purchaseOrderPaymentSummary(PDO $pdo, string $poId, ?float $adjustedPayable = null): array
{
    if ($adjustedPayable === null) {
        $payableStatement = $pdo->prepare('SELECT final_payment FROM purchase_orders WHERE po_id = :po_id LIMIT 1');
        $payableStatement->execute([':po_id' => $poId]);
        $adjustedPayable = (float) ($payableStatement->fetchColumn() ?: 0);
    }
    $paidStatement = $pdo->prepare('SELECT COALESCE(SUM(amount), 0) FROM purchase_order_payments WHERE po_id = :po_id');
    $paidStatement->execute([':po_id' => $poId]);
    $totalPaid = round((float) $paidStatement->fetchColumn(), 2);
    $adjustedPayable = round(max(0, (float) $adjustedPayable), 2);
    return [
        'adjusted_payable' => $adjustedPayable,
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

function synchronizePurchaseOrderPaymentStatus(PDO $pdo, string $poId, float $adjustedPayable): array
{
    $summary = purchaseOrderPaymentSummary($pdo, $poId, $adjustedPayable);
    $statement = $pdo->prepare('UPDATE purchase_orders SET payment_status = :payment_status WHERE po_id = :po_id');
    $statement->execute([':payment_status' => $summary['payment_status'], ':po_id' => $poId]);
    return $summary;
}
