<?php
function ensurePurchaseOrderInvoiceSchema(PDO $pdo): void
{
    // DDL implicitly commits MySQL transactions, even with IF NOT EXISTS.
    $tables = $pdo->query("SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME IN ('purchase_order_invoices','purchase_order_invoice_items')");
    if ((int) $tables->fetchColumn() === 2) return;
    if ($pdo->inTransaction()) throw new RuntimeException('Initialize invoice schema before starting a transaction.');
    $pdo->exec("CREATE TABLE IF NOT EXISTS purchase_order_invoices (
        invoice_id CHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
        po_id CHAR(36) NOT NULL,
        invoice_number VARCHAR(100) NOT NULL,
        invoice_date DATE NOT NULL,
        discount DECIMAL(12,2) NOT NULL DEFAULT 0.00,
        other_charges DECIMAL(12,2) NOT NULL DEFAULT 0.00,
        supplier_invoice_total DECIMAL(12,2) NOT NULL,
        recorded_by CHAR(36) NULL,
        recorded_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uq_purchase_order_invoice_po (po_id),
        KEY idx_purchase_order_invoice_number (invoice_number)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    $pdo->exec("CREATE TABLE IF NOT EXISTS purchase_order_invoice_items (
        invoice_item_id CHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
        invoice_id CHAR(36) NOT NULL,
        po_item_id CHAR(36) NOT NULL,
        invoice_qty DECIMAL(12,4) NOT NULL,
        unit_cost DECIMAL(12,4) NOT NULL,
        UNIQUE KEY uq_purchase_order_invoice_line (invoice_id, po_item_id),
        KEY idx_purchase_order_invoice_item_po_line (po_item_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
}

function purchaseOrderInvoice(PDO $pdo, string $poId): ?array
{
    $statement = $pdo->prepare(
        'SELECT poi.invoice_id, poi.po_id, poi.invoice_number, poi.invoice_date,
                poi.discount, poi.other_charges, poi.supplier_invoice_total,
                poi.recorded_by, poi.recorded_at, poi.updated_at,
                po.po_number, po.status AS po_status, s.supplier_id, s.supplier_name
         FROM purchase_order_invoices poi
         INNER JOIN purchase_orders po ON po.po_id = poi.po_id
         INNER JOIN suppliers s ON s.supplier_id = po.supplier_id
         WHERE poi.po_id = :po_id
         LIMIT 1'
    );
    $statement->execute([':po_id' => $poId]);
    $invoice = $statement->fetch(PDO::FETCH_ASSOC);
    if (!$invoice) return null;
    $items = $pdo->prepare(
        'SELECT piii.invoice_item_id, piii.invoice_id, piii.po_item_id, piii.unit_cost, piii.invoice_qty,
                poi.product_id, poi.purchase_qty AS order_qty,
                COALESCE(NULLIF(TRIM(poi.purchase_unit_snapshot), \'\'), \'pcs\') AS purchase_unit,
                COALESCE(NULLIF(TRIM(poi.generic_name_snapshot), \'\'), NULLIF(TRIM(md.generic_name), \'\'), p.product_name) AS product_name,
                COALESCE(NULLIF(TRIM(poi.generic_name_snapshot), \'\'), NULLIF(TRIM(md.generic_name), \'\'), p.product_name) AS generic_name,
                COALESCE(NULLIF(TRIM(poi.brand_name_snapshot), \'\'), p.brand_name) AS brand_name,
                COALESCE(NULLIF(TRIM(poi.generic_name_snapshot), \'\'), NULLIF(TRIM(poi.variant_flavor_snapshot), \'\'), \'\') AS generic_or_variant,
                COALESCE(NULLIF(TRIM(poi.strength_snapshot), \'\'), \'\') AS strength,
                COALESCE(NULLIF(TRIM(poi.size_value_snapshot), \'\'), \'\') AS size_value,
                COALESCE(NULLIF(TRIM(poi.unit_snapshot), \'\'), \'\') AS unit,
                COALESCE(NULLIF(TRIM(poi.packaging_snapshot), \'\'), \'\') AS packaging,
                ROUND(piii.invoice_qty * piii.unit_cost, 2) AS line_total
         FROM purchase_order_invoice_items piii
         INNER JOIN purchase_order_items poi ON poi.po_item_id = piii.po_item_id
         INNER JOIN product p ON p.product_id = poi.product_id
         LEFT JOIN medicine_details md ON md.product_id = p.product_id
         WHERE piii.invoice_id = :invoice_id
         ORDER BY poi.po_item_id'
    );
    $items->execute([':invoice_id' => $invoice['invoice_id']]);
    $invoice['items'] = $items->fetchAll(PDO::FETCH_ASSOC);
        $applicationStatement = $pdo->prepare(
            'SELECT app.application_id, app.credit_id, app.po_id AS destination_po_id,
                    app.amount_applied, app.applied_at,
                    cr.credit_amount AS original_credit_amount,
                    source_po.po_id AS source_po_id,
                    source_po.po_number AS source_po_number,
                    source_po.supplier_id
             FROM supplier_credit_applications app
             INNER JOIN supplier_credits cr ON cr.credit_id = app.credit_id
             INNER JOIN supplier_claims sc ON sc.claim_id = cr.claim_id
             INNER JOIN purchase_order_items source_item ON source_item.po_item_id = sc.po_item_id
             INNER JOIN purchase_orders source_po ON source_po.po_id = source_item.po_id
             WHERE app.po_id = :po_id AND sc.resolution_type = \'Next PO Credit\'
             ORDER BY app.applied_at, app.application_id'
        );
        $applicationStatement->execute([':po_id' => $poId]);
        $invoice['supplier_credit_applications'] = $applicationStatement->fetchAll(PDO::FETCH_ASSOC);
        foreach ($invoice['supplier_credit_applications'] as &$application) {
            $application['amount_applied'] = round((float) $application['amount_applied'], 2);
            $application['original_credit_amount'] = round((float) $application['original_credit_amount'], 2);
        }
        unset($application);
    $productIds = array_values(array_unique(array_filter(array_column($invoice['items'], 'product_id'))));
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
                $number = rtrim(rtrim((string) $specification['value_number'], '0'), '.');
                $value = trim(($number === '' ? '0' : $number) . ' ' . (string) ($specification['unit_symbol'] ?? ''));
            }
            if ($value !== '') $specificationsByProduct[(string) $specification['product_id']][] = $value;
        }
    }
    $subtotal = 0.0;
    foreach ($invoice['items'] as &$item) {
        $item['order_qty'] = (int) $item['order_qty'];
        $item['invoice_qty'] = (float) $item['invoice_qty'];
        $item['unit_cost'] = round((float) $item['unit_cost'], 4);
        $item['line_total'] = round((float) $item['line_total'], 2);
        $item['specification'] = implode(' • ', array_values(array_unique(array_filter(array_map(
            static fn($value): string => trim((string) $value),
            array_merge(
                [$item['generic_or_variant'] ?? '', $item['strength'] ?? '', $item['size_value'] ?? '', $item['packaging'] ?? ''],
                $specificationsByProduct[(string) ($item['product_id'] ?? '')] ?? []
            )
        )))));
        $subtotal += $item['line_total'];
    }
    unset($item);
    foreach (['discount','other_charges','supplier_invoice_total'] as $field) $invoice[$field] = round((float)$invoice[$field], 2);
    $invoice['subtotal'] = round($subtotal, 2);
    $invoice['calculated_total'] = round($invoice['subtotal'] - $invoice['discount'] + $invoice['other_charges'], 2);
    $invoice['difference'] = round($invoice['supplier_invoice_total'] - $invoice['calculated_total'], 2);
    $invoice['match_status'] = abs($invoice['difference']) < 0.01 ? 'Matched' : 'Review Required';
    $invoice['supplier_credit_applied'] = round(array_reduce(
        $invoice['supplier_credit_applications'],
        static fn(float $total, array $application): float => $total + (float) ($application['amount_applied'] ?? 0),
        0.0
    ), 2);
    $invoice['amount_payable'] = round(max(0, $invoice['supplier_invoice_total'] - $invoice['supplier_credit_applied']), 2);
    return $invoice;
}
?>
