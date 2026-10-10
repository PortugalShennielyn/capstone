<?php
$allowedRoles = ['super_admin', 'admin', 'manager', 'Admin', 'ro-super-admin', 'ro-admin', 'ro-manager'];
require_once '../../config/db_connection.php';
require_once '../../config/require_auth.php';
require_once '../activity_log_helpers.php';
require_once '../../config/audit_log.php';
require_once 'product_category_schema.php';
require_once 'product_customization_schema.php';
require_once 'product_status_schema.php';
require_once 'product_pricing_schema.php';
require_once '../suppliers/purchasing_conversion.php';
require_once 'product_selling_options.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['status' => 'error', 'message' => 'Only POST requests are allowed.']);
    exit();
}

$payload = json_decode(file_get_contents('php://input'), true);
if (!is_array($payload)) {
    http_response_code(400);
    echo json_encode(['status' => 'error', 'message' => 'Invalid JSON payload.']);
    exit();
}

function cleanUpdateField(array $payload, string $field): ?string
{
    $value = trim((string) ($payload[$field] ?? ''));
    return $value === '' || strcasecmp($value, 'N/A') === 0 ? null : $value;
}

function cleanUpdateNumber(array $payload, string $field): ?string
{
    $value = trim((string) ($payload[$field] ?? ''));
    if ($value === '' || strcasecmp($value, 'N/A') === 0) {
        return null;
    }
    if (!is_numeric($value)) {
        throw new InvalidArgumentException(str_replace('_', ' ', ucfirst($field)) . ' must be a number only.');
    }
    return $value;
}

function joinUpdateParts(?string ...$parts): ?string
{
    $clean = array_values(array_filter(array_map(static fn($part) => trim((string) ($part ?? '')), $parts), static fn($part) => $part !== ''));
    return count($clean) ? implode(' ', $clean) : null;
}

function normalizeUpdateSkuSellingPrice($value, string $productStatus): float
{
    $priceText = trim((string) ($value ?? ''));
    if ($priceText === '' || !preg_match('/^\d+(?:\.\d{1,2})?$/', $priceText) || !is_numeric($priceText) || !is_finite((float) $priceText)) {
        throw new InvalidArgumentException('SKU Selling Price must be numeric with no more than 2 decimal places.');
    }

    $price = (float) $priceText;
    if ($price < 0 || ($productStatus === 'Active' && $price <= 0)) {
        throw new InvalidArgumentException('An active SKU Selling Price must be greater than 0.');
    }

    return round($price, 2);
}

function productAuditSnapshot(PDO $pdo, string $productId): array
{
    $state = [];
    $product = $pdo->prepare('SELECT barcode, category_id, type_id, inventory_unit_id, brand_name, product_name, price, pricing_method, custom_markup_percentage, status FROM product WHERE product_id=:product_id LIMIT 1');
    $product->execute([':product_id' => $productId]);
    $state['product'] = $product->fetch(PDO::FETCH_ASSOC) ?: [];
    foreach (['medicine_details', 'grocery_details', 'medical_supply_details'] as $table) {
        $statement = $pdo->prepare("SELECT * FROM {$table} WHERE product_id=:product_id ORDER BY 1");
        $statement->execute([':product_id' => $productId]);
        $state[$table] = $statement->fetchAll(PDO::FETCH_ASSOC);
    }
    $specifications = $pdo->prepare(
        'SELECT ps.specification_name, psv.value_text, psv.value_number, psv.measurement_unit_id
         FROM product_specification_values psv
         INNER JOIN product_specifications ps ON ps.specification_id=psv.specification_id
         WHERE psv.product_id=:product_id ORDER BY ps.specification_name, psv.value_text, psv.value_number'
    );
    $specifications->execute([':product_id' => $productId]);
    $state['specifications'] = $specifications->fetchAll(PDO::FETCH_ASSOC);
    return $state;
}

