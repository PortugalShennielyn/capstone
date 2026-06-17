CREATE TABLE IF NOT EXISTS product_categories (
    category_id CHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
    category_name VARCHAR(50) NOT NULL UNIQUE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO product_categories (category_name)
VALUES ('Medicine'), ('Grocery')
ON DUPLICATE KEY UPDATE category_name = VALUES(category_name);

ALTER TABLE product
    ADD COLUMN IF NOT EXISTS category_id CHAR(36) NULL AFTER product_id,
    ADD COLUMN IF NOT EXISTS type_id CHAR(36) NULL AFTER category_id,
    ADD COLUMN IF NOT EXISTS measurement_unit_id CHAR(36) NULL AFTER type_id,
    ADD COLUMN IF NOT EXISTS generic_name VARCHAR(150) NULL AFTER product_name,
    ADD COLUMN IF NOT EXISTS strength_size VARCHAR(100) NULL AFTER generic_name,
    ADD COLUMN IF NOT EXISTS strength_size_value VARCHAR(50) NULL AFTER strength_size,
    ADD COLUMN IF NOT EXISTS goods_type VARCHAR(100) NULL AFTER strength_size,
    ADD COLUMN IF NOT EXISTS size_weight VARCHAR(100) NULL AFTER goods_type;

CREATE TABLE IF NOT EXISTS product_types (
    type_id CHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
    category_id CHAR(36) NULL,
    type_name VARCHAR(80) NOT NULL UNIQUE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

ALTER TABLE product_types
    ADD COLUMN IF NOT EXISTS category_id CHAR(36) NULL AFTER type_id;

ALTER TABLE product_types
    MODIFY type_name VARCHAR(80) NOT NULL;

CREATE TABLE IF NOT EXISTS product_measurement_units (
    measurement_unit_id CHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
    unit_name VARCHAR(40) NOT NULL UNIQUE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

UPDATE product_types pt
INNER JOIN product_categories pc ON pc.category_name = pt.type_name
SET pt.category_id = pc.category_id
WHERE pt.category_id IS NULL;

INSERT INTO product_types (category_id, type_name)
SELECT category_id, type_name
FROM (
    SELECT pc.category_id, 'Tablet' AS type_name FROM product_categories pc WHERE pc.category_name = 'Medicine'
    UNION ALL SELECT pc.category_id, 'Capsule' FROM product_categories pc WHERE pc.category_name = 'Medicine'
    UNION ALL SELECT pc.category_id, 'Syrup' FROM product_categories pc WHERE pc.category_name = 'Medicine'
    UNION ALL SELECT pc.category_id, 'Suspension' FROM product_categories pc WHERE pc.category_name = 'Medicine'
    UNION ALL SELECT pc.category_id, 'Drops' FROM product_categories pc WHERE pc.category_name = 'Medicine'
    UNION ALL SELECT pc.category_id, 'Ointment' FROM product_categories pc WHERE pc.category_name = 'Medicine'
    UNION ALL SELECT pc.category_id, 'Cream' FROM product_categories pc WHERE pc.category_name = 'Medicine'
    UNION ALL SELECT pc.category_id, 'Gel' FROM product_categories pc WHERE pc.category_name = 'Medicine'
    UNION ALL SELECT pc.category_id, 'Lotion' FROM product_categories pc WHERE pc.category_name = 'Medicine'
    UNION ALL SELECT pc.category_id, 'Solution' FROM product_categories pc WHERE pc.category_name = 'Medicine'
    UNION ALL SELECT pc.category_id, 'Injection' FROM product_categories pc WHERE pc.category_name = 'Medicine'
    UNION ALL SELECT pc.category_id, 'Inhaler' FROM product_categories pc WHERE pc.category_name = 'Medicine'
    UNION ALL SELECT pc.category_id, 'Nebulizer' FROM product_categories pc WHERE pc.category_name = 'Medicine'
    UNION ALL SELECT pc.category_id, 'Suppository' FROM product_categories pc WHERE pc.category_name = 'Medicine'
    UNION ALL SELECT pc.category_id, 'Patch' FROM product_categories pc WHERE pc.category_name = 'Medicine'
    UNION ALL SELECT pc.category_id, 'Powder' FROM product_categories pc WHERE pc.category_name = 'Medicine'
    UNION ALL SELECT pc.category_id, 'Vitamins/Supplements' FROM product_categories pc WHERE pc.category_name = 'Medicine'
    UNION ALL SELECT pc.category_id, 'First Aid' FROM product_categories pc WHERE pc.category_name = 'Medicine'
    UNION ALL SELECT pc.category_id, 'Medical Supply' FROM product_categories pc WHERE pc.category_name = 'Medicine'
    UNION ALL SELECT pc.category_id, 'Personal Protective Equipment' FROM product_categories pc WHERE pc.category_name = 'Medicine'
    UNION ALL SELECT pc.category_id, 'Device/Equipment' FROM product_categories pc WHERE pc.category_name = 'Medicine'
    UNION ALL SELECT pc.category_id, 'Canned Goods' FROM product_categories pc WHERE pc.category_name = 'Grocery'
    UNION ALL SELECT pc.category_id, 'Beverage' FROM product_categories pc WHERE pc.category_name = 'Grocery'
    UNION ALL SELECT pc.category_id, 'Snacks' FROM product_categories pc WHERE pc.category_name = 'Grocery'
    UNION ALL SELECT pc.category_id, 'Biscuits' FROM product_categories pc WHERE pc.category_name = 'Grocery'
    UNION ALL SELECT pc.category_id, 'Noodles' FROM product_categories pc WHERE pc.category_name = 'Grocery'
    UNION ALL SELECT pc.category_id, 'Condiments' FROM product_categories pc WHERE pc.category_name = 'Grocery'
    UNION ALL SELECT pc.category_id, 'Dairy' FROM product_categories pc WHERE pc.category_name = 'Grocery'
    UNION ALL SELECT pc.category_id, 'Bread/Bakery' FROM product_categories pc WHERE pc.category_name = 'Grocery'
    UNION ALL SELECT pc.category_id, 'Personal Care' FROM product_categories pc WHERE pc.category_name = 'Grocery'
    UNION ALL SELECT pc.category_id, 'Hygiene Product' FROM product_categories pc WHERE pc.category_name = 'Grocery'
    UNION ALL SELECT pc.category_id, 'Baby Care' FROM product_categories pc WHERE pc.category_name = 'Grocery'
    UNION ALL SELECT pc.category_id, 'Household Item' FROM product_categories pc WHERE pc.category_name = 'Grocery'
) seeded_types
ON DUPLICATE KEY UPDATE category_id = VALUES(category_id);

INSERT INTO product_measurement_units (unit_name)
VALUES
    ('mg'), ('g'), ('kg'), ('mcg'), ('mL'), ('L'), ('%'), ('IU'),
    ('mg/mL'), ('mg/5mL'), ('pcs'), ('pack'), ('box'), ('bottle'),
    ('sachet'), ('can'), ('N/A')
ON DUPLICATE KEY UPDATE unit_name = VALUES(unit_name);

CREATE TABLE IF NOT EXISTS supplier_products (
    supplier_product_id CHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
    supplier_id CHAR(36) NOT NULL,
    product_id CHAR(36) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY unique_supplier_product (supplier_id, product_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT IGNORE INTO supplier_products (supplier_id, product_id)
SELECT supplier_id, product_id
FROM product
WHERE supplier_id IS NOT NULL
  AND supplier_id <> '';

