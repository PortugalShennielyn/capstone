START TRANSACTION;

UPDATE medical_supply_details
SET variant = COALESCE(NULLIF(TRIM(variant), ''), 'Ethyl Alcohol 70%'),
    size = COALESCE(NULLIF(TRIM(size), ''), '500 mL'),
    sterile_status = COALESCE(NULLIF(TRIM(sterile_status), ''), 'Non-sterile')
WHERE product_id = '44bad6eb-88d9-11f1-8e9d-706871ff20d7'
  AND (NULLIF(TRIM(variant), '') IS NULL
    OR NULLIF(TRIM(size), '') IS NULL
    OR NULLIF(TRIM(sterile_status), '') IS NULL);

COMMIT;
