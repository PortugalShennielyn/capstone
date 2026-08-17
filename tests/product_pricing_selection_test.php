<?php
require_once __DIR__ . '/../pharma-api/config/db_connection.php';
require_once __DIR__ . '/../pharma-api/v1/products/product_pricing_schema.php';

function pricingSelectionAssert(bool $condition, string $message): void
{
    if (!$condition) throw new RuntimeException($message);
    echo "PASS: {$message}\n";
}

$alcoholId = '44bad6eb-88d9-11f1-8e9d-706871ff20d7';
$before = $pdo->query("SELECT variant, size, sterile_status FROM medical_supply_details WHERE product_id = '{$alcoholId}'")->fetch();
pricingSelectionAssert(
    $before && $before['variant'] === 'Ethyl Alcohol 70%' && $before['size'] === '500 mL' && $before['sterile_status'] === 'Non-sterile',
    'Green Cross Alcohol has its verified specification'
);

$preview = selectedCategoryPricingPreview($pdo, [$alcoholId]);
pricingSelectionAssert(
    ($preview[0]['eligibility_status'] ?? '') === 'Already up to date' && empty($preview[0]['eligible_for_apply']),
    'Already-current category pricing is not actionable'
);

$pdo->beginTransaction();
try {
    $pdo->prepare("UPDATE product SET pricing_method = 'manual', price = 80 WHERE product_id = :product_id")
        ->execute([':product_id' => $alcoholId]);
    $result = applyCategoryMarkupToSelectedProducts($pdo, [$alcoholId]);
    $after = $pdo->query("SELECT variant, size, sterile_status FROM medical_supply_details WHERE product_id = '{$alcoholId}'")->fetch();
    pricingSelectionAssert(($result['applied_products'] ?? 0) === 1, 'Manual product can convert to category markup');
    pricingSelectionAssert($before === $after, 'Pricing-only update preserves product specifications');
} finally {
    $pdo->rollBack();
}

echo "Product pricing selection checks completed.\n";
