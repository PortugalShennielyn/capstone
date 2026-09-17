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
                pmu.unit_name AS inventory_unit,
                pc.category_name,
                pt.type_name,
                md.generic_name,
                classification_values.medicine_classification,
                classification_values.medicine_classification_badge,
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
                (SELECT GROUP_CONCAT(
                    COALESCE(NULLIF(TRIM(psv.value_text),''), NULLIF(TRIM(CONCAT(TRIM(TRAILING '.' FROM TRIM(TRAILING '0' FROM CAST(psv.value_number AS CHAR))), CASE WHEN spec_unit.unit_name IS NULL THEN '' ELSE CONCAT(' ',spec_unit.unit_name) END)),''))
                    ORDER BY COALESCE(pts.sort_order,2147483647),ps.specification_name SEPARATOR ' • ')
                 FROM product_specification_values psv
                 INNER JOIN product_specifications ps ON ps.specification_id=psv.specification_id
                 LEFT JOIN product_type_specifications pts ON pts.type_id=p.type_id AND pts.specification_id=psv.specification_id
                 LEFT JOIN product_measurement_units spec_unit ON spec_unit.measurement_unit_id=psv.measurement_unit_id
                 WHERE psv.product_id=p.product_id
                   AND LOWER(TRIM(ps.specification_name)) <> 'medicine classification') AS normalized_specification,
                COALESCE(stock.available_stock, 0) AS available_stock,
                COALESCE(stock.shelf_stock, 0) AS shelf_stock,
                stock.first_expiry_date,
                stock.first_days_until_expiry,
                stock.first_batch_number,
                stock.expired_batch_count
            FROM product p
            LEFT JOIN product_categories pc ON pc.category_id = p.category_id
            LEFT JOIN product_types pt ON pt.type_id = p.type_id
            LEFT JOIN product_measurement_units pmu ON pmu.measurement_unit_id = p.inventory_unit_id
            LEFT JOIN medicine_details md ON md.product_id = p.product_id
            LEFT JOIN (
                SELECT psv.product_id,
                       psv.value_text AS medicine_classification,
                       CASE WHEN LOWER(TRIM(psv.value_text)) = 'prescription (rx)' THEN 'Rx' ELSE NULL END AS medicine_classification_badge
                FROM product_specification_values psv
                INNER JOIN product_specifications ps ON ps.specification_id=psv.specification_id
                WHERE LOWER(TRIM(ps.specification_name))='medicine classification'
            ) classification_values ON classification_values.product_id=p.product_id
            LEFT JOIN grocery_details gd ON gd.product_id = p.product_id
            LEFT JOIN medical_supply_details msd ON msd.product_id = p.product_id
            LEFT JOIN (
                SELECT product_id,
                       SUM(CASE WHEN quantity_remaining > 0 AND (expiration_date IS NULL OR expiration_date >= CURDATE()) THEN quantity_remaining ELSE 0 END) AS available_stock,
                       SUM(CASE WHEN quantity_remaining > 0 THEN quantity_remaining ELSE 0 END) AS shelf_stock,
                       SUBSTRING_INDEX(GROUP_CONCAT(CASE WHEN quantity_remaining > 0 AND (expiration_date IS NULL OR expiration_date >= CURDATE()) THEN expiration_date END ORDER BY expiration_date IS NULL, expiration_date ASC, created_at ASC, selling_stock_id ASC), ',', 1) AS first_expiry_date,
                       SUBSTRING_INDEX(GROUP_CONCAT(CASE WHEN quantity_remaining > 0 AND (expiration_date IS NULL OR expiration_date >= CURDATE()) THEN DATEDIFF(expiration_date, CURDATE()) END ORDER BY expiration_date IS NULL, expiration_date ASC, created_at ASC, selling_stock_id ASC), ',', 1) AS first_days_until_expiry,
                       SUBSTRING_INDEX(GROUP_CONCAT(CASE WHEN quantity_remaining > 0 AND (expiration_date IS NULL OR expiration_date >= CURDATE()) THEN batch_number END ORDER BY expiration_date IS NULL, expiration_date ASC, created_at ASC, selling_stock_id ASC), ',', 1) AS first_batch_number,
                       SUM(CASE WHEN quantity_remaining > 0 AND expiration_date IS NOT NULL AND expiration_date < CURDATE() THEN 1 ELSE 0 END) AS expired_batch_count
                FROM product_selling_stock
                GROUP BY product_id
            ) stock ON stock.product_id = p.product_id
            {$where}
            HAVING shelf_stock > 0
            ORDER BY p.brand_name ASC, p.product_name ASC";
    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);

    $products = array_map(static function (array $row): array {
        return [
            'product_id' => (string) $row['product_id'],
            'brand_name' => trim((string) ($row['brand_name'] ?? '')),
            'product_name' => salesResolvedProductName($row),
            'specification' => trim((string) ($row['normalized_specification'] ?? '')) ?: salesBuildSpecification($row),
            'inventory_unit' => trim((string) ($row['inventory_unit'] ?? '')),
            'generic_name' => trim((string) ($row['generic_name'] ?? '')),
            'medicine_classification' => trim((string) ($row['medicine_classification'] ?? '')),
            'medicine_classification_badge' => trim((string) ($row['medicine_classification_badge'] ?? '')),
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
            'shelf_stock' => (int) ($row['shelf_stock'] ?? 0),
            'first_expiry_date' => $row['first_expiry_date'] ?? null,
            'first_expiry_status' => (int)($row['available_stock'] ?? 0) > 0 ? inventoryExpiryStatus($row['first_expiry_date'] ?? null, $row['first_days_until_expiry'] ?? null) : 'Expired',
            'first_batch_number' => trim((string) ($row['first_batch_number'] ?? '')),
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
