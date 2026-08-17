<?php
require_once '../../config/db_connection.php';
require_once '../../config/require_auth.php';
require_once 'sales_pos_helpers.php';
require_once '../products/product_status_schema.php';

try {
    ensureProductStatusColumn($pdo);
    $search = trim((string) ($_GET['search'] ?? ''));
    $type = trim((string) ($_GET['type'] ?? ''));
    $categoryId = trim((string) ($_GET['category_id'] ?? ''));
    $categoryName = trim((string) ($_GET['category_name'] ?? ''));
    $typeId = trim((string) ($_GET['type_id'] ?? ''));
    $typeName = trim((string) ($_GET['type_name'] ?? ''));
    $params = [];
    $whereParts = ["p.status = 'Active'"];

    if ($search !== '') {
        $inactiveBarcode = $pdo->prepare(
            "SELECT product_name
             FROM product
             WHERE barcode = :barcode
               AND status = 'Inactive'
             LIMIT 1"
        );
        $inactiveBarcode->execute([':barcode' => $search]);
        if ($inactiveBarcode->fetchColumn() !== false) {
            http_response_code(409);
            echo json_encode([
                'status' => 'error',
                'message' => 'This product is inactive and cannot be sold.',
            ]);
            exit();
        }
            $whereParts[] = "CONCAT_WS(' ',
                  p.barcode,
                  p.brand_name,
                  p.product_name,
                  md.generic_name,
                  md.strength_value,
                  md.strength_unit,
                  md.dosage_form,
                  md.net_content_value,
                  md.net_content_unit,
                  md.package_type,
                  pc.category_name,
                  pt.type_name,
                  gd.variant,
                  gd.size,
                  gd.net_weight,
                  gd.unit,
                  gd.pack_content,
                  gd.package_type,
                  msd.variant,
                  msd.size,
                  msd.material,
                  msd.sterile_status,
                  msd.pack_content,
                  msd.package_type
              ) LIKE :search";
        $params[':search'] = '%' . $search . '%';
    }
    if ($type !== '' && strcasecmp($type, 'All Items') !== 0) {
        $whereParts[] = '(pt.type_name = :type OR pc.category_name = :type)';
        $params[':type'] = $type;
    }
    if ($categoryId !== '') {
        $whereParts[] = 'p.category_id = :category_id';
        $params[':category_id'] = $categoryId;
    } elseif ($categoryName !== '') {
        $whereParts[] = 'pc.category_name = :category_name';
        $params[':category_name'] = $categoryName;
    }
    if ($typeId !== '') {
        $whereParts[] = 'p.type_id = :type_id';
        $params[':type_id'] = $typeId;
    } elseif ($typeName !== '') {
        $whereParts[] = 'pt.type_name = :type_name';
        $params[':type_name'] = $typeName;
    }
    $where = $whereParts ? 'WHERE ' . implode(' AND ', $whereParts) : '';

    $sql = "SELECT
                p.product_id,
                p.barcode,
                p.product_image,
                p.brand_name,
                p.product_name,
                p.price,
                p.category_id,
                p.type_id,
                pc.category_name,
                pt.type_name,
                md.generic_name,
                md.strength,
                md.strength_value,
                md.strength_unit,
                md.dosage_form,
                md.net_content_value,
                md.net_content_unit,
                md.package_type AS medicine_package_type,
                gd.variant,
                gd.size,
                gd.net_weight,
                gd.unit AS grocery_unit,
                gd.pack_content AS grocery_pack_content,
                gd.package_type AS grocery_package_type,
                msd.variant AS medical_variant,
                msd.size AS medical_size,
                msd.material,
                msd.sterile_status,
                msd.pack_content AS medical_pack_content,
                msd.package_type AS medical_package_type,
                p.status AS product_status,
                COALESCE(stock.available_stock, 0) AS available_stock
            FROM product p
            LEFT JOIN product_categories pc ON pc.category_id = p.category_id
            LEFT JOIN product_types pt ON pt.type_id = p.type_id
            LEFT JOIN medicine_details md ON md.product_id = p.product_id
            LEFT JOIN grocery_details gd ON gd.product_id = p.product_id
            LEFT JOIN medical_supply_details msd ON msd.product_id = p.product_id
            LEFT JOIN (
                SELECT product_id, SUM(quantity_remaining) AS available_stock
                FROM product_selling_stock
                GROUP BY product_id
            ) stock ON stock.product_id = p.product_id
            {$where}
            HAVING available_stock > 0
            ORDER BY p.brand_name ASC, p.product_name ASC";
    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);

    $products = array_map(static function (array $row): array {
        return [
            'product_id' => (string) $row['product_id'],
            'brand_name' => trim((string) ($row['brand_name'] ?? '')),
            'product_name' => trim((string) ($row['product_name'] ?? '')),
            'specification' => salesBuildSpecification($row),
            'generic_name' => trim((string) ($row['generic_name'] ?? '')),
            'strength' => trim((string) ($row['strength'] ?? '')),
            'strength_value' => salesSpecificationValue($row['strength_value'] ?? ''),
            'strength_unit' => trim((string) ($row['strength_unit'] ?? '')),
            'dosage_form' => trim((string) ($row['dosage_form'] ?? '')),
            'net_content_value' => salesSpecificationValue($row['net_content_value'] ?? ''),
            'net_content_unit' => trim((string) ($row['net_content_unit'] ?? '')),
            'variant' => trim((string) ($row['variant'] ?? '')),
            'size' => trim((string) ($row['size'] ?? '')),
            'net_weight' => salesSpecificationValue($row['net_weight'] ?? ''),
            'unit' => trim((string) ($row['grocery_unit'] ?? '')),
            'pack_content' => trim((string) ($row['grocery_pack_content'] ?? $row['medical_pack_content'] ?? '')),
            'medical_variant' => trim((string) ($row['medical_variant'] ?? '')),
            'medical_size' => trim((string) ($row['medical_size'] ?? '')),
            'material' => trim((string) ($row['material'] ?? '')),
            'sterile_status' => trim((string) ($row['sterile_status'] ?? '')),
            'packaging' => trim((string) ($row['medicine_package_type'] ?? $row['grocery_package_type'] ?? $row['medical_package_type'] ?? '')),
            'barcode' => trim((string) ($row['barcode'] ?? '')),
            'product_image' => trim((string) ($row['product_image'] ?? '')),
            'category_id' => trim((string) ($row['category_id'] ?? '')),
            'category_name' => trim((string) ($row['category_name'] ?? '')),
            'type_id' => trim((string) ($row['type_id'] ?? '')),
            'type_name' => trim((string) ($row['type_name'] ?? '')),
            'price' => is_numeric($row['price'] ?? null) ? round((float) $row['price'], 2) : null,
            'available_stock' => (int) ($row['available_stock'] ?? 0),
            'status' => strcasecmp(trim((string) ($row['product_status'] ?? 'Active')), 'Inactive') === 0 ? 'Inactive' : 'Active',
        ];
    }, $stmt->fetchAll(PDO::FETCH_ASSOC));

    foreach ($products as &$product) {
        $product['selling_units'] = productSellingOptions($pdo, (string) $product['product_id'], true);
        $defaultOption = productDefaultSellingOption($pdo, (string) $product['product_id']);
        if ($defaultOption) $product['price'] = $defaultOption['selling_price'];
    }
    $products = array_values(array_filter($products, static fn(array $product): bool => !empty($product['selling_units'])));
    unset($product);

    echo json_encode([
        'status' => 'success',
        'data' => $products,
    ]);
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode([
        'status' => 'error',
        'message' => 'Unable to search sales products.',
        'error' => $e->getMessage(),
    ]);
}

?>
