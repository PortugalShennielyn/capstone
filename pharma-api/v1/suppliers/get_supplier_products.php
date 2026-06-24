<?php
require_once '../../config/db_connection.php';
require_once '../products/product_category_schema.php';

$supplierId = cleanId($_GET['supplier_id'] ?? null);

if ($supplierId === '') {
    http_response_code(400);
    echo json_encode(['status' => 'error', 'message' => 'A valid supplier is required.']);
    exit();
}

try {

    $statement = $pdo->prepare(
        "SELECT
            sp.supplier_product_id,
            sp.supplier_cost_price,
            COALESCE(NULLIF(sp.purchase_unit, ''), gd.package_type, md.package_type, md.dosage_form, 'pcs') AS purchase_unit,
            CASE
                WHEN COALESCE(sp.units_per_purchase_unit, 1) > 1 THEN sp.units_per_purchase_unit
                WHEN gd.pack_content REGEXP '^[0-9]+' THEN GREATEST(CAST(SUBSTRING_INDEX(gd.pack_content, ' ', 1) AS UNSIGNED), 1)
                ELSE 1
            END AS units_per_purchase_unit,
            p.product_id,
            p.product_name,
            p.brand_name,
            COALESCE(sp.supplier_cost_price, p.price, 0) AS price,
            p.price AS selling_price,
            p.barcode AS variation_barcode,
            p.barcode,
            NULL AS sku,
            COALESCE(inv.storage_stock, 0) AS storage_stock,
            COALESCE(shelf.shelf_stock, 0) AS shelf_stock,
            COALESCE(inv.storage_stock, 0) + COALESCE(shelf.shelf_stock, 0) AS stock,
            p.category_id,
            p.type_id,
            pc.category_name,
            pt.type_name,
            md.generic_name,
            md.dosage_form,
            COALESCE(md.package_type, gd.package_type) AS package_type,
            md.strength AS strength_value,
            '' AS strength_unit,
            gd.variant AS variant_flavor,
            gd.size AS size_value,
            gd.size AS display_size,
            gd.net_weight AS weight_volume_value,
            '' AS weight_volume_unit,
            gd.pack_content,
            gd.pack_content AS pack_content_unit,
            '' AS product_unit,
            md.strength AS strength_size_value,
            md.strength AS strength_size_display
         FROM supplier_products sp
         INNER JOIN product p ON sp.product_id = p.product_id
         LEFT JOIN product_categories pc ON p.category_id = pc.category_id
         LEFT JOIN product_types pt ON p.type_id = pt.type_id
         LEFT JOIN medicine_details md ON p.product_id = md.product_id
         LEFT JOIN grocery_details gd ON p.product_id = gd.product_id
         LEFT JOIN (
            SELECT product_id, SUM(quantity_remaining) AS storage_stock
            FROM product_inventory
            GROUP BY product_id
         ) inv ON p.product_id = inv.product_id
         LEFT JOIN (
            SELECT product_id, SUM(quantity_remaining) AS shelf_stock
            FROM product_selling_stock
            GROUP BY product_id
         ) shelf ON p.product_id = shelf.product_id
         WHERE sp.supplier_id = :supplier_id
         GROUP BY
            sp.supplier_product_id,
            sp.supplier_cost_price,
            sp.purchase_unit,
            sp.units_per_purchase_unit,
            p.product_id,
            p.product_name,
            p.brand_name,
            p.price,
            p.barcode,
            p.category_id,
            p.type_id,
            pc.category_name,
            pt.type_name,
            md.generic_name,
            md.dosage_form,
            md.package_type,
            md.strength,
            gd.package_type,
            gd.variant,
            gd.size,
            gd.net_weight,
            gd.pack_content,
            inv.storage_stock,
            shelf.shelf_stock
         ORDER BY p.product_name ASC, sp.supplier_product_id ASC"
    );
    $statement->execute([':supplier_id' => $supplierId]);

    echo json_encode([
        'status' => 'success',
        'products' => $statement->fetchAll(PDO::FETCH_ASSOC)
    ]);
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode(['status' => 'error', 'message' => 'Unable to load supplier products.', 'error' => $e->getMessage()]);
}
?>
