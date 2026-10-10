<?php
declare(strict_types=1);

require_once __DIR__ . '/../pharma-api/config/db_connection.php';
require_once __DIR__ . '/../pharma-api/v1/products/product_pricing_schema.php';

function pricingSafetyAssert(bool $condition, string $message): void
{
    if (!$condition) throw new RuntimeException($message);
}

$validBasis = [
    'unit_cost' => 10, 'accepted_inventory_unit' => 'tablet', 'accepted_purchase_unit' => 'box',
    'accepted_conversion' => 10, 'accepted_purchase_qty' => 2, 'accepted_inventory_qty' => 20,
    'selling_base_quantity' => 1,
];
pricingSafetyAssert(selectedPricingCostError($validBasis, 'tablet') === null, 'Valid accepted conversion was blocked.');
pricingSafetyAssert(selectedPricingCostError([], 'tablet') !== null, 'Missing accepted cost was allowed.');
pricingSafetyAssert(selectedPricingCostError([...$validBasis, 'unit_cost' => 0], 'tablet') !== null, 'Zero accepted cost was allowed.');
pricingSafetyAssert(selectedPricingCostError([...$validBasis, 'accepted_inventory_unit' => 'bottle'], 'tablet') !== null, 'Mismatched selling unit was allowed.');
pricingSafetyAssert(selectedPricingCostError([...$validBasis, 'accepted_purchase_unit' => 'tablet'], 'tablet') !== null, 'Mismatched purchase conversion was allowed.');
pricingSafetyAssert(selectedPricingCostError([...$validBasis, 'accepted_conversion' => 0], 'tablet') !== null, 'Zero conversion was allowed.');
pricingSafetyAssert(selectedPricingCostError([...$validBasis, 'accepted_inventory_qty' => 19], 'tablet') !== null, 'Incorrect converted quantity was allowed.');
pricingSafetyAssert(selectedPricingChangeWarning(100, 70) !== null, 'A 30% decrease was not flagged.');
pricingSafetyAssert(selectedPricingChangeWarning(100, 130) !== null, 'A 30% increase was not flagged.');
pricingSafetyAssert(selectedPricingChangeWarning(100, 105) === null, 'A normal price change was flagged.');

$missingCostId = $pdo->query(
    'SELECT p.product_id FROM product p WHERE NOT EXISTS
     (SELECT 1 FROM inventory_batches ib WHERE ib.product_id = p.product_id AND ib.unit_cost > 0) LIMIT 1'
)->fetchColumn();
pricingSafetyAssert((bool)$missingCostId, 'A missing-cost product fixture is required.');
$missingCostPreview = selectedCategoryPricingPreview($pdo, [$missingCostId])[0];
pricingSafetyAssert(!$missingCostPreview['eligible_for_apply'] && $missingCostPreview['calculated_selling_price'] === null,
    'Missing-cost product was offered for markup.');

$ids = $pdo->query('SELECT DISTINCT product_id FROM inventory_batches WHERE unit_cost > 0')->fetchAll(PDO::FETCH_COLUMN);
$preview = $ids ? selectedCategoryPricingPreview($pdo, $ids) : [];
$priced = array_values(array_filter($preview, static fn($row) => $row['calculated_selling_price'] !== null && !empty($row['sellable_units'])));
pricingSafetyAssert(count($priced) >= 2, 'Two products with accepted unit costs are required.');

$pdo->beginTransaction();
try {
    $preparePrice = $pdo->prepare("UPDATE product SET pricing_method = 'category_markup', custom_markup_percentage = NULL, price = :price WHERE product_id = :id");
    $preparePrice->execute([
        ':price' => round((float) $priced[0]['calculated_selling_price'] * 1.1, 2),
        ':id' => $priced[0]['product_id'],
    ]);
    $preparePrice->execute([
        ':price' => round((float) $priced[1]['calculated_selling_price'] * 2, 2),
        ':id' => $priced[1]['product_id'],
    ]);
    $fresh = selectedCategoryPricingPreview($pdo, [$priced[0]['product_id'], $priced[1]['product_id']]);
    $normal = current(array_filter($fresh, static fn($row) => $row['product_id'] === $priced[0]['product_id']));
    $flagged = current(array_filter($fresh, static fn($row) => $row['product_id'] === $priced[1]['product_id']));
    pricingSafetyAssert($normal && $normal['eligible_for_apply'] && !$normal['warning'], 'Prepared normal category price is eligible.');
    pricingSafetyAssert($flagged && $flagged['eligible_for_apply'] && $flagged['warning'], 'Prepared 50% price change is flagged.');

    $normalId = $normal['product_id'];
    $normalResult = applyCategoryMarkupToSelectedProducts($pdo, [$normalId], false, [$normalId => $normal['preview_token']]);
    pricingSafetyAssert($normalResult['applied_products'] === 1, 'Normal category markup was not applied.');
    $normalPrice = (float)$pdo->query('SELECT price FROM product WHERE product_id = ' . $pdo->quote($normalId))->fetchColumn();
    pricingSafetyAssert(abs($normalPrice - $normal['calculated_selling_price']) < 0.005, 'Normal markup did not use accepted unit cost.');
    $pos = $pdo->prepare('SELECT selling_price FROM product_selling_options WHERE product_id = :id AND is_active = 1 AND base_quantity = 1 LIMIT 1');
    $pos->execute([':id' => $normalId]);
    pricingSafetyAssert(abs((float)$pos->fetchColumn() - $normalPrice) < 0.005, 'Approved base price did not reach POS selling options.');

    $flaggedId = $flagged['product_id'];
    try {
        applyCategoryMarkupToSelectedProducts($pdo, [$flaggedId], false, [$flaggedId => $flagged['preview_token']], true);
        throw new RuntimeException('Flagged price was applied without Admin confirmation.');
    } catch (InvalidArgumentException $expected) {
        pricingSafetyAssert(str_contains($expected->getMessage(), 'Admin'), 'Flagged price failed for the wrong reason.');
    }
    try {
        applyCategoryMarkupToSelectedProducts($pdo, [$flaggedId], true, [$flaggedId => $flagged['preview_token']], false);
        throw new RuntimeException('A non-Admin applied a flagged price.');
    } catch (InvalidArgumentException $expected) {
        pricingSafetyAssert(str_contains($expected->getMessage(), 'Admin'), 'Non-Admin rejection failed for the wrong reason.');
    }
    $flaggedResult = applyCategoryMarkupToSelectedProducts($pdo, [$flaggedId], true, [$flaggedId => $flagged['preview_token']], true);
    pricingSafetyAssert($flaggedResult['applied_products'] === 1, 'Admin-confirmed flagged price was not applied.');
    $pdo->prepare('UPDATE product SET price = :price WHERE product_id = :id')->execute([
        ':price' => $normalPrice + 1, ':id' => $normalId
    ]);
    try {
        applyCategoryMarkupToSelectedProducts($pdo, [$normalId], false, [$normalId => $normal['preview_token']]);
        throw new RuntimeException('Stale preview was applied.');
    } catch (InvalidArgumentException $expected) {
        pricingSafetyAssert(str_contains($expected->getMessage(), 'Preview'), 'Stale preview failed for the wrong reason.');
    }
} finally {
    $pdo->rollBack();
}

echo "selected category pricing safety test passed\n";
