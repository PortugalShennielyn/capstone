<?php
function ensurePurchaseOrderInvoiceSchema(PDO $pdo): void
{
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
        unit_cost DECIMAL(12,4) NOT NULL,
        UNIQUE KEY uq_purchase_order_invoice_line (invoice_id, po_item_id),
        KEY idx_purchase_order_invoice_item_po_line (po_item_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
}

function purchaseOrderInvoice(PDO $pdo, string $poId): ?array
{
    ensurePurchaseOrderInvoiceSchema($pdo);
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
        'SELECT piii.invoice_item_id, piii.invoice_id, piii.po_item_id, piii.unit_cost,
                poi.product_id, poi.purchase_qty AS order_qty,
                COALESCE(NULLIF(TRIM(poi.purchase_unit_snapshot), \'\'), \'pcs\') AS purchase_unit,
                COALESCE(NULLIF(TRIM(poi.product_name_snapshot), \'\'), p.product_name) AS product_name,
                COALESCE(NULLIF(TRIM(poi.brand_name_snapshot), \'\'), p.brand_name) AS brand_name,
                ROUND(poi.purchase_qty * piii.unit_cost, 2) AS line_total
         FROM purchase_order_invoice_items piii
         INNER JOIN purchase_order_items poi ON poi.po_item_id = piii.po_item_id
         INNER JOIN product p ON p.product_id = poi.product_id
         WHERE piii.invoice_id = :invoice_id
         ORDER BY poi.po_item_id'
    );
    $items->execute([':invoice_id' => $invoice['invoice_id']]);
    $invoice['items'] = $items->fetchAll(PDO::FETCH_ASSOC);
    $subtotal = 0.0;
    foreach ($invoice['items'] as &$item) {
        $item['order_qty'] = (int) $item['order_qty'];
        $item['unit_cost'] = round((float) $item['unit_cost'], 4);
        $item['line_total'] = round((float) $item['line_total'], 2);
        $subtotal += $item['line_total'];
    }
    unset($item);
    foreach (['discount','other_charges','supplier_invoice_total'] as $field) $invoice[$field] = round((float)$invoice[$field], 2);
    $invoice['subtotal'] = round($subtotal, 2);
    $invoice['calculated_total'] = round($invoice['subtotal'] - $invoice['discount'] + $invoice['other_charges'], 2);
    $invoice['difference'] = round($invoice['supplier_invoice_total'] - $invoice['calculated_total'], 2);
    $invoice['match_status'] = abs($invoice['difference']) < 0.01 ? 'Matched' : 'Review Required';
    return $invoice;
}
?>
