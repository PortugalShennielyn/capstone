-- Barcode belongs to a sellable unit; shelf stock remains in the product base unit.
ALTER TABLE product_selling_options
    ADD COLUMN barcode VARCHAR(100) NULL DEFAULT NULL AFTER selling_price,
    ADD UNIQUE KEY uq_product_selling_option_barcode (barcode);
