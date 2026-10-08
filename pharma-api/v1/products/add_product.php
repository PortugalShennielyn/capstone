<?php
$allowedRoles = ['super_admin', 'admin', 'manager', 'supervisor', 'Admin', 'ro-super-admin', 'ro-admin', 'ro-manager', 'ro-supervisor'];
require_once '../../config/db_connection.php';
require_once '../../config/require_auth.php';
require_once '../activity_log_helpers.php';
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

function cleanSkuField(array $payload, string $field): ?string
{
    $value = trim((string) ($payload[$field] ?? ''));
    return $value === '' || strcasecmp($value, 'N/A') === 0 ? null : $value;
}

function cleanSkuNumber(array $payload, string $field): ?string
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

function positiveSkuInteger(array $payload, string $field): int
{
    $value = trim((string) ($payload[$field] ?? ''));
    if (!is_numeric($value) || (float) $value <= 0) {
        throw new InvalidArgumentException('Units per Purchase Unit must be numeric and greater than 0.');
    }
    return (int) $value;
}

function joinSkuParts(?string ...$parts): ?string
{
    $clean = array_values(array_filter(array_map(static fn($part) => trim((string) ($part ?? '')), $parts), static fn($part) => $part !== ''));
    return count($clean) ? implode(' ', $clean) : null;
}

function normalizeSkuSellingPrice($value, string $productStatus): float
{
    $priceText = trim((string) ($value ?? ''));
    if ($priceText === '' || !preg_match('/^\d+(?:\.\d{1,2})?$/', $priceText) || !is_numeric($priceText) || !is_finite((float) $priceText)) {
        throw new InvalidArgumentException('Each SKU Selling Price must be numeric with no more than 2 decimal places.');
    }

    $price = (float) $priceText;
    if ($price < 0 || ($productStatus === 'Active' && $price <= 0)) {
        throw new InvalidArgumentException('Each active SKU Selling Price must be greater than 0.');
    }

    return round($price, 2);
}

