<?php

require_once __DIR__ . '/../pharma-api/config/db_connection.php';
require_once __DIR__ . '/../pharma-api/v1/products/product_customization_schema.php';
require_once __DIR__ . '/../pharma-api/v1/products/product_pricing_schema.php';

function productMasterAssert(bool $condition, string $message): void
{
    if (!$condition) throw new RuntimeException($message);
    echo "PASS: {$message}\n";
}

ensureProductCustomizationSchema($pdo);

$normalizedTypeDuplicates = (int) $pdo->query(
    "SELECT COUNT(*) FROM (
        SELECT category_id, LOWER(TRIM(type_name)) AS normalized_name
        FROM product_types GROUP BY category_id, LOWER(TRIM(type_name)) HAVING COUNT(*) > 1
     ) duplicate_types"
)->fetchColumn();
$normalizedSpecificationDuplicates = (int) $pdo->query(
    "SELECT COUNT(*) FROM (
        SELECT LOWER(TRIM(specification_name)) AS normalized_name
        FROM product_specifications GROUP BY LOWER(TRIM(specification_name)) HAVING COUNT(*) > 1
     ) duplicate_specifications"
)->fetchColumn();
$normalizedChoiceDuplicates = (int) $pdo->query(
    "SELECT COUNT(*) FROM (
        SELECT specification_id, LOWER(TRIM(choice_value)) AS normalized_value
        FROM product_specification_choices GROUP BY specification_id, LOWER(TRIM(choice_value)) HAVING COUNT(*) > 1
     ) duplicate_choices"
)->fetchColumn();
productMasterAssert($normalizedTypeDuplicates === 0, 'Product Types are unique per Category after normalization');
productMasterAssert($normalizedSpecificationDuplicates === 0, 'Specification definitions are normalized without duplicates');
productMasterAssert($normalizedChoiceDuplicates === 0, 'Selection choices are normalized without duplicates');
productMasterAssert(normalizeSpecificationChoices([' Bottle ', 'bottle', 'CAN', 'Can', '']) === ['Bottle', 'CAN'], 'Choice saving trims and deduplicates case-insensitively');
productMasterAssert((int) $pdo->query('SELECT COUNT(*) FROM product_types pt LEFT JOIN product_type_specifications pts ON pts.type_id = pt.type_id WHERE pts.type_id IS NULL')->fetchColumn() === 0, 'Every existing Product Type has a reusable database template');

$groceryCategoryId = cleanId($pdo->query("SELECT category_id FROM product_categories WHERE LOWER(TRIM(category_name)) = 'grocery' LIMIT 1")->fetchColumn());
$beverageType = findProductTypeByNormalizedName($pdo, $groceryCategoryId, '  BEVERAGE  ');
productMasterAssert($beverageType && strcasecmp($beverageType['type_name'], 'Beverage') === 0, 'Case-insensitive trimmed Product Type lookup reuses Beverage');

$pdo->beginTransaction();
try {
    $newTypeId = newUuid($pdo);
    $pdo->prepare("INSERT INTO product_types (type_id, category_id, type_name) VALUES (:type_id, :category_id, 'Energy Drink')")
        ->execute([':type_id' => $newTypeId, ':category_id' => $groceryCategoryId]);
    productMasterAssert(assignSuggestedProductTypeTemplate($pdo, $newTypeId), 'A brand-new Product Type receives a one-time category suggestion');
    $newTypeLabels = array_column(getTypeSpecificationConfiguration($pdo, $newTypeId), 'display_name');
    productMasterAssert($newTypeLabels === ['Net Content', 'Package Type', 'Inventory Unit', 'Pack Content'], 'New Grocery Product Type suggestion is compact and category-appropriate');

    $cocaProductId = cleanId($pdo->query("SELECT product_id FROM product WHERE barcode = '4801981112005' LIMIT 1")->fetchColumn());
    $cocaTypeId = cleanId($pdo->query("SELECT type_id FROM product WHERE product_id = " . $pdo->quote($cocaProductId))->fetchColumn());
    $cocaDefinitions = [];
    foreach (getTypeSpecificationConfiguration($pdo, $cocaTypeId) as $definition) $cocaDefinitions[$definition['specification_name']] = $definition;
    $literUnitId = cleanId($pdo->query("SELECT measurement_unit_id FROM product_measurement_units WHERE measurement_group = 'Volume' AND unit_symbol = 'L' LIMIT 1")->fetchColumn());
    $cocaValues = validateAndNormalizeSpecificationValues($pdo, $cocaTypeId, [
        ['specification_id' => $cocaDefinitions['Flavor']['specification_id'], 'value_text' => 'Original Taste'],
        ['specification_id' => $cocaDefinitions['Volume']['specification_id'], 'value_number' => '2', 'measurement_unit_id' => $literUnitId],
        ['specification_id' => $cocaDefinitions['Package Type']['specification_id'], 'value_text' => 'Bottle'],
        ['specification_id' => $cocaDefinitions['Inventory Unit']['specification_id'], 'value_text' => 'Bottle'],
    ]);
    saveProductSpecificationValues($pdo, $cocaProductId, $cocaValues);
    $cocaReload = $pdo->prepare("SELECT ps.specification_name, psv.value_text, psv.value_number, pmu.unit_symbol FROM product_specification_values psv INNER JOIN product_specifications ps ON ps.specification_id=psv.specification_id LEFT JOIN product_measurement_units pmu ON pmu.measurement_unit_id=psv.measurement_unit_id WHERE psv.product_id=:product_id");
    $cocaReload->execute([':product_id' => $cocaProductId]);
    $cocaRows = [];
    foreach ($cocaReload->fetchAll(PDO::FETCH_ASSOC) as $row) $cocaRows[$row['specification_name']] = $row;
    productMasterAssert($cocaRows['Flavor']['value_text'] === 'Original Taste' && (float) $cocaRows['Volume']['value_number'] === 2.0 && $cocaRows['Volume']['unit_symbol'] === 'L' && $cocaRows['Package Type']['value_text'] === 'Bottle' && $cocaRows['Inventory Unit']['value_text'] === 'Bottle', 'Coca-Cola Beverage values save and reload as Original Taste, 2 L, and Bottle');
    $pricing = productPricingSnapshot($pdo, $cocaProductId);
    productMasterAssert(strcasecmp($pricing['inventory_unit'], 'Bottle') === 0, 'Cost Basis and Selling Price use the configured Inventory Unit');
} finally {
    $pdo->rollBack();
}

echo "Product Master specification template checks completed.\n";

?>
