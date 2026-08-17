-- MariaDB 10.4: preserve physical damage separately from the quantity acted on.
-- Existing affected_quantity/unit_conversion_id remain as the compatibility claim quantity.

ALTER TABLE supplier_claims
    ADD COLUMN damaged_quantity INT NOT NULL DEFAULT 0 AFTER inventory_batch_id,
    ADD COLUMN damaged_unit_conversion_id CHAR(36) NULL AFTER damaged_quantity,
    ADD COLUMN action_quantity INT NOT NULL DEFAULT 0 AFTER damaged_unit_conversion_id,
    ADD COLUMN action_unit_conversion_id CHAR(36) NULL AFTER action_quantity,
    ADD KEY idx_supplier_claims_damaged_conversion (damaged_unit_conversion_id),
    ADD KEY idx_supplier_claims_action_conversion (action_unit_conversion_id),
    ADD CONSTRAINT fk_supplier_claims_damaged_conversion
        FOREIGN KEY (damaged_unit_conversion_id) REFERENCES supplier_product_unit_conversions (conversion_id),
    ADD CONSTRAINT fk_supplier_claims_action_conversion
        FOREIGN KEY (action_unit_conversion_id) REFERENCES supplier_product_unit_conversions (conversion_id),
    ADD CONSTRAINT chk_supplier_claims_damaged_quantity CHECK (damaged_quantity >= 0),
    ADD CONSTRAINT chk_supplier_claims_action_quantity CHECK (action_quantity >= 0);

-- Preserve the meaning of pre-migration claims: their single quantity represented
-- both the observed damage and the quantity returned/held/disposed.
UPDATE supplier_claims
SET damaged_quantity = affected_quantity,
    damaged_unit_conversion_id = unit_conversion_id,
    action_quantity = affected_quantity,
    action_unit_conversion_id = unit_conversion_id;

CREATE OR REPLACE VIEW supplier_claim_legacy_projection AS
SELECT
    sc.claim_id AS return_id,
    sc.claim_id,
    poi.po_id,
    sc.po_item_id,
    sc.inventory_batch_id,
    sc.affected_quantity,
    sc.unit_conversion_id,
    sc.affected_quantity * affected_c.base_quantity AS affected_base_quantity,
    CASE
        WHEN sc.action_unit_conversion_id IS NOT NULL THEN sc.action_quantity * action_c.base_quantity
        ELSE sc.affected_quantity * affected_c.base_quantity
    END AS return_quantity,
    affected_c.unit_name AS affected_unit_name,
    affected_c.base_quantity AS affected_unit_base_quantity,
    sc.damaged_quantity AS damaged_selected_quantity,
    sc.damaged_unit_conversion_id,
    damaged_c.unit_name AS damaged_unit_name,
    COALESCE(damaged_c.base_quantity, 1) AS damaged_unit_base_quantity,
    CASE
        WHEN sc.damaged_unit_conversion_id IS NOT NULL THEN sc.damaged_quantity * damaged_c.base_quantity
        ELSE sc.affected_quantity * affected_c.base_quantity
    END AS damaged_quantity,
    sc.action_quantity,
    sc.action_unit_conversion_id,
    action_c.unit_name AS action_unit_name,
    COALESCE(action_c.base_quantity, 1) AS action_unit_base_quantity,
    CASE
        WHEN sc.action_unit_conversion_id IS NOT NULL THEN sc.action_quantity * action_c.base_quantity
        ELSE sc.affected_quantity * affected_c.base_quantity
    END AS action_base_quantity,
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
INNER JOIN supplier_product_unit_conversions affected_c ON affected_c.conversion_id = sc.unit_conversion_id
LEFT JOIN supplier_product_unit_conversions damaged_c ON damaged_c.conversion_id = sc.damaged_unit_conversion_id
LEFT JOIN supplier_product_unit_conversions action_c ON action_c.conversion_id = sc.action_unit_conversion_id;

CREATE OR REPLACE VIEW purchase_order_receiving_item_summary AS
SELECT
    ri.receiving_item_id,
    ri.receiving_id,
    ri.po_item_id,
    ri.received_quantity,
    COALESCE(claims.damaged_quantity, 0) AS damaged_quantity,
    COALESCE(claims.action_quantity, 0) AS action_quantity
FROM purchase_order_receiving_items ri
LEFT JOIN (
    SELECT
        po_item_id,
        SUM(damaged_quantity) AS damaged_quantity,
        SUM(action_base_quantity) AS action_quantity
    FROM supplier_claim_legacy_projection
    GROUP BY po_item_id
) claims ON claims.po_item_id = ri.po_item_id;