function normalizeSkuVariation(array $variation, string $categoryName, ?string $fallbackPrice, string $productStatus): array
{
    $price = $variation['price'] ?? $fallbackPrice;
    $price = normalizeSkuSellingPrice($price, $productStatus);

    $barcode = cleanSkuField($variation, 'barcode') ?? ('AUTO-' . strtoupper(bin2hex(random_bytes(6))));

    return [
        'variant' => cleanSkuField($variation, 'variant_name') ?? cleanSkuField($variation, 'variant_flavor') ?? cleanSkuField($variation, 'variation_name'),
        'strength_value' => cleanSkuNumber($variation, 'strength_value'),
        'strength_unit' => cleanSkuField($variation, 'strength_unit'),
        'strength' => cleanSkuField($variation, 'strength') ?? joinSkuParts(cleanSkuNumber($variation, 'strength_value'), cleanSkuField($variation, 'strength_unit')),
        'dosage_form' => cleanSkuField($variation, 'dosage_form') ?? cleanSkuField($variation, 'product_unit') ?? cleanSkuField($variation, 'unit'),
        'net_content_value' => cleanSkuNumber($variation, 'net_content_value') ?? cleanSkuNumber($variation, 'volume_value'),
        'net_content_unit' => cleanSkuField($variation, 'net_content_unit') ?? cleanSkuField($variation, 'volume_unit'),
        'medicine_package_type' => cleanSkuField($variation, 'package_type') ?? cleanSkuField($variation, 'packaging'),
        'size' => cleanSkuField($variation, 'size_value') ?? cleanSkuField($variation, 'display_size'),
        'net_weight' => cleanSkuNumber($variation, 'net_weight') ?? cleanSkuNumber($variation, 'weight_value') ?? cleanSkuNumber($variation, 'weight_volume_value'),
        'grocery_unit' => cleanSkuField($variation, 'unit') ?? cleanSkuField($variation, 'weight_unit') ?? cleanSkuField($variation, 'weight_volume_unit'),
        'grocery_package_type' => cleanSkuField($variation, 'package_type') ?? cleanSkuField($variation, 'packaging'),
        'material' => cleanSkuField($variation, 'material'),
        'sterile_status' => cleanSkuField($variation, 'sterile_status'),
        'medical_package_type' => cleanSkuField($variation, 'package_type') ?? cleanSkuField($variation, 'packaging'),
        'pack_content' => cleanSkuField($variation, 'pack_content') ?? joinSkuParts(cleanSkuNumber($variation, 'pack_content_qty'), cleanSkuField($variation, 'pack_content_unit')),
        'barcode' => $barcode,
        'inventory_unit_id' => cleanId($variation['inventory_unit_id'] ?? null),
        'price' => $price,
        'is_empty_detail' => $categoryName === 'Grocery'
            ? !(cleanSkuField($variation, 'variant_name') || cleanSkuField($variation, 'variant_flavor') || cleanSkuField($variation, 'size_value') || cleanSkuNumber($variation, 'net_weight') || cleanSkuNumber($variation, 'weight_value') || cleanSkuNumber($variation, 'weight_volume_value') || cleanSkuField($variation, 'unit') || cleanSkuField($variation, 'weight_unit') || cleanSkuField($variation, 'weight_volume_unit') || cleanSkuField($variation, 'package_type') || cleanSkuField($variation, 'packaging') || cleanSkuField($variation, 'pack_content') || cleanSkuNumber($variation, 'pack_content_qty'))
            : (in_array($categoryName, ['Medical Supply', 'Medical Supplies'], true)
                ? !(cleanSkuField($variation, 'variant_name') || cleanSkuField($variation, 'variant_flavor') || cleanSkuField($variation, 'size_value') || cleanSkuField($variation, 'material') || cleanSkuField($variation, 'sterile_status') || cleanSkuField($variation, 'package_type') || cleanSkuField($variation, 'packaging') || cleanSkuField($variation, 'pack_content') || cleanSkuNumber($variation, 'pack_content_qty'))
            : !(cleanSkuNumber($variation, 'strength_value') || cleanSkuField($variation, 'strength_unit') || cleanSkuField($variation, 'dosage_form') || cleanSkuNumber($variation, 'net_content_value') || cleanSkuNumber($variation, 'volume_value') || cleanSkuField($variation, 'net_content_unit') || cleanSkuField($variation, 'volume_unit') || cleanSkuField($variation, 'unit') || cleanSkuField($variation, 'package_type') || cleanSkuField($variation, 'packaging'))
            )
    ];
}

