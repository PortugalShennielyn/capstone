-- Invoice quantity is transactional data, independent of ordered quantity.
-- Reuse existing invoice tables, keys, costs, discounts and header total.
ALTER TABLE purchase_order_invoice_items
    ADD COLUMN IF NOT EXISTS invoice_qty DECIMAL(12,4) NULL AFTER po_item_id;
UPDATE purchase_order_invoice_items ii
JOIN purchase_order_items oi ON oi.po_item_id = ii.po_item_id
SET ii.invoice_qty = oi.purchase_qty WHERE ii.invoice_qty IS NULL;
ALTER TABLE purchase_order_invoice_items
    MODIFY invoice_qty DECIMAL(12,4) NOT NULL;
