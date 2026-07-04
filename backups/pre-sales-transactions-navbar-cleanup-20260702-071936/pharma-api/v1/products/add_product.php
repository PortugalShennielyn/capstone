<?php
require_once '../../config/db_connection.php';
require_once '../../config/require_auth.php';
require_once 'product_category_schema.php';

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

function normalizeSkuVariation(array $variation, string $categoryName, ?string $fallbackPrice): array
{
    $price = $variation['price'] ?? $fallbackPrice;
    if (!is_numeric($price) || (float) $price < 0) {
        throw new InvalidArgumentException('Each SKU must have a valid non-negative price.');
    }

    $barcode = cleanSkuField($variation, 'barcode') ?? ('AUTO-' . strtoupper(bin2hex(random_bytes(6))));

    return [
        'variant' => cleanSkuField($variation, 'variant_name') ?? cleanSkuField($variation, 'variant_flavor') ?? cleanSkuField($variation, 'variation_name'),
        'generic_name' => cleanSkuField($variation, 'generic_name'),
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
        'price' => (float) $price,
        'is_empty_detail' => $categoryName === 'Grocery'
            ? !(cleanSkuField($variation, 'variant_name') || cleanSkuField($variation, 'variant_flavor') || cleanSkuField($variation, 'size_value') || cleanSkuNumber($variation, 'net_weight') || cleanSkuNumber($variation, 'weight_value') || cleanSkuNumber($variation, 'weight_volume_value') || cleanSkuField($variation, 'unit') || cleanSkuField($variation, 'weight_unit') || cleanSkuField($variation, 'weight_volume_unit') || cleanSkuField($variation, 'package_type') || cleanSkuField($variation, 'packaging') || cleanSkuField($variation, 'pack_content') || cleanSkuNumber($variation, 'pack_content_qty'))
            : (in_array($categoryName, ['Medical Supply', 'Medical Supplies'], true)
                ? !(cleanSkuField($variation, 'variant_name') || cleanSkuField($variation, 'variant_flavor') || cleanSkuField($variation, 'size_value') || cleanSkuField($variation, 'material') || cleanSkuField($variation, 'sterile_status') || cleanSkuField($variation, 'package_type') || cleanSkuField($variation, 'packaging') || cleanSkuField($variation, 'pack_content') || cleanSkuNumber($variation, 'pack_content_qty'))
            : !(cleanSkuField($variation, 'generic_name') || cleanSkuNumber($variation, 'strength_value') || cleanSkuField($variation, 'strength_unit') || cleanSkuField($variation, 'dosage_form') || cleanSkuNumber($variation, 'net_content_value') || cleanSkuNumber($variation, 'volume_value') || cleanSkuField($variation, 'net_content_unit') || cleanSkuField($variation, 'volume_unit') || cleanSkuField($variation, 'unit') || cleanSkuField($variation, 'package_type') || cleanSkuField($variation, 'packaging'))
            )
    ];
}

try {
    $supplierId = cleanId($payload['supplier_id'] ?? null);
    $categoryId = cleanId($payload['category_id'] ?? null);
    $typeId = cleanId($payload['type_id'] ?? null);
    $brandName = requiredProductField($payload, 'brand_name');
    $productName = requiredProductField($payload, 'product_name');
    $fallbackPrice = $payload['price'] ?? '0';
    $supplierCostPrice = $payload['supplier_cost_price'] ?? null;
    $purchaseUnit = cleanSkuField($payload, 'purchase_unit');
    $unitsPerPurchaseUnit = positiveSkuInteger($payload, 'units_per_purchase_unit');

    if ($supplierId === '') {
        throw new InvalidArgumentException('A supplier is required.');
    }
    if ($categoryId === '') {
        throw new InvalidArgumentException('A valid product category is required.');
    }
    if ($typeId === '' || getProductTypeId($pdo, $categoryId, $typeId) === null) {
        throw new InvalidArgumentException('A valid product type is required for the selected category.');
    }

    $categoryStatement = $pdo->prepare('SELECT category_name FROM product_categories WHERE category_id = :category_id LIMIT 1');
    $categoryStatement->execute([':category_id' => $categoryId]);
    $categoryName = (string) $categoryStatement->fetchColumn();
    if ($categoryName === '') {
        throw new InvalidArgumentException('A valid product category is required.');
    }

    $rawVariations = isset($payload['variations']) && is_array($payload['variations']) && count($payload['variations']) > 0
        ? $payload['variations']
        : [$payload];

    $skuRows = [];
    foreach ($rawVariations as $variation) {
        if (!is_array($variation) || !empty($variation['delete'])) {
            continue;
        }
        $variation['generic_name'] = cleanSkuField($variation, 'generic_name') ?? cleanSkuField($payload, 'generic_name');
        $skuRows[] = normalizeSkuVariation($variation, $categoryName, $fallbackPrice);
    }

    if (count($skuRows) === 0) {
        throw new InvalidArgumentException('Please add at least one sellable SKU.');
    }

    $pdo->beginTransaction();

    $productInsert = $pdo->prepare(
        'INSERT INTO product (product_id, barcode, brand_name, product_name, category_id, type_id, price)
         VALUES (:product_id, :barcode, :brand_name, :product_name, :category_id, :type_id, :price)'
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
        'INSERT INTO supplier_products (supplier_id, product_id, supplier_cost_price, purchase_unit, units_per_purchase_unit)
         VALUES (:supplier_id, :product_id, :supplier_cost_price, :purchase_unit, :units_per_purchase_unit)
         ON DUPLICATE KEY UPDATE
            supplier_cost_price = VALUES(supplier_cost_price),
            purchase_unit = VALUES(purchase_unit),
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
            ':type_id' => $typeId,
            ':price' => $sku['price']
        ]);

        if ($categoryName === 'Medicine') {
            $medicineInsert->execute([
                ':medicine_detail_id' => newUuid($pdo),
                ':product_id' => $productId,
                ':generic_name' => $sku['generic_name'] ?? cleanSkuField($payload, 'generic_name'),
                ':strength_value' => $sku['strength_value'],
                ':strength_unit' => $sku['strength_unit'],
                ':strength' => $sku['strength'],
                ':dosage_form' => $sku['dosage_form'],
                ':net_content_value' => $sku['net_content_value'],
                ':net_content_unit' => $sku['net_content_unit'],
                ':package_type' => $sku['medicine_package_type']
            ]);
        } elseif ($categoryName === 'Grocery') {
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
        } elseif (in_array($categoryName, ['Medical Supply', 'Medical Supplies'], true)) {
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

        $supplierInsert->execute([
            ':supplier_id' => $supplierId,
            ':product_id' => $productId,
            ':supplier_cost_price' => is_numeric($supplierCostPrice) ? (float) $supplierCostPrice : null,
            ':purchase_unit' => $purchaseUnit,
            ':units_per_purchase_unit' => $unitsPerPurchaseUnit
        ]);
        $createdProductIds[] = $productId;
    }

    $pdo->commit();

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
