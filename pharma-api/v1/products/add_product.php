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

    $supplierId = cleanId($payload['supplier_id'] ?? null);
    $categoryId = cleanId($payload['category_id'] ?? null);
    $typeId = cleanId($payload['type_id'] ?? null);
    $measurementUnitId = cleanId($payload['measurement_unit_id'] ?? null);
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

    if ($supplierId === '') {
        throw new InvalidArgumentException('A supplier is required.');
    }

    if ($categoryId === '') {
        throw new InvalidArgumentException('A valid product category is required.');
    }

    if ($typeId === '' || getProductTypeId($pdo, $categoryId, $typeId) === null) {
        throw new InvalidArgumentException('A valid product type is required for the selected category.');
    }

    if ($productUnit === null) {
        $firstVariation = (isset($payload['variations']) && is_array($payload['variations']) && count($payload['variations']) > 0)
            ? (is_array($payload['variations'][0]) ? $payload['variations'][0] : [])
            : $payload;
        $productUnit = optionalProductField($firstVariation, 'unit')
            ?? optionalProductField($firstVariation, 'packaging')
            ?? optionalProductField($payload, 'unit')
            ?? 'pcs';
    }

    if ($measurementUnitId === '' || getMeasurementUnitId($pdo, $measurementUnitId) === null) {
        $measurementUnitId = ensureMeasurementUnitId($pdo, $productUnit);
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

    $genericName = $categoryName === 'Medicine' ? requiredProductField($payload, 'generic_name') : null;
    $rawVariations = (isset($payload['variations']) && is_array($payload['variations']) && count($payload['variations']) > 0)
        ? $payload['variations']
        : [$payload];

    foreach ($rawVariations as $index => $variation) {
        if (!is_array($variation) || !empty($variation['delete'])) {
            continue;
        }

        $variationPrice = $variation['price'] ?? $price;
        if (!is_numeric($variationPrice) || (float) $variationPrice < 0) {
            throw new InvalidArgumentException('Each variation must have a valid non-negative price.');
        }

        $variationBarcode = trim((string) ($variation['barcode'] ?? ''));
        if ($variationBarcode === '') {
            $variationBarcode = 'AUTO-' . strtoupper(bin2hex(random_bytes(6)));
        }

        $variationUnit = optionalProductField($variation, 'unit') ?? $productUnit;
        $variationPackaging = optionalProductField($variation, 'packaging');

        $variationPayloads[] = [
            'variant_name' => optionalProductField($variation, 'variant_name') ?? optionalProductField($variation, 'variant_flavor') ?? optionalProductField($variation, 'variation_name'),
            'strength_value' => $categoryName === 'Medicine' ? $numericField($variation, 'strength_value') : null,
            'strength_unit' => $categoryName === 'Medicine' ? optionalProductField($variation, 'strength_unit') : null,
            'volume_value' => $numericField($variation, 'volume_value'),
            'volume_unit' => optionalProductField($variation, 'volume_unit'),
            'size_value' => optionalProductField($variation, 'size_value') ?? optionalProductField($variation, 'display_size'),
            'weight_value' => $numericField($variation, 'weight_value') ?? $numericField($variation, 'weight_volume_value') ?? $numericField($variation, 'net_weight'),
            'weight_unit' => optionalProductField($variation, 'weight_unit') ?? optionalProductField($variation, 'weight_volume_unit'),
            'unit' => $variationUnit,
            'packaging' => $variationPackaging,
            'pack_content_qty' => $numericField($variation, 'pack_content_qty', true),
            'pack_content_unit' => optionalProductField($variation, 'pack_content_unit'),
            'price' => (float) $variationPrice,
            'barcode' => $variationBarcode,
            'sku' => optionalProductField($variation, 'sku'),
            'stock' => max(0, (int) ($variation['stock'] ?? 0)),
            'is_default' => !empty($variation['is_default']) ? 1 : 0
        ];
    }

    if (count($variationPayloads) === 0) {
        throw new InvalidArgumentException('Please add at least one product variation.');
    }

    if (!array_filter($variationPayloads, static fn($variation) => (int) $variation['is_default'] === 1)) {
        $variationPayloads[0]['is_default'] = 1;
    }

    $firstVariation = array_values(array_filter($variationPayloads, static fn($variation) => (int) $variation['is_default'] === 1))[0] ?? $variationPayloads[0];
    $variantFlavor = $firstVariation['variant_name'];
    $sizeValue = $firstVariation['size_value'];
    $displaySize = $sizeValue;
    $weightVolumeValue = $firstVariation['weight_value'];
    $weightVolumeUnit = $firstVariation['weight_unit'];
    $packaging = $firstVariation['packaging'];
    $productUnit = $firstVariation['unit'] ?? $productUnit;
    $price = $firstVariation['price'];
    $strengthValue = $firstVariation['strength_value'];
    $strengthUnit = $firstVariation['strength_unit'];
    $volumeValue = $firstVariation['volume_value'];
    $volumeUnit = $firstVariation['volume_unit'];
    $strengthSizeValue = $strengthValue ?? $volumeValue ?? $displaySize ?? optionalProductField($payload, 'strength_size_value');

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
    $mainProductId = cleanId($mainProductStatement->fetchColumn());

    if ($mainProductId !== '') {
        $lastVariationId = null;
        $variationStatement = $pdo->prepare(
            'INSERT INTO product_variations (
                variation_id,
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
                :variation_id,
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
            $lastVariationId = newUuid($pdo);
            $variationStatement->execute([
                ':variation_id' => $lastVariationId,
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
            'variation_id' => $lastVariationId
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

    $existingProductId = cleanId($existingProductStatement->fetchColumn());

    if ($existingProductId !== '') {
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

    $productId = newUuid($pdo);
    array_unshift($columns, 'product_id');
    $values = [':product_id' => $productId] + $values;
    $placeholders = array_keys($values);

    $productStatement = $pdo->prepare(
        'INSERT INTO product (' . implode(', ', $columns) . ')
         VALUES (' . implode(', ', $placeholders) . ')'
    );
    $productStatement->execute($values);

    $variationStatement = $pdo->prepare(
        'INSERT INTO product_variations (
            variation_id,
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
            :variation_id,
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
            ':variation_id' => newUuid($pdo),
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

function ensureMeasurementUnitId(PDO $pdo, ?string $unitName): string
{
    $cleanUnit = trim((string) ($unitName ?? ''));
    if ($cleanUnit === '') {
        $cleanUnit = 'pcs';
    }

    $unitIdColumn = getMeasurementUnitIdColumn($pdo);
    $select = $pdo->prepare("SELECT {$unitIdColumn} FROM product_measurement_units WHERE LOWER(unit_name) = LOWER(:unit_name) LIMIT 1");
    $select->execute([':unit_name' => $cleanUnit]);
    $existingId = cleanId($select->fetchColumn());
    if ($existingId !== '') {
        return $existingId;
    }

    $measurementUnitId = newUuid($pdo);
    $insert = $pdo->prepare('INSERT INTO product_measurement_units (measurement_unit_id, unit_name) VALUES (:measurement_unit_id, :unit_name)');
    $insert->execute([':measurement_unit_id' => $measurementUnitId, ':unit_name' => $cleanUnit]);
    return $measurementUnitId;
}
?>
