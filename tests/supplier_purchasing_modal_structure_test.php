<?php

function supplierPurchasingModalAssert(bool $condition, string $message): void
{
    if (!$condition) {
        throw new RuntimeException($message);
    }
}

$html = file_get_contents(__DIR__ . '/../pharma-frontend/supplier.html');
$javascript = file_get_contents(__DIR__ . '/../pharma-frontend/js/modules/suppliers.js');

supplierPurchasingModalAssert(substr_count($html, 'id="editSupplierProductModal"') === 1, 'The existing edit modal must not be duplicated.');
foreach (['editSupplierProductSetupPane', 'editSupplierProductReviewPane'] as $paneId) {
    supplierPurchasingModalAssert(substr_count($html, 'id="' . $paneId . '"') === 1, "{$paneId} must exist exactly once.");
}
supplierPurchasingModalAssert(!str_contains($html, 'editSupplierProductDetailsPane'), 'Product Details must not remain a separate tab.');
supplierPurchasingModalAssert(!str_contains($html, 'editSupplierProductPricingPane'), 'Supplier Pricing must not remain a separate tab.');
supplierPurchasingModalAssert(str_contains($html, 'Supplier purchasing setup'), 'The purchasing setup title is required.');
supplierPurchasingModalAssert(str_contains($html, 'Purchasing terms') && str_contains($html, '>Review<'), 'Purchasing terms and Review must be the two steps.');
supplierPurchasingModalAssert(str_contains($html, 'class="sps-layout"'), 'The setup must use the two-column purchasing layout.');
supplierPurchasingModalAssert(str_contains($html, 'overflow-y: auto;') && str_contains($html, 'overflow-x: hidden;'), 'Only the modal body should scroll vertically.');
supplierPurchasingModalAssert(!str_contains($html, 'id="editSupplierProductConversionPreview"'), 'The permanent right-side preview must be removed.');
supplierPurchasingModalAssert(!str_contains($html, 'class="edit-attribute'), 'Legacy editable Product Master attribute controls must not remain in the modal.');
supplierPurchasingModalAssert(str_contains($html, 'id="editSupplierProductAttributes"'), 'The Product Master attribute container is required.');
supplierPurchasingModalAssert(str_contains($html, 'id="editSupplierProductForm" novalidate'), 'The persistent footer must be able to run the existing save validation from any tab.');
supplierPurchasingModalAssert(!str_contains($html, 'id="editSupplierProductSupplierCost"'), 'Supplier setup must not contain an editable purchasing price.');
supplierPurchasingModalAssert(str_contains($html, 'id="editSupplierProductPurchaseUnit"'), 'Purchase Unit must remain editable.');
supplierPurchasingModalAssert(str_contains($html, 'id="editSupplierProductInventoryUnitPreview"'), 'Inventory Unit must remain editable.');
supplierPurchasingModalAssert(str_contains($html, 'id="editSupplierProductPurchaseUnit"'), 'Purchase Unit must be a controlled selector.');
supplierPurchasingModalAssert(str_contains($html, 'id="editSupplierProductInventoryUnitPreview" required disabled aria-readonly="true"'), 'Product Base Unit must be read only in Supplier Purchasing Setup.');
supplierPurchasingModalAssert(!str_contains($html, 'id="editSupplierProductInnerUnit"'), 'The simplified setup must not expose an Inner Unit selector.');
supplierPurchasingModalAssert(!str_contains($html, 'id="editSupplierProductPurchaseUnit" list='), 'Purchase Unit must not use a free-text datalist.');
supplierPurchasingModalAssert(str_contains($html, 'Pack content'), 'Pack content must remain part of the purchasing setup.');
supplierPurchasingModalAssert(str_contains($html, 'From Product Master'), 'Product Master details must stay visible beside the purchasing form.');
supplierPurchasingModalAssert(str_contains($html, 'Continue to review'), 'The first step must continue into review.');
supplierPurchasingModalAssert(!str_contains($html, 'Packaging Hierarchy'), 'The multi-level Packaging Hierarchy editor must be removed.');
supplierPurchasingModalAssert(!str_contains($html, 'Product Packaging <small>From Product Master</small>'), 'Product Packaging must not appear in the Supplier Purchasing Setup.');
supplierPurchasingModalAssert(str_contains($html, 'Invalid legacy unit — please select a valid Purchase Unit.'), 'Numeric legacy Purchase Units must show a clear correction message.');
supplierPurchasingModalAssert(!str_contains($html, 'Purchasing Cost Breakdown'), 'Derived purchasing cost breakdowns must be removed.');
supplierPurchasingModalAssert(str_contains($html, 'id="editSupplierProductUnitsPerPurchaseUnit"'), 'Units per Purchase Unit must remain editable.');
supplierPurchasingModalAssert(!str_contains($html, 'id="editSupplierProductToggleInnerUnit"'), 'Add Packaging Level controls must be removed.');
supplierPurchasingModalAssert(!str_contains($html, 'id="editSupplierProductUnitsPerInnerUnit"'), 'Second-level conversion inputs must be removed.');
supplierPurchasingModalAssert(!str_contains($html, 'id="editSupplierProductCostBasis"'), 'Manual Supplier Cost Basis must be removed.');
supplierPurchasingModalAssert(!str_contains($html, 'Last Supplier Cost'), 'Supplier setup and review must not display Last Supplier Cost.');
supplierPurchasingModalAssert(!str_contains($html, 'Cost per Product Base Unit'), 'Derived Product Base Unit cost must not be displayed.');
supplierPurchasingModalAssert(!str_contains($html, 'id="editSupplierProductSellingPrice"'), 'Customer Selling Price must not appear in Supplier Purchasing Setup.');
supplierPurchasingModalAssert(!str_contains($html, 'From Category Pricing'), 'Category retail markup must not appear in Supplier Purchasing Setup.');
supplierPurchasingModalAssert(!str_contains($html, 'Calculated Selling Price'), 'Calculated customer Selling Price must not appear in Supplier Purchasing Setup.');
supplierPurchasingModalAssert(!str_contains($html, 'Price Difference'), 'Retail Price Difference must not appear in Supplier Purchasing Setup.');
supplierPurchasingModalAssert(!str_contains($html, 'Retail Selling Setup'), 'Purchase Review must not contain a retail setup card.');
supplierPurchasingModalAssert(!str_contains($html, 'Shelf Inventory → Selling Setup'), 'The supplier purchasing modal must not contain retail configuration content.');
supplierPurchasingModalAssert(substr_count($html, 'id="editPreviewInventoryReceived"') === 1, 'Purchase Review must contain one conversion summary only.');
supplierPurchasingModalAssert(str_contains($html, 'supplier-review-impact'), 'Purchase Review must show the receiving impact.');

