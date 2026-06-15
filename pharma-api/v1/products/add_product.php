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

    $supplierId = isset($payload['supplier_id']) ? (int) $payload['supplier_id'] : 0;
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
    $variationPayloads = [];

    $numericField = static function (array $source, string $field, bool $integer = false) {
        $value = trim((string) ($source[$field] ?? ''));
        if ($value === '' || strcasecmp($value, 'N/A') === 0) {
            return null;
        }
        if (!is_numeric($value)) {
            throw new InvalidArgumentException(str_replace('_', ' ', ucfirst($field)) . ' must be a number only.');
        }
        return $integer ? (int) $value : $value;
    };

    if ($supplierId <= 0) {
        throw new InvalidArgumentException('A supplier is required.');
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

    $hasVariationPrices = isset($payload['variations']) && is_array($payload['variations']) && count($payload['variations']) > 0;
    if (!is_numeric($price) || (float) $price < 0) {
        if ($hasVariationPrices) {
            $price = 0;
        } else {
        throw new InvalidArgumentException('Price must be a valid non-negative number.');
        }
    }

    $categoryStatement = $pdo->prepare(
        'SELECT category_name
         FROM product_categories
         WHERE category_id = :category_id
         LIMIT 1'
    );
    $categoryStatement->execute([':category_id' => $categoryId]);
    $categoryName = (string) $categoryStatement->fetchColumn();

    if ($categoryName === '') {
        throw new InvalidArgumentException('A valid product category is required.');
    }

    $genericName = null;
    if ($categoryName === 'Medicine') {
        $genericName = requiredProductField($payload, 'generic_name');
        $strengthValue = $numericField($payload, 'strength_value');
        $volumeValue = $numericField($payload, 'volume_value');
        $strengthSizeValue = $strengthValue ?? $volumeValue ?? $displaySize ?? optionalProductField($payload, 'strength_size_value');
        $variantFlavor = null;
        $sizeValue = $displaySize;
        $weightVolumeValue = null;
        $weightVolumeUnit = null;
        $variationPayloads[] = [
            'variant_name' => null,
            'strength_value' => $strengthValue,
            'strength_unit' => $strengthUnit,
            'volume_value' => $volumeValue,
            'volume_unit' => $volumeUnit,
            'size_value' => $displaySize ?: $sizeValue,
            'weight_value' => null,
            'weight_unit' => null,
            'unit' => $productUnit,
            'packaging' => $packaging,
            'pack_content_qty' => $numericField($payload, 'pack_content_qty', true),
            'pack_content_unit' => optionalProductField($payload, 'pack_content_unit'),
            'price' => (float) $price,
            'barcode' => trim((string) ($payload['barcode'] ?? '')),
            'sku' => optionalProductField($payload, 'sku'),
            'stock' => 0,
            'is_default' => 1
        ];
    } elseif ($categoryName === 'Grocery') {
        $rawVariations = (isset($payload['variations']) && is_array($payload['variations']) && count($payload['variations']) > 0)
            ? $payload['variations']
            : [$payload];

        foreach ($rawVariations as $index => $variation) {
            if (!is_array($variation)) {
                continue;
            }

            $variationPrice = $variation['price'] ?? $price;
            if (!is_numeric($variationPrice) || (float) $variationPrice < 0) {
                throw new InvalidArgumentException('Each grocery variation must have a valid non-negative price.');
            }

            $variationSize = requiredProductField($variation, 'size_value');
            $variationBarcode = trim((string) ($variation['barcode'] ?? ''));
            if ($variationBarcode === '') {
                $variationBarcode = 'AUTO-' . strtoupper(bin2hex(random_bytes(6)));
            }

            $variationPayloads[] = [
                'variant_name' => optionalProductField($variation, 'variant_flavor') ?? optionalProductField($variation, 'variation_name'),
                'strength_value' => null,
                'strength_unit' => null,
                'volume_value' => $numericField($variation, 'volume_value'),
                'volume_unit' => optionalProductField($variation, 'volume_unit'),
                'size_value' => $variationSize,
                'weight_value' => $numericField($variation, 'weight_volume_value') ?? $numericField($variation, 'net_weight'),
                'weight_unit' => optionalProductField($variation, 'weight_volume_unit') ?? optionalProductField($variation, 'weight_unit'),
                'unit' => optionalProductField($variation, 'unit') ?? $productUnit,
                'packaging' => optionalProductField($variation, 'packaging'),
                'pack_content_qty' => $numericField($variation, 'pack_content_qty', true),
                'pack_content_unit' => optionalProductField($variation, 'pack_content_unit'),
                'price' => (float) $variationPrice,
                'barcode' => $variationBarcode,
                'sku' => optionalProductField($variation, 'sku'),
                'stock' => max(0, (int) ($variation['stock'] ?? 0)),
                'is_default' => $index === 0 ? 1 : 0
            ];
        }

        if (count($variationPayloads) === 0) {
            throw new InvalidArgumentException('Please add at least one grocery variation.');
        }

        $firstVariation = $variationPayloads[0];
        $variantFlavor = $firstVariation['variant_name'];
        $sizeValue = $firstVariation['size_value'];
        $displaySize = $sizeValue;
        $weightVolumeValue = $firstVariation['weight_value'];
        $weightVolumeUnit = $firstVariation['weight_unit'];
        $packaging = $firstVariation['packaging'];
        $price = $firstVariation['price'];
        $strengthValue = null;
        $strengthUnit = null;
        $volumeValue = null;
        $volumeUnit = null;
        $strengthSizeValue = null;
    }

    $barcode = trim((string) ($payload['barcode'] ?? ''));
    if ($categoryName === 'Grocery' && isset($variationPayloads[0]['barcode'])) {
        $barcode = $variationPayloads[0]['barcode'];
    }
    if ($barcode === '') {
        $barcode = 'AUTO-' . strtoupper(bin2hex(random_bytes(6)));
    }
    if ($variationPayloads && empty($variationPayloads[0]['barcode'])) {
        $variationPayloads[0]['barcode'] = $barcode;
    }

    $columns = [
        'category_id',
        'type_id',
        'brand_name',
        'product_name',
        'generic_name',
        'image_url'
    ];

    $values = [
        ':category_id' => $categoryId,
        ':type_id' => $typeId,
        ':brand_name' => $brandName,
        ':product_name' => $productName,
        ':generic_name' => $genericName,
        ':image_url' => $imageUrl !== '' ? $imageUrl : null
    ];

    if (productTableHasColumn($pdo, 'measurement_unit_id')) {
        $columns[] = 'measurement_unit_id';
        $values[':measurement_unit_id'] = $measurementUnitId;
    }
    if (productTableHasColumn($pdo, 'barcode')) {
        $columns[] = 'barcode';
        $values[':barcode'] = $barcode;
    }
    if (productTableHasColumn($pdo, 'price')) {
        $columns[] = 'price';
        $values[':price'] = (float) $price;
    }

    if (productTableHasColumn($pdo, 'supplier_id')) {
        $columns[] = 'supplier_id';
        $values[':supplier_id'] = $supplierId;
    }

    $placeholders = array_keys($values);

    $pdo->beginTransaction();

    $mainProductStatement = $pdo->prepare(
        'SELECT p.product_id
         FROM product p
         INNER JOIN supplier_products sp ON sp.product_id = p.product_id
         WHERE sp.supplier_id = :supplier_id
           AND p.category_id = :category_id
           AND p.type_id = :type_id
           AND p.brand_name = :brand_name
           AND p.product_name = :product_name
           AND COALESCE(p.generic_name, "") = :generic_name_match
         LIMIT 1'
    );
    $mainProductStatement->execute([
        ':supplier_id' => $supplierId,
        ':category_id' => $categoryId,
        ':type_id' => $typeId,
        ':brand_name' => $brandName,
        ':product_name' => $productName,
        ':generic_name_match' => $genericName ?? ''
    ]);
    $mainProductId = (int) $mainProductStatement->fetchColumn();

    if ($mainProductId > 0) {
        $variationStatement = $pdo->prepare(
            'INSERT INTO product_variations (
                product_id,
                variant_name,
                strength_value,
                strength_unit,
                volume_value,
                volume_unit,
                size_value,
                size_unit,
                weight_value,
                weight_unit,
                unit,
                packaging,
                pack_content_qty,
                pack_content_unit,
                price,
                barcode,
                sku,
                is_default,
                stock
             ) VALUES (
                :product_id,
                :variant_name,
                :strength_value,
                :strength_unit,
                :volume_value,
                :volume_unit,
                :size_value,
                NULL,
                :weight_value,
                :weight_unit,
                :unit,
                :packaging,
                :pack_content_qty,
                :pack_content_unit,
                :price,
                :barcode,
                :sku,
                :is_default,
                :stock
             )'
        );
        foreach ($variationPayloads as $variation) {
            $variationStatement->execute([
                ':product_id' => $mainProductId,
                ':variant_name' => $variation['variant_name'],
                ':strength_value' => $variation['strength_value'],
                ':strength_unit' => $variation['strength_unit'],
                ':volume_value' => $variation['volume_value'],
                ':volume_unit' => $variation['volume_unit'],
                ':size_value' => $variation['size_value'],
                ':weight_value' => $variation['weight_value'],
                ':weight_unit' => $variation['weight_unit'],
                ':unit' => $variation['unit'],
                ':packaging' => $variation['packaging'],
                ':pack_content_qty' => $variation['pack_content_qty'],
                ':pack_content_unit' => $variation['pack_content_unit'],
                ':price' => $variation['price'],
                ':barcode' => $variation['barcode'],
                ':sku' => $variation['sku'],
                ':is_default' => 0,
                ':stock' => $variation['stock']
            ]);
        }

        $pdo->commit();

        http_response_code(201);
        echo json_encode([
            'status' => 'success',
            'message' => 'Product variation added successfully.',
            'product_id' => $mainProductId,
            'variation_id' => (int) $pdo->lastInsertId()
        ]);
        exit();
    }

    $existingProductStatement = $pdo->prepare(
        'SELECT product_id
         FROM product
         WHERE category_id = :category_id
           AND type_id = :type_id
           AND brand_name = :brand_name
           AND product_name = :product_name
           AND COALESCE(generic_name, "") = :generic_name_match
         LIMIT 1'
    );
    $existingProductStatement->execute([
        ':category_id' => $categoryId,
        ':type_id' => $typeId,
        ':brand_name' => $brandName,
        ':product_name' => $productName,
        ':generic_name_match' => $genericName ?? ''
    ]);

    $existingProductId = (int) $existingProductStatement->fetchColumn();

    if ($existingProductId > 0) {
        $supplierProductStatement = $pdo->prepare(
            'INSERT IGNORE INTO supplier_products (supplier_id, product_id)
             VALUES (:supplier_id, :product_id)'
        );
        $supplierProductStatement->execute([
            ':supplier_id' => $supplierId,
            ':product_id' => $existingProductId
        ]);

        $pdo->commit();

        echo json_encode([
            'status' => 'success',
            'message' => 'Product already exists and is linked to this supplier.',
            'product_id' => $existingProductId
        ]);
        exit();
    }

    $productStatement = $pdo->prepare(
        'INSERT INTO product (' . implode(', ', $columns) . ')
         VALUES (' . implode(', ', $placeholders) . ')'
    );
    $productStatement->execute($values);

    $productId = (int) $pdo->lastInsertId();

    $variationStatement = $pdo->prepare(
        'INSERT INTO product_variations (
            product_id,
            variant_name,
            strength_value,
            strength_unit,
            volume_value,
            volume_unit,
            size_value,
            size_unit,
            weight_value,
            weight_unit,
            unit,
            packaging,
            pack_content_qty,
            pack_content_unit,
            price,
            barcode,
            sku,
            is_default,
            stock
         ) VALUES (
            :product_id,
            :variant_name,
            :strength_value,
            :strength_unit,
            :volume_value,
            :volume_unit,
            :size_value,
            NULL,
            :weight_value,
            :weight_unit,
            :unit,
            :packaging,
            :pack_content_qty,
            :pack_content_unit,
            :price,
            :barcode,
            :sku,
            :is_default,
            :stock
         )'
    );
    foreach ($variationPayloads as $variation) {
        $variationStatement->execute([
            ':product_id' => $productId,
            ':variant_name' => $variation['variant_name'],
            ':strength_value' => $variation['strength_value'],
            ':strength_unit' => $variation['strength_unit'],
            ':volume_value' => $variation['volume_value'],
            ':volume_unit' => $variation['volume_unit'],
            ':size_value' => $variation['size_value'],
            ':weight_value' => $variation['weight_value'],
            ':weight_unit' => $variation['weight_unit'],
            ':unit' => $variation['unit'],
            ':packaging' => $variation['packaging'],
            ':pack_content_qty' => $variation['pack_content_qty'],
            ':pack_content_unit' => $variation['pack_content_unit'],
            ':price' => $variation['price'],
            ':barcode' => $variation['barcode'],
            ':sku' => $variation['sku'],
            ':is_default' => $variation['is_default'],
            ':stock' => $variation['stock']
        ]);
    }

    $supplierProductStatement = $pdo->prepare(
        'INSERT IGNORE INTO supplier_products (supplier_id, product_id)
         VALUES (:supplier_id, :product_id)'
    );
    $supplierProductStatement->execute([
        ':supplier_id' => $supplierId,
        ':product_id' => $productId
    ]);

    $pdo->commit();

    http_response_code(201);
    echo json_encode([
        'status' => 'success',
        'message' => 'Product added successfully.',
        'product_id' => $productId
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
    echo json_encode(['status' => 'error', 'message' => 'Unable to add product.']);
}
?>
