-- Idempotently backfill actual completed sales and recorded discounts into the
-- existing audit_logs table. This creates no sample transactions or IDs.
INSERT INTO audit_logs
    (audit_id, user_id, employee_id, user_name, role, action, module, event_status,
     description, target_type, target_id, details, idempotency_key, created_at)
SELECT
    UUID(), pay.cashier_id, cashier.username, COALESCE(NULLIF(cashier.full_name, ''), cashier.username), cashier.role,
    'SALE_COMPLETED', 'Sales & Transactions', 'Success',
    CONCAT(COALESCE(NULLIF(cashier.full_name, ''), cashier.username, 'Cashier'), ' completed transaction ', receipt.receipt_no, '.'),
    'Sales Transaction', CAST(ord.order_id AS CHAR),
    JSON_OBJECT(
        'order_id', ord.order_id, 'order_no', ord.order_no, 'transaction_id', receipt.receipt_no,
        'amount', pay.final_amount, 'payment_method', pay.payment_method,
        'discount_type', pay.cashier_discount_type,
        'discount_amount', COALESCE(pay.sales_clerk_discount, 0) + COALESCE(pay.cashier_discount_amount, 0),
        'sales_clerk_discount', COALESCE(pay.sales_clerk_discount, 0),
        'cashier_discount_amount', COALESCE(pay.cashier_discount_amount, 0),
        'source_record', 'sales_receipts and sales_payments', 'historical_backfill', TRUE
    ),
    CONCAT('legacy:sales:completed:', ord.order_id), COALESCE(pay.paid_at, receipt.created_at)
FROM sales_orders ord
INNER JOIN sales_payments pay ON pay.order_id = ord.order_id AND pay.payment_status = 'paid'
INNER JOIN sales_receipts receipt ON receipt.order_id = ord.order_id
LEFT JOIN users cashier ON cashier.user_id = pay.cashier_id
WHERE ord.status = 'completed'
  AND NOT EXISTS (
      SELECT 1 FROM audit_logs existing
      WHERE existing.module = 'Sales & Transactions'
        AND existing.action = 'SALE_COMPLETED'
        AND existing.target_id = CAST(ord.order_id AS CHAR)
  )
ON DUPLICATE KEY UPDATE audit_id = audit_id;

INSERT INTO audit_logs
    (audit_id, user_id, employee_id, user_name, role, action, module, event_status,
     description, target_type, target_id, details, idempotency_key, created_at)
SELECT
    UUID(), pay.cashier_id, cashier.username, COALESCE(NULLIF(cashier.full_name, ''), cashier.username), cashier.role,
    'DISCOUNT_APPLIED', 'Sales & Transactions', 'Success',
    CONCAT(COALESCE(NULLIF(cashier.full_name, ''), cashier.username, 'Cashier'), ' applied a ',
        CASE WHEN pay.cashier_discount_type = 'none' THEN 'sales clerk' ELSE pay.cashier_discount_type END,
        ' discount to transaction ', receipt.receipt_no, '.'),
    'Sales Transaction', CAST(ord.order_id AS CHAR),
    JSON_OBJECT(
        'order_id', ord.order_id, 'order_no', ord.order_no, 'transaction_id', receipt.receipt_no,
        'amount', pay.final_amount, 'payment_method', pay.payment_method,
        'discount_type', pay.cashier_discount_type,
        'discount_amount', COALESCE(pay.sales_clerk_discount, 0) + COALESCE(pay.cashier_discount_amount, 0),
        'sales_clerk_discount', COALESCE(pay.sales_clerk_discount, 0),
        'cashier_discount_amount', COALESCE(pay.cashier_discount_amount, 0),
        'source_record', 'sales_payments', 'historical_backfill', TRUE
    ),
    CONCAT('legacy:sales:discount:', ord.order_id), COALESCE(pay.paid_at, receipt.created_at)
FROM sales_orders ord
INNER JOIN sales_payments pay ON pay.order_id = ord.order_id AND pay.payment_status = 'paid'
INNER JOIN sales_receipts receipt ON receipt.order_id = ord.order_id
LEFT JOIN users cashier ON cashier.user_id = pay.cashier_id
WHERE ord.status = 'completed'
  AND COALESCE(pay.sales_clerk_discount, 0) + COALESCE(pay.cashier_discount_amount, 0) > 0
  AND NOT EXISTS (
      SELECT 1 FROM audit_logs existing
      WHERE existing.module = 'Sales & Transactions'
        AND existing.action = 'DISCOUNT_APPLIED'
        AND existing.target_id = CAST(ord.order_id AS CHAR)
  )
ON DUPLICATE KEY UPDATE audit_id = audit_id;

INSERT INTO audit_logs
    (audit_id, user_id, employee_id, user_name, role, action, module, event_status,
     description, target_type, target_id, details, idempotency_key, created_at)
SELECT
    UUID(), ord.cancelled_by, actor.username, COALESCE(NULLIF(actor.full_name, ''), actor.username), actor.role,
    'TRANSACTION_CANCELLED', 'Sales & Transactions', 'Success',
    CONCAT(COALESCE(NULLIF(actor.full_name, ''), actor.username, 'User'), ' cancelled order ', ord.order_no,
        '. Reason: ', COALESCE(NULLIF(ord.cancellation_reason, ''), 'Not recorded'), '.'),
    'Sales Transaction', CAST(ord.order_id AS CHAR),
    JSON_OBJECT('order_id', ord.order_id, 'order_no', ord.order_no, 'transaction_id', ord.order_no,
        'void_reason', ord.cancellation_reason, 'operation', 'cancelled before payment',
        'source_record', 'sales_orders', 'historical_backfill', TRUE),
    CONCAT('legacy:sales:cancelled:', ord.order_id), ord.cancelled_at
FROM sales_orders ord
LEFT JOIN users actor ON actor.user_id = ord.cancelled_by
WHERE ord.status = 'cancelled' AND ord.cancelled_at IS NOT NULL
  AND NOT EXISTS (
      SELECT 1 FROM audit_logs existing
      WHERE existing.module = 'Sales & Transactions'
        AND existing.action = 'TRANSACTION_CANCELLED'
        AND existing.target_id = CAST(ord.order_id AS CHAR)
  )
ON DUPLICATE KEY UPDATE audit_id = audit_id;
