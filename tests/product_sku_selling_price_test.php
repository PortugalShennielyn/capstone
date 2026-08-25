<?php

declare(strict_types=1);

function skuPriceAssert(bool $condition, string $message): void
{
    if (!$condition) {
        throw new RuntimeException($message);
    }
}

$productsHtml = (string) file_get_contents(__DIR__ . '/../pharma-frontend/products.html');
$productsJs = (string) file_get_contents(__DIR__ . '/../pharma-frontend/js/modules/products.js');
$addProductApi = (string) file_get_contents(__DIR__ . '/../pharma-api/v1/products/add_product.php');
$updateProductApi = (string) file_get_contents(__DIR__ . '/../pharma-api/v1/products/update_product.php');
$posHelpers = (string) file_get_contents(__DIR__ . '/../pharma-api/v1/sales/sales_pos_helpers.php');

skuPriceAssert(str_contains($productsJs, 'function sellingPriceField'), 'SKU cards must render their own Selling Price field.');
skuPriceAssert(str_contains($productsJs, 'min="0.01"') && str_contains($productsJs, 'step="0.01"'), 'SKU Selling Price controls must enforce positive two-decimal values.');
skuPriceAssert(!str_contains($productsHtml, 'editProductManualPrice'), 'The redundant form-level manual Selling Price field must stay removed.');
skuPriceAssert(!str_contains($productsJs, "existingSkuPrice.closest('.col-md-6')?.classList.add('d-none')"), 'The primary SKU Selling Price must remain visible.');
skuPriceAssert(substr_count($productsJs, "renderAddVariations({ variations: [{ price: '' }]") >= 2, 'Create Another Variant must start with a blank price.');
skuPriceAssert(str_contains($productsJs, "variations.push({ price: '', is_default: 0 })"), 'Additional Edit variants must start with a blank price.');

skuPriceAssert(str_contains($addProductApi, "':price' => \$sku['price']"), 'Add Product must persist each variation price to its own product row.');
skuPriceAssert(str_contains($addProductApi, 'normalizeSkuSellingPrice') && str_contains($updateProductApi, 'normalizeUpdateSkuSellingPrice'), 'Add and Edit APIs must validate SKU prices.');
skuPriceAssert(str_contains($addProductApi, "syncProductDefaultSellingPrice(\$pdo, \$productId, (float) \$sku['price'])"), 'Every newly added SKU must synchronize its default POS selling option.');
skuPriceAssert(str_contains($updateProductApi, "\$variation['price'] ?? \$payload['manual_selling_price']"), 'Edit Product must prioritize the SKU-card price.');
skuPriceAssert(str_contains($updateProductApi, 'syncProductDefaultSellingPrice($pdo, $productId, (float)$price)'), 'Edited SKU prices must synchronize to POS.');
skuPriceAssert(str_contains($posHelpers, "\$product['price'] = \$defaultOption['selling_price']"), 'POS must consume the synchronized default SKU selling price.');

echo "Product SKU selling price test passed.\n";
