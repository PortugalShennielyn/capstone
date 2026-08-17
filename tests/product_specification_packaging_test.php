<?php

require_once __DIR__ . '/../pharma-api/config/db_connection.php';
require_once __DIR__ . '/../pharma-api/v1/products/product_customization_schema.php';

function specificationAssert(bool $condition, string $message): void
{
    if (!$condition) throw new RuntimeException($message);
    echo "PASS: {$message}\n";
}

ensureProductCustomizationSchema($pdo);

$typeStatement = $pdo->query("SELECT type_id FROM product_types WHERE type_name = 'Beverage' LIMIT 1");
$beverageTypeId = cleanId($typeStatement->fetchColumn());
$syrupTypeId = cleanId($pdo->query("SELECT type_id FROM product_types WHERE type_name = 'Syrup' LIMIT 1")->fetchColumn());
$groceryCategoryId = cleanId($pdo->query("SELECT category_id FROM product_categories WHERE category_name = 'Grocery' LIMIT 1")->fetchColumn());
specificationAssert($beverageTypeId !== '' && $syrupTypeId !== '', 'Beverage and Syrup configurations exist');

$beverageConfiguration = getTypeSpecificationConfiguration($pdo, $beverageTypeId);
$beverageLabels = array_column($beverageConfiguration, 'display_name');
specificationAssert($beverageLabels === ['Flavor', 'Net Content', 'Package Type', 'Inventory Unit', 'Pack Content'], 'Beverage loads its reusable five-field SKU template');

$syrupConfiguration = getTypeSpecificationConfiguration($pdo, $syrupTypeId);
$syrupVolume = array_values(array_filter($syrupConfiguration, static fn($row) => $row['specification_name'] === 'Volume'))[0] ?? null;
specificationAssert($syrupVolume && $syrupVolume['display_name'] === 'Volume', 'Syrup keeps the shared Volume label');

$volumeUnits = $pdo->prepare("SELECT unit_symbol FROM product_measurement_units WHERE measurement_group = 'Volume' ORDER BY unit_symbol");
$volumeUnits->execute();
$volumeSymbols = $volumeUnits->fetchAll(PDO::FETCH_COLUMN);
specificationAssert(in_array('mL', $volumeSymbols, true) && in_array('L', $volumeSymbols, true), 'Liquid Content offers mL and L from the Volume unit group');
specificationAssert(!in_array('g', $volumeSymbols, true) && !in_array('kg', $volumeSymbols, true), 'Liquid Content excludes weight units');
specificationAssert((int) $pdo->query("SELECT COUNT(*) FROM product_specifications WHERE LOWER(specification_name) = 'volume'")->fetchColumn() === 1, 'Volume remains one shared specification definition');
specificationAssert((int) $pdo->query("SELECT COUNT(*) FROM lookup_values WHERE lookup_type = 'product_package_type' AND LOWER(lookup_label) = 'tetra pack'")->fetchColumn() === 1, 'Tetra Pack exists once in the product container lookup');

$legacyBeverageRowsBefore = (int) $pdo->query("SELECT COUNT(*) FROM grocery_details gd JOIN product p ON p.product_id = gd.product_id WHERE p.type_id = " . $pdo->quote($beverageTypeId))->fetchColumn();
$specificationCountBefore = (int) $pdo->query('SELECT COUNT(*) FROM product_specifications')->fetchColumn();
$unitCountBefore = (int) $pdo->query('SELECT COUNT(*) FROM product_measurement_units')->fetchColumn();

