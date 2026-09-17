ALTER TABLE supplier_products
    ADD COLUMN IF NOT EXISTS inventory_unit VARCHAR(50) NULL AFTER purchase_unit;

UPDATE supplier_products sp
INNER JOIN product p ON p.product_id = sp.product_id
LEFT JOIN medicine_details md ON md.product_id = p.product_id
LEFT JOIN grocery_details gd ON gd.product_id = p.product_id
LEFT JOIN medical_supply_details msd ON msd.product_id = p.product_id
SET sp.inventory_unit = CASE
    WHEN LOWER(TRIM(COALESCE(md.dosage_form, ''))) IN ('tablet', 'capsule', 'sachet') THEN LOWER(TRIM(md.dosage_form))
    WHEN LOWER(TRIM(COALESCE(md.dosage_form, ''))) = 'caplet' THEN 'tablet'
    WHEN LOWER(TRIM(COALESCE(md.package_type, gd.package_type, msd.package_type, ''))) IN ('bottle','can','pouch','tube','roll','vial','ampule')
        THEN LOWER(TRIM(COALESCE(md.package_type, gd.package_type, msd.package_type)))
    ELSE 'pc'
END
WHERE sp.inventory_unit IS NULL OR TRIM(sp.inventory_unit) = '';
