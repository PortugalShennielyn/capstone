<?php
require_once '../../config/db_connection.php';
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

try {
    ensureProductCategorySchema($pdo);

    $productId = isset($payload['product_id']) ? (int) $payload['product_id'] : 0;
    $categoryId = isset($payload['category_id']) ? (int) $payload['category_id'] : 0;
    $typeId = isset($payload['type_id']) ? (int) $payload['type_id'] : 0;
    $measurementUnitId = isset($payload['measurement_unit_id']) ? (int) $payload['measurement_unit_id'] : 0;
    $brandName = requiredProductField($payload, 'brand_name');
    $productName = requiredProductField($payload, 'product_name');
    $strengthSizeValue = optionalProductField($payload, 'strength_size_value');
    $strengthValue = optionalProductField($payload, 'strength_value');
    $strengthUnit = optionalProductField($payload, 'strength_unit');
    $volumeValue = optionalProductField($payload, 'volume_value');
    $volumeUnit = optionalProductField($payload, 'volume_unit');
    $variantFlavor = optionalProductField($payload, 'variant_flavor');
    $sizeValue = optionalProductField($payload, 'size_value');
    $displaySize = optionalProductField($payload, 'display_size');
    $weightVolumeValue = optionalProductField($payload, 'weight_volume_value');
    $weightVolumeUnit = optionalProductField($payload, 'weight_volume_unit');
    $packaging = optionalProductField($payload, 'packaging');
    $productUnit = optionalProductField($payload, 'product_unit');
    $price = $payload['price'] ?? null;
    $imageUrl = trim((string) ($payload['image_url'] ?? ''));

    if ($productId <= 0) {
        throw new InvalidArgumentException('A valid product is required.');
    }

    if ($categoryId <= 0) {
        throw new InvalidArgumentException('A valid product category is required.');
    }

    if ($typeId <= 0 || getProductTypeId($pdo, $categoryId, $typeId) === null) {
        throw new InvalidArgumentException('A valid product type is required for the selected category.');
    }

    if ($measurementUnitId <= 0 || getMeasurementUnitId($pdo, $measurementUnitId) === null) {
        throw new InvalidArgumentException('A valid measurement unit is required.');
    }

    if ($productUnit === null) {
        $unitIdColumn = getMeasurementUnitIdColumn($pdo);
        $unitStatement = $pdo->prepare("SELECT unit_name FROM product_measurement_units WHERE {$unitIdColumn} = :measurement_unit_id LIMIT 1");
        $unitStatement->execute([':measurement_unit_id' => $measurementUnitId]);
        $productUnit = optionalProductField(['product_unit' => $unitStatement->fetchColumn()], 'product_unit');
    }

    if (!is_numeric($price) || (float) $price < 0) {
        throw new InvalidArgumentException('Price must be a valid non-negative number.');
    }

    $categoryStatement = $pdo->prepare(
        'SELECT category_name FROM product_categories WHERE category_id = :category_id LIMIT 1'
    );
    $categoryStatement->execute([':category_id' => $categoryId]);
    $categoryName = (string) $categoryStatement->fetchColumn();

    if ($categoryName === '') {
        throw new InvalidArgumentException('A valid product category is required.');
    }

    $genericName = null;
    if ($categoryName === 'Medicine') {
        $genericName = requiredProductField($payload, 'generic_name');
        $strengthSizeValue = $strengthValue ?? $volumeValue ?? $displaySize ?? optionalProductField($payload, 'strength_size_value');
        $variantFlavor = null;
        $sizeValue = $displaySize;
        $weightVolumeValue = null;
        $weightVolumeUnit = null;
    } elseif ($categoryName === 'Grocery') {
        $variantFlavor = optionalProductField($payload, 'variant_flavor');
        $sizeValue = requiredProductField($payload, 'size_value');
        $displaySize = $sizeValue;
        $packaging = optionalProductField($payload, 'packaging');
        $strengthValue = null;
        $strengthUnit = null;
        $volumeValue = null;
        $volumeUnit = null;
        $strengthSizeValue = null;
    }

    $statement = $pdo->prepare(
        'UPDATE product
         SET category_id = :category_id,
             type_id = :type_id,
             measurement_unit_id = :measurement_unit_id,
             brand_name = :brand_name,
             product_name = :product_name,
             generic_name = :generic_name,
             strength_size_value = :strength_size_value,
             strength_value = :strength_value,
             strength_unit = :strength_unit,
             volume_value = :volume_value,
             volume_unit = :volume_unit,
             variant_flavor = :variant_flavor,
             size_value = :size_value,
             display_size = :display_size,
             weight_volume_value = :weight_volume_value,
             weight_volume_unit = :weight_volume_unit,
             packaging = :packaging,
             product_unit = :product_unit,
             price = :price,
             image_url = :image_url
         WHERE product_id = :product_id'
    );

    $statement->execute([
        ':category_id' => $categoryId,
        ':type_id' => $typeId,
        ':measurement_unit_id' => $measurementUnitId,
        ':brand_name' => $brandName,
        ':product_name' => $productName,
        ':generic_name' => $genericName,
        ':strength_size_value' => $strengthSizeValue,
        ':strength_value' => $strengthValue,
        ':strength_unit' => $strengthUnit,
        ':volume_value' => $volumeValue,
        ':volume_unit' => $volumeUnit,
        ':variant_flavor' => $variantFlavor,
        ':size_value' => $sizeValue,
        ':display_size' => $displaySize,
        ':weight_volume_value' => $weightVolumeValue,
        ':weight_volume_unit' => $weightVolumeUnit,
        ':packaging' => $packaging,
        ':product_unit' => $productUnit,
        ':price' => (float) $price,
        ':image_url' => $imageUrl !== '' ? $imageUrl : null,
        ':product_id' => $productId
    ]);

    echo json_encode([
        'status' => 'success',
        'message' => 'Product updated successfully.'
    ]);
} catch (InvalidArgumentException $e) {
    http_response_code(400);
    echo json_encode(['status' => 'error', 'message' => $e->getMessage()]);
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode(['status' => 'error', 'message' => 'Unable to update product.']);
}
?>
