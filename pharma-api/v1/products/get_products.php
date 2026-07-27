<?php
require_once '../../config/db_connection.php';
require_once '../../config/require_auth.php';
require_once 'product_category_schema.php';
require_once 'product_status_schema.php';

try {
    ensureProductStatusColumn($pdo);
    $stmt = $pdo->prepare(
        "SELECT
            p.product_id,
            p.barcode,
            p.category_id,
            p.type_id,
            p.brand_name,
            p.product_name,
            p.price,
            p.status,
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
            msd.variant AS medical_variant,
            msd.size AS medical_size,
            msd.material,
            msd.sterile_status,
            msd.package_type AS medical_package_type,
            msd.pack_content AS medical_pack_content,
            supplier_names.supplier_ids,
            supplier_names.supplier_name,
            COALESCE(inventory_stock.storage_quantity, 0) + COALESCE(inventory_stock.selling_stock, 0) AS total_inventory_quantity,
            COALESCE(inventory_stock.storage_quantity, 0) AS available_stock,
            inventory_stock.nearest_expiry_date,
            COALESCE(inventory_stock.selling_stock, 0) AS selling_stock,
            COALESCE(inventory_stock.damaged_quantity, 0) AS damaged_stock,
            COALESCE(inventory_stock.returned_quantity, 0) AS returned_stock
         FROM product p
         LEFT JOIN product_categories pc ON p.category_id = pc.category_id
         LEFT JOIN product_types pt ON p.type_id = pt.type_id
         LEFT JOIN medicine_details md ON p.product_id = md.product_id
         LEFT JOIN grocery_details gd ON p.product_id = gd.product_id
         LEFT JOIN medical_supply_details msd ON p.product_id = msd.product_id
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
                ib.product_id,
                SUM(ib.storage_qty) AS storage_quantity,
                SUM(COALESCE(shelf.selling_stock, 0)) AS selling_stock,
                SUM(ib.damaged_qty) AS damaged_quantity,
                SUM(ib.returned_qty) AS returned_quantity,
                MIN(CASE
                    WHEN (ib.storage_qty > 0 OR COALESCE(shelf.selling_stock, 0) > 0)
                     AND ib.batch_status NOT IN ('returned', 'depleted')
                    THEN ib.expiry_date ELSE NULL
                END) AS nearest_expiry_date
            FROM inventory_batches ib
            LEFT JOIN (
                SELECT source_batch_id, SUM(quantity_remaining) AS selling_stock
                FROM product_selling_stock
                WHERE source_batch_id IS NOT NULL
                GROUP BY source_batch_id
            ) shelf ON shelf.source_batch_id = ib.batch_id
            WHERE ib.batch_status IN ('active', 'expired', 'damaged', 'returned')
            GROUP BY ib.product_id
         ) inventory_stock ON inventory_stock.product_id = p.product_id
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
            $product['damaged_stock'] = (int) ($product['damaged_stock'] ?? 0);
            $product['returned_stock'] = (int) ($product['returned_stock'] ?? 0);
            $product['current_stock'] = $product['selling_stock'] + $product['available_stock'];
            $product['barcode'] = $product['barcode'] ?? '';
            $product['price'] = $product['price'] ?? 0;
            $product['strength_value'] = $product['medicine_strength_value'] ?? ($product['strength'] ?? '');
            $product['strength_unit'] = $product['strength_unit'] ?? '';
            $product['strength_size_value'] = $product['strength_value'];
            $product['strength_size_display'] = trim(($product['strength_value'] ?? '') . ' ' . ($product['strength_unit'] ?? '')) ?: ($product['strength'] ?? '');
            $product['volume_value'] = $product['net_content_value'] ?? '';
            $product['volume_unit'] = $product['net_content_unit'] ?? '';
            $product['package_type'] = $product['medicine_package_type'] ?? ($product['grocery_package_type'] ?? ($product['medical_package_type'] ?? ''));
            $product['variant_flavor'] = $product['variant'] ?? ($product['medical_variant'] ?? '');
            $product['size_value'] = $product['size'] ?? ($product['medical_size'] ?? '');
            $product['display_size'] = $product['size_value'];
            $product['weight_volume_value'] = $product['net_weight'] ?? '';
            $product['weight_volume_unit'] = $product['grocery_unit'] ?? '';
            $product['packaging'] = $product['package_type'];
            $product['packaging_size'] = $product['pack_content'] ?? ($product['medical_pack_content'] ?? '');
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