function productIdentityExists(
    PDO $pdo,
    string $categoryId,
    string $typeId,
    string $brandName,
    string $productName,
    string $categoryName,
    array $sku
): bool {
    $unbrandedProductName = preg_replace(
        '/^' . preg_quote($brandName, '/') . '\s+/i',
        '',
        trim($productName)
    ) ?: trim($productName);
    $params = [
        ':duplicate_category_id' => $categoryId,
        ':duplicate_type_id' => $typeId,
        ':duplicate_brand_name' => $brandName,
        ':duplicate_product_name' => $productName,
        ':duplicate_unbranded_product_name' => $unbrandedProductName,
        ':duplicate_branded_product_name' => trim($brandName . ' ' . $unbrandedProductName)
    ];
    $detailJoin = '';
    $detailWhere = '';

    if ($categoryName === 'Medicine') {
        $detailJoin = 'INNER JOIN medicine_details detail ON detail.product_id = p.product_id';
        $detailWhere = 'AND LOWER(TRIM(COALESCE(detail.generic_name, \'\'))) = LOWER(TRIM(COALESCE(:duplicate_generic_name, \'\')))
            AND detail.strength_value <=> :duplicate_strength_value
            AND LOWER(TRIM(COALESCE(detail.strength_unit, \'\'))) = LOWER(TRIM(COALESCE(:duplicate_strength_unit, \'\')))
            AND LOWER(TRIM(COALESCE(detail.dosage_form, \'\'))) = LOWER(TRIM(COALESCE(:duplicate_dosage_form, \'\')))
            AND detail.net_content_value <=> :duplicate_net_content_value
            AND LOWER(TRIM(COALESCE(detail.net_content_unit, \'\'))) = LOWER(TRIM(COALESCE(:duplicate_net_content_unit, \'\')))
            AND LOWER(TRIM(COALESCE(detail.package_type, \'\'))) = LOWER(TRIM(COALESCE(:duplicate_package_type, \'\')))';
        $params += [
            ':duplicate_generic_name' => $sku['generic_name'],
            ':duplicate_strength_value' => $sku['strength_value'],
            ':duplicate_strength_unit' => $sku['strength_unit'],
            ':duplicate_dosage_form' => $sku['dosage_form'],
            ':duplicate_net_content_value' => $sku['net_content_value'],
            ':duplicate_net_content_unit' => $sku['net_content_unit'],
            ':duplicate_package_type' => $sku['medicine_package_type']
        ];
    } elseif ($categoryName === 'Grocery') {
        $detailJoin = 'INNER JOIN grocery_details detail ON detail.product_id = p.product_id';
        $detailWhere = 'AND LOWER(TRIM(COALESCE(detail.variant, \'\'))) = LOWER(TRIM(COALESCE(:duplicate_variant, \'\')))
            AND LOWER(TRIM(COALESCE(detail.size, \'\'))) = LOWER(TRIM(COALESCE(:duplicate_size, \'\')))
            AND detail.net_weight <=> :duplicate_net_weight
            AND LOWER(TRIM(COALESCE(detail.unit, \'\'))) = LOWER(TRIM(COALESCE(:duplicate_unit, \'\')))
            AND LOWER(TRIM(COALESCE(detail.package_type, \'\'))) = LOWER(TRIM(COALESCE(:duplicate_package_type, \'\')))';
        $params += [
            ':duplicate_variant' => $sku['variant'],
            ':duplicate_size' => $sku['size'],
            ':duplicate_net_weight' => $sku['net_weight'],
            ':duplicate_unit' => $sku['grocery_unit'],
            ':duplicate_package_type' => $sku['grocery_package_type']
        ];
    } else {
        $detailJoin = 'INNER JOIN medical_supply_details detail ON detail.product_id = p.product_id';
        $detailWhere = 'AND LOWER(TRIM(COALESCE(detail.variant, \'\'))) = LOWER(TRIM(COALESCE(:duplicate_variant, \'\')))
            AND LOWER(TRIM(COALESCE(detail.size, \'\'))) = LOWER(TRIM(COALESCE(:duplicate_size, \'\')))
            AND LOWER(TRIM(COALESCE(detail.material, \'\'))) = LOWER(TRIM(COALESCE(:duplicate_material, \'\')))
            AND LOWER(TRIM(COALESCE(detail.sterile_status, \'\'))) = LOWER(TRIM(COALESCE(:duplicate_sterile_status, \'\')))
            AND LOWER(TRIM(COALESCE(detail.package_type, \'\'))) = LOWER(TRIM(COALESCE(:duplicate_package_type, \'\')))';
        $params += [
            ':duplicate_variant' => $sku['variant'],
            ':duplicate_size' => $sku['size'],
            ':duplicate_material' => $sku['material'],
            ':duplicate_sterile_status' => $sku['sterile_status'],
            ':duplicate_package_type' => $sku['medical_package_type']
        ];
    }

    $statement = $pdo->prepare(
        "SELECT p.product_id
         FROM product p
         {$detailJoin}
         WHERE p.category_id = :duplicate_category_id
           AND p.type_id = :duplicate_type_id
           AND LOWER(TRIM(p.brand_name)) = LOWER(TRIM(:duplicate_brand_name))
           AND (
               LOWER(TRIM(p.product_name)) = LOWER(TRIM(:duplicate_product_name))
               OR LOWER(TRIM(p.product_name)) = LOWER(TRIM(:duplicate_unbranded_product_name))
               OR LOWER(TRIM(p.product_name)) = LOWER(TRIM(:duplicate_branded_product_name))
           )
           {$detailWhere}
         LIMIT 1"
    );
    $statement->execute($params);
    return (bool) $statement->fetchColumn();
}

try {
    ensureProductCustomizationSchema($pdo);
    ensureProductStatusColumn($pdo);
    ensureProductPricingSchema($pdo);
    ensureSupplierPurchasingConversionSchema($pdo);
    $supplierId = cleanId($payload['supplier_id'] ?? null);
    if (
        $supplierId !== ''
        && !currentSessionHasRbacRole('super_admin')
        && !currentSessionHasRbacRole('ro_super_admin')
        && !currentSessionHasRbacRole('admin')
        && !currentSessionHasRbacRole('ro_admin')
    ) {
        http_response_code(403);
        echo json_encode(['status' => 'error', 'message' => 'Only an Admin can create or change supplier purchasing assignments.']);
        exit();
    }
    $categoryId = cleanId($payload['category_id'] ?? null);
    $typeId = cleanId($payload['type_id'] ?? null);
    $brandName = trim((string) ($payload['brand_name'] ?? ''));
    $productName = trim((string) ($payload['product_name'] ?? ''));
    $productStatus = normalizeProductStatus($payload['status'] ?? 'Active');
    $fallbackPrice = $payload['price'] ?? null;
    $pricingMethod = normalizePricingMethod($payload['pricing_method'] ?? 'manual');
    $customMarkup = normalizeMarkupPercentage($payload['custom_markup_percentage'] ?? null, true);
    if ($pricingMethod === 'custom_markup' && $customMarkup === null) {
        throw new InvalidArgumentException('Custom markup percentage is required for Custom markup pricing.');
    }
    if ($pricingMethod !== 'custom_markup') {
        $customMarkup = null;
    }
    $supplierCostPrice = $payload['supplier_cost_price'] ?? null;
    $purchaseUnit = cleanSkuField($payload, 'purchase_unit');
    $unitsPerPurchaseUnit = 1;
    if ($supplierId !== '') {
        $unitsPerPurchaseUnit = positiveSkuInteger($payload, 'units_per_purchase_unit');
        if ($purchaseUnit === null) {
            throw new InvalidArgumentException('Purchase Unit is required when assigning a supplier.');
        }
        if ($supplierCostPrice !== null && $supplierCostPrice !== '' && (!is_numeric($supplierCostPrice) || (float) $supplierCostPrice < 0)) {
            throw new InvalidArgumentException('Supplier cost must be a non-negative number when provided.');
        }
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
         INNER JOIN product_types pt ON pt.category_id=pc.category_id AND pt.type_id=:type_id AND pt.is_active=1
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
        // product.product_name remains populated only for compatibility with
        // existing modules; medicine_details.generic_name is canonical.
        $genericName = requiredMedicineGenericName($payload['generic_name'] ?? null);
        $productName = $brandName !== '' ? $brandName : $genericName;
    } else {
        $brandName = requiredProductField($payload, 'brand_name');
        $productName = requiredProductField($payload, 'product_name');
    }
    $rawVariations = isset($payload['variations']) && is_array($payload['variations']) && count($payload['variations']) > 0
        ? $payload['variations']
        : [$payload];

    $skuRows = [];
    $skuTypeStatement = $pdo->prepare(
        'SELECT type_name FROM product_types WHERE type_id=:type_id AND category_id=:category_id AND is_active=1 LIMIT 1'
    );
    foreach ($rawVariations as $variation) {
        if (!is_array($variation) || !empty($variation['delete'])) {
            continue;
        }
        $sku = normalizeSkuVariation($variation, $categoryName, $fallbackPrice, $productStatus);
        // A non-medicine SKU uses the Product Type selected for the product.
        // Older clients sent an empty per-SKU type, which must not mask it.
        $skuTypeId = cleanId($variation['type_id'] ?? null);
        if ($skuTypeId === '' && $categoryName !== 'Medicine') $skuTypeId = $typeId;
        $skuTypeStatement->execute([':type_id' => $skuTypeId, ':category_id' => $categoryId]);
        $skuTypeName = trim((string) $skuTypeStatement->fetchColumn());
        if ($skuTypeId === '' || $skuTypeName === '') {
            throw new InvalidArgumentException('Each sellable SKU requires a valid Product Type / Dosage Form for the selected category.');
        }
        $sku['type_id'] = $skuTypeId;
        $sku['type_name'] = $skuTypeName;
        $sku['has_dynamic_configuration'] = count(getTypeSpecificationConfiguration($pdo, $skuTypeId)) > 0;
        $inventoryUnit = requiredProductInventoryUnit($pdo, $sku['inventory_unit_id']);
        $sku['inventory_unit_id'] = $inventoryUnit['measurement_unit_id'];
        $sku['inventory_unit_name'] = $inventoryUnit['unit_name'];
        $submittedSpecifications = is_array($variation['specifications'] ?? null) ? $variation['specifications'] : [];
        $submittedSpecifications = withMedicineClassificationSpecification(
            $pdo,
            $categoryName,
            $submittedSpecifications,
            $variation['medicine_classification'] ?? $payload['medicine_classification'] ?? null
        );
        $sku['specifications'] = validateAndNormalizeSpecificationValues($pdo, $skuTypeId, $submittedSpecifications);
        $sku['medicine_details'] = requiredMedicineDetails($pdo, $categoryName, $skuTypeName, $payload, $variation, $sku['specifications'], $skuTypeId);
        $skuRows[] = $sku;
    }

    if (count($skuRows) === 0) {
        throw new InvalidArgumentException('Please add at least one sellable SKU.');
    }

    $submittedCombinations = [];
    foreach ($skuRows as $sku) {
        $signature = $sku['type_id'] . '|' . specificationValueSignature($sku['specifications']);
        if (isset($submittedCombinations[$signature])) {
            throw new InvalidArgumentException('Two variants have the same specification combination.');
        }
        $submittedCombinations[$signature] = true;
        if (($sku['has_dynamic_configuration'] && dynamicProductIdentityExists($pdo, $categoryId, $sku['type_id'], $brandName, $productName, $sku['specifications'])) || (!$sku['has_dynamic_configuration'] && productIdentityExists(
            $pdo,
            $categoryId,
            $sku['type_id'],
            $brandName,
            $productName,
            $categoryName,
            $sku
        ))) {
            throw new InvalidArgumentException(
                'This exact product and specification already exists in Product Master. Use the existing product or create a different variant.'
            );
        }
    }
    $submittedBarcodes = [];
    $barcodeCheck = $pdo->prepare('SELECT product_id FROM product WHERE LOWER(TRIM(barcode)) = LOWER(TRIM(:barcode)) LIMIT 1');
    $unitBarcodeColumn = productSellingOptionBarcodeColumn($pdo);
    $unitBarcodeCheck = $unitBarcodeColumn
        ? $pdo->prepare("SELECT product_id FROM product_selling_options WHERE LOWER(TRIM(`{$unitBarcodeColumn}`)) = LOWER(TRIM(:barcode)) LIMIT 1")
        : null;
    foreach ($skuRows as $sku) {
        $normalizedBarcode = strtolower(trim((string) $sku['barcode']));
        if (isset($submittedBarcodes[$normalizedBarcode])) {
            throw new InvalidArgumentException('Each product variant must have a unique barcode.');
        }
        $submittedBarcodes[$normalizedBarcode] = true;
        $barcodeCheck->execute([':barcode' => $sku['barcode']]);
        if ($barcodeCheck->fetchColumn()) {
            throw new InvalidArgumentException('This barcode already belongs to another product variant.');
        }
        if ($unitBarcodeCheck) {
            $unitBarcodeCheck->execute([':barcode' => $sku['barcode']]);
            if ($unitBarcodeCheck->fetchColumn()) {
                throw new InvalidArgumentException('This barcode already belongs to a sellable unit.');
            }
        }
    }

    $pdo->beginTransaction();

    $productInsert = $pdo->prepare(
        'INSERT INTO product (product_id, barcode, brand_name, product_name, category_id, type_id, inventory_unit_id, price, pricing_method, custom_markup_percentage, status)
         VALUES (:product_id, :barcode, :brand_name, :product_name, :category_id, :type_id, :inventory_unit_id, :price, :pricing_method, :custom_markup_percentage, :status)'
    );
    $medicineInsert = $pdo->prepare(
        'INSERT INTO medicine_details (medicine_detail_id, product_id, generic_name, strength_value, strength_unit, strength, dosage_form, net_content_value, net_content_unit, package_type)
         VALUES (:medicine_detail_id, :product_id, :generic_name, :strength_value, :strength_unit, :strength, :dosage_form, :net_content_value, :net_content_unit, :package_type)'
    );
    $groceryInsert = $pdo->prepare(
        'INSERT INTO grocery_details (grocery_detail_id, product_id, variant, size, net_weight, unit, package_type, pack_content)
         VALUES (:grocery_detail_id, :product_id, :variant, :size, :net_weight, :unit, :package_type, :pack_content)'
    );
    $medicalSupplyInsert = $pdo->prepare(
        'INSERT INTO medical_supply_details (medical_supply_detail_id, product_id, variant, size, material, sterile_status, package_type, pack_content)
         VALUES (:medical_supply_detail_id, :product_id, :variant, :size, :material, :sterile_status, :package_type, :pack_content)'
    );
    $supplierInsert = $pdo->prepare(
        'INSERT INTO supplier_products (supplier_product_id,supplier_id,product_id,supplier_cost_price,supplier_cost_input,supplier_cost_basis,purchase_unit,purchase_unit_contains,inventory_unit,units_per_purchase_unit)
         VALUES (:supplier_product_id,:supplier_id,:product_id,:supplier_cost_price,:supplier_cost_input,\'purchase\',:purchase_unit,:purchase_unit_contains,:inventory_unit,:units_per_purchase_unit)
         ON DUPLICATE KEY UPDATE
            supplier_cost_price = COALESCE(VALUES(supplier_cost_price), supplier_cost_price),
            supplier_cost_input = COALESCE(VALUES(supplier_cost_input), supplier_cost_input),
            supplier_cost_basis = VALUES(supplier_cost_basis),
            purchase_unit = VALUES(purchase_unit),
            purchase_unit_contains = VALUES(purchase_unit_contains),
            inventory_unit = VALUES(inventory_unit),
            units_per_purchase_unit = VALUES(units_per_purchase_unit)'
    );

    $createdProductIds = [];
    foreach ($skuRows as $sku) {
        $productId = newUuid($pdo);
        $productInsert->execute([
            ':product_id' => $productId,
            ':barcode' => $sku['barcode'],
            ':brand_name' => $brandName,
            ':product_name' => $productName,
            ':category_id' => $categoryId,
            ':type_id' => $sku['type_id'],
            ':inventory_unit_id' => $sku['inventory_unit_id'],
            ':price' => $sku['price'],
            ':pricing_method' => $pricingMethod,
            ':custom_markup_percentage' => $customMarkup,
            ':status' => $productStatus
        ]);

        if ($categoryName === 'Medicine') {
            $medicine = $sku['medicine_details'];
            $medicineInsert->execute([
                ':medicine_detail_id' => newUuid($pdo),
                ':product_id' => $productId,
                ':generic_name' => $medicine['generic_name'],
                ':strength_value' => $medicine['strength_value'],
                ':strength_unit' => $medicine['strength_unit'],
                ':strength' => $medicine['strength'],
                ':dosage_form' => $medicine['dosage_form'],
                ':net_content_value' => $medicine['net_content_value'],
                ':net_content_unit' => $medicine['net_content_unit'],
                ':package_type' => $medicine['package_type']
            ]);
        } elseif (!$sku['has_dynamic_configuration'] && $categoryName === 'Grocery') {
            $groceryInsert->execute([
                ':grocery_detail_id' => newUuid($pdo),
                ':product_id' => $productId,
                ':variant' => $sku['variant'],
                ':size' => $sku['size'],
                ':net_weight' => $sku['net_weight'],
                ':unit' => $sku['grocery_unit'],
                ':package_type' => $sku['grocery_package_type'],
                ':pack_content' => $sku['pack_content']
            ]);
        } elseif (!$sku['has_dynamic_configuration'] && in_array($categoryName, ['Medical Supply', 'Medical Supplies'], true)) {
            $medicalSupplyInsert->execute([
                ':medical_supply_detail_id' => newUuid($pdo),
                ':product_id' => $productId,
                ':variant' => $sku['variant'],
                ':size' => $sku['size'],
                ':material' => $sku['material'],
                ':sterile_status' => $sku['sterile_status'],
                ':package_type' => $sku['medical_package_type'],
                ':pack_content' => $sku['pack_content']
            ]);
        }

        if ($supplierId !== '') {
            $supplierProductId = newUuid($pdo);
            $supplierInsert->execute([
                ':supplier_product_id' => $supplierProductId,
                ':supplier_id' => $supplierId,
                ':product_id' => $productId,
                ':supplier_cost_price' => ($supplierCostPrice === null || $supplierCostPrice === '') ? null : (float) $supplierCostPrice / $unitsPerPurchaseUnit,
                ':supplier_cost_input' => ($supplierCostPrice === null || $supplierCostPrice === '') ? null : (float) $supplierCostPrice,
                ':purchase_unit' => $purchaseUnit,
                ':purchase_unit_contains' => $unitsPerPurchaseUnit,
                ':inventory_unit' => $sku['inventory_unit_name'],
                ':units_per_purchase_unit' => $unitsPerPurchaseUnit
            ]);
            syncSupplierProductUnitConversions($pdo,$supplierProductId,[
                'purchase_unit'=>$purchaseUnit,
                'purchase_unit_contains'=>$unitsPerPurchaseUnit,
                'inventory_unit'=>$sku['inventory_unit_name'],
                'units_per_purchase_unit'=>$unitsPerPurchaseUnit,
            ]);
        }
        saveProductSpecificationValues($pdo, $productId, $sku['specifications']);
        syncProductDefaultSellingPrice($pdo, $productId, (float) $sku['price']);
        $createdProductIds[] = $productId;
    }

    $pdo->commit();

    foreach ($createdProductIds as $createdProductId) {
        recordActivityLog($pdo, 'Products', 'Added', 'Product added: ' . $productName, $createdProductId);
    }

    http_response_code(201);
    echo json_encode([
        'status' => 'success',
        'message' => count($createdProductIds) === 1 ? 'Product SKU added successfully.' : 'Product SKUs added successfully.',
        'product_ids' => $createdProductIds,
        'product_id' => $createdProductIds[0] ?? null
    ]);
} catch (InvalidArgumentException $e) {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }
    http_response_code(400);
    echo json_encode(['status' => 'error', 'message' => $e->getMessage()]);
} catch (Throwable $e) {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }
    http_response_code(500);
    echo json_encode(['status' => 'error', 'message' => 'Unable to add product SKU.', 'error' => $e->getMessage()]);
}
?>