$pdo->beginTransaction();
try {
    $byInternalName = [];
    foreach ($beverageConfiguration as $definition) $byInternalName[$definition['specification_name']] = $definition;
    $mlUnitId = cleanId($pdo->query("SELECT measurement_unit_id FROM product_measurement_units WHERE measurement_group = 'Volume' AND unit_symbol = 'mL' LIMIT 1")->fetchColumn());
    $bottleCountUnitId = cleanId($pdo->query("SELECT measurement_unit_id FROM product_measurement_units WHERE measurement_group = 'Count' AND LOWER(unit_symbol) = 'bottle' LIMIT 1")->fetchColumn());
    $productId = newUuid($pdo);
    $barcode = 'TEST-CHUCKIE-' . substr(str_replace('-', '', $productId), 0, 10);
    $pdo->prepare("INSERT INTO product (product_id, barcode, brand_name, product_name, category_id, type_id, price, pricing_method, status) VALUES (:id, :barcode, 'Nestle', 'Chuckie', :category_id, :type_id, 20, 'manual', 'Active')")
        ->execute([':id' => $productId, ':barcode' => $barcode, ':category_id' => $groceryCategoryId, ':type_id' => $beverageTypeId]);

    $submitted = [
        ['specification_id' => $byInternalName['Flavor']['specification_id'], 'value_text' => 'Chocolate'],
        ['specification_id' => $byInternalName['Volume']['specification_id'], 'value_number' => '110', 'measurement_unit_id' => $mlUnitId],
        ['specification_id' => $byInternalName['Package Type']['specification_id'], 'value_text' => 'Tetra Pack'],
        ['specification_id' => $byInternalName['Inventory Unit']['specification_id'], 'value_text' => 'Bottle'],
        ['specification_id' => $byInternalName['Pack Content']['specification_id'], 'value_number' => '24', 'measurement_unit_id' => $bottleCountUnitId],
    ];
    $normalized = validateAndNormalizeSpecificationValues($pdo, $beverageTypeId, $submitted);
    saveProductSpecificationValues($pdo, $productId, $normalized);

    $reload = $pdo->prepare(
        "SELECT ps.specification_name, COALESCE(pts.display_label, ps.specification_name) AS display_name,
                psv.value_text, psv.value_number, pmu.unit_symbol
         FROM product_specification_values psv
         JOIN product p ON p.product_id = psv.product_id
         JOIN product_specifications ps ON ps.specification_id = psv.specification_id
         JOIN product_type_specifications pts ON pts.type_id = p.type_id AND pts.specification_id = psv.specification_id
         LEFT JOIN product_measurement_units pmu ON pmu.measurement_unit_id = psv.measurement_unit_id
         WHERE psv.product_id = :product_id ORDER BY pts.sort_order"
    );
    $reload->execute([':product_id' => $productId]);
    $savedRows = $reload->fetchAll(PDO::FETCH_ASSOC);
    specificationAssert(array_column($savedRows, 'display_name') === ['Flavor', 'Net Content', 'Package Type', 'Inventory Unit', 'Pack Content'], 'Saved Beverage reloads in Product-Type display order');
    specificationAssert($savedRows[0]['value_text'] === 'Chocolate' && (float) $savedRows[1]['value_number'] === 110.0 && $savedRows[1]['unit_symbol'] === 'mL' && $savedRows[2]['value_text'] === 'Tetra Pack' && $savedRows[3]['value_text'] === 'Bottle' && (float) $savedRows[4]['value_number'] === 24.0 && $savedRows[4]['unit_symbol'] === 'bottle', 'Beverage values save and reload without loss');

    saveProductSpecificationValues($pdo, $productId, validateAndNormalizeSpecificationValues($pdo, $beverageTypeId, $submitted));
    $reload->execute([':product_id' => $productId]);
    specificationAssert(count($reload->fetchAll(PDO::FETCH_ASSOC)) === 5, 'Edit-style resave reloads the same five values without duplicates');

    $supplierId = cleanId($pdo->query('SELECT supplier_id FROM suppliers WHERE archived_at IS NULL LIMIT 1')->fetchColumn());
    $pdo->prepare("INSERT INTO supplier_products (supplier_product_id, supplier_id, product_id, supplier_cost_price, purchase_unit, units_per_purchase_unit) VALUES (:id, :supplier_id, :product_id, 12, 'Carton', 24)")
        ->execute([':id' => newUuid($pdo), ':supplier_id' => $supplierId, ':product_id' => $productId]);
    $packaging = $pdo->prepare("SELECT sp.purchase_unit, sp.units_per_purchase_unit, psv.value_text AS container_type FROM supplier_products sp JOIN product p ON p.product_id=sp.product_id JOIN product_specification_values psv ON psv.product_id=p.product_id JOIN product_specifications ps ON ps.specification_id=psv.specification_id WHERE sp.product_id=:product_id AND ps.specification_name='Package Type'");
    $packaging->execute([':product_id' => $productId]);
    $packagingRow = $packaging->fetch(PDO::FETCH_ASSOC);
    specificationAssert($packagingRow['container_type'] === 'Tetra Pack' && $packagingRow['purchase_unit'] === 'Carton' && (int) $packagingRow['units_per_purchase_unit'] === 24, 'Product container and supplier purchase package remain separate');

    specificationAssert(in_array('Pack Content', array_column(getTypeSpecificationConfiguration($pdo, $beverageTypeId), 'display_name'), true), 'Beverage template includes optional Pack Content');
} finally {
    $pdo->rollBack();
}

specificationAssert((int) $pdo->query('SELECT COUNT(*) FROM product_specifications')->fetchColumn() === $specificationCountBefore, 'No duplicate specification definitions were created');
specificationAssert((int) $pdo->query('SELECT COUNT(*) FROM product_measurement_units')->fetchColumn() === $unitCountBefore, 'No duplicate measurement units were created');
specificationAssert((int) $pdo->query("SELECT COUNT(*) FROM grocery_details gd JOIN product p ON p.product_id = gd.product_id WHERE p.type_id = " . $pdo->quote($beverageTypeId))->fetchColumn() === $legacyBeverageRowsBefore, 'Existing legacy Beverage detail rows remain preserved');

echo "Product specification and packaging checks completed.\n";

?>
