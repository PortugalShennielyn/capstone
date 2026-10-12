ALTER TABLE sales_payments
    ADD COLUMN IF NOT EXISTS gcash_reference_no VARCHAR(100) NULL AFTER payment_method;
