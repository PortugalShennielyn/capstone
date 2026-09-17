SET NAMES utf8mb4;
START TRANSACTION;

-- Resolve all reference identifiers from the live reference tables.
SELECT category_id INTO @cat_medicine FROM product_categories WHERE category_name = 'Medicine' LIMIT 1;
SELECT category_id INTO @cat_grocery FROM product_categories WHERE category_name = 'Grocery' LIMIT 1;
SELECT category_id INTO @cat_medical FROM product_categories WHERE category_name = 'Medical Supplies' LIMIT 1;
SELECT category_id INTO @cat_cosmetics FROM product_categories WHERE category_name = 'Cosmetics' LIMIT 1;
SELECT category_id INTO @cat_beauty FROM product_categories WHERE LOWER(category_name) = 'beauty care' LIMIT 1;
SELECT category_id INTO @cat_others FROM product_categories WHERE category_name = 'Others' LIMIT 1;
SELECT category_id INTO @cat_analgesic FROM product_categories WHERE REPLACE(LOWER(category_name), ' ', '') = 'analgesic/antipyretic' LIMIT 1;

SELECT type_id INTO @type_tablet FROM product_types WHERE type_name = 'Tablet' AND category_id = @cat_medicine LIMIT 1;
SELECT type_id INTO @type_personal_care FROM product_types WHERE type_name = 'Personal Care' LIMIT 1;
SELECT type_id INTO @type_grocery FROM product_types WHERE type_name = 'Grocery' AND category_id = @cat_grocery LIMIT 1;
SELECT type_id INTO @type_face_mask FROM product_types WHERE type_name = 'Face Mask' AND category_id = @cat_medical LIMIT 1;
SELECT type_id INTO @type_suspension FROM product_types WHERE type_name = 'Suspension' AND category_id = @cat_medicine LIMIT 1;
SELECT type_id INTO @type_household FROM product_types WHERE type_name = 'Household Item' LIMIT 1;

SELECT measurement_unit_id INTO @unit_tablet FROM product_measurement_units WHERE LOWER(unit_name) = 'tablet' AND measurement_group = 'Count' AND is_active = 1 LIMIT 1;
SELECT measurement_unit_id INTO @unit_piece FROM product_measurement_units WHERE unit_name = 'Piece' AND measurement_group = 'Count' AND is_active = 1 LIMIT 1;
SELECT measurement_unit_id INTO @unit_pouch FROM product_measurement_units WHERE unit_name = 'Pouch' AND measurement_group = 'Count' AND is_active = 1 LIMIT 1;
SELECT measurement_unit_id INTO @unit_box FROM product_measurement_units WHERE unit_name = 'Box' AND measurement_group = 'Count' AND is_active = 1 LIMIT 1;
SELECT measurement_unit_id INTO @unit_bottle FROM product_measurement_units WHERE unit_name = 'Bottle' AND measurement_group = 'Count' AND is_active = 1 LIMIT 1;
SELECT measurement_unit_id INTO @unit_pack FROM product_measurement_units WHERE unit_name = 'Pack' AND measurement_group = 'Count' AND is_active = 1 LIMIT 1;
SELECT measurement_unit_id INTO @unit_mg FROM product_measurement_units WHERE unit_name = 'mg' AND measurement_group = 'Strength' AND is_active = 1 LIMIT 1;
SELECT measurement_unit_id INTO @unit_mg_5ml FROM product_measurement_units WHERE unit_name = 'mg/5mL' AND measurement_group = 'Strength' AND is_active = 1 LIMIT 1;
SELECT measurement_unit_id INTO @unit_g FROM product_measurement_units WHERE unit_name = 'g' AND measurement_group = 'Weight' AND is_active = 1 LIMIT 1;
SELECT measurement_unit_id INTO @unit_ml FROM product_measurement_units WHERE unit_name = 'mL' AND measurement_group = 'Volume' AND is_active = 1 LIMIT 1;

