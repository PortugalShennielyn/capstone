<?php
declare(strict_types=1);

require_once __DIR__ . '/../pharma-api/config/db_connection.php';
require_once __DIR__ . '/../pharma-api/v1/products/product_customization_schema.php';

function configAssert(bool $condition, string $message): void
{
    if (!$condition) throw new RuntimeException($message);
}

ensureProductCustomizationSchema($pdo);

$statement = $pdo->prepare(
    "SELECT ps.specification_name, ps.measurement_group
     FROM product_types pt
     INNER JOIN product_categories pc ON pc.category_id=pt.category_id
     INNER JOIN product_type_specifications pts ON pts.type_id=pt.type_id
     INNER JOIN product_specifications ps ON ps.specification_id=pts.specification_id
     WHERE pc.category_name=:category AND pt.type_name=:type AND pt.is_active=1
     ORDER BY pts.sort_order"
);
$configuration = static function (string $category, string $type) use ($statement): array {
    $statement->execute([':category' => $category, ':type' => $type]);
    return $statement->fetchAll(PDO::FETCH_ASSOC);
};
$names = static fn(array $rows): array => array_column($rows, 'specification_name');

foreach (['Tablet', 'Capsule'] as $type) {
    $fields = $names($configuration('Medicine', $type));
    configAssert(in_array('Strength', $fields, true) && in_array('Package Type', $fields, true), "{$type} is missing simple medicine fields.");
    configAssert(!in_array('Strength Denominator', $fields, true) && !in_array('Volume', $fields, true), "{$type} incorrectly uses liquid concentration fields.");
}
foreach (['Powder for Suspension', 'Syrup', 'Injection'] as $type) {
    $fields = $names($configuration('Medicine', $type));
    configAssert(count(array_intersect(['Strength', 'Strength Denominator', 'Volume', 'Package Type'], $fields)) === 4, "{$type} is missing concentration fields.");
}
$cream = $configuration('Medicine', 'Cream');
configAssert(in_array('Strength Denominator Weight', $names($cream), true) && in_array('Net Weight', $names($cream), true), 'Cream does not support mg/g and gram net content.');

foreach (['Beverage', 'Canned Goods', 'Snacks'] as $type) {
    $fields = $names($configuration('Grocery', $type));
    configAssert(!in_array('Strength', $fields, true) && !in_array('Medicine Classification', $fields, true), "Grocery {$type} contains medicine fields.");
    configAssert(in_array('Package Type', $fields, true), "Grocery {$type} is missing Package / Container.");
}
foreach (['Device/Equipment', 'First Aid Supply', 'Face Mask'] as $type) {
    $fields = $names($configuration('Medical Supplies', $type));
    configAssert(!in_array('Strength', $fields, true) && !in_array('Medicine Classification', $fields, true), "Medical Supply {$type} contains medicine fields.");
    configAssert(in_array('Package Type', $fields, true), "Medical Supply {$type} is missing Package / Container.");
}

$wrongMedicineCount = (int) $pdo->query(
    "SELECT COUNT(*) FROM product_types pt
     INNER JOIN product_categories pc ON pc.category_id=pt.category_id
     WHERE pc.category_name='Medicine' AND pt.is_active=1
       AND pt.type_name IN ('Device/Equipment','First Aid','Medical Supply','Medicine','Nebulizer')"
)->fetchColumn();
configAssert($wrongMedicineCount === 0, 'Wrong-category Product Types remain active under Medicine.');

echo "Product Type category/configuration tests passed.\n";
?>
