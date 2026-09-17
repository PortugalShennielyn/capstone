<?php

require_once __DIR__ . '/../config/db_connection.php';
require_once __DIR__ . '/../v1/products/product_customization_schema.php';

ensureProductCustomizationSchema($pdo);

$summary = [
    'product_types' => (int) $pdo->query('SELECT COUNT(*) FROM product_types')->fetchColumn(),
    'specifications' => (int) $pdo->query('SELECT COUNT(*) FROM product_specifications')->fetchColumn(),
    'type_mappings' => (int) $pdo->query('SELECT COUNT(*) FROM product_type_specifications')->fetchColumn(),
    'choices' => (int) $pdo->query('SELECT COUNT(*) FROM product_specification_choices')->fetchColumn(),
    'measurement_units' => (int) $pdo->query('SELECT COUNT(*) FROM product_measurement_units')->fetchColumn(),
];

echo json_encode(['status' => 'success', 'message' => 'Product Type specification templates initialized.', 'summary' => $summary], JSON_PRETTY_PRINT) . PHP_EOL;

?>
