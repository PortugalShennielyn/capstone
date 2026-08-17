<?php
declare(strict_types=1);

require_once __DIR__ . '/../pharma-api/config/db_connection.php';
require_once __DIR__ . '/../pharma-api/v1/suppliers/purchasing_conversion.php';

function supplierCatalogAssert(bool $condition, string $message): void
{
    if (!$condition) throw new RuntimeException($message);
}

$html = file_get_contents(__DIR__ . '/../pharma-frontend/supplier.html');
$javascript = file_get_contents(__DIR__ . '/../pharma-frontend/js/modules/suppliers.js');
$endpoint = file_get_contents(__DIR__ . '/../pharma-api/v1/suppliers/get_supplier_product_list.php');
$productMasterEndpoint = file_get_contents(__DIR__ . '/../pharma-api/v1/products/get_products.php');
$purchasingConversion = file_get_contents(__DIR__ . '/../pharma-api/v1/suppliers/purchasing_conversion.php');

preg_match('/<table[^>]+id="table-supplier-products"[\s\S]*?<\/table>/', $html, $tableMatch);
$catalogTable = $tableMatch[0] ?? '';
supplierCatalogAssert($catalogTable !== '', 'Supplier Product Catalog table was not found.');
supplierCatalogAssert(!str_contains($catalogTable, 'col-packaging'), 'Visible Packaging column must be removed.');
supplierCatalogAssert(str_contains($catalogTable, 'col-purchase-unit'), 'Purchase Unit column must remain.');
supplierCatalogAssert(!str_contains($javascript, '<td class="col-packaging">'), 'Packaging cells must not be rendered.');
supplierCatalogAssert(str_contains($javascript, 'get_supplier_product_list.php?${parameters}'), 'Filters and pagination must use the catalog endpoint query.');
supplierCatalogAssert(str_contains($endpoint, 'product_specification_values psv'), 'Catalog must load normalized Product Master specification values.');
supplierCatalogAssert(str_contains($endpoint, 'WHERE psv.product_id IN ({$specificationPlaceholders})'), 'Specifications must be loaded in one page-batched query.');
supplierCatalogAssert(str_contains($endpoint, 'supplierProductPurchasingHierarchies'), 'Purchasing hierarchies must be loaded in one batch.');
supplierCatalogAssert(!str_contains($endpoint, 'supplierProductPurchasingHierarchy($pdo'), 'Catalog must not query hierarchy once per row.');
supplierCatalogAssert(str_contains($endpoint, "['base_unit_name']"), 'Catalog must expose the configured Product Base Unit explicitly.');
supplierCatalogAssert(str_contains($endpoint, "['units_per_purchase_unit'] = \$normalizedHierarchy['units_per_purchase_unit']"), 'Catalog conversion quantity must come from the normalized hierarchy.');
supplierCatalogAssert(str_contains($purchasingConversion, "'base_unit_name' =>"), 'Batched hierarchy data must expose its terminal Product Base Unit.');
supplierCatalogAssert(!str_contains($javascript, "if (packaging === 'blister pack') return 'pcs'"), 'Purchase Unit labels must not map Blister Pack to pcs.');
supplierCatalogAssert(str_contains($javascript, 'product.base_unit_name || product.inventory_unit'), 'Purchase Unit labels must use the explicit Product Base Unit returned by the catalog API.');
supplierCatalogAssert(str_contains($endpoint, 'LIMIT :limit OFFSET :offset'), 'Server-side pagination is required.');
supplierCatalogAssert(str_contains($endpoint, "'specifications' =>") || str_contains($endpoint, "['specifications'] ="), 'Each catalog product must receive its Product Master specifications.');
foreach (['psv.value_text', 'psv.value_number', 'pts.sort_order', 'unit_symbol'] as $sharedField) {
    supplierCatalogAssert(str_contains($endpoint, $sharedField) && str_contains($productMasterEndpoint, $sharedField), "Catalog and Product Master must share {$sharedField}.");
}

$rows = $pdo->query(
    "SELECT p.product_name, COUNT(DISTINCT sp.supplier_product_id) assignments, COUNT(psv.specification_id) specification_rows
     FROM supplier_products sp
     INNER JOIN product p ON p.product_id=sp.product_id
     LEFT JOIN product_specification_values psv ON psv.product_id=p.product_id
     WHERE p.product_name REGEXP 'AA Batteries|Milo|Biogesic|Paracetamol|Face Mask|Beauty Bar'
     GROUP BY p.product_id,p.product_name"
)->fetchAll(PDO::FETCH_ASSOC);
supplierCatalogAssert(count($rows) >= 5, 'Expected multiple current Product Master types for catalog verification.');
foreach ($rows as $row) {
    supplierCatalogAssert((int)$row['assignments'] >= 1, $row['product_name'] . ' has no supplier assignment.');
    supplierCatalogAssert((int)$row['specification_rows'] >= 1, $row['product_name'] . ' has no normalized Product Master specifications.');
}

$eveready = $pdo->query(
    "SELECT sp.supplier_product_id, sp.purchase_unit, sp.units_per_purchase_unit,
            pmu.unit_name AS base_unit_name
     FROM supplier_products sp
     INNER JOIN product p ON p.product_id=sp.product_id
     INNER JOIN product_measurement_units pmu ON pmu.measurement_unit_id=p.inventory_unit_id
     WHERE p.brand_name='Eveready' AND p.product_name LIKE '%Batter%'
     LIMIT 1"
)->fetch(PDO::FETCH_ASSOC);
supplierCatalogAssert((bool)$eveready, 'Eveready supplier assignment was not found.');
supplierCatalogAssert(strcasecmp((string)$eveready['purchase_unit'], 'Carton') === 0, 'Eveready Purchase Unit must remain Carton.');
supplierCatalogAssert((int)$eveready['units_per_purchase_unit'] === 100, 'Eveready hierarchy must resolve to 100 Product Base Units.');
supplierCatalogAssert(strcasecmp((string)$eveready['base_unit_name'], 'Blister pack') === 0, 'Eveready Product Base Unit must be Blister Pack, not pcs.');
$evereadyHierarchy = supplierProductPurchasingHierarchies($pdo, [(string)$eveready['supplier_product_id']])[(string)$eveready['supplier_product_id']] ?? [];
supplierCatalogAssert((int)($evereadyHierarchy['units_per_purchase_unit'] ?? 0) === 100, 'Catalog hierarchy batch must return Eveready total base quantity 100.');
supplierCatalogAssert(strcasecmp((string)($evereadyHierarchy['base_unit_name'] ?? ''), 'Blister pack') === 0, 'Catalog hierarchy batch must return Blister Pack as Eveready Product Base Unit.');

echo "Supplier catalog specification and structure tests passed.\n";
