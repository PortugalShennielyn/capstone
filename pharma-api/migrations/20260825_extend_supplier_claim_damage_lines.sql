-- Preserve row-level affected-package quantity and associate the row with the
-- accepted receiving batch created by the same receiving transaction.
ALTER TABLE supplier_claim_damage_lines
    DROP CONSTRAINT chk_claim_damage_quantity,
    ADD COLUMN affected_quantity INT NOT NULL DEFAULT 1 AFTER affected_unit_conversion_id,
    ADD COLUMN inventory_batch_id CHAR(36) NULL AFTER damaged_unit_conversion_id,
    ADD KEY idx_claim_damage_inventory_batch (inventory_batch_id),
    ADD CONSTRAINT fk_claim_damage_inventory_batch
        FOREIGN KEY (inventory_batch_id) REFERENCES inventory_batches (batch_id) ON DELETE SET NULL,
    ADD CONSTRAINT chk_claim_damage_affected_quantity CHECK (affected_quantity > 0),
    ADD CONSTRAINT chk_claim_damage_quantity CHECK (damaged_quantity >= 0);
