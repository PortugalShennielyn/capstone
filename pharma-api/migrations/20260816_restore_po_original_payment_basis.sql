-- Damaged, returned, or replacement-pending quantities are references only.
-- The PO payment basis remains the original PO total; confirmed credit
-- applications are deducted separately by purchaseOrderPaymentSummary().
UPDATE purchase_orders po
LEFT JOIN (
    SELECT
        po_id,
        SUM(COALESCE(NULLIF(line_total, 0), COALESCE(NULLIF(inventory_qty_ordered, 0), quantity) * COALESCE(unit_price_snapshot, 0))) AS item_total
    FROM purchase_order_items
    GROUP BY po_id
) items ON items.po_id = po.po_id
SET po.final_payment = COALESCE(NULLIF(po.total_amount, 0), items.item_total, 0)
WHERE po.status = 'Delivered';
