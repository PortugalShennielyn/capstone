CREATE TABLE IF NOT EXISTS product_selling_options (
    selling_option_id CHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
    product_id CHAR(36) NOT NULL,
    unit_name VARCHAR(50) NOT NULL,
    base_quantity INT NOT NULL,
    selling_price DECIMAL(10,2) NOT NULL,
    pos_enabled TINYINT(1) NOT NULL DEFAULT 1,
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    is_default TINYINT(1) NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_product_selling_option_unit (product_id, unit_name),
    KEY idx_product_selling_options_pos (product_id, pos_enabled, is_active, is_default),
    CONSTRAINT fk_product_selling_options_product
        FOREIGN KEY (product_id) REFERENCES product(product_id)
        ON DELETE CASCADE ON UPDATE RESTRICT,
    CONSTRAINT chk_product_selling_options_base_quantity CHECK (base_quantity > 0),
    CONSTRAINT chk_product_selling_options_price CHECK (selling_price >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

INSERT INTO product_selling_options (
    selling_option_id, product_id, unit_name, base_quantity,
    selling_price, pos_enabled, is_active, is_default
)
SELECT UUID(), p.product_id,
       COALESCE(NULLIF(pmu.unit_symbol, ''), NULLIF(pmu.unit_name, ''), 'Unit'),
       1, p.price, 1, 1, 1
FROM product p
INNER JOIN product_measurement_units pmu
    ON pmu.measurement_unit_id = p.inventory_unit_id
LEFT JOIN product_selling_options existing
    ON existing.product_id = p.product_id
WHERE existing.selling_option_id IS NULL;

UPDATE supplier_product_unit_conversions
SET is_selling_unit = 0
WHERE is_selling_unit <> 0;

UPDATE supplier_product_unit_conversions
SET is_transfer_unit = CASE WHEN base_quantity = 1 THEN 1 ELSE 0 END;

ALTER TABLE supplier_product_unit_conversions
    MODIFY is_selling_unit TINYINT(1) NOT NULL DEFAULT 0;
