START TRANSACTION;

-- Pack Content describes the physical contents inside one sellable Pack. It is
-- deliberately independent from product.inventory_unit_id (the stock/POS unit).
UPDATE product_specification_values pack_content
INNER JOIN product p ON p.product_id = pack_content.product_id
INNER JOIN product_measurement_units inventory_unit
    ON inventory_unit.measurement_unit_id = p.inventory_unit_id
INNER JOIN product_specifications pack_definition
    ON pack_definition.specification_id = pack_content.specification_id
INNER JOIN product_specification_values variant
    ON variant.product_id = p.product_id
INNER JOIN product_specifications variant_definition
    ON variant_definition.specification_id = variant.specification_id
INNER JOIN product_measurement_units pieces
    ON pieces.measurement_group = 'Count'
   AND LOWER(TRIM(pieces.unit_name)) = 'pcs'
   AND pieces.is_active = 1
SET pack_content.measurement_unit_id = pieces.measurement_unit_id
WHERE p.product_name = 'EQ Dry Disposable Baby Diapers'
  AND LOWER(TRIM(inventory_unit.unit_name)) = 'pack'
  AND LOWER(TRIM(pack_definition.specification_name)) = 'pack content'
  AND pack_content.value_number = 44
  AND LOWER(TRIM(variant_definition.specification_name)) = 'variant'
  AND LOWER(TRIM(variant.value_text)) = 'new born';

COMMIT;
