<?php

require_once __DIR__ . '/../pharma-api/config/db_connection.php';
require_once __DIR__ . '/../pharma-api/v1/products/product_pricing_schema.php';

function pricingAssert(bool $condition, string $message): void
{
    if (!$condition) {
        throw new RuntimeException($message);
    }
    echo "PASS: {$message}\n";
}

ensureProductPricingSchema($pdo);

foreach ([
    'Medicine' => 5.0,
    'Grocery' => 15.0,
    'Medical Supplies' => 15.0,
] as $categoryName => $expectedMarkup) {
    $statement = $pdo->prepare('SELECT category_id, default_markup_percentage FROM product_categories WHERE LOWER(TRIM(category_name)) = LOWER(TRIM(:category_name)) LIMIT 1');
    $statement->execute([':category_name' => $categoryName]);
    $category = $statement->fetch(PDO::FETCH_ASSOC);
    pricingAssert($category && (float) $category['default_markup_percentage'] === $expectedMarkup, "{$categoryName} default markup is {$expectedMarkup}%");
    pricingAssert(calculatedSellingPrice(100, $expectedMarkup) === round(100 * (1 + ($expectedMarkup / 100)), 2), "{$categoryName} calculates the requested price from a 100.00 unit cost");
}
$medicalSuppliesId = (string) $pdo->query("SELECT category_id FROM product_categories WHERE LOWER(TRIM(category_name)) = 'medical supplies' LIMIT 1")->fetchColumn();
$medicalSuppliesResolution = categoryMarkupResolution($pdo, $medicalSuppliesId);
pricingAssert($medicalSuppliesResolution['markup_percentage'] === 15.0 && $medicalSuppliesResolution['source_label'] === 'Medical Supplies', 'Medical Supplies uses its own 15% category markup');
pricingAssert(calculatedSellingPrice(50, $medicalSuppliesResolution['markup_percentage']) === 57.5, 'Medical Supplies 50.00 cost calculates to 57.50 at 15% markup');
pricingAssert(calculatedSellingPrice(50, 30) === 65.0, 'Custom 30% markup on 50.00 calculates to 65.00');
pricingAssert(calculatedSellingPrice(50, 60) === 80.0, 'PHP 50 cost plus 60% markup equals 80.00');
pricingAssert(round(50 * 100, 2) === 5000.0, 'PHP 50 unit cost times 100 units equals 5,000.00');
pricingAssert(calculatedSellingPrice(55, 60) === 88.0, 'PHP 55 cost plus 60% markup equals 88.00');
pricingAssert(round(55 * 100, 2) === 5500.0, 'PHP 55 unit cost times 100 units equals 5,500.00');

$candidate = $pdo->query(
    "SELECT p.product_id, p.category_id, sp.supplier_id
     FROM product p
     INNER JOIN supplier_products sp ON sp.product_id = p.product_id
     WHERE p.status = 'Active'
     LIMIT 1"
)->fetch(PDO::FETCH_ASSOC);
pricingAssert((bool) $candidate, 'An active supplier-assigned product is available for transactional testing');

$historyBefore = [
    'po_count' => (int) $pdo->query('SELECT COUNT(*) FROM purchase_order_items')->fetchColumn(),
    'po_sum' => (float) $pdo->query('SELECT COALESCE(SUM(unit_price_snapshot), 0) FROM purchase_order_items')->fetchColumn(),
    'sale_count' => (int) $pdo->query('SELECT COUNT(*) FROM sales_order_items')->fetchColumn(),
    'sale_sum' => (float) $pdo->query('SELECT COALESCE(SUM(unit_price), 0) FROM sales_order_items')->fetchColumn(),
];

