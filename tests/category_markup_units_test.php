<?php
require_once __DIR__ . '/../pharma-api/config/db_connection.php';
require_once __DIR__ . '/../pharma-api/v1/products/product_pricing_schema.php';
require_once __DIR__ . '/../pharma-api/v1/products/product_selling_options.php';

function markupUnitAssert(bool $condition, string $message): void
{
    if (!$condition) {
        throw new RuntimeException($message);
    }
    echo "PASS: {$message}\n";
}

function markupUnitCandidateIds(PDO $pdo, string $categoryName): array
{
    $statement = $pdo->prepare(
        "SELECT p.product_id
         FROM product p
         INNER JOIN product_categories c ON c.category_id = p.category_id
         WHERE p.status = 'Active' AND c.category_name = :category_name
           AND EXISTS (
               SELECT 1 FROM inventory_batches ib
               WHERE ib.product_id = p.product_id
                 AND ib.unit_cost > 0
                 AND (ib.received_qty - ib.damaged_qty - ib.returned_qty) > 0
           )
         ORDER BY p.product_name
         LIMIT 25"
    );
    $statement->execute([':category_name' => $categoryName]);
    return $statement->fetchAll(PDO::FETCH_COLUMN);
}

$convertedUnitChecked = false;
$syncedProduct = null;

foreach (['Medicine', 'Grocery'] as $categoryName) {
    $ids = markupUnitCandidateIds($pdo, $categoryName);
    markupUnitAssert($ids !== [], "{$categoryName} has an active product with an accepted unit cost");
    $preview = selectedCategoryPricingPreview($pdo, $ids);
    $priced = null;
    foreach ($preview as $row) {
        if (($row['current_cost_basis'] ?? null) === null || empty($row['sellable_units'])) {
            continue;
        }
        $priced = $row;
        if (!empty(array_filter($row['sellable_units'], static fn(array $unit): bool => (int) $unit['base_quantity'] > 1))) {
            break;
        }
    }
    markupUnitAssert($priced !== null, "{$categoryName} preview includes a converted sellable unit");
    $markup = (float) $priced['applied_markup_percentage'];
    $baseCost = (float) $priced['current_cost_basis'];
    foreach ($priced['sellable_units'] as $unit) {
        $expectedCost = round($baseCost * (int) $unit['base_quantity'], 2);
        $expectedPrice = calculatedSellingPrice($expectedCost, $markup);
        markupUnitAssert(
            abs((float) $unit['unit_cost'] - $expectedCost) < 0.001 && abs((float) $unit['new_price'] - $expectedPrice) < 0.001,
            "{$categoryName} {$unit['sellable_unit']} price uses converted unit cost"
        );
        if ((int) $unit['base_quantity'] > 1) {
            $convertedUnitChecked = true;
        }
    }
    if ($categoryName === 'Medicine') {
        markupUnitAssert(
            ($priced['review_note'] ?? '') === 'No verified medicine price ceiling on file. Review this price manually.',
            'Medicine without a verified ceiling is flagged for manual review'
        );
    }
    if ($syncedProduct === null && !empty($priced['eligible_for_apply'])) {
        $syncedProduct = $priced;
    }
}

markupUnitAssert($convertedUnitChecked, 'At least one sellable unit uses a conversion above one base unit');

$medicalIds = $pdo->query(
    "SELECT p.product_id
     FROM product p
     INNER JOIN product_categories c ON c.category_id = p.category_id
     WHERE c.category_name = 'Medical Supplies' AND p.status = 'Active'"
)->fetchAll(PDO::FETCH_COLUMN);
markupUnitAssert($medicalIds !== [], 'Medical Supplies has active products');
foreach (selectedCategoryPricingPreview($pdo, $medicalIds) as $row) {
    markupUnitAssert(
        empty($row['eligible_for_apply']) && str_contains((string) $row['eligibility_status'], 'accepted'),
        'Medical Supplies product without an accepted unit cost is excluded and identified'
    );
}
$medicalLines = categoryMarkupSellableUnitLines($pdo, (string) $medicalIds[0], 20.0, 15.0, 'piece', 5.0);
markupUnitAssert($medicalLines !== [], 'Medical Supplies can price a configured sellable unit');
foreach ($medicalLines as $unit) {
    $expectedCost = round(20 * (int) $unit['base_quantity'], 2);
    markupUnitAssert(
        abs((float) $unit['unit_cost'] - $expectedCost) < 0.001
        && abs((float) $unit['new_price'] - calculatedSellingPrice($expectedCost, 15.0)) < 0.001,
        "Medical Supplies {$unit['sellable_unit']} uses the 15% category formula"
    );
}

$missingId = $pdo->query(
    "SELECT p.product_id
     FROM product p
     WHERE p.status = 'Active'
       AND NOT EXISTS (
           SELECT 1 FROM inventory_batches ib
           WHERE ib.product_id = p.product_id
             AND (ib.received_qty - ib.damaged_qty - ib.returned_qty) > 0
       )
     LIMIT 1"
)->fetchColumn();
markupUnitAssert((bool) $missingId, 'A product without an accepted delivery exists for the exclusion check');
$missingPreview = selectedCategoryPricingPreview($pdo, [(string) $missingId]);
markupUnitAssert(
    count($missingPreview) === 1 && empty($missingPreview[0]['eligible_for_apply']) && str_contains((string) $missingPreview[0]['eligibility_status'], 'accepted'),
    'Products without an accepted unit cost are excluded and identified'
);

