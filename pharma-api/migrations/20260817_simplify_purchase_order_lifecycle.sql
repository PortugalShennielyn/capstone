-- Purchase orders now follow Draft -> Pending -> Arrived -> Delivered.
-- Actual PO value is recorded only when a pending delivery arrives.
ALTER TABLE purchase_orders
    MODIFY status VARCHAR(40) NOT NULL DEFAULT 'Draft',
    MODIFY total_amount DECIMAL(12,2) NULL DEFAULT NULL;

ALTER TABLE purchase_order_items
    MODIFY unit_price_snapshot DECIMAL(12,4) NULL DEFAULT NULL,
    MODIFY line_total DECIMAL(10,2) NULL DEFAULT NULL;

UPDATE purchase_orders
SET status = 'Pending'
WHERE LOWER(TRIM(status)) = 'in transit';

-- These pre-receipt amounts came from supplier reference costs, not receipts.
UPDATE purchase_orders
SET total_amount = NULL
WHERE status IN ('Draft', 'Pending');

UPDATE purchase_order_items poi
INNER JOIN purchase_orders po ON po.po_id = poi.po_id
SET poi.unit_price_snapshot = NULL,
    poi.line_total = NULL
WHERE po.status IN ('Draft', 'Pending');