SELECT specification_id INTO @spec_variant FROM product_specifications WHERE specification_name = 'Variant' LIMIT 1;
SELECT specification_id INTO @spec_flavor FROM product_specifications WHERE specification_name = 'Flavor' LIMIT 1;
SELECT specification_id INTO @spec_strength FROM product_specifications WHERE specification_name = 'Strength' LIMIT 1;
SELECT specification_id INTO @spec_volume FROM product_specifications WHERE specification_name = 'Volume' LIMIT 1;
SELECT specification_id INTO @spec_net_weight FROM product_specifications WHERE specification_name = 'Net Weight' LIMIT 1;
SELECT specification_id INTO @spec_tablet_count FROM product_specifications WHERE specification_name = 'Tablet Count' LIMIT 1;
SELECT specification_id INTO @spec_pack_content FROM product_specifications WHERE specification_name = 'Pack Content' LIMIT 1;
SELECT specification_id INTO @spec_package_type FROM product_specifications WHERE specification_name = 'Package Type' LIMIT 1;
SELECT specification_id INTO @spec_size FROM product_specifications WHERE specification_name = 'Size' LIMIT 1;
SELECT specification_id INTO @spec_material FROM product_specifications WHERE specification_name = 'Material' LIMIT 1;
SELECT specification_id INTO @spec_sterile FROM product_specifications WHERE specification_name = 'Sterile Status' LIMIT 1;

-- Clear old product-flow transactions in FK-safe order without disabling FK checks.
DELETE FROM inventory_transfer_allocations;
DELETE FROM inventory_transfers;
DELETE FROM product_selling_stock;
DELETE FROM inventory_batches;
DELETE FROM product_inventory;

DELETE FROM cashier_queue;
DELETE FROM sales_receipts;
DELETE FROM sales_payments;
DELETE FROM sales_order_status_history;
DELETE FROM sales_order_items;
DELETE FROM sales_orders;

DELETE FROM purchase_order_receiving_items;
DELETE FROM purchase_order_returns;
DELETE FROM purchase_order_receiving;
DELETE FROM purchase_order_payments;
DELETE FROM purchase_order_approval_audit;
DELETE FROM purchase_order_items;
DELETE FROM purchase_orders;
DELETE FROM purchase_request_items;
DELETE FROM purchase_requests;

DELETE FROM activity_logs
WHERE module IN ('Products', 'Inventory', 'Purchase Order', 'Purchase Request', 'Return/Damage', 'Sales', 'Cashier')
   OR (module = 'Pricing' AND reference_id <> 'category-markups-v1');

DELETE FROM supplier_product_unit_conversions;
DELETE FROM supplier_products;
DELETE FROM entity_dimensions WHERE entity_type IN ('product', 'product_variation');
DELETE FROM product_variations_backup;
DELETE FROM product_specification_values;
DELETE FROM grocery_details;
DELETE FROM medical_supply_details;
DELETE FROM medicine_details;
DELETE FROM product;

-- Exactly one new master product per live category.
SET @p_analgesic = UUID();
SET @p_beauty = UUID();
SET @p_cosmetics = UUID();
SET @p_grocery = UUID();
SET @p_medical = UUID();
SET @p_medicine = UUID();
SET @p_others = UUID();

INSERT INTO product
    (product_id, barcode, brand_name, product_name, category_id, type_id, inventory_unit_id, price, pricing_method, custom_markup_percentage, status)
