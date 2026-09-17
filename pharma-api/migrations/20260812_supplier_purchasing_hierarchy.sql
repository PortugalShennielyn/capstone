ALTER TABLE supplier_products
    ADD COLUMN IF NOT EXISTS supplier_cost_input DECIMAL(10,2) NULL AFTER supplier_cost_price,
    ADD COLUMN IF NOT EXISTS supplier_cost_basis VARCHAR(20) NOT NULL DEFAULT 'inventory' AFTER supplier_cost_input,
    ADD COLUMN IF NOT EXISTS purchase_unit_contains INT NULL AFTER purchase_unit,
    ADD COLUMN IF NOT EXISTS inner_unit VARCHAR(50) NULL AFTER purchase_unit_contains,
    ADD COLUMN IF NOT EXISTS units_per_inner_unit INT NULL AFTER inner_unit;

ALTER TABLE supplier_products
    MODIFY supplier_cost_price DECIMAL(12,4) NULL;

ALTER TABLE purchase_order_items
    MODIFY unit_price_snapshot DECIMAL(12,4) NULL;

ALTER TABLE inventory_batches
    MODIFY unit_cost DECIMAL(12,4) NOT NULL DEFAULT 0.0000;

-- Existing rows intentionally remain untouched. A NULL purchase_unit_contains
-- means the legacy units_per_purchase_unit value is a direct conversion.