try {
    normalizeMarkupPercentage(-5);
    throw new RuntimeException('Negative markup was accepted.');
} catch (InvalidArgumentException $expected) {
    markupUnitAssert(true, 'Negative markup percentages are rejected');
}

markupUnitAssert($syncedProduct !== null, 'An eligible product is available for POS price synchronization');

$pdo->beginTransaction();
try {
    $productId = (string) $syncedProduct['product_id'];
    $beforePrice = (float) $pdo->query('SELECT price FROM product WHERE product_id = ' . $pdo->quote($productId))->fetchColumn();
    $category = $pdo->query('SELECT c.category_id, c.default_markup_percentage FROM product p INNER JOIN product_categories c ON c.category_id = p.category_id WHERE p.product_id = ' . $pdo->quote($productId))->fetch(PDO::FETCH_ASSOC);
    $pdo->prepare('UPDATE product_categories SET default_markup_percentage = :markup WHERE category_id = :category_id')
        ->execute([':markup' => round((float) $category['default_markup_percentage'] + 1, 2), ':category_id' => $category['category_id']]);
    $unchanged = (float) $pdo->query('SELECT price FROM product WHERE product_id = ' . $pdo->quote($productId))->fetchColumn();
    markupUnitAssert($unchanged === $beforePrice, 'Saving a category markup percentage leaves the current selling price unchanged');
    $pdo->prepare('UPDATE product_categories SET default_markup_percentage = :markup WHERE category_id = :category_id')
        ->execute([':markup' => $category['default_markup_percentage'], ':category_id' => $category['category_id']]);

    $result = applyCategoryMarkupToSelectedProducts(
        $pdo,
        [$productId],
        true,
        [$productId => $syncedProduct['preview_token']],
        true,
        false
    );
    markupUnitAssert(($result['applied_products'] ?? 0) === 1, 'Confirmed category markup updates the selected product');

    $savedPrice = (float) $pdo->query('SELECT price FROM product WHERE product_id = ' . $pdo->quote($productId))->fetchColumn();
    markupUnitAssert(abs($savedPrice - (float) $syncedProduct['calculated_selling_price']) < 0.001, 'Product master price matches the base-unit category price');

    $options = $pdo->prepare('SELECT selling_option_id, base_quantity, selling_price, pos_enabled, is_default FROM product_selling_options WHERE product_id = :product_id AND is_active = 1');
    $options->execute([':product_id' => $productId]);
    $savedOptions = $options->fetchAll(PDO::FETCH_ASSOC);
    foreach ($syncedProduct['sellable_units'] as $unit) {
        if ($unit['selling_option_id'] === '') {
            continue;
        }
        $saved = null;
        foreach ($savedOptions as $option) {
            if ((string) $option['selling_option_id'] === (string) $unit['selling_option_id']) {
                $saved = $option;
                break;
            }
        }
        markupUnitAssert($saved !== null, 'Configured sellable unit remains after pricing');
        $expected = (int) $unit['base_quantity'] === 1 ? (float) $syncedProduct['calculated_selling_price'] : (float) $unit['new_price'];
        markupUnitAssert(abs((float) $saved['selling_price'] - $expected) < 0.001, 'Sellable unit price is saved on the existing selling option');
    }

    $defaultOption = productDefaultSellingOption($pdo, $productId);
    markupUnitAssert($defaultOption !== null, 'POS default selling option is available');
    $defaultExpected = null;
    foreach ($syncedProduct['sellable_units'] as $unit) {
        if ((string) $unit['selling_option_id'] === (string) $defaultOption['selling_option_id']) {
            $defaultExpected = (int) $unit['base_quantity'] === 1 ? (float) $syncedProduct['calculated_selling_price'] : (float) $unit['new_price'];
        }
    }
    markupUnitAssert($defaultExpected !== null && abs((float) $defaultOption['selling_price'] - $defaultExpected) < 0.001, 'Salesclerk and cashier POS read the updated default selling price');

    $shelfPrice = $pdo->prepare('SELECT MIN(selling_price) FROM product_selling_options WHERE product_id = :product_id AND is_active = 1 AND pos_enabled = 1');
    $shelfPrice->execute([':product_id' => $productId]);
    $shelfValue = $shelfPrice->fetchColumn();
    $expectedShelf = null;
    foreach ($savedOptions as $option) {
        if ((int) $option['pos_enabled'] !== 1) {
            continue;
        }
        $price = (float) $option['selling_price'];
        $expectedShelf = $expectedShelf === null ? $price : min($expectedShelf, $price);
    }
    markupUnitAssert($expectedShelf === null || ($shelfValue !== false && abs((float) $shelfValue - $expectedShelf) < 0.001), 'Shelf Inventory reads the updated POS selling price');

    $second = selectedCategoryPricingPreview($pdo, [$productId]);
    markupUnitAssert(empty($second[0]['eligible_for_apply']), 'Applying the same category markup again is not eligible');
} finally {
    $pdo->rollBack();
}

echo "Category markup unit checks completed.\n";