VALUES
    (@p_analgesic, CONCAT('AUTO-', UPPER(SUBSTRING(REPLACE(UUID(), '-', ''), 1, 12))), 'Generic Health', 'Paracetamol 500 mg Tablet', @cat_analgesic, @type_tablet, @unit_tablet, 2.00, 'manual', NULL, 'Active'),
    (@p_beauty, CONCAT('AUTO-', UPPER(SUBSTRING(REPLACE(UUID(), '-', ''), 1, 12))), 'Dove', 'Beauty Bar 90 g', @cat_beauty, @type_personal_care, @unit_piece, 55.00, 'manual', NULL, 'Active'),
    (@p_cosmetics, CONCAT('AUTO-', UPPER(SUBSTRING(REPLACE(UUID(), '-', ''), 1, 12))), 'Ever Bilena', 'Matte Lipstick 3.5 g', @cat_cosmetics, @type_personal_care, @unit_piece, 165.00, 'manual', NULL, 'Active'),
    (@p_grocery, CONCAT('AUTO-', UPPER(SUBSTRING(REPLACE(UUID(), '-', ''), 1, 12))), 'Milo', 'Milo Activ-Go 300 g Pouch', @cat_grocery, @type_grocery, @unit_pouch, 145.00, 'manual', NULL, 'Active'),
    (@p_medical, CONCAT('AUTO-', UPPER(SUBSTRING(REPLACE(UUID(), '-', ''), 1, 12))), 'Indoplas', 'Disposable Face Mask 50 pcs Box', @cat_medical, @type_face_mask, @unit_box, 180.00, 'manual', NULL, 'Active'),
    (@p_medicine, CONCAT('AUTO-', UPPER(SUBSTRING(REPLACE(UUID(), '-', ''), 1, 12))), 'Biogesic', 'Biogesic for Kids', @cat_medicine, @type_suspension, @unit_bottle, 115.00, 'manual', NULL, 'Active'),
    (@p_others, CONCAT('AUTO-', UPPER(SUBSTRING(REPLACE(UUID(), '-', ''), 1, 12))), 'Eveready', 'AA Batteries 2-Pack', @cat_others, @type_household, @unit_pack, 95.00, 'manual', NULL, 'Active');

-- Normalized product specifications; supplier pack quantities are intentionally absent here.
INSERT INTO product_specification_values (product_id, specification_id, value_text, value_number, measurement_unit_id) VALUES
    (@p_analgesic, @spec_strength, NULL, 500, @unit_mg),
    (@p_analgesic, @spec_tablet_count, NULL, 1, @unit_tablet),
    (@p_analgesic, @spec_package_type, 'Blister Pack', NULL, NULL),

    (@p_beauty, @spec_variant, 'Original', NULL, NULL),
    (@p_beauty, @spec_net_weight, NULL, 90, @unit_g),
    (@p_beauty, @spec_pack_content, NULL, 1, @unit_piece),
    (@p_beauty, @spec_package_type, 'Wrapper', NULL, NULL),

    (@p_cosmetics, @spec_variant, 'Matte', NULL, NULL),
    (@p_cosmetics, @spec_net_weight, NULL, 3.5, @unit_g),
    (@p_cosmetics, @spec_pack_content, NULL, 1, @unit_piece),
    (@p_cosmetics, @spec_package_type, 'Tube', NULL, NULL),

    (@p_grocery, @spec_variant, 'Activ-Go', NULL, NULL),
    (@p_grocery, @spec_net_weight, NULL, 300, @unit_g),
    (@p_grocery, @spec_pack_content, NULL, 1, @unit_pouch),
    (@p_grocery, @spec_package_type, 'Pouch', NULL, NULL),

    (@p_medical, @spec_variant, '3-Ply', NULL, NULL),
    (@p_medical, @spec_size, 'Adult', NULL, NULL),
    (@p_medical, @spec_material, 'Non-woven polypropylene', NULL, NULL),
    (@p_medical, @spec_sterile, 'Non-sterile', NULL, NULL),
    (@p_medical, @spec_pack_content, NULL, 50, @unit_piece),
    (@p_medical, @spec_package_type, 'Box', NULL, NULL),

    (@p_medicine, @spec_flavor, 'Orange', NULL, NULL),
    (@p_medicine, @spec_strength, NULL, 120, @unit_mg_5ml),
    (@p_medicine, @spec_volume, NULL, 60, @unit_ml),
    (@p_medicine, @spec_package_type, 'Bottle', NULL, NULL),

    (@p_others, @spec_variant, 'AA Alkaline', NULL, NULL),
    (@p_others, @spec_pack_content, NULL, 2, @unit_piece),
    (@p_others, @spec_package_type, 'Pack', NULL, NULL);

-- Existing category-specific detail tables remain populated for API compatibility.
INSERT INTO medicine_details
    (medicine_detail_id, product_id, generic_name, strength_value, strength_unit, strength, dosage_form, package_type, net_content_value, net_content_unit)
