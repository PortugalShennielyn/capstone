-- MariaDB 10.4 migration: normalize receiving damage into supplier claims.
-- Back up the affected tables before running this migration.

ALTER TABLE purchase_order_payments
    CHANGE COLUMN idempotency_key payment_request_key VARCHAR(100) NOT NULL;

ALTER TABLE purchase_order_receiving
    ADD COLUMN inspection_status VARCHAR(40) NOT NULL DEFAULT 'Awaiting Inspection' AFTER remarks,
    ADD COLUMN inspected_by CHAR(36) NULL AFTER inspection_status,
    ADD KEY idx_purchase_order_receiving_inspection_status (inspection_status),
    ADD KEY idx_purchase_order_receiving_inspected_by (inspected_by),
    ADD CONSTRAINT fk_purchase_order_receiving_inspected_by
        FOREIGN KEY (inspected_by) REFERENCES users (user_id) ON DELETE SET NULL;

RENAME TABLE purchase_order_returns TO supplier_claims;

ALTER TABLE supplier_claims
    DROP FOREIGN KEY fk_purchase_order_returns_po_id,
    DROP FOREIGN KEY fk_purchase_order_returns_po_item_id,
    DROP INDEX idx_purchase_order_returns_po_id,
    DROP INDEX idx_purchase_order_returns_po_item_id,
    DROP INDEX idx_purchase_order_returns_return_status,
    CHANGE COLUMN return_id claim_id CHAR(36) NOT NULL DEFAULT (UUID()),
    CHANGE COLUMN return_quantity affected_quantity INT NOT NULL DEFAULT 0,
    CHANGE COLUMN return_status claim_status VARCHAR(40) NOT NULL DEFAULT 'Awaiting Supplier Resolution',
    DROP COLUMN po_id,
    ADD COLUMN inventory_batch_id CHAR(36) NULL AFTER po_item_id,
    ADD COLUMN unit_conversion_id CHAR(36) NULL AFTER affected_quantity,
    ADD COLUMN disposition VARCHAR(40) NULL AFTER damage_reason,
    ADD COLUMN resolution_type VARCHAR(40) NULL AFTER disposition,
    ADD COLUMN reported_by CHAR(36) NULL AFTER claim_status,
    ADD COLUMN resolved_at TIMESTAMP NULL DEFAULT NULL AFTER created_at,
    ADD KEY idx_supplier_claims_po_item (po_item_id),
    ADD KEY idx_supplier_claims_inventory_batch (inventory_batch_id),
    ADD KEY idx_supplier_claims_unit_conversion (unit_conversion_id),
    ADD KEY idx_supplier_claims_status (claim_status),
    ADD KEY idx_supplier_claims_reported_by (reported_by),
    ADD CONSTRAINT fk_supplier_claims_po_item
        FOREIGN KEY (po_item_id) REFERENCES purchase_order_items (po_item_id) ON DELETE CASCADE,
    ADD CONSTRAINT fk_supplier_claims_inventory_batch
        FOREIGN KEY (inventory_batch_id) REFERENCES inventory_batches (batch_id) ON DELETE SET NULL,
    ADD CONSTRAINT fk_supplier_claims_unit_conversion
        FOREIGN KEY (unit_conversion_id) REFERENCES supplier_product_unit_conversions (conversion_id),
    ADD CONSTRAINT fk_supplier_claims_reported_by
        FOREIGN KEY (reported_by) REFERENCES users (user_id) ON DELETE SET NULL;

-- The old table was empty in the inspected database. For non-empty copies, resolve
-- unit_conversion_id to the supplier product's base conversion before making it NOT NULL.
UPDATE supplier_claims sc
INNER JOIN purchase_order_items poi ON poi.po_item_id = sc.po_item_id
INNER JOIN purchase_orders po ON po.po_id = poi.po_id
INNER JOIN supplier_products sp ON sp.supplier_id = po.supplier_id AND sp.product_id = poi.product_id
INNER JOIN supplier_product_unit_conversions c
    ON c.supplier_product_id = sp.supplier_product_id AND c.base_quantity = 1
