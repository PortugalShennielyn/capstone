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

function cleanVariationField(array $payload, string $field): ?string
{
    $value = trim((string) ($payload[$field] ?? ''));
    return $value === '' || strcasecmp($value, 'N/A') === 0 ? null : $value;
}

function cleanNumericVariationField(array $payload, string $field, bool $integer = false)
{
    $value = trim((string) ($payload[$field] ?? ''));
    if ($value === '' || strcasecmp($value, 'N/A') === 0) {
        return null;
    }
    if (!is_numeric($value)) {
        throw new InvalidArgumentException(str_replace('_', ' ', ucfirst($field)) . ' must be a number only.');
    }
    return $integer ? (int) $value : $value;
}

function normalizeVariation(array $variation, string $categoryName, string $fallbackUnit): array
{
    $price = $variation['price'] ?? 0;
    if (!is_numeric($price) || (float) $price < 0) {
        throw new InvalidArgumentException('Each variation must have a valid non-negative price.');
    }

    return [
        'variation_id' => cleanId($variation['variation_id'] ?? null),
        'variant_name' => cleanVariationField($variation, 'variant_name') ?? cleanVariationField($variation, 'variant_flavor'),
        'strength_value' => $categoryName === 'Medicine' ? cleanNumericVariationField($variation, 'strength_value') : null,
        'strength_unit' => $categoryName === 'Medicine' ? cleanVariationField($variation, 'strength_unit') : null,
        'volume_value' => cleanNumericVariationField($variation, 'volume_value'),
        'volume_unit' => cleanVariationField($variation, 'volume_unit'),
        'size_value' => cleanVariationField($variation, 'size_value'),
        'size_unit' => cleanVariationField($variation, 'size_unit'),
        'weight_value' => $categoryName === 'Grocery'
            ? (cleanNumericVariationField($variation, 'weight_value') ?? cleanNumericVariationField($variation, 'weight_volume_value'))
            : null,
        'weight_unit' => $categoryName === 'Grocery'
            ? (cleanVariationField($variation, 'weight_unit') ?? cleanVariationField($variation, 'weight_volume_unit'))
            : null,
        'unit' => cleanVariationField($variation, 'unit') ?? $fallbackUnit,
        'packaging' => cleanVariationField($variation, 'packaging'),
        'pack_content_qty' => cleanNumericVariationField($variation, 'pack_content_qty', true),
        'pack_content_unit' => cleanVariationField($variation, 'pack_content_unit'),
        'price' => (float) $price,
        'barcode' => cleanVariationField($variation, 'barcode') ?? ('AUTO-' . strtoupper(bin2hex(random_bytes(6)))),
        'sku' => cleanVariationField($variation, 'sku'),
        'stock' => max(0, (int) ($variation['stock'] ?? 0)),
        'is_default' => !empty($variation['is_default']) ? 1 : 0,
        'delete' => !empty($variation['delete']) || !empty($variation['_delete'])
    ];
}

