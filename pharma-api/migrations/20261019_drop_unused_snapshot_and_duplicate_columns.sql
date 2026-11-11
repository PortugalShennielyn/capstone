-- Product descriptions belong on the product record. These purchase-order
-- copies were empty on every row. Purchase unit, conversion, inventory unit,
-- and unit price snapshots stay because they record the order itself.
ALTER TABLE purchase_order_items
    DROP COLUMN IF EXISTS product_name_snapshot,
    DROP COLUMN IF EXISTS brand_name_snapshot,
    DROP COLUMN IF EXISTS category_name_snapshot,
    DROP COLUMN IF EXISTS type_name_snapshot,
    DROP COLUMN IF EXISTS generic_name_snapshot,
    DROP COLUMN IF EXISTS variant_flavor_snapshot,
    DROP COLUMN IF EXISTS strength_snapshot,
    DROP COLUMN IF EXISTS size_value_snapshot,
    DROP COLUMN IF EXISTS packaging_snapshot;

-- product_inventory stored the same date twice. Shelf stock keeps its own
-- expiration_date column because that table does not have a second copy.
ALTER TABLE product_inventory
    ADD COLUMN IF NOT EXISTS expiry_date DATE NULL;

SET @copy_expiration_date = IF(
    (SELECT COUNT(*)
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'product_inventory'
       AND COLUMN_NAME = 'expiration_date') > 0,
    'UPDATE product_inventory SET expiry_date = expiration_date WHERE expiry_date IS NULL AND expiration_date IS NOT NULL',
    'SELECT 1'
);
PREPARE copy_expiration_date_stmt FROM @copy_expiration_date;
EXECUTE copy_expiration_date_stmt;
DEALLOCATE PREPARE copy_expiration_date_stmt;

ALTER TABLE product_inventory
    DROP COLUMN IF EXISTS expiration_date;

DROP TABLE IF EXISTS product_variations_backup;
