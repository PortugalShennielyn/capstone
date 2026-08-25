ALTER TABLE purchase_order_receiving
    ADD COLUMN delivered_by_name VARCHAR(150) NULL AFTER inspected_by,
    ADD COLUMN delivery_receipt_no VARCHAR(100) NULL AFTER delivered_by_name;
