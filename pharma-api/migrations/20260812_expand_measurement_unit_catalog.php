<?php
require_once __DIR__ . '/../config/db_connection.php';
require_once __DIR__ . '/../v1/products/product_customization_schema.php';

// Populate the shared database catalog. Product dropdowns continue to query
// product_measurement_units; no unit options are embedded in frontend code.
ensureProductCustomizationSchema($pdo);

echo "Central measurement-unit catalog expanded successfully.\n";
?>
