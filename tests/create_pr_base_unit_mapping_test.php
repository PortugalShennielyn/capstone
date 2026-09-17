<?php

declare(strict_types=1);

require_once __DIR__ . '/../pharma-api/config/db_connection.php';
require_once __DIR__ . '/../pharma-api/v1/purchase_requests/purchase_request_helpers.php';

function createPrMappingAssert(bool $condition, string $message): void
{
    if (!$condition) throw new RuntimeException($message);
}

$root = dirname(__DIR__);
$candidateSource = (string) file_get_contents($root . '/pharma-api/v1/purchase_requests/get_pr_candidates.php');
$createSource = (string) file_get_contents($root . '/pharma-api/v1/purchase_requests/create_purchase_request.php');
$saveSource = (string) file_get_contents($root . '/pharma-api/v1/purchase_requests/save_purchase_request.php');
$html = (string) file_get_contents($root . '/pharma-frontend/purchase_requests.html');
$javascript = (string) file_get_contents($root . '/pharma-frontend/js/modules/purchase_requests.js');
$documentRenderer = (string) file_get_contents($root . '/pharma-frontend/js/modules/pr_document_renderer.js');

$catalogStart = strpos($javascript, 'function renderProductCatalog()');
$catalogEnd = strpos($javascript, 'function bulkSelectProducts', $catalogStart ?: 0);
$catalogRenderer = $catalogStart !== false && $catalogEnd !== false
    ? substr($javascript, $catalogStart, $catalogEnd - $catalogStart)
    : '';
$formPayloadStart = strpos($javascript, 'function formPayload(');
$formPayloadEnd = strpos($javascript, 'function previewPayload', $formPayloadStart ?: 0);
$formPayload = $formPayloadStart !== false && $formPayloadEnd !== false
    ? substr($javascript, $formPayloadStart, $formPayloadEnd - $formPayloadStart)
    : '';

createPrMappingAssert(str_contains($candidateSource, 'AS base_inventory_unit'), 'Candidate query does not expose an explicit base_inventory_unit.');
createPrMappingAssert(str_contains($candidateSource, 'product_measurement_units pmu') && str_contains($candidateSource, 'p.inventory_unit_id'), 'Candidate query does not resolve the permanent Product Master unit field.');
createPrMappingAssert(str_contains($candidateSource, 'AND EXISTS ('), 'Supplier eligibility is not implemented with a non-duplicating EXISTS check.');
createPrMappingAssert(!str_contains($candidateSource, 'supplier_options') && !str_contains($candidateSource, 'supplier_name'), 'Candidate response still contains supplier purchasing data.');
createPrMappingAssert(str_contains($candidateSource, 'SELECT DISTINCT'), 'Candidate query does not explicitly protect unique Product Master variants.');

createPrMappingAssert($catalogRenderer !== '', 'Create PR catalog renderer was not found.');
createPrMappingAssert(str_contains($catalogRenderer, 'baseInventoryUnit(product)'), 'Catalog does not bind the Product Master base inventory unit.');
createPrMappingAssert(!str_contains($catalogRenderer, '<select') && !str_contains($catalogRenderer, 'supplier_options') && !str_contains($catalogRenderer, 'purchasingConversion'), 'Create PR Base Inventory Unit still renders supplier purchasing controls.');
createPrMappingAssert(str_contains($catalogRenderer, 'Unit not configured') && str_contains($catalogRenderer, 'Fix in Product Master'), 'Missing Product Master base-unit handling is incomplete.');
createPrMappingAssert(str_contains($catalogRenderer, 'catalog-specification'), 'Specification is not rendered in its compact wrapping cell.');
createPrMappingAssert(str_contains($catalogRenderer, 'data-selected-qty') && str_contains($catalogRenderer, 'disabled'), 'Unselected quantity inputs are not disabled.');

createPrMappingAssert(str_contains($html, '<colgroup><col style="width:5%"><col style="width:18%"><col style="width:27%"'), 'Compact Product/Specification column proportions are missing.');
createPrMappingAssert(str_contains($html, '.catalog-specification{white-space:normal;overflow-wrap:break-word'), 'Specification wrapping rules are missing.');
createPrMappingAssert(str_contains($html, '.catalog-qty { width:68px') && str_contains($html, 'gap:6px'), 'Requested quantity input and suffix spacing is not compact.');

createPrMappingAssert($formPayload !== '' && !str_contains($formPayload, 'supplier_') && !str_contains($formPayload, 'purchase_unit') && !str_contains($formPayload, 'price'), 'Create PR submission payload contains purchasing data.');
createPrMappingAssert(str_contains($documentRenderer, 'item.unit || product.base_inventory_unit'), 'A4 PR renderer does not prioritize the saved base inventory unit.');
foreach ([$createSource, $saveSource] as $endpointSource) {
    createPrMappingAssert(str_contains($endpointSource, 'purchaseRequestBaseInventoryUnit'), 'PR save endpoint does not derive the Product Master base unit.');
    createPrMappingAssert(
        !str_contains($endpointSource, 'supplier_product_id'),
        'PR save endpoint still persists a supplier assignment during PR creation.'
    );
}

createPrMappingAssert(positivePurchaseRequestQuantity('1.25', 'kg') === 1.25, 'Decimal weight quantity was rejected.');
createPrMappingAssert(positivePurchaseRequestQuantity('2.5', 'mL') === 2.5, 'Decimal volume quantity was rejected.');
$countableRejected = false;
try {
    positivePurchaseRequestQuantity('1.5', 'Bottle');
} catch (InvalidArgumentException) {
    $countableRejected = true;
}
createPrMappingAssert($countableRejected, 'Fractional countable quantity was accepted.');

$namedProducts = $pdo->query(
    "SELECT product_id, product_name, brand_name
     FROM product
     WHERE LOWER(product_name) LIKE '%betadine%'
        OR LOWER(product_name) LIKE '%bonakid%'
        OR LOWER(product_name) LIKE '%spicy%ramen%'
        OR LOWER(product_name) LIKE '%coca%cola%'
     ORDER BY product_name, product_id"
)->fetchAll(PDO::FETCH_ASSOC);
$spicyRamenIds = [];
foreach ($namedProducts as $product) {
    $unit = purchaseRequestBaseInventoryUnit($pdo, (string) $product['product_id']);
    createPrMappingAssert($unit !== null, $product['product_name'] . ' has no resolvable Product Master base unit.');
    if (stripos((string) $product['product_name'], 'spicy ramen') !== false) $spicyRamenIds[] = $product['product_id'];
}
if (count($spicyRamenIds) >= 2) {
    createPrMappingAssert(count(array_unique($spicyRamenIds)) === count($spicyRamenIds), 'Distinct Spicy Ramen Product Master variants were collapsed.');
}

echo "Create PR Product Master base-unit mapping and compact table tests passed.\n";
