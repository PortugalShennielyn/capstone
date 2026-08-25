-- Finalize replacement receiving as a separate, traceable, idempotent event.
-- This migration is additive: it does not delete or rewrite procurement history.

ALTER TABLE purchase_order_receiving
    DROP INDEX uniq_purchase_order_receiving_po_id,
    ADD COLUMN receiving_type VARCHAR(30) NOT NULL DEFAULT 'Original' AFTER po_id,
    ADD COLUMN parent_receiving_id CHAR(36) NULL AFTER receiving_type,
    ADD COLUMN claim_id CHAR(36) NULL AFTER parent_receiving_id,
    ADD COLUMN receiving_request_key VARCHAR(100) NULL AFTER claim_id,
    ADD KEY idx_po_receiving_po_type (po_id, receiving_type),
    ADD KEY idx_po_receiving_parent (parent_receiving_id),
    ADD KEY idx_po_receiving_claim (claim_id),
    ADD UNIQUE KEY uq_po_receiving_request_key (receiving_request_key),
    ADD CONSTRAINT fk_po_receiving_parent
        FOREIGN KEY (parent_receiving_id) REFERENCES purchase_order_receiving (receiving_id),
    ADD CONSTRAINT fk_po_receiving_claim
        FOREIGN KEY (claim_id) REFERENCES supplier_claims (claim_id);

ALTER TABLE purchase_order_receiving_items
    ADD COLUMN accepted_quantity INT NOT NULL DEFAULT 0 AFTER received_quantity,
    ADD COLUMN damaged_quantity INT NOT NULL DEFAULT 0 AFTER accepted_quantity,
    ADD COLUMN parent_receiving_item_id CHAR(36) NULL AFTER po_item_id,
    ADD KEY idx_po_receiving_items_parent (parent_receiving_item_id),
    ADD CONSTRAINT fk_po_receiving_items_parent
        FOREIGN KEY (parent_receiving_item_id) REFERENCES purchase_order_receiving_items (receiving_item_id),
    ADD CONSTRAINT chk_po_receiving_items_accepted CHECK (accepted_quantity >= 0),
    ADD CONSTRAINT chk_po_receiving_items_damaged CHECK (damaged_quantity >= 0);

UPDATE purchase_order_receiving_items ri
LEFT JOIN (
    SELECT sc.po_item_id,
           SUM(sc.damaged_quantity * damaged_conversion.base_quantity) AS damaged_base,
           SUM(sc.action_quantity * action_conversion.base_quantity) AS removed_base
    FROM supplier_claims sc
    LEFT JOIN supplier_product_unit_conversions damaged_conversion
        ON damaged_conversion.conversion_id = sc.damaged_unit_conversion_id
    LEFT JOIN supplier_product_unit_conversions action_conversion
        ON action_conversion.conversion_id = sc.action_unit_conversion_id
    GROUP BY sc.po_item_id
) claims ON claims.po_item_id = ri.po_item_id
SET ri.damaged_quantity = LEAST(ri.received_quantity, COALESCE(claims.damaged_base, 0)),
    ri.accepted_quantity = GREATEST(0, ri.received_quantity - COALESCE(claims.removed_base, 0));

CREATE OR REPLACE VIEW purchase_order_receiving_item_summary AS
SELECT ri.receiving_item_id,
       ri.receiving_id,
       ri.po_item_id,
       ri.parent_receiving_item_id,
       ri.received_quantity,
       ri.accepted_quantity,
       ri.damaged_quantity,
       GREATEST(0, ri.received_quantity - ri.accepted_quantity) AS action_quantity
FROM purchase_order_receiving_items ri;

ALTER TABLE supplier_credit_applications
    ADD COLUMN applied_by CHAR(36) NULL AFTER applied_at,
    ADD KEY idx_supplier_credit_applications_user (applied_by),
    ADD CONSTRAINT fk_supplier_credit_applications_user
        FOREIGN KEY (applied_by) REFERENCES users (user_id) ON DELETE SET NULL;

CREATE TABLE inventory_receiving_transactions (
    transaction_id CHAR(36) NOT NULL DEFAULT (UUID()),
    transaction_request_key VARCHAR(100) NOT NULL,
    transaction_type VARCHAR(40) NOT NULL,
    receiving_id CHAR(36) NOT NULL,
    receiving_item_id CHAR(36) NOT NULL,
    claim_id CHAR(36) NULL,
    po_id CHAR(36) NOT NULL,
    po_item_id CHAR(36) NOT NULL,
    inventory_batch_id CHAR(36) NOT NULL,
    product_id CHAR(36) NOT NULL,
    supplier_id CHAR(36) NOT NULL,
    quantity INT NOT NULL,
    created_by CHAR(36) NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (transaction_id),
    UNIQUE KEY uq_inventory_receiving_transaction_request (transaction_request_key),
    KEY idx_inventory_receiving_transaction_claim (claim_id),
    KEY idx_inventory_receiving_transaction_po_item (po_id, po_item_id),
    KEY idx_inventory_receiving_transaction_batch (inventory_batch_id),
    CONSTRAINT fk_inventory_receiving_transaction_receiving
        FOREIGN KEY (receiving_id) REFERENCES purchase_order_receiving (receiving_id),
    CONSTRAINT fk_inventory_receiving_transaction_receiving_item
        FOREIGN KEY (receiving_item_id) REFERENCES purchase_order_receiving_items (receiving_item_id),
    CONSTRAINT fk_inventory_receiving_transaction_claim
        FOREIGN KEY (claim_id) REFERENCES supplier_claims (claim_id),
    CONSTRAINT fk_inventory_receiving_transaction_po
        FOREIGN KEY (po_id) REFERENCES purchase_orders (po_id),
    CONSTRAINT fk_inventory_receiving_transaction_po_item
        FOREIGN KEY (po_item_id) REFERENCES purchase_order_items (po_item_id),
    CONSTRAINT fk_inventory_receiving_transaction_batch
        FOREIGN KEY (inventory_batch_id) REFERENCES inventory_batches (batch_id),
    CONSTRAINT fk_inventory_receiving_transaction_product
        FOREIGN KEY (product_id) REFERENCES product (product_id),
    CONSTRAINT fk_inventory_receiving_transaction_supplier
        FOREIGN KEY (supplier_id) REFERENCES suppliers (supplier_id),
    CONSTRAINT fk_inventory_receiving_transaction_user
        FOREIGN KEY (created_by) REFERENCES users (user_id) ON DELETE SET NULL,
    CONSTRAINT chk_inventory_receiving_transaction_quantity CHECK (quantity > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