try {
    ensureProductCustomizationSchema($pdo);
    ensureProductStatusColumn($pdo);
    ensureProductPricingSchema($pdo);
    ensureSupplierPurchasingConversionSchema($pdo);
    $productId = cleanId($payload['product_id'] ?? null);
    $categoryId = cleanId($payload['category_id'] ?? null);
    $typeId = cleanId($payload['type_id'] ?? null);
    $brandName = trim((string) ($payload['brand_name'] ?? ''));
    $productName = trim((string) ($payload['product_name'] ?? ''));
    $productStatus = normalizeProductStatus($payload['status'] ?? 'Active');
    $variation = (isset($payload['variations'][0]) && is_array($payload['variations'][0])) ? $payload['variations'][0] : $payload;
    $typeId = cleanId($variation['type_id'] ?? null) ?: $typeId;
    $inventoryUnit = requiredProductInventoryUnit($pdo, $variation['inventory_unit_id'] ?? null);
    $detailSchema = strtolower(trim((string) ($variation['detail_schema'] ?? '')));
    $pricingMethod = normalizePricingMethod($payload['pricing_method'] ?? 'manual');
    $customMarkup = normalizeMarkupPercentage($payload['custom_markup_percentage'] ?? null, true);
    if ($pricingMethod === 'custom_markup' && $customMarkup === null) {
        throw new InvalidArgumentException('Custom markup percentage is required for Custom markup pricing.');
    }
    if ($pricingMethod !== 'custom_markup') {
        $customMarkup = null;
    }

    if ($productId === '') {
        throw new InvalidArgumentException('A valid product is required.');
    }
    if ($categoryId === '') {
        throw new InvalidArgumentException('A valid product category is required.');
    }
    if ($typeId === '' || getProductTypeId($pdo, $categoryId, $typeId) === null) {
        throw new InvalidArgumentException('A valid product type is required for the selected category.');
    }

    $categoryStatement = $pdo->prepare(
        'SELECT pc.category_name, pt.type_name
         FROM product_categories pc
         INNER JOIN product_types pt ON pt.category_id=pc.category_id AND pt.type_id=:type_id
         WHERE pc.category_id=:category_id LIMIT 1'
    );
    $categoryStatement->execute([':category_id' => $categoryId, ':type_id' => $typeId]);
    $categoryType = $categoryStatement->fetch(PDO::FETCH_ASSOC);
    $categoryName = trim((string) ($categoryType['category_name'] ?? ''));
    $typeName = trim((string) ($categoryType['type_name'] ?? ''));
    if ($categoryName === '' || $typeName === '') {
        throw new InvalidArgumentException('A valid product category is required.');
    }
    if ($categoryName === 'Medicine') {
        // Validate the canonical identity now. The legacy non-null Product Name
        // is preserved below; Medicine displays read medicine_details.generic_name.
        requiredMedicineGenericName($payload['generic_name'] ?? null);
    } else {
        $brandName = requiredProductField($payload, 'brand_name');
        $productName = requiredProductField($payload, 'product_name');
    }
    $hasDynamicConfiguration = count(getTypeSpecificationConfiguration($pdo, $typeId)) > 0;

    $existingStatement = $pdo->prepare('SELECT barcode, category_id, type_id, inventory_unit_id, brand_name, product_name, price, pricing_method, custom_markup_percentage, status FROM product WHERE product_id = :product_id LIMIT 1');
    $existingStatement->execute([':product_id' => $productId]);
    $existingPricing = $existingStatement->fetch(PDO::FETCH_ASSOC);
    if (!$existingPricing) {
        throw new InvalidArgumentException('Product not found.');
    }
    if ($categoryName === 'Medicine') {
        $existingProductName = trim((string) ($existingPricing['product_name'] ?? ''));
        $productName = $existingProductName !== ''
            ? $existingProductName
            : ($brandName !== '' ? $brandName : requiredMedicineGenericName($payload['generic_name'] ?? null));
    }
    $price = round((float) $existingPricing['price'], 2);
    $applyCalculatedPrice = !empty($payload['apply_calculated_price']) && $pricingMethod !== 'manual';
    $submittedSkuPrice = $variation['price'] ?? $payload['manual_selling_price'] ?? $payload['price'] ?? null;
    if ($submittedSkuPrice !== null && trim((string) $submittedSkuPrice) !== '') {
        $price = normalizeUpdateSkuSellingPrice($submittedSkuPrice, $productStatus);
    } elseif ($pricingMethod === 'manual') {
        throw new InvalidArgumentException('SKU Selling Price is required.');
    } elseif ($productStatus === 'Active' && $price <= 0) {
        throw new InvalidArgumentException('An active SKU Selling Price must be greater than 0.');
    }

    if ($applyCalculatedPrice) {
        $basis = latestAcceptedCostBasis($pdo, $productId);
        if (!$basis || !is_numeric($basis['unit_cost']) || !is_finite((float) $basis['unit_cost'])) {
            throw new InvalidArgumentException('A valid accepted cost basis is required before applying a calculated price.');
        }
        $markup = $pricingMethod === 'custom_markup'
            ? (float) $customMarkup
            : (float) categoryMarkupResolution($pdo, $categoryId)['markup_percentage'];
        $price = calculatedSellingPrice((float) $basis['unit_cost'], $markup);
    }
    $barcode = cleanUpdateField($variation, 'barcode') ?? cleanUpdateField($payload, 'barcode') ?? ('AUTO-' . strtoupper(bin2hex(random_bytes(6))));
    $submittedSpecifications = is_array($variation['specifications'] ?? null) ? $variation['specifications'] : [];
    $submittedSpecifications = withMedicineClassificationSpecification(
        $pdo,
        $categoryName,
        $submittedSpecifications,
        $variation['medicine_classification'] ?? $payload['medicine_classification'] ?? null
    );
    $specificationValues = validateAndNormalizeSpecificationValues($pdo, $typeId, $submittedSpecifications, $productId);
    $medicineDetails = requiredMedicineDetails($pdo, $categoryName, $typeName, $payload, $variation, $specificationValues, $typeId);
    if ($hasDynamicConfiguration && dynamicProductIdentityExists($pdo, $categoryId, $typeId, $brandName, $productName, $specificationValues, $productId)) {
        throw new InvalidArgumentException('This exact product and specification already exists in Product Master.');
    }
    $barcodeCheck = $pdo->prepare(
        'SELECT product_id FROM product
         WHERE LOWER(TRIM(barcode)) = LOWER(TRIM(:barcode))
           AND product_id <> :product_id
         LIMIT 1'
    );
    $barcodeCheck->execute([':barcode' => $barcode, ':product_id' => $productId]);
    if ($barcodeCheck->fetchColumn()) {
        throw new InvalidArgumentException('This barcode already belongs to another product variant.');
    }
    $unitBarcodeColumn = productSellingOptionBarcodeColumn($pdo);
    if ($unitBarcodeColumn !== null) {
        $unitBarcodeCheck = $pdo->prepare(
            "SELECT product_id FROM product_selling_options
             WHERE LOWER(TRIM(`{$unitBarcodeColumn}`)) = LOWER(TRIM(:barcode))
               AND product_id <> :product_id LIMIT 1"
        );
        $unitBarcodeCheck->execute([':barcode' => $barcode, ':product_id' => $productId]);
        if ($unitBarcodeCheck->fetchColumn()) {
            throw new InvalidArgumentException('This barcode already belongs to a sellable unit of another product.');
        }
    }

    ensureActivityLogSchema($pdo);
    ensureAuditLogSchema($pdo);
    $pdo->beginTransaction();
    $lockedProduct = $pdo->prepare('SELECT barcode, category_id, type_id, inventory_unit_id, brand_name, product_name, price, pricing_method, custom_markup_percentage, status FROM product WHERE product_id = :product_id FOR UPDATE');
    $lockedProduct->execute([':product_id' => $productId]);
    $beforeProduct = $lockedProduct->fetch(PDO::FETCH_ASSOC);
    if (!$beforeProduct) throw new InvalidArgumentException('Product not found.');
    $beforeState = productAuditSnapshot($pdo, $productId);

    $supplierRowsStatement = $pdo->prepare('SELECT * FROM supplier_products WHERE product_id=:product_id FOR UPDATE');
    $supplierRowsStatement->execute([':product_id'=>$productId]);
    $supplierRows = $supplierRowsStatement->fetchAll(PDO::FETCH_ASSOC);
    $inventoryUnitChanged = cleanId($existingPricing['inventory_unit_id'] ?? null) !== cleanId($inventoryUnit['measurement_unit_id']);
    if ($inventoryUnitChanged) {
        foreach ($supplierRows as $supplierRow) {
            $conversion = supplierPurchasingConversion($supplierRow);
            $newBase = strtolower(trim((string)$inventoryUnit['unit_name']));
            if ($newBase === strtolower(trim((string)$conversion['purchase_unit'])) && (int)$conversion['base_qty_per_purchase_unit'] > 1) {
                throw new InvalidArgumentException('This unit is already used as a multi-unit Purchase Unit by a supplier. Update that supplier packaging hierarchy before changing the Product Base Unit.');
            }
            if (!empty($conversion['inner_unit']) && $newBase === strtolower(trim((string)$conversion['inner_unit'])) && (int)$conversion['units_per_inner_unit'] > 1) {
                throw new InvalidArgumentException('This unit is already used as a multi-unit Inner Unit by a supplier. Update that supplier packaging hierarchy before changing the Product Base Unit.');
            }
        }
    }

    $productStatement = $pdo->prepare(
        'UPDATE product
         SET barcode = :barcode,
             category_id = :category_id,
             type_id = :type_id,
             inventory_unit_id = :inventory_unit_id,
             brand_name = :brand_name,
             product_name = :product_name,
             price = :price,
             pricing_method = :pricing_method,
             custom_markup_percentage = :custom_markup_percentage,
             status = :status
         WHERE product_id = :product_id'
    );
    $productStatement->execute([
        ':barcode' => $barcode,
        ':category_id' => $categoryId,
        ':type_id' => $typeId,
        ':inventory_unit_id' => $inventoryUnit['measurement_unit_id'],
        ':brand_name' => $brandName,
        ':product_name' => $productName,
        ':price' => (float) $price,
        ':pricing_method' => $pricingMethod,
        ':custom_markup_percentage' => $customMarkup,
        ':status' => $productStatus,
        ':product_id' => $productId
    ]);
    syncProductDefaultSellingPrice($pdo, $productId, (float)$price);
    if ($inventoryUnitChanged) {
        foreach ($supplierRows as $supplierRow) {
            $supplierRow['inventory_unit'] = $inventoryUnit['unit_name'];
            $pdo->prepare('UPDATE supplier_products SET inventory_unit=:unit WHERE supplier_product_id=:id')->execute([
                ':unit'=>$inventoryUnit['unit_name'],':id'=>$supplierRow['supplier_product_id']
            ]);
            syncSupplierProductUnitConversions($pdo,(string)$supplierRow['supplier_product_id'],$supplierRow);
        }
    }

    if ($categoryName === 'Medicine') {
        $genericName = $medicineDetails['generic_name'];
        $strengthValue = $medicineDetails['strength_value'];
        $strengthUnit = $medicineDetails['strength_unit'];
        $strength = $medicineDetails['strength'];
        $dosageForm = $medicineDetails['dosage_form'];
        $netContentValue = $medicineDetails['net_content_value'];
        $netContentUnit = $medicineDetails['net_content_unit'];
        $packageType = null;
        $exists = $pdo->prepare('SELECT medicine_detail_id FROM medicine_details WHERE product_id = :product_id LIMIT 1');
        $exists->execute([':product_id' => $productId]);
        if (cleanId($exists->fetchColumn()) !== '') {
            $detail = $pdo->prepare('UPDATE medicine_details SET generic_name = :generic_name, strength_value = :strength_value, strength_unit = :strength_unit, strength = :strength, dosage_form = :dosage_form, net_content_value = :net_content_value, net_content_unit = :net_content_unit, package_type = :package_type WHERE product_id = :product_id');
        } else {
            $detail = $pdo->prepare('INSERT INTO medicine_details (medicine_detail_id, product_id, generic_name, strength_value, strength_unit, strength, dosage_form, net_content_value, net_content_unit, package_type) VALUES (:detail_id, :product_id, :generic_name, :strength_value, :strength_unit, :strength, :dosage_form, :net_content_value, :net_content_unit, :package_type)');
            $detail->bindValue(':detail_id', newUuid($pdo));
        }
        $detail->bindValue(':product_id', $productId);
        $detail->bindValue(':generic_name', $genericName);
        $detail->bindValue(':strength_value', $strengthValue);
        $detail->bindValue(':strength_unit', $strengthUnit);
        $detail->bindValue(':strength', $strength);
        $detail->bindValue(':dosage_form', $dosageForm);
        $detail->bindValue(':net_content_value', $netContentValue);
        $detail->bindValue(':net_content_unit', $netContentUnit);
        $detail->bindValue(':package_type', $packageType);
        $detail->execute();
        $pdo->prepare('DELETE FROM grocery_details WHERE product_id = :product_id')->execute([':product_id' => $productId]);
        $pdo->prepare('DELETE FROM medical_supply_details WHERE product_id = :product_id')->execute([':product_id' => $productId]);
    } elseif (!$hasDynamicConfiguration && $categoryName === 'Grocery' && in_array($detailSchema, ['', 'grocery'], true)) {
        $netWeight = cleanUpdateNumber($variation, 'net_weight') ?? cleanUpdateNumber($variation, 'weight_value') ?? cleanUpdateNumber($variation, 'weight_volume_value');
        $detailValues = [
            ':product_id' => $productId,
            ':variant' => cleanUpdateField($variation, 'variant_name') ?? cleanUpdateField($variation, 'variant_flavor'),
            ':size' => cleanUpdateField($variation, 'size_value') ?? cleanUpdateField($variation, 'display_size'),
            ':net_weight' => $netWeight,
            ':unit' => cleanUpdateField($variation, 'unit') ?? cleanUpdateField($variation, 'weight_unit') ?? cleanUpdateField($variation, 'weight_volume_unit'),
            ':package_type' => null,
            ':pack_content' => null
        ];
        $exists = $pdo->prepare('SELECT grocery_detail_id FROM grocery_details WHERE product_id = :product_id LIMIT 1');
        $exists->execute([':product_id' => $productId]);
        if (cleanId($exists->fetchColumn()) !== '') {
            $detail = $pdo->prepare('UPDATE grocery_details SET variant = :variant, size = :size, net_weight = :net_weight, unit = :unit, package_type = :package_type, pack_content = :pack_content WHERE product_id = :product_id');
        } else {
            $detail = $pdo->prepare('INSERT INTO grocery_details (grocery_detail_id, product_id, variant, size, net_weight, unit, package_type, pack_content) VALUES (:detail_id, :product_id, :variant, :size, :net_weight, :unit, :package_type, :pack_content)');
            $detailValues[':detail_id'] = newUuid($pdo);
        }
        $detail->execute($detailValues);
        $pdo->prepare('DELETE FROM medicine_details WHERE product_id = :product_id')->execute([':product_id' => $productId]);
        $pdo->prepare('DELETE FROM medical_supply_details WHERE product_id = :product_id')->execute([':product_id' => $productId]);
    } elseif (!$hasDynamicConfiguration && in_array($categoryName, ['Medical Supply', 'Medical Supplies'], true) && in_array($detailSchema, ['', 'medical_supply'], true)) {
        $detailValues = [
            ':product_id' => $productId,
            ':variant' => cleanUpdateField($variation, 'variant_name') ?? cleanUpdateField($variation, 'variant_flavor'),
            ':size' => cleanUpdateField($variation, 'size_value') ?? cleanUpdateField($variation, 'display_size'),
            ':material' => cleanUpdateField($variation, 'material'),
            ':sterile_status' => cleanUpdateField($variation, 'sterile_status'),
            ':package_type' => null,
            ':pack_content' => null
        ];
        $exists = $pdo->prepare('SELECT medical_supply_detail_id FROM medical_supply_details WHERE product_id = :product_id LIMIT 1');
        $exists->execute([':product_id' => $productId]);
        if (cleanId($exists->fetchColumn()) !== '') {
            $detail = $pdo->prepare('UPDATE medical_supply_details SET variant = :variant, size = :size, material = :material, sterile_status = :sterile_status, package_type = :package_type, pack_content = :pack_content WHERE product_id = :product_id');
        } else {
            $detail = $pdo->prepare('INSERT INTO medical_supply_details (medical_supply_detail_id, product_id, variant, size, material, sterile_status, package_type, pack_content) VALUES (:detail_id, :product_id, :variant, :size, :material, :sterile_status, :package_type, :pack_content)');
            $detailValues[':detail_id'] = newUuid($pdo);
        }
        $detail->execute($detailValues);
        $pdo->prepare('DELETE FROM medicine_details WHERE product_id = :product_id')->execute([':product_id' => $productId]);
        $pdo->prepare('DELETE FROM grocery_details WHERE product_id = :product_id')->execute([':product_id' => $productId]);
    }

    if ($categoryName !== 'Medicine') {
        $pdo->prepare('DELETE FROM medicine_details WHERE product_id = :product_id')->execute([':product_id' => $productId]);
    }

    if ($hasDynamicConfiguration && (array_key_exists('specifications', $variation) || $categoryName === 'Medicine')) {
        saveProductSpecificationValues($pdo, $productId, $specificationValues);
    }
    $afterProduct = productAuditSnapshot($pdo, $productId);
    $changed = [];
    foreach ($afterProduct as $field => $newValue) {
        $oldValue = $beforeState[$field] ?? null;
        if ($field === 'product' && is_array($oldValue) && is_array($newValue)) {
            foreach ($newValue as $column => $columnValue) {
                $oldColumnValue = $oldValue[$column] ?? null;
                $same = in_array($column, ['price', 'custom_markup_percentage'], true) && is_numeric($oldColumnValue) && is_numeric($columnValue)
                    ? abs((float) $oldColumnValue - (float) $columnValue) < 0.005
                    : (string) ($oldColumnValue ?? '') === (string) ($columnValue ?? '');
                if (!$same) $changed[$column] = ['previous' => $oldColumnValue, 'new' => $columnValue];
            }
        } elseif (json_encode($oldValue, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) !== json_encode($newValue, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)) {
            $changed[$field] = ['previous' => $oldValue, 'new' => $newValue];
        }
    }
    if ($changed) {
        $displayValue = static function ($value): string {
            if ($value === null || $value === '') return '—';
            return is_array($value)
                ? (string) json_encode($value, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)
                : (string) $value;
        };
        $summaryChanges = array_map(static fn($field, $values) => $field . ' changed from ' . $displayValue($values['previous'] ?? null) . ' to ' . $displayValue($values['new'] ?? null), array_keys($changed), array_values($changed));
        recordInventoryAudit($pdo, 'PRODUCT_UPDATED', $productName . ': ' . implode('; ', $summaryChanges) . '.', $productId, ['product_id' => $productId, 'product_name' => $productName, 'changed_fields' => $changed]);
    }
    recordActivityLog($pdo, 'Products', 'Updated', 'Product updated: ' . $productName, $productId, null, null, false);
    $pdo->commit();
    if (
        $existingPricing['pricing_method'] !== $pricingMethod
        || abs((float) $existingPricing['price'] - $price) >= 0.005
        || ($existingPricing['custom_markup_percentage'] === null ? null : (float) $existingPricing['custom_markup_percentage']) !== $customMarkup
    ) {
        recordActivityLog($pdo, 'Pricing', 'Product pricing updated', json_encode([
            'previous_pricing_method' => $existingPricing['pricing_method'],
            'new_pricing_method' => $pricingMethod,
            'previous_selling_price' => round((float) $existingPricing['price'], 2),
            'new_selling_price' => $price,
            'custom_markup_percentage' => $customMarkup,
            'calculated_price_applied' => $applyCalculatedPrice,
        ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES), $productId, null, null, false);
    }

    echo json_encode([
        'status' => 'success',
        'message' => 'Product SKU updated successfully.'
    ]);
} catch (InvalidArgumentException $e) {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }
    recordInventoryAuditFailure($pdo, 'PRODUCT_UPDATE_FAILED', 'Product update failed validation.', isset($productId) ? (string) $productId : null);
    http_response_code(400);
    echo json_encode(['status' => 'error', 'message' => $e->getMessage()]);
} catch (Throwable $e) {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }
    recordInventoryAuditFailure($pdo, 'PRODUCT_UPDATE_FAILED', 'Product update failed before commit.', isset($productId) ? (string) $productId : null);
    http_response_code(500);
    echo json_encode(['status' => 'error', 'message' => 'Unable to update product SKU.', 'error' => $e->getMessage()]);
}
?>
