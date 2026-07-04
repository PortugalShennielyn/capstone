<?php
require_once '../../config/db_connection.php';
require_once '../../config/require_auth.php';
require_once 'sales_pos_helpers.php';

try {
    $search = trim((string) ($_GET['search'] ?? ''));
    $type = trim((string) ($_GET['type'] ?? ''));
    $categoryId = trim((string) ($_GET['category_id'] ?? ''));
    $categoryName = trim((string) ($_GET['category_name'] ?? ''));
    $typeId = trim((string) ($_GET['type_id'] ?? ''));
    $typeName = trim((string) ($_GET['type_name'] ?? ''));
    $params = [];
    $whereParts = [];

    if ($search !== '') {
        $whereParts[] = '(p.brand_name LIKE :search
                  OR p.product_name LIKE :search
                  OR md.generic_name LIKE :search
                  OR md.strength_value LIKE :search
                  OR md.strength_unit LIKE :search
                  OR md.dosage_form LIKE :search
                  OR md.net_content_value LIKE :search
                  OR md.net_content_unit LIKE :search
                  OR md.package_type LIKE :search
                  OR pc.category_name LIKE :search
                  OR pt.type_name LIKE :search
                  OR gd.variant LIKE :search
                  OR gd.size LIKE :search
                  OR gd.package_type LIKE :search
                  OR msd.variant LIKE :search
                  OR msd.size LIKE :search
                  OR msd.package_type LIKE :search)';
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
                md.strength_value,
                md.strength_unit,
                md.dosage_form,
                md.net_content_value,
                md.net_content_unit,
                md.package_type AS medicine_package_type,
                gd.variant,
                gd.size,
                gd.package_type AS grocery_package_type,
                msd.variant AS medical_variant,
                msd.size AS medical_size,
                msd.package_type AS medical_package_type,
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
            'strength_value' => salesSpecificationValue($row['strength_value'] ?? ''),
            'strength_unit' => trim((string) ($row['strength_unit'] ?? '')),
            'dosage_form' => trim((string) ($row['dosage_form'] ?? '')),
            'net_content_value' => salesSpecificationValue($row['net_content_value'] ?? ''),
            'net_content_unit' => trim((string) ($row['net_content_unit'] ?? '')),
            'packaging' => trim((string) ($row['medicine_package_type'] ?? $row['grocery_package_type'] ?? $row['medical_package_type'] ?? '')),
            'barcode' => trim((string) ($row['barcode'] ?? '')),
            'product_image' => trim((string) ($row['product_image'] ?? '')),
            'category_id' => trim((string) ($row['category_id'] ?? '')),
            'category_name' => trim((string) ($row['category_name'] ?? '')),
            'type_id' => trim((string) ($row['type_id'] ?? '')),
            'type_name' => trim((string) ($row['type_name'] ?? '')),
            'price' => round((float) ($row['price'] ?? 0), 2),
            'available_stock' => (int) ($row['available_stock'] ?? 0),
        ];
    }, $stmt->fetchAll(PDO::FETCH_ASSOC));

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
