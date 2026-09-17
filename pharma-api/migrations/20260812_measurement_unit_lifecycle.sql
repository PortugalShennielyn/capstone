ALTER TABLE product_measurement_units
    ADD COLUMN IF NOT EXISTS is_active TINYINT(1) NOT NULL DEFAULT 1 AFTER measurement_group,
    ADD COLUMN IF NOT EXISTS is_system TINYINT(1) NOT NULL DEFAULT 1 AFTER is_active;

-- Rows that existed before lifecycle tracking are protected defaults. Units
-- created through the customization API after this migration use is_system=0.
ALTER TABLE product_measurement_units
    ALTER COLUMN is_system SET DEFAULT 0;
