CREATE TABLE IF NOT EXISTS purchase_order_payments (
    payment_id CHAR(36) NOT NULL DEFAULT (UUID()),
    po_id CHAR(36) NOT NULL,
    amount DECIMAL(12,2) NOT NULL,
    payment_method VARCHAR(40) NOT NULL,
    payment_date DATE NOT NULL,
    reference_number VARCHAR(100) NULL,
    remarks TEXT NULL,
    recorded_by CHAR(36) NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    payment_request_key VARCHAR(100) NOT NULL,
    PRIMARY KEY (payment_id),
    UNIQUE KEY uniq_purchase_order_payments_idempotency (payment_request_key),
    KEY idx_purchase_order_payments_po_id (po_id),
    KEY idx_purchase_order_payments_payment_date (payment_date),
    CONSTRAINT fk_purchase_order_payments_po_id
        FOREIGN KEY (po_id) REFERENCES purchase_orders (po_id) ON DELETE RESTRICT,
    CONSTRAINT fk_purchase_order_payments_recorded_by
        FOREIGN KEY (recorded_by) REFERENCES users (user_id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

INSERT IGNORE INTO purchase_order_payments
    (payment_id, po_id, amount, payment_method, payment_date, reference_number, remarks, recorded_by, created_at, payment_request_key)
SELECT
    UUID(),
    snapshot.po_id,
    CAST(JSON_UNQUOTE(JSON_EXTRACT(snapshot.meta_json, '$.amount_paid')) AS DECIMAL(12,2)),
    'legacy_snapshot',
    DATE(snapshot.received_date),
    NULL,
    'Migrated from the reliable receiving payment snapshot; the original payment method and payment date were not stored, so the receiving date is used.',
    (
        SELECT al.user_id
        FROM activity_logs al
        WHERE al.reference_id = snapshot.po_id
          AND al.module = 'Purchase Order'
          AND al.user_id IS NOT NULL
        ORDER BY al.created_at DESC, al.activity_id DESC
        LIMIT 1
    ),
    snapshot.received_date,
    CONCAT('migration:receiving:', snapshot.receiving_id)
FROM (
    SELECT
        por.receiving_id,
        por.po_id,
        por.received_date,
        SUBSTRING_INDEX(
            SUBSTRING(por.remarks, CHAR_LENGTH(CONCAT('[RECEIVING_META_V1]', CHAR(10))) + 1),
            CHAR(10),
            1
        ) AS meta_json
    FROM purchase_order_receiving por
    WHERE por.remarks LIKE CONCAT('[RECEIVING_META_V1]', CHAR(10), '%')
) snapshot
WHERE JSON_VALID(snapshot.meta_json)
  AND JSON_EXTRACT(snapshot.meta_json, '$.amount_paid') IS NOT NULL
  AND CAST(JSON_UNQUOTE(JSON_EXTRACT(snapshot.meta_json, '$.amount_paid')) AS DECIMAL(12,2)) > 0;

UPDATE purchase_orders po
LEFT JOIN (
    SELECT po_id, ROUND(SUM(amount), 2) AS total_paid
    FROM purchase_order_payments
    GROUP BY po_id
) paid ON paid.po_id = po.po_id
SET po.payment_status = CASE
    WHEN COALESCE(paid.total_paid, 0) <= 0 THEN 'Unpaid'
    WHEN COALESCE(paid.total_paid, 0) >= po.final_payment AND po.final_payment > 0 THEN 'Fully Paid'
    ELSE 'Partially Paid'
END
WHERE EXISTS (
    SELECT 1
    FROM purchase_order_receiving por
    WHERE por.po_id = po.po_id
);
