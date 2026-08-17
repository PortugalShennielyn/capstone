ALTER TABLE purchase_request_items
    CHANGE COLUMN current_stock_snapshot stock_qty_at_request DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    CHANGE COLUMN unit_snapshot unit_label_at_request VARCHAR(80) NULL;