$pdo->beginTransaction();
try {
    $originalProductPrice = (float) $pdo->query("SELECT price FROM product WHERE product_id = " . $pdo->quote($candidate['product_id']))->fetchColumn();
    $pdo->prepare('UPDATE supplier_products SET supplier_cost_price = 55 WHERE product_id = :product_id AND supplier_id = :supplier_id')
        ->execute([':product_id' => $candidate['product_id'], ':supplier_id' => $candidate['supplier_id']]);
    $priceAfterQuotation = (float) $pdo->query("SELECT price FROM product WHERE product_id = " . $pdo->quote($candidate['product_id']))->fetchColumn();
    $poSumAfterQuotation = (float) $pdo->query('SELECT COALESCE(SUM(unit_price_snapshot), 0) FROM purchase_order_items')->fetchColumn();
    pricingAssert($priceAfterQuotation === $originalProductPrice, 'Editing a supplier quotation does not change the active selling price');
    pricingAssert($poSumAfterQuotation === $historyBefore['po_sum'], 'Editing a supplier quotation does not change existing PO snapshots');

    $alternateSupplier = $pdo->prepare('SELECT supplier_id FROM suppliers WHERE supplier_id <> :supplier_id AND archived_at IS NULL LIMIT 1');
    $alternateSupplier->execute([':supplier_id' => $candidate['supplier_id']]);
    $alternateSupplierId = cleanId($alternateSupplier->fetchColumn());
    pricingAssert($alternateSupplierId !== '', 'A second supplier is available for multiple-supplier testing');
    $pdo->prepare("INSERT INTO supplier_products (supplier_product_id, supplier_id, product_id, supplier_cost_price, purchase_unit, units_per_purchase_unit) VALUES (:id, :supplier_id, :product_id, 1, 'Box', 100) ON DUPLICATE KEY UPDATE supplier_cost_price = 1")
        ->execute([':id' => newUuid($pdo), ':supplier_id' => $alternateSupplierId, ':product_id' => $candidate['product_id']]);

    $pdo->prepare("UPDATE product_categories SET default_markup_percentage = 60, pricing_behavior = 'automatic' WHERE category_id = :category_id")
        ->execute([':category_id' => $candidate['category_id']]);
    $pdo->prepare("UPDATE product SET price = 10, pricing_method = 'category_markup', custom_markup_percentage = NULL WHERE product_id = :product_id")
        ->execute([':product_id' => $candidate['product_id']]);
    $batchId = newUuid($pdo);
    $pdo->prepare(
        "INSERT INTO inventory_batches
            (batch_id, product_id, supplier_id, received_date, received_qty, storage_qty, shelf_qty, damaged_qty, returned_qty, unit_cost, batch_status)
         VALUES (:batch_id, :product_id, :supplier_id, '2099-01-01 00:00:00', 1, 1, 0, 0, 0, 55, 'active')"
    )->execute([
        ':batch_id' => $batchId,
        ':product_id' => $candidate['product_id'],
        ':supplier_id' => $candidate['supplier_id'],
    ]);

    $basis = latestAcceptedCostBasis($pdo, $candidate['product_id']);
    pricingAssert($basis !== null && $basis['unit_cost'] === 55.0, 'Latest accepted delivery is the actual 55.00 cost basis');
    pricingAssert($basis['supplier_id'] === $candidate['supplier_id'], 'Latest accepted supplier remains the pricing source instead of the cheaper quotation');
    applyAcceptedDeliveryPricing($pdo, $candidate['product_id'], $basis);
    $automaticPrice = (float) $pdo->query("SELECT price FROM product WHERE product_id = " . $pdo->quote($candidate['product_id']))->fetchColumn();
    pricingAssert($automaticPrice === 88.0, 'Automatic receiving trigger updates active selling price to 88.00');

    $pdo->prepare("UPDATE product_categories SET pricing_behavior = 'review_required' WHERE category_id = :category_id")
        ->execute([':category_id' => $candidate['category_id']]);
    $pdo->prepare('UPDATE product SET price = 80 WHERE product_id = :product_id')->execute([':product_id' => $candidate['product_id']]);
    $review = applyAcceptedDeliveryPricing($pdo, $candidate['product_id'], $basis);
    $reviewPrice = (float) $pdo->query("SELECT price FROM product WHERE product_id = " . $pdo->quote($candidate['product_id']))->fetchColumn();
    pricingAssert($reviewPrice === 80.0 && $review['price_status'] === 'Pending update', 'Review-required pricing preserves active price and exposes recommendation');

    $pdo->prepare("UPDATE product SET pricing_method = 'manual' WHERE product_id = :product_id")->execute([':product_id' => $candidate['product_id']]);
    $pdo->prepare("UPDATE product_categories SET default_markup_percentage = 20 WHERE category_id = :category_id")->execute([':category_id' => $candidate['category_id']]);
    $manualSnapshot = applyAcceptedDeliveryPricing($pdo, $candidate['product_id'], $basis);
    $manualPrice = (float) $pdo->query("SELECT price FROM product WHERE product_id = " . $pdo->quote($candidate['product_id']))->fetchColumn();
    pricingAssert($manualPrice === 80.0 && $manualSnapshot['pricing_method'] === 'manual', 'Manual 80.00 price remains unchanged after category markup changes');
    $impact = categoryPricingImpact($pdo, $candidate['category_id'], 75);
    $testedImpact = array_values(array_filter($impact, static fn($row) => $row['product_id'] === $candidate['product_id']))[0] ?? null;
    pricingAssert($testedImpact && !$testedImpact['eligible_for_apply'], 'Manual pricing is excluded from category price application');

    $selectedPreview = selectedCategoryPricingPreview($pdo, [$candidate['product_id']]);
    pricingAssert(count($selectedPreview) === 1 && $selectedPreview[0]['existing_pricing_method'] === 'manual' && !$selectedPreview[0]['eligible_for_apply'], 'Selected-product preview blocks a batch without accepted PO unit conversion');
    try {
        applyCategoryMarkupToSelectedProducts($pdo, [$candidate['product_id']]);
        throw new RuntimeException('Unverified batch cost was applied.');
    } catch (InvalidArgumentException $expected) {
        pricingAssert(true, 'Unverified batch cost is rejected before applying category markup');
    }
    $selectedProduct = $pdo->query("SELECT price, pricing_method FROM product WHERE product_id = " . $pdo->quote($candidate['product_id']))->fetch(PDO::FETCH_ASSOC);
    pricingAssert($selectedProduct['pricing_method'] === 'manual' && (float) $selectedProduct['price'] === 80.0, 'Unverified batch leaves the manual price unchanged');
} finally {
    $pdo->rollBack();
}

$historyAfter = [
    'po_count' => (int) $pdo->query('SELECT COUNT(*) FROM purchase_order_items')->fetchColumn(),
    'po_sum' => (float) $pdo->query('SELECT COALESCE(SUM(unit_price_snapshot), 0) FROM purchase_order_items')->fetchColumn(),
    'sale_count' => (int) $pdo->query('SELECT COUNT(*) FROM sales_order_items')->fetchColumn(),
    'sale_sum' => (float) $pdo->query('SELECT COALESCE(SUM(unit_price), 0) FROM sales_order_items')->fetchColumn(),
];
pricingAssert($historyBefore === $historyAfter, 'Historical PO and completed-sale price snapshots remain unchanged');

echo "Pricing workflow checks completed.\n";

?>
