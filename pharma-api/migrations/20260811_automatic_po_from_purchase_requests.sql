-- Prospective procurement linkage. Existing historical/manual POs remain valid.
ALTER TABLE purchase_orders
    ADD COLUMN IF NOT EXISTS pr_id CHAR(36) NULL AFTER po_id;
