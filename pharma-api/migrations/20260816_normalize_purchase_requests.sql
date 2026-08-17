-- Historical PR submissions were written by PHP in Europe/Berlin while
-- decisions were written by MariaDB in America/Los_Angeles. Repair only the
-- affected impossible ordering produced by that nine-hour offset.
UPDATE purchase_requests
SET submitted_at = DATE_SUB(submitted_at, INTERVAL 9 HOUR)
WHERE submitted_at IS NOT NULL
  AND decided_at IS NOT NULL
  AND decided_at < submitted_at
  AND TIMESTAMPDIFF(HOUR, decided_at, submitted_at) BETWEEN 7 AND 11;

ALTER TABLE purchase_requests
    DROP FOREIGN KEY fk_purchase_requests_po,
    DROP INDEX uniq_purchase_requests_converted_po,
    DROP COLUMN reason,
    DROP COLUMN decision_reason,
    DROP COLUMN converted_po_id;

ALTER TABLE purchase_request_items
    DROP FOREIGN KEY fk_purchase_request_items_supplier_product,
    DROP INDEX idx_purchase_request_items_supplier_product,
    DROP COLUMN supplier_product_id,
    DROP COLUMN reason;
