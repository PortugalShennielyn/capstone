<?php
require_once '../../config/db_connection.php';
require_once '../../config/require_auth.php';
require_once '../products/product_category_schema.php';
require_once '../products/product_status_schema.php';
require_once '../products/product_pricing_schema.php';
require_once 'supplier_schema.php';

$supplierId = cleanId($_GET['supplier_id'] ?? null);

if ($supplierId === '') {
    http_response_code(400);
    echo json_encode(['status' => 'error', 'message' => 'A valid supplier is required.']);
    exit();
}

try {
    ensureProductStatusColumn($pdo);
    ensureSupplierProductInventoryUnitColumn($pdo);
    ensureSupplierPurchasingConversionSchema($pdo);
    $statement = $pdo->prepare(
        "SELECT
            sp.supplier_product_id,
            sp.supplier_cost_price,
            sp.supplier_cost_input,
            sp.supplier_cost_basis,
            sp.purchase_unit,
            sp.purchase_unit_contains,
            sp.inner_unit,
            sp.units_per_inner_unit,
            sp.inventory_unit,
            COALESCE(sp.units_per_purchase_unit, 1) AS units_per_purchase_unit,
            p.product_id,
            p.product_name,
            p.brand_name,
            COALESCE(sp.supplier_cost_price, 0) AS price,
            'base_unit' AS supplier_price_basis,
            p.price AS selling_price,
            p.barcode AS variation_barcode,
            p.barcode,
            NULL AS sku,
            COALESCE(inv.storage_stock, 0) AS storage_stock,
            COALESCE(inv.shelf_stock, 0) AS shelf_stock,
            COALESCE(inv.storage_stock, 0) + COALESCE(inv.shelf_stock, 0) AS stock,
            p.category_id,
            p.type_id,
            pc.category_name,
            pt.type_name,
            md.generic_name,
            md.dosage_form,
            msd.material,
            msd.sterile_status,
            COALESCE(md.package_type, gd.package_type, msd.package_type) AS package_type,
            COALESCE(md.package_type, gd.package_type, msd.package_type) AS packaging,
            COALESCE(md.strength_value, md.strength) AS strength_value,
            md.strength_unit AS strength_unit,
            md.strength,
            md.net_content_value,
            md.net_content_unit,
            md.net_content_value AS volume_value,
            md.net_content_unit AS volume_unit,
            COALESCE(gd.variant, msd.variant) AS variant_flavor,
            COALESCE(gd.size, msd.size) AS size_value,
            COALESCE(gd.size, msd.size) AS display_size,
            gd.net_weight AS weight_volume_value,
            gd.net_weight AS net_weight,
            gd.unit AS weight_volume_unit,
            gd.unit AS unit,
            COALESCE(gd.pack_content, msd.pack_content) AS pack_content,
            COALESCE(gd.pack_content, msd.pack_content) AS pack_content_unit,
            '' AS product_unit,
            COALESCE(md.strength_value, md.strength) AS strength_size_value,
            COALESCE(NULLIF(CONCAT_WS(' ', md.strength_value, md.strength_unit), ''), md.strength) AS strength_size_display
         FROM supplier_products sp
         INNER JOIN product p ON sp.product_id = p.product_id
         LEFT JOIN product_categories pc ON p.category_id = pc.category_id
         LEFT JOIN product_types pt ON p.type_id = pt.type_id
         LEFT JOIN medicine_details md ON p.product_id = md.product_id
         LEFT JOIN grocery_details gd ON p.product_id = gd.product_id
         LEFT JOIN medical_supply_details msd ON p.product_id = msd.product_id
         LEFT JOIN (
            SELECT
                product_id,
                SUM(storage_qty) AS storage_stock,
                SUM(shelf_qty) AS shelf_stock
            FROM inventory_batches
            WHERE batch_status IN ('active', 'expired', 'damaged', 'returned')
            GROUP BY product_id
         ) inv ON p.product_id = inv.product_id
         WHERE sp.supplier_id = :supplier_id
           AND p.status = 'Active'
         GROUP BY
            sp.supplier_product_id,
            sp.supplier_cost_price,
            sp.supplier_cost_input,
            sp.supplier_cost_basis,
            sp.purchase_unit,
            sp.purchase_unit_contains,
            sp.inner_unit,
            sp.units_per_inner_unit,
            sp.inventory_unit,
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
            md.strength_value,
            md.strength_unit,
            md.net_content_value,
            md.net_content_unit,
            gd.package_type,
            gd.variant,
            gd.size,
            gd.net_weight,
            gd.unit,
            gd.pack_content,
            msd.package_type,
            msd.variant,
            msd.size,
            msd.material,
            msd.sterile_status,
            msd.pack_content,
            inv.storage_stock,
            inv.shelf_stock
         ORDER BY p.product_name ASC, sp.supplier_product_id ASC"
    );
    $statement->execute([':supplier_id' => $supplierId]);

    $products = $statement->fetchAll(PDO::FETCH_ASSOC);
    $canViewSupplierCost = currentSessionHasRbacRole('super_admin')
        || currentSessionHasRbacRole('ro_super_admin')
        || currentSessionHasRbacRole('admin')
        || currentSessionHasRbacRole('ro_admin')
        || currentSessionHasRbacRole('supervisor')
        || currentSessionHasRbacRole('ro_supervisor');
    foreach ($products as &$product) {
        $normalizedHierarchy = supplierProductPurchasingHierarchy($pdo, (string) $product['supplier_product_id']);
        if (!empty($normalizedHierarchy['hierarchy_levels'])) $product['hierarchy_levels'] = $normalizedHierarchy['hierarchy_levels'];
        $product = enrichSupplierPurchasingSetup($product);
        $product['pricing'] = productPricingSnapshot($pdo, $product['product_id']);
        $product['category_markup_percentage'] = $product['pricing']['category_markup_percentage'];
        $product['pricing_behavior'] = $product['pricing']['pricing_behavior'];
        if ($canViewSupplierCost) {
            $product['supplier_cost_per_base_unit'] = round((float) ($product['supplier_cost_price'] ?? 0), 4);
            $product['calculated_selling_price'] = calculatedSellingPrice($product['supplier_cost_per_base_unit'], (float) $product['pricing']['applied_markup_percentage']);
            $product['price_difference'] = round($product['calculated_selling_price'] - (float) $product['selling_price'], 2);
        } else {
            unset($product['supplier_cost_price'], $product['supplier_cost_input'], $product['supplier_cost_basis'], $product['supplier_cost_per_inventory_unit'], $product['estimated_purchase_unit_cost'], $product['price'], $product['supplier_price_basis']);
        }
    }
    unset($product);
    echo json_encode([
        'status' => 'success',
        'products' => $products
    ]);
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode(['status' => 'error', 'message' => 'Unable to load supplier products.', 'error' => $e->getMessage()]);
}
?>
