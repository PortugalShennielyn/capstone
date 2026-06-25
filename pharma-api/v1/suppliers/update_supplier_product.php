<?php
require_once '../../config/db_connection.php';
require_once '../products/product_category_schema.php';

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

function supplierProductText(array $payload, string $field): ?string
{
    $value = trim((string) ($payload[$field] ?? ''));
    return $value === '' || strcasecmp($value, 'N/A') === 0 ? null : $value;
}

function supplierProductRequiredText(array $payload, string $field): string
{
    $value = trim((string) ($payload[$field] ?? ''));
    if ($value === '') {
        throw new InvalidArgumentException(str_replace('_', ' ', ucfirst($field)) . ' is required.');
    }
    return $value;
}

function supplierProductNumberOrNull(array $payload, string $field): ?float
{
    $value = trim((string) ($payload[$field] ?? ''));
    if ($value === '') {
        return null;
    }
    if (!is_numeric($value) || (float) $value < 0) {
        throw new InvalidArgumentException(str_replace('_', ' ', ucfirst($field)) . ' must be a valid number.');
    }
    return (float) $value;
}

function supplierProductJoin(?string ...$parts): ?string
{
    $clean = array_values(array_filter(array_map(static fn($part) => trim((string) ($part ?? '')), $parts), static fn($part) => $part !== ''));
    return count($clean) ? implode(' ', $clean) : null;
}

try {
    $supplierProductId = cleanId($payload['supplier_product_id'] ?? null);
    $supplierId = cleanId($payload['supplier_id'] ?? null);
    $productId = cleanId($payload['product_id'] ?? null);
    $categoryId = cleanId($payload['category_id'] ?? null);
    $typeId = cleanId($payload['type_id'] ?? null);
    $brandName = supplierProductRequiredText($payload, 'brand_name');
    $productName = supplierProductRequiredText($payload, 'product_name');
    $supplierCost = supplierProductNumberOrNull($payload, 'supplier_cost_price');
    $purchaseUnit = supplierProductText($payload, 'purchase_unit');
    $unitsPerPurchaseUnit = max(1, (int) ($payload['units_per_purchase_unit'] ?? 1));

    if ($supplierProductId === '' || $supplierId === '' || $productId === '') {
        throw new InvalidArgumentException('A valid supplier product link is required.');
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

    $linkCheck = $pdo->prepare(
        'SELECT COUNT(*)
         FROM supplier_products
         WHERE supplier_product_id = :supplier_product_id
           AND supplier_id = :supplier_id
           AND product_id = :product_id'
    );
    $linkCheck->execute([
        ':supplier_product_id' => $supplierProductId,
        ':supplier_id' => $supplierId,
        ':product_id' => $productId
    ]);
    if ((int) $linkCheck->fetchColumn() !== 1) {
        throw new InvalidArgumentException('Supplier product link was not found.');
    }

    $unit = supplierProductText($payload, 'unit');
    $packaging = supplierProductText($payload, 'packaging');
    $variant = supplierProductText($payload, 'variant_flavor');
    $strength = supplierProductText($payload, 'strength_value');
    $size = supplierProductText($payload, 'size_value');
    $packContentQty = supplierProductText($payload, 'pack_content_qty');
    $packContent = supplierProductJoin($packContentQty, $unit);

    $pdo->beginTransaction();

    $productStatement = $pdo->prepare(
        'UPDATE product
         SET category_id = :category_id,
             type_id = :type_id,
             brand_name = :brand_name,
             product_name = :product_name
         WHERE product_id = :product_id'
    );
    $productStatement->execute([
        ':category_id' => $categoryId,
        ':type_id' => $typeId,
        ':brand_name' => $brandName,
        ':product_name' => $productName,
        ':product_id' => $productId
    ]);

    if ($categoryName === 'Medicine') {
        $exists = $pdo->prepare('SELECT medicine_detail_id FROM medicine_details WHERE product_id = :product_id LIMIT 1');
        $exists->execute([':product_id' => $productId]);

        if (cleanId($exists->fetchColumn()) !== '') {
            $detail = $pdo->prepare(
                'UPDATE medicine_details
                 SET strength = :strength,
                     dosage_form = :dosage_form,
                     package_type = :package_type
                 WHERE product_id = :product_id'
            );
            $detail->execute([
                ':strength' => $strength,
                ':dosage_form' => $unit,
                ':package_type' => $packaging,
                ':product_id' => $productId
            ]);
        } else {
            $detail = $pdo->prepare(
                'INSERT INTO medicine_details (medicine_detail_id, product_id, generic_name, strength, dosage_form, package_type)
                 VALUES (:medicine_detail_id, :product_id, NULL, :strength, :dosage_form, :package_type)'
            );
            $detail->execute([
                ':medicine_detail_id' => newUuid($pdo),
                ':product_id' => $productId,
                ':strength' => $strength,
                ':dosage_form' => $unit,
                ':package_type' => $packaging
            ]);
        }

        $pdo->prepare('DELETE FROM grocery_details WHERE product_id = :product_id')->execute([':product_id' => $productId]);
    } elseif ($categoryName === 'Grocery') {
        $exists = $pdo->prepare('SELECT grocery_detail_id FROM grocery_details WHERE product_id = :product_id LIMIT 1');
        $exists->execute([':product_id' => $productId]);

        if (cleanId($exists->fetchColumn()) !== '') {
            $detail = $pdo->prepare(
                'UPDATE grocery_details
                 SET variant = :variant,
                     size = :size,
                     net_weight = :net_weight,
                     package_type = :package_type,
                     pack_content = :pack_content
                 WHERE product_id = :product_id'
            );
            $detail->execute([
                ':variant' => $variant,
                ':size' => $size,
                ':net_weight' => $strength,
                ':package_type' => $packaging,
                ':pack_content' => $packContent,
                ':product_id' => $productId
            ]);
        } else {
            $detail = $pdo->prepare(
                'INSERT INTO grocery_details (grocery_detail_id, product_id, variant, size, net_weight, package_type, pack_content)
                 VALUES (:grocery_detail_id, :product_id, :variant, :size, :net_weight, :package_type, :pack_content)'
            );
            $detail->execute([
                ':grocery_detail_id' => newUuid($pdo),
                ':product_id' => $productId,
                ':variant' => $variant,
                ':size' => $size,
                ':net_weight' => $strength,
                ':package_type' => $packaging,
                ':pack_content' => $packContent
            ]);
        }

        $pdo->prepare('DELETE FROM medicine_details WHERE product_id = :product_id')->execute([':product_id' => $productId]);
    }

    $supplierStatement = $pdo->prepare(
        'UPDATE supplier_products
         SET supplier_cost_price = :supplier_cost_price,
             purchase_unit = :purchase_unit,
             units_per_purchase_unit = :units_per_purchase_unit
         WHERE supplier_product_id = :supplier_product_id
           AND supplier_id = :supplier_id
           AND product_id = :product_id'
    );
    $supplierStatement->execute([
        ':supplier_cost_price' => $supplierCost,
        ':purchase_unit' => $purchaseUnit,
        ':units_per_purchase_unit' => $unitsPerPurchaseUnit,
        ':supplier_product_id' => $supplierProductId,
        ':supplier_id' => $supplierId,
        ':product_id' => $productId
    ]);

    $pdo->commit();

    echo json_encode([
        'status' => 'success',
        'message' => 'Supplier product updated successfully.'
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
    echo json_encode(['status' => 'error', 'message' => 'Unable to update supplier product.', 'error' => $e->getMessage()]);
}
?>