supplierPurchasingModalAssert(str_contains($javascript, 'products/get_product_details.php'), 'Product identity and saved values must come from Product Master details.');
supplierPurchasingModalAssert(str_contains($javascript, 'products/get_product_configuration.php'), 'Configured attributes must come from the Product Master configuration.');
supplierPurchasingModalAssert(str_contains($javascript, 'renderSupplierProductMasterDetails'), 'The Product Master details renderer must populate the modal.');
supplierPurchasingModalAssert(str_contains($javascript, 'supplierMasterIdentityName'), 'Medicine identity must use the generic name when the product name repeats the brand.');
supplierPurchasingModalAssert(str_contains($javascript, "endpoint('suppliers/update_supplier_assignment.php')"), 'Saving must continue through the existing supplier assignment update endpoint.');
supplierPurchasingModalAssert(str_contains($javascript, "import { purchasingConversion }"), 'The modal must use the shared purchasing conversion function.');
supplierPurchasingModalAssert(!str_contains($javascript, 'purchasingCost('), 'The modal must not calculate derived per-unit purchasing costs.');
supplierPurchasingModalAssert(str_contains($javascript, 'loadSupplierPurchasingUnitSelectors'), 'Supplier unit selectors must load from the shared central unit source.');
supplierPurchasingModalAssert(str_contains($javascript, 'validSupplierUnitSelection'), 'Select-only unit validation is required before save.');
supplierPurchasingModalAssert(str_contains($javascript, 'editSupplierDirectPurchaseUnit'), 'The direct conversion must label the selected Purchase Unit.');
supplierPurchasingModalAssert(str_contains($javascript, 'editSupplierDirectBaseUnit'), 'The direct conversion must label the Product Base Unit.');
supplierPurchasingModalAssert(!str_contains($javascript, "supplier_cost_basis: 'purchase'"), 'Supplier setup must not submit a purchasing price or cost basis.');
supplierPurchasingModalAssert(str_contains($javascript, 'measurementUnitsForContext'), 'All supplier selectors must use shared central context filtering.');
supplierPurchasingModalAssert(!str_contains($javascript, "['box', 'carton'].includes(normalizedSupplierUnit(unit.unit_name))"), 'Purchase Unit options must come from the unit list, not a hardcoded Box and Carton filter.');
supplierPurchasingModalAssert(str_contains($javascript, 'dedupedPurchaseUnits'), 'Duplicate purchase units from Count and Packaging must be shown once.');
supplierPurchasingModalAssert(str_contains($html, 'id="editSupplierPurchaseUnitSearch"'), 'Purchase Unit must be a type-to-select field.');
supplierPurchasingModalAssert(str_contains($javascript, 'Customize purchase unit'), 'Purchase Unit must offer a customize action.');
supplierPurchasingModalAssert(str_contains($javascript, "measurement_group: 'Packaging'"), 'A custom purchase unit must be saved into the measurement unit list.');
supplierPurchasingModalAssert(!str_contains($javascript, 'validateHierarchyDraft'), 'Multi-level hierarchy validation must be removed.');
supplierPurchasingModalAssert(!str_contains($javascript, 'alignHierarchyWithPurchaseUnit'), 'Multi-level hierarchy realignment must be removed.');
supplierPurchasingModalAssert(str_contains($javascript, 'Number.isInteger(Number(quantityInput?.value))'), 'Final contents must use positive whole-number validation.');
supplierPurchasingModalAssert(str_contains($html, '#fafbff'), 'The Product Master panel must use the bright faded background.');
supplierPurchasingModalAssert(str_contains($html, '#f3f0ff'), 'The active purchasing step must use the soft purple highlight.');

preg_match_all('/\sid="([^"]+)"/', $html, $matches);
$duplicateIds = array_filter(array_count_values($matches[1]), static fn(int $count): bool => $count > 1);
supplierPurchasingModalAssert($duplicateIds === [], 'Duplicate HTML IDs found: ' . implode(', ', array_keys($duplicateIds)));

echo "Supplier purchasing modal structure checks passed.\n";
