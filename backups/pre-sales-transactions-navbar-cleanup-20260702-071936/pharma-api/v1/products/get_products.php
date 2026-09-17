<?php
require_once '../../config/db_connection.php';
require_once '../../config/require_auth.php';
require_once 'product_category_schema.php';

try {
    $stmt = $pdo->prepare(
        "SELECT
            p.product_id,
            p.barcode,
            p.category_id,
            p.type_id,
            p.brand_name,
            p.product_name,
            p.price,
            p.created_at,
            pc.category_name,
            pt.type_name,
            md.generic_name,
            md.strength,
            md.strength_value AS medicine_strength_value,
            md.strength_unit,
            md.net_content_value,
            md.net_content_unit,
            md.dosage_form,
            md.package_type AS medicine_package_type,
            gd.variant,
            gd.size,
            gd.net_weight,
            gd.unit AS grocery_unit,
            gd.package_type AS grocery_package_type,
            gd.pack_content,
            supplier_names.supplier_ids,
            supplier_names.supplier_name,
            COALESCE(inventory_stock.total_inventory_quantity, 0) AS total_inventory_quantity,
            COALESCE(inventory_stock.available_stock, 0) AS available_stock,
            inventory_stock.nearest_expiry_date,
            COALESCE(selling_stock.selling_stock, 0) AS selling_stock
         FROM product p
         LEFT JOIN product_categories pc ON p.category_id = pc.category_id
         LEFT JOIN product_types pt ON p.type_id = pt.type_id
         LEFT JOIN medicine_details md ON p.product_id = md.product_id
         LEFT JOIN grocery_details gd ON p.product_id = gd.product_id
         LEFT JOIN (
            SELECT
                sp.product_id,
                GROUP_CONCAT(DISTINCT sp.supplier_id ORDER BY sp.supplier_id SEPARATOR ',') AS supplier_ids,
                GROUP_CONCAT(DISTINCT s.supplier_name ORDER BY s.supplier_name SEPARATOR ', ') AS supplier_name
            FROM supplier_products sp
            LEFT JOIN suppliers s ON sp.supplier_id = s.supplier_id
            GROUP BY sp.product_id
         ) supplier_names ON supplier_names.product_id = p.product_id
         LEFT JOIN (
            SELECT
                product_id,
                SUM(quantity_stocked) AS total_inventory_quantity,
                SUM(quantity_remaining) AS available_stock,
                MIN(CASE WHEN quantity_remaining > 0 AND expiration_date IS NOT NULL THEN expiration_date END) AS nearest_expiry_date
            FROM product_inventory
            GROUP BY product_id
         ) inventory_stock ON inventory_stock.product_id = p.product_id
         LEFT JOIN (
            SELECT pss.product_id, SUM(pss.quantity_remaining) AS selling_stock
            FROM product_selling_stock pss
            GROUP BY pss.product_id
         ) selling_stock ON selling_stock.product_id = p.product_id
         ORDER BY p.product_id DESC"
    );
    $stmt->execute();

    $products = $stmt->fetchAll(PDO::FETCH_ASSOC);
    if (count($products) > 0) {
        foreach ($products as &$product) {
            $product['variations'] = [];
            $product['available_stock'] = (int) ($product['available_stock'] ?? 0);
            $product['selling_stock'] = (int) ($product['selling_stock'] ?? 0);
            $product['total_inventory_quantity'] = (int) ($product['total_inventory_quantity'] ?? 0);
            $product['current_stock'] = $product['selling_stock'];
            $product['damaged_returned_stock'] = null;
            $product['barcode'] = $product['barcode'] ?? '';
            $product['price'] = $product['price'] ?? 0;
            $product['strength_value'] = $product['medicine_strength_value'] ?? ($product['strength'] ?? '');
            $product['strength_unit'] = $product['strength_unit'] ?? '';
            $product['strength_size_value'] = $product['strength_value'];
            $product['strength_size_display'] = trim(($product['strength_value'] ?? '') . ' ' . ($product['strength_unit'] ?? '')) ?: ($product['strength'] ?? '');
            $product['volume_value'] = $product['net_content_value'] ?? '';
            $product['volume_unit'] = $product['net_content_unit'] ?? '';
            $product['package_type'] = $product['medicine_package_type'] ?? ($product['grocery_package_type'] ?? '');
            $product['variant_flavor'] = $product['variant'] ?? '';
            $product['size_value'] = $product['size'] ?? '';
            $product['display_size'] = $product['size'] ?? '';
            $product['weight_volume_value'] = $product['net_weight'] ?? '';
            $product['weight_volume_unit'] = $product['grocery_unit'] ?? '';
            $product['packaging'] = '';
            $product['packaging_size'] = $product['pack_content'] ?? '';
            $product['pack_content_qty'] = '';
            $product['pack_content_unit'] = $product['pack_content'] ?? '';
        }
        unset($product);
    }

    echo json_encode([
        'status' => 'success',
        'data' => $products
    ]);
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode([
        'status' => 'error',
        'message' => 'Unable to load products.',
        'error' => $e->getMessage()
    ]);
}

?>
