ALTER TABLE purchase_order_items
    ADD COLUMN pr_item_id CHAR(36) NULL AFTER po_id,
    ADD KEY idx_purchase_order_items_pr_item (pr_item_id),
    ADD CONSTRAINT fk_purchase_order_items_pr_item
        FOREIGN KEY (pr_item_id) REFERENCES purchase_request_items (pr_item_id);