VALUES
    (UUID(), @p_medicine, 'Paracetamol', 120, 'mg/5mL', '120 mg / 5 mL', 'Suspension', 'Bottle', 60, 'mL');

INSERT INTO grocery_details
    (grocery_detail_id, product_id, variant, size, net_weight, unit, package_type, pack_content)
VALUES
    (UUID(), @p_grocery, 'Activ-Go', '300 g', '300', 'g', 'Pouch', '1 Pouch');

INSERT INTO medical_supply_details
    (medical_supply_detail_id, product_id, variant, size, material, sterile_status, package_type, pack_content)
VALUES
    (UUID(), @p_medical, '3-Ply', 'Adult', 'Non-woven polypropylene', 'Non-sterile', 'Box', '50 Pieces');

-- Give every active supplier exactly one usable assignment, reusing master products as needed.
INSERT INTO supplier_products
    (supplier_product_id, supplier_id, product_id, supplier_cost_price, supplier_cost_input, supplier_cost_basis,
     purchase_unit, purchase_unit_contains, inner_unit, units_per_inner_unit, inventory_unit, units_per_purchase_unit)
SELECT
    UUID(), ranked.supplier_id,
    CASE MOD(ranked.rn - 1, 7)
        WHEN 0 THEN @p_analgesic WHEN 1 THEN @p_beauty WHEN 2 THEN @p_cosmetics
        WHEN 3 THEN @p_grocery WHEN 4 THEN @p_medical WHEN 5 THEN @p_medicine ELSE @p_others END,
    CASE MOD(ranked.rn - 1, 7)
        WHEN 0 THEN 1.50 WHEN 1 THEN 42.00 WHEN 2 THEN 125.00 WHEN 3 THEN 115.00
        WHEN 4 THEN 140.00 WHEN 5 THEN 90.00 ELSE 70.00 END,
    CASE MOD(ranked.rn - 1, 7)
        WHEN 0 THEN 1.50 WHEN 1 THEN 42.00 WHEN 2 THEN 125.00 WHEN 3 THEN 115.00
        WHEN 4 THEN 140.00 WHEN 5 THEN 270.00 ELSE 70.00 END,
    'purchase',
    CASE MOD(ranked.rn - 1, 7)
        WHEN 0 THEN 'tablet' WHEN 1 THEN 'Piece' WHEN 2 THEN 'Piece' WHEN 3 THEN 'Pouch'
        WHEN 4 THEN 'Box' WHEN 5 THEN 'Pack' ELSE 'Pack' END,
    CASE WHEN MOD(ranked.rn - 1, 7) = 5 THEN 3 ELSE 1 END,
    NULL, NULL,
    CASE MOD(ranked.rn - 1, 7)
        WHEN 0 THEN 'tablet' WHEN 1 THEN 'Piece' WHEN 2 THEN 'Piece' WHEN 3 THEN 'Pouch'
        WHEN 4 THEN 'Box' WHEN 5 THEN 'Bottle' ELSE 'Pack' END,
    CASE WHEN MOD(ranked.rn - 1, 7) = 5 THEN 3 ELSE 1 END
FROM (
    SELECT supplier_id, ROW_NUMBER() OVER (ORDER BY supplier_id) AS rn
    FROM suppliers
    WHERE archived_at IS NULL
) ranked;

-- Base-unit conversions for all assignments plus Biogesic's supplier Pack = 3 Bottles.
INSERT INTO supplier_product_unit_conversions
    (conversion_id, supplier_product_id, unit_name, base_quantity, level_order, is_transfer_unit, is_selling_unit)
SELECT UUID(), supplier_product_id, inventory_unit, 1, 0, 1, 1
FROM supplier_products;

INSERT INTO supplier_product_unit_conversions
    (conversion_id, supplier_product_id, unit_name, base_quantity, level_order, is_transfer_unit, is_selling_unit)
SELECT UUID(), supplier_product_id, purchase_unit, units_per_purchase_unit, 2, 1, 1
FROM supplier_products
WHERE product_id = @p_medicine AND LOWER(purchase_unit) <> LOWER(inventory_unit);

COMMIT;
