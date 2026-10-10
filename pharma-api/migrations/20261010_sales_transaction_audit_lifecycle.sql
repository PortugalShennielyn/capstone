-- Backfill real sales-order lifecycle changes that were recorded in the
-- status history but were not previously written to the canonical audit log.
INSERT INTO audit_logs
    (audit_id, user_id, employee_id, user_name, role, action, module, event_status,
     description, target_type, target_id, details, idempotency_key, created_at)
SELECT
    UUID(), history.changed_by, actor.username,
    COALESCE(NULLIF(actor.full_name, ''), actor.username, 'Unknown user'), actor.role,
    CASE history.new_status
        WHEN 'draft' THEN 'TRANSACTION_CREATED'
        WHEN 'waiting_cashier' THEN 'TRANSACTION_SENT_TO_CASHIER'
        WHEN 'accepted_by_cashier' THEN 'TRANSACTION_ACCEPTED'
        WHEN 'processing_payment' THEN 'TRANSACTION_PAYMENT_PROCESSING'
        WHEN 'cancelled' THEN 'TRANSACTION_CANCELLED'
        WHEN 'rejected' THEN 'TRANSACTION_REJECTED'
    END,
    'Sales & Transactions', 'Success',
    CONCAT(
        COALESCE(NULLIF(actor.full_name, ''), actor.username, 'User'), ' ',
        CASE history.new_status
            WHEN 'draft' THEN 'created order '
            WHEN 'waiting_cashier' THEN 'sent order to cashier '
            WHEN 'accepted_by_cashier' THEN 'accepted order '
            WHEN 'processing_payment' THEN 'started payment for order '
            WHEN 'cancelled' THEN 'cancelled order '
            WHEN 'rejected' THEN 'rejected order '
        END,
        '#', order_row.order_no, '.'
    ),
    'Sales Transaction', CAST(history.order_id AS CHAR),
    JSON_OBJECT(
        'order_id', history.order_id,
        'order_no', order_row.order_no,
        'transaction_id', order_row.order_no,
        'amount', order_row.total_amount,
        'previous_status', history.old_status,
        'status', history.new_status,
        'remarks', history.remarks,
        'cancellation_reason', CASE WHEN history.new_status = 'cancelled' THEN history.remarks ELSE NULL END,
        'source_record', 'sales_order_status_history',
        'history_id', history.history_id,
        'historical_backfill', TRUE
    ),
    CONCAT('legacy:sales:status:', history.history_id),
    history.changed_at
FROM sales_order_status_history history
INNER JOIN sales_orders order_row ON order_row.order_id = history.order_id
LEFT JOIN users actor ON actor.user_id = history.changed_by
WHERE history.new_status IN (
        'draft', 'waiting_cashier', 'accepted_by_cashier',
        'processing_payment', 'cancelled', 'rejected'
    )
  AND NOT EXISTS (
      SELECT 1
      FROM audit_logs existing
      WHERE existing.module = 'Sales & Transactions'
        AND existing.action = CASE history.new_status
            WHEN 'draft' THEN 'TRANSACTION_CREATED'
            WHEN 'waiting_cashier' THEN 'TRANSACTION_SENT_TO_CASHIER'
            WHEN 'accepted_by_cashier' THEN 'TRANSACTION_ACCEPTED'
            WHEN 'processing_payment' THEN 'TRANSACTION_PAYMENT_PROCESSING'
            WHEN 'cancelled' THEN 'TRANSACTION_CANCELLED'
            WHEN 'rejected' THEN 'TRANSACTION_REJECTED'
        END
        AND existing.target_id = CAST(history.order_id AS CHAR)
        AND (
            history.new_status = 'cancelled'
            OR existing.created_at = history.changed_at
        )
  )
ON DUPLICATE KEY UPDATE audit_id = audit_id;
