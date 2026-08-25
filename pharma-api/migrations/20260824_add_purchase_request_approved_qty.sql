ALTER TABLE purchase_request_items
    ADD COLUMN IF NOT EXISTS approved_qty DECIMAL(12,2) NULL AFTER requested_qty;

UPDATE purchase_request_items pri
INNER JOIN purchase_requests pr ON pr.pr_id = pri.pr_id
SET pri.approved_qty = pri.requested_qty
WHERE pr.status IN ('Approved', 'Partially Ordered', 'Ordered')
  AND pri.approved_qty IS NULL;
