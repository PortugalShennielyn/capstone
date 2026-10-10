<?php
require_once __DIR__ . '/../pharma-api/config/db_connection.php';
require_once __DIR__ . '/../pharma-api/v1/products/product_pricing_schema.php';

function pricingSelectionAssert(bool $condition, string $message): void
{
    if (!$condition) throw new RuntimeException($message);
    echo "PASS: {$message}\n";
}

function pricingSelectionSnapshot(PDO $pdo, string $productId): array
{
    $product = $pdo->query(
        'SELECT brand_name, product_name, price, pricing_method FROM product WHERE product_id = ' . $pdo->quote($productId)
    )->fetch(PDO::FETCH_ASSOC);
    $specs = $pdo->prepare('SELECT specification_id, value_text, value_number FROM product_specification_values WHERE product_id = :product_id ORDER BY specification_id');
    $specs->execute([':product_id' => $productId]);
    return ['product' => $product, 'specs' => $specs->fetchAll(PDO::FETCH_ASSOC)];
}

$medical = $pdo->query(
    "SELECT p.product_id, p.brand_name, p.product_name
     FROM product p
     INNER JOIN product_categories c ON c.category_id = p.category_id
     WHERE c.category_name = 'Medical Supplies' AND p.status = 'Active'
     ORDER BY p.product_name
     LIMIT 1"
)->fetch(PDO::FETCH_ASSOC);
pricingSelectionAssert((bool) $medical, 'A Medical Supplies product is available');
$medicalPreview = selectedCategoryPricingPreview($pdo, [$medical['product_id']])[0];
pricingSelectionAssert(
    empty($medicalPreview['eligible_for_apply']) && str_contains((string) $medicalPreview['eligibility_status'], 'accepted'),
    'Medical Supplies product without an accepted cost is not actionable'
);

$candidateIds = $pdo->query(
    "SELECT DISTINCT product_id FROM inventory_batches WHERE unit_cost > 0"
)->fetchAll(PDO::FETCH_COLUMN);
$pricedPreview = null;
foreach (selectedCategoryPricingPreview($pdo, $candidateIds) as $row) {
    if ($row['calculated_selling_price'] !== null && !empty($row['sellable_units'])) {
        $pricedPreview = $row;
        break;
    }
}
pricingSelectionAssert($pricedPreview !== null, 'A product with an accepted unit cost is available');
$pricedId = (string) $pricedPreview['product_id'];

$pdo->beginTransaction();
try {
    $before = pricingSelectionSnapshot($pdo, (string) $pricedId);
    $pdo->prepare("UPDATE product SET pricing_method = 'manual', price = 80 WHERE product_id = :product_id")
        ->execute([':product_id' => $pricedId]);
    try {
        applyCategoryMarkupToSelectedProducts($pdo, [(string) $pricedId]);
        throw new RuntimeException('Manual price was replaced without confirmation.');
    } catch (InvalidArgumentException $expected) {
        pricingSelectionAssert(str_contains($expected->getMessage(), 'Manual price kept'), 'Manual price stays until replacement is confirmed');
    }
    $kept = $pdo->query('SELECT price, pricing_method FROM product WHERE product_id = ' . $pdo->quote((string) $pricedId))->fetch(PDO::FETCH_ASSOC);
    pricingSelectionAssert($kept && $kept['pricing_method'] === 'manual' && (float) $kept['price'] === 80.0, 'Unconfirmed apply leaves the manual price in place');
    $result = applyCategoryMarkupToSelectedProducts($pdo, [(string) $pricedId], true, null, true, true);
    $after = pricingSelectionSnapshot($pdo, (string) $pricedId);
    pricingSelectionAssert(($result['applied_products'] ?? 0) === 1, 'Confirmed manual product converts to category markup');
    pricingSelectionAssert(
        $before['product']['brand_name'] === $after['product']['brand_name']
        && $before['product']['product_name'] === $after['product']['product_name']
        && $before['specs'] === $after['specs'],
        'Pricing-only update preserves brand, product, and specifications'
    );
} finally {
    $pdo->rollBack();
}

echo "Product pricing selection checks completed.\n";
