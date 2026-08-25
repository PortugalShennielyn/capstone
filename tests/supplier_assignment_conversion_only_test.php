<?php

declare(strict_types=1);

function assignmentConversionAssert(bool $condition, string $message): void
{
    if (!$condition) throw new RuntimeException($message);
}

$ui = (string)file_get_contents(__DIR__ . '/../pharma-frontend/js/modules/supplier_product_assignment.js');
$api = (string)file_get_contents(__DIR__ . '/../pharma-api/v1/suppliers/assign_product.php');
$schema = (string)file_get_contents(__DIR__ . '/../pharma-api/v1/suppliers/supplier_schema.php');

assignmentConversionAssert(!str_contains($ui, 'term-cost'), 'Assignment Step 2 still renders or validates a supplier cost.');
assignmentConversionAssert(!str_contains($ui, 'Estimated Purchase Unit Cost'), 'Review still displays an estimated supplier cost.');
assignmentConversionAssert(str_contains($ui, 'Contents per ${esc(saved.purchaseUnit'), 'Contents label is not based on the selected Purchase Unit.');
assignmentConversionAssert(str_contains($ui, 'term-quantity-unit'), 'The Product Base Unit is not displayed beside Contents.');
assignmentConversionAssert(str_contains($ui, 'purchasingConversion'), 'Assignment preview is not using the shared conversion model.');
assignmentConversionAssert(!str_contains($ui, 'supplier_cost_price: saved'), 'Assignment still submits supplier pricing.');

assignmentConversionAssert(!str_contains($api, "\$payload['supplier_cost_price']"), 'Assignment API still accepts supplier pricing.');
assignmentConversionAssert(!str_contains($api, ':supplier_cost_price'), 'Assignment API still persists a submitted cost.');
assignmentConversionAssert(str_contains($api, 'strcasecmp($purchaseUnit, $inventoryUnit) === 0'), 'Same-unit assignments are not normalized to a 1-to-1 conversion.');
assignmentConversionAssert(str_contains($schema, "\$sameDirectUnit ? 'inventory' : 'purchase'"), 'Same Product Base Unit is not accepted as a Purchase Unit.');

echo "Supplier assignment conversion-only checks passed.\n";
