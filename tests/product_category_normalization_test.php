<?php

declare(strict_types=1);

require_once __DIR__ . '/../pharma-api/config/db_connection.php';
require_once __DIR__ . '/../pharma-api/v1/products/product_category_schema.php';

function assertCategoryNormalization(bool $condition, string $message): void
{
    if (!$condition) {
        throw new RuntimeException($message);
    }
}

$expectedNames = ['Grocery', 'Medical Supplies', 'Medicine'];
$categories = getProductCategories($pdo);
$actualNames = array_column($categories, 'category_name');
sort($actualNames);
assertCategoryNormalization($actualNames === $expectedNames, 'Category API must expose exactly the three operational categories.');

$allDatabaseNames = $pdo->query('SELECT category_name FROM product_categories ORDER BY category_name')->fetchAll(PDO::FETCH_COLUMN);
assertCategoryNormalization($allDatabaseNames === $expectedNames, 'Database must contain exactly the three operational categories.');

$categoryIds = array_column($categories, 'category_id', 'category_name');
assertCategoryNormalization(count(array_unique($categoryIds)) === 3, 'Canonical category IDs must be distinct.');

foreach ($categories as $category) {
    $types = getProductTypesByCategory($pdo, (string) $category['category_id']);
    foreach ($types as $type) {
        assertCategoryNormalization(
            (string) $type['category_id'] === (string) $category['category_id'],
            "Product Type {$type['type_name']} leaked into the wrong category response."
        );
    }
}

$invalidTypes = (int) $pdo->query(
    "SELECT COUNT(*) FROM product_types pt LEFT JOIN product_categories pc ON pc.category_id=pt.category_id "
    . "WHERE pc.category_id IS NULL OR pc.category_name NOT IN ('Grocery','Medicine','Medical Supplies')"
)->fetchColumn();
assertCategoryNormalization($invalidTypes === 0, 'Every Product Type must belong to an operational category.');

$invalidProducts = (int) $pdo->query(
    'SELECT COUNT(*) FROM product p LEFT JOIN product_types pt ON pt.type_id=p.type_id '
    . 'WHERE pt.type_id IS NULL OR NOT (p.category_id <=> pt.category_id)'
)->fetchColumn();
assertCategoryNormalization($invalidProducts === 0, 'Every product must agree with its Product Type category.');

$brokenTypeSpecifications = (int) $pdo->query(
    'SELECT COUNT(*) FROM product_type_specifications pts '
    . 'LEFT JOIN product_types pt ON pt.type_id=pts.type_id '
    . 'LEFT JOIN product_specifications ps ON ps.specification_id=pts.specification_id '
    . 'WHERE pt.type_id IS NULL OR ps.specification_id IS NULL'
)->fetchColumn();
assertCategoryNormalization($brokenTypeSpecifications === 0, 'Product Type specification relationships must remain valid.');

$productsJs = file_get_contents(__DIR__ . '/../pharma-frontend/js/modules/products.js');
assertCategoryNormalization(
    str_contains($productsJs, '<td>${escapeHtml(dash(product.type_name))}</td>'),
    'The Product Master Type column must render product.type_name.'
);
assertCategoryNormalization(
    !str_contains($productsJs, '⚙ Customize Categories</option>'),
    'The Add Product category dropdown must not expose non-operational category creation.'
);

echo "Product category normalization test passed.\n";
echo 'Categories: ' . implode(', ', $actualNames) . "\n";
echo 'Products checked: ' . (int) $pdo->query('SELECT COUNT(*) FROM product')->fetchColumn() . "\n";
echo 'Product Types checked: ' . (int) $pdo->query('SELECT COUNT(*) FROM product_types')->fetchColumn() . "\n";
echo 'Type specification links checked: ' . (int) $pdo->query('SELECT COUNT(*) FROM product_type_specifications')->fetchColumn() . "\n";

