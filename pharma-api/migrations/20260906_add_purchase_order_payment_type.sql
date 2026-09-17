ALTER TABLE purchase_order_payments
    ADD COLUMN IF NOT EXISTS payment_type VARCHAR(40) NULL AFTER payment_method;

UPDATE purchase_order_payments pop
SET pop.payment_type = CASE
    WHEN EXISTS (
        SELECT 1 FROM purchase_order_receiving por
        WHERE por.po_id = pop.po_id
          AND por.inspection_status = 'Confirmed'
          AND por.received_date <= pop.created_at
    ) THEN 'Post-Inspection Payment'
    ELSE 'Advance Payment'
END
WHERE pop.payment_type IS NULL OR pop.payment_type = '';

ALTER TABLE purchase_order_payments
    MODIFY payment_type VARCHAR(40) NOT NULL;
