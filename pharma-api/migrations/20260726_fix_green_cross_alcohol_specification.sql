START TRANSACTION;

UPDATE medical_supply_details
SET size = '500 mL'
WHERE product_id = '44bad6eb-88d9-11f1-8e9d-706871ff20d7'
  AND variant = 'Ethyl Alcohol 70%'
  AND size = '500'
  AND sterile_status = 'Non-sterile';

COMMIT;