SET sc.unit_conversion_id = c.conversion_id
WHERE sc.unit_conversion_id IS NULL;

ALTER TABLE supplier_claims
    MODIFY unit_conversion_id CHAR(36) NOT NULL;

ALTER TABLE purchase_order_receiving_items
    DROP COLUMN damaged_quantity;

CREATE TABLE supplier_credits (
    credit_id CHAR(36) NOT NULL DEFAULT (UUID()),
    claim_id CHAR(36) NOT NULL,
    credit_amount DECIMAL(12,2) NOT NULL,
    credit_status VARCHAR(40) NOT NULL DEFAULT 'Available',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (credit_id),
    UNIQUE KEY uq_supplier_credits_claim (claim_id),
    KEY idx_supplier_credits_status (credit_status),
    CONSTRAINT fk_supplier_credits_claim
        FOREIGN KEY (claim_id) REFERENCES supplier_claims (claim_id) ON DELETE CASCADE,
    CONSTRAINT chk_supplier_credits_amount CHECK (credit_amount > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE supplier_credit_applications (
    application_id CHAR(36) NOT NULL DEFAULT (UUID()),
    credit_id CHAR(36) NOT NULL,
    po_id CHAR(36) NOT NULL,
    amount_applied DECIMAL(12,2) NOT NULL,
    applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (application_id),
    UNIQUE KEY uq_supplier_credit_application (credit_id, po_id),
    KEY idx_supplier_credit_applications_po (po_id),
    CONSTRAINT fk_supplier_credit_applications_credit
        FOREIGN KEY (credit_id) REFERENCES supplier_credits (credit_id) ON DELETE CASCADE,
    CONSTRAINT fk_supplier_credit_applications_po
        FOREIGN KEY (po_id) REFERENCES purchase_orders (po_id),
    CONSTRAINT chk_supplier_credit_applications_amount CHECK (amount_applied > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- Read-only compatibility projection while existing response property names are retained.
CREATE OR REPLACE VIEW supplier_claim_legacy_projection AS
SELECT
    sc.claim_id AS return_id,
    sc.claim_id,
    poi.po_id,
    sc.po_item_id,
    sc.inventory_batch_id,
    sc.affected_quantity,
    sc.unit_conversion_id,
    sc.affected_quantity * c.base_quantity AS return_quantity,
    sc.affected_quantity * c.base_quantity AS affected_base_quantity,
    c.unit_name AS affected_unit_name,
    c.base_quantity AS affected_unit_base_quantity,
    sc.damage_reason,
    sc.disposition,
    sc.resolution_type,
    sc.claim_status AS return_status,
    sc.claim_status,
    sc.reported_by,
    sc.remarks,
    sc.created_at,
    sc.resolved_at
FROM supplier_claims sc
INNER JOIN purchase_order_items poi ON poi.po_item_id = sc.po_item_id
INNER JOIN supplier_product_unit_conversions c ON c.conversion_id = sc.unit_conversion_id;

CREATE OR REPLACE VIEW purchase_order_receiving_item_summary AS
SELECT
    ri.receiving_item_id,
    ri.receiving_id,
    ri.po_item_id,
    ri.received_quantity,
    COALESCE(claims.damaged_quantity, 0) AS damaged_quantity
FROM purchase_order_receiving_items ri
LEFT JOIN (
    SELECT sc.po_item_id, SUM(sc.affected_quantity * c.base_quantity) AS damaged_quantity
    FROM supplier_claims sc
    INNER JOIN supplier_product_unit_conversions c ON c.conversion_id = sc.unit_conversion_id
    GROUP BY sc.po_item_id
) claims ON claims.po_item_id = ri.po_item_id;
