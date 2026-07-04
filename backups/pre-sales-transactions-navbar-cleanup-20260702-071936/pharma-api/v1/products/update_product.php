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

try {
    $productId = cleanId($payload['product_id'] ?? null);
    $supplierId = cleanId($payload['supplier_id'] ?? null);
    $categoryId = cleanId($payload['category_id'] ?? null);
    $typeId = cleanId($payload['type_id'] ?? null);
    $brandName = requiredProductField($payload, 'brand_name');
    $productName = requiredProductField($payload, 'product_name');
    $variation = (isset($payload['variations'][0]) && is_array($payload['variations'][0])) ? $payload['variations'][0] : $payload;

    if ($productId === '') {
        throw new InvalidArgumentException('A valid product is required.');
    }
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

    $price = $variation['price'] ?? $payload['price'] ?? 0;
    if (!is_numeric($price) || (float) $price < 0) {
        throw new InvalidArgumentException('Price must be a valid non-negative number.');
    }
    $barcode = cleanUpdateField($variation, 'barcode') ?? cleanUpdateField($payload, 'barcode') ?? ('AUTO-' . strtoupper(bin2hex(random_bytes(6))));

    $pdo->beginTransaction();

    $productStatement = $pdo->prepare(
        'UPDATE product
         SET barcode = :barcode,
             category_id = :category_id,
             type_id = :type_id,
             brand_name = :brand_name,
             product_name = :product_name,
             price = :price
         WHERE product_id = :product_id'
    );
    $productStatement->execute([
        ':barcode' => $barcode,
        ':category_id' => $categoryId,
        ':type_id' => $typeId,
        ':brand_name' => $brandName,
        ':product_name' => $productName,
        ':price' => (float) $price,
        ':product_id' => $productId
    ]);

    $pdo->prepare('DELETE FROM supplier_products WHERE product_id = :product_id')
        ->execute([':product_id' => $productId]);
    $pdo->prepare('INSERT IGNORE INTO supplier_products (supplier_id, product_id) VALUES (:supplier_id, :product_id)')
        ->execute([':supplier_id' => $supplierId, ':product_id' => $productId]);

    if ($categoryName === 'Medicine') {
        $genericName = cleanUpdateField($payload, 'generic_name') ?? cleanUpdateField($variation, 'generic_name');
        $strengthValue = cleanUpdateNumber($variation, 'strength_value');
        $strengthUnit = cleanUpdateField($variation, 'strength_unit');
        $strength = cleanUpdateField($variation, 'strength') ?? joinUpdateParts($strengthValue, $strengthUnit);
        $dosageForm = cleanUpdateField($variation, 'dosage_form');
        $netContentValue = cleanUpdateNumber($variation, 'net_content_value') ?? cleanUpdateNumber($variation, 'volume_value');
        $netContentUnit = cleanUpdateField($variation, 'net_content_unit') ?? cleanUpdateField($variation, 'volume_unit');
        $packageType = cleanUpdateField($variation, 'package_type');
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
    } elseif ($categoryName === 'Grocery') {
        $netWeight = cleanUpdateNumber($variation, 'net_weight') ?? cleanUpdateNumber($variation, 'weight_value') ?? cleanUpdateNumber($variation, 'weight_volume_value');
        $detailValues = [
            ':product_id' => $productId,
            ':variant' => cleanUpdateField($variation, 'variant_name') ?? cleanUpdateField($variation, 'variant_flavor'),
            ':size' => cleanUpdateField($variation, 'size_value') ?? cleanUpdateField($variation, 'display_size'),
            ':net_weight' => $netWeight,
            ':unit' => cleanUpdateField($variation, 'unit') ?? cleanUpdateField($variation, 'weight_unit') ?? cleanUpdateField($variation, 'weight_volume_unit'),
            ':package_type' => cleanUpdateField($variation, 'package_type') ?? cleanUpdateField($variation, 'packaging'),
            ':pack_content' => cleanUpdateField($variation, 'pack_content') ?? joinUpdateParts(cleanUpdateNumber($variation, 'pack_content_qty'), cleanUpdateField($variation, 'pack_content_unit'))
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
    }

    $pdo->commit();

    echo json_encode([
        'status' => 'success',
        'message' => 'Product SKU updated successfully.'
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
    echo json_encode(['status' => 'error', 'message' => 'Unable to update product SKU.', 'error' => $e->getMessage()]);
}
?>