try {
    ensureProductCategorySchema($pdo);

    $productId = cleanId($payload['product_id'] ?? null);
    $categoryId = cleanId($payload['category_id'] ?? null);
    $typeId = cleanId($payload['type_id'] ?? null);
    $brandName = requiredProductField($payload, 'brand_name');
    $productName = requiredProductField($payload, 'product_name');
    $genericName = cleanVariationField($payload, 'generic_name');
    $imageUrl = trim((string) ($payload['image_url'] ?? ''));

    if ($productId === '') {
        throw new InvalidArgumentException('A valid product is required.');
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
    if ($categoryName !== 'Medicine') {
        $genericName = null;
    }

    $fallbackUnit = cleanVariationField($payload, 'product_unit') ?? cleanVariationField($payload, 'unit') ?? '';
    $rawVariations = isset($payload['variations']) && is_array($payload['variations']) ? $payload['variations'] : [];
    if (count($rawVariations) === 0) {
        $rawVariations[] = $payload;
    }
    $variations = array_map(
        static fn($variation) => normalizeVariation(is_array($variation) ? $variation : [], $categoryName, $fallbackUnit),
        $rawVariations
    );

    $keptVariations = array_values(array_filter($variations, static fn($variation) => !$variation['delete']));
    if (count($keptVariations) === 0) {
        throw new InvalidArgumentException('At least one variation is required.');
    }
    if (!array_filter($keptVariations, static fn($variation) => (int) $variation['is_default'] === 1)) {
        foreach ($variations as &$variation) {
            if (!$variation['delete']) {
                $variation['is_default'] = 1;
                break;
            }
        }
        unset($variation);
    }

    $pdo->beginTransaction();

    $productStatement = $pdo->prepare(
        'UPDATE product
         SET category_id = :category_id,
             type_id = :type_id,
             brand_name = :brand_name,
             product_name = :product_name,
             generic_name = :generic_name,
             image_url = :image_url
         WHERE product_id = :product_id'
    );
    $productStatement->execute([
        ':category_id' => $categoryId,
        ':type_id' => $typeId,
        ':brand_name' => $brandName,
        ':product_name' => $productName,
        ':generic_name' => $genericName,
        ':image_url' => $imageUrl !== '' ? $imageUrl : null,
        ':product_id' => $productId
    ]);

    $pdo->prepare('UPDATE product_variations SET is_default = 0 WHERE product_id = :product_id')
        ->execute([':product_id' => $productId]);

    $deleteUsageStatement = $pdo->prepare(
        'SELECT
            (SELECT COUNT(*) FROM purchase_order_items WHERE variation_id = :variation_id) +
            (SELECT COUNT(*) FROM product_inventory WHERE variation_id = :variation_id) +
            (SELECT COUNT(*) FROM product_selling_stock WHERE variation_id = :variation_id)'
    );
    $deleteStatement = $pdo->prepare(
        'DELETE FROM product_variations WHERE product_id = :product_id AND variation_id = :variation_id'
    );
    $updateStatement = $pdo->prepare(
        'UPDATE product_variations
         SET variant_name = :variant_name,
             strength_value = :strength_value,
             strength_unit = :strength_unit,
             volume_value = :volume_value,
             volume_unit = :volume_unit,
             size_value = :size_value,
             size_unit = :size_unit,
             weight_value = :weight_value,
             weight_unit = :weight_unit,
             unit = :unit,
             packaging = :packaging,
             pack_content_qty = :pack_content_qty,
             pack_content_unit = :pack_content_unit,
             price = :price,
             barcode = :barcode,
             sku = :sku,
             stock = :stock,
             is_default = :is_default
         WHERE product_id = :product_id
           AND variation_id = :variation_id'
    );
    $insertStatement = $pdo->prepare(
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
            stock,
            is_default
        ) VALUES (
            :variation_id,
            :product_id,
            :variant_name,
            :strength_value,
            :strength_unit,
            :volume_value,
            :volume_unit,
            :size_value,
            :size_unit,
            :weight_value,
            :weight_unit,
            :unit,
            :packaging,
            :pack_content_qty,
            :pack_content_unit,
            :price,
            :barcode,
            :sku,
            :stock,
            :is_default
        )'
    );

    foreach ($variations as $variation) {
        if ($variation['delete']) {
            if ($variation['variation_id'] === '') {
                continue;
            }
            $deleteUsageStatement->execute([':variation_id' => $variation['variation_id']]);
            if ((int) $deleteUsageStatement->fetchColumn() > 0) {
                throw new InvalidArgumentException('Cannot delete a variation that already has purchase order or stock history.');
            }
            $deleteStatement->execute([
                ':product_id' => $productId,
                ':variation_id' => $variation['variation_id']
            ]);
            continue;
        }

        $params = [
            ':product_id' => $productId,
            ':variation_id' => $variation['variation_id'],
            ':variant_name' => $variation['variant_name'],
            ':strength_value' => $variation['strength_value'],
            ':strength_unit' => $variation['strength_unit'],
            ':volume_value' => $variation['volume_value'],
            ':volume_unit' => $variation['volume_unit'],
            ':size_value' => $variation['size_value'],
            ':size_unit' => $variation['size_unit'],
            ':weight_value' => $variation['weight_value'],
            ':weight_unit' => $variation['weight_unit'],
            ':unit' => $variation['unit'],
            ':packaging' => $variation['packaging'],
            ':pack_content_qty' => $variation['pack_content_qty'],
            ':pack_content_unit' => $variation['pack_content_unit'],
            ':price' => $variation['price'],
            ':barcode' => $variation['barcode'],
            ':sku' => $variation['sku'],
            ':stock' => $variation['stock'],
            ':is_default' => $variation['is_default']
        ];

        if ($variation['variation_id'] !== '') {
            $updateStatement->execute($params);
        } else {
            $params[':variation_id'] = newUuid($pdo);
            $insertStatement->execute($params);
        }
    }

    $pdo->commit();

    echo json_encode([
        'status' => 'success',
        'message' => 'Product updated successfully.'
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
    echo json_encode(['status' => 'error', 'message' => 'Unable to update product.', 'error' => $e->getMessage()]);
}
?>
